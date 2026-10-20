/* ==========================================================================
   wango-core — shared runtime for every section.
   Loaded once from layout/theme.liquid, before the per-section scripts.
   ========================================================================== */
(function () {
  "use strict";

  var W = (window.Wango = window.Wango || {});

  /* ── motion preference ────────────────────────────────────────────────── */
  W.reduced = function () {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  /* ── phone layout ─────────────────────────────────────────────────────────
     On a phone every animation is tied to the scroll position instead of a
     timer or a tap (the one exception is the wordmark clip, which follows the
     finger). Narrow windows and touch-first devices both count; the answer is
     read once at boot, so a section never switches mode mid-page. */
  var mobileMode = null;
  W.mobile = function () {
    if (mobileMode === null) {
      mobileMode = !W.reduced() &&
        window.matchMedia("(max-width: 767px), (hover: none) and (pointer: coarse)").matches;
    }
    return mobileMode;
  };

  /* ── opening animation finished ───────────────────────────────────────────
     Each page's hero calls this once its opening has played (or, on a phone,
     been scrolled through). The sign-up popup waits for it. */
  W.introDone = function () {
    if (W._intro) return;
    W._intro = true;
    document.dispatchEvent(new CustomEvent("wango:intro-done"));
  };

  /* ── GSAP + ScrollTrigger ─────────────────────────────────────────────── */
  if (window.gsap) {
    if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    if (window.Flip) gsap.registerPlugin(Flip);
    if (window.CustomEase) gsap.registerPlugin(CustomEase);
  }

  /* ── Lenis smooth scroll, driven off the GSAP ticker ──────────────────────
     Two independent rAF loops fight each other and produce the stepped scroll
     the Next.js build hit; one ticker keeps scroll and tweens on the same
     clock. Disabled entirely under reduced-motion and inside the Shopify
     theme editor, where the editor's own scrolling must stay authoritative. */
  var inEditor = !!(window.Shopify && window.Shopify.designMode);
  if (window.Lenis && !W.reduced() && !inEditor) {
    var lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    W.lenis = lenis;
    if (window.gsap) {
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
      if (window.ScrollTrigger) lenis.on("scroll", ScrollTrigger.update);
    } else {
      (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
    }
  }

  /* ── scrub-able video: serve it from memory, not the CDN ─────────────────
     Every `currentTime = x` on a network-backed <video> is a seek that may need
     a range request; on a CDN that is tens of ms, so a pointer- or scroll-driven
     scrub crawls at a few frames a second (measured: ~0.5 texture uploads/s).
     Fetching the file once into a blob URL turns every seek into a local read,
     which is what the file-on-disk build did. Falls back to the plain URL. */
  var blobCache = {};
  W.blobUrl = function (url) {
    if (!url || !window.fetch || !window.URL || !URL.createObjectURL) return Promise.resolve(url);
    if (!blobCache[url]) {
      blobCache[url] = fetch(url, { mode: "cors", credentials: "omit" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(function (b) { return URL.createObjectURL(b); })
        .catch(function () { return url; });
    }
    return blobCache[url];
  };
  /** Points a <video> at the first playable <source>, but from memory. */
  W.videoFromBlob = function (video) {
    var srcs = [].slice.call(video.querySelectorAll("source"));
    var pick = srcs.filter(function (s) { return s.src && video.canPlayType(s.type) !== ""; })[0] || srcs[0];
    var url = pick ? pick.src : video.currentSrc || video.src;
    if (!url) return Promise.resolve();
    return W.blobUrl(url).then(function (u) {
      if (u === url) { video.preload = "auto"; video.load(); return; }   /* fetch failed: play from the CDN sources */
      srcs.forEach(function (s) { s.remove(); });
      video.src = u; video.load();
    });
  };

  /* ── Calibration ─────────────────────────────────────────────────────────
     ScrollTrigger measures a section's start/end ONCE, when it is created.
     Fonts, lazy images and videos then change the page height and move every
     section below them, so the trigger points stop matching where the section
     really is — animations begin early/late and finish before the section
     does. Re-measure whenever the document's height genuinely changes (and
     on load / fonts / media metadata), debounced, and only on a real change:
     refreshing on every callback would itself make the scroll jitter. */
  if (window.ScrollTrigger) {
    ScrollTrigger.config({ ignoreMobileResize: true });
    /* A refresh re-measures every trigger and costs a long frame, so it never
       runs while the page is moving: it waits for the scroll to rest. */
    var lastH = document.documentElement.scrollHeight, calTimer = 0, lastScroll = 0;
    window.addEventListener("scroll", function () { lastScroll = performance.now(); }, { passive: true });
    var recalibrate = function () {
      clearTimeout(calTimer);
      calTimer = setTimeout(function settle() {
        if (performance.now() - lastScroll < 250) { calTimer = setTimeout(settle, 250); return; }
        var h = document.documentElement.scrollHeight;
        if (Math.abs(h - lastH) > 1) { lastH = h; ScrollTrigger.refresh(); }
      }, 120);
    };
    if ("ResizeObserver" in window) new ResizeObserver(recalibrate).observe(document.body);
    document.addEventListener("load", recalibrate, true);        /* img load does not bubble */
    document.addEventListener("loadedmetadata", recalibrate, true);
    window.addEventListener("load", recalibrate);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(recalibrate);
    setTimeout(function () { ScrollTrigger.refresh(); }, 800);   /* one unconditional settle pass */
  }

  /** Scrolls to an element through Lenis when it is running, natively otherwise. */
  W.scrollTo = function (el) {
    if (!el) return;
    if (W.lenis) W.lenis.scrollTo(el, { duration: 1.2 });
    else el.scrollIntoView({ behavior: "smooth" });
  };

  /* ── .w-reveal on a phone: scrubbed ───────────────────────────────────────
     Opacity and rise follow the element's own position in the viewport, in
     both directions, instead of a one-shot timed transition. The element's
     untransformed top is used (its current offset is subtracted), otherwise
     the rise would feed back into its own progress. */
  var scrubbed = [], scrubQueued = false;
  /* All positions are read first, then all styles written: a read after a
     write forces the browser to lay the page out again, once per element. */
  var scrubP = [];
  function paintScrubbed() {
    scrubQueued = false;
    var vh = window.innerHeight, start = vh * 0.96, span = vh * 0.22, i, el;
    for (i = 0; i < scrubbed.length; i++) {
      el = scrubbed[i];
      var top = el.getBoundingClientRect().top - (el._wy || 0);
      var p = (start - top) / span - (el._wd || 0);
      scrubP[i] = p < 0 ? 0 : p > 1 ? 1 : p;
    }
    for (i = 0; i < scrubbed.length; i++) {
      el = scrubbed[i];
      var q = scrubP[i];
      if (q === el._wp) continue;
      el._wp = q;
      el._wy = 28 * (1 - q);
      el.style.opacity = q;
      el.style.transform = q === 1 ? "none" : "translateY(" + el._wy.toFixed(1) + "px)";
    }
  }
  function queueScrubbed() {
    if (scrubQueued) return;
    scrubQueued = true;
    requestAnimationFrame(paintScrubbed);
  }
  function scrubReveals(els) {
    if (!scrubbed.length) {
      window.addEventListener("scroll", queueScrubbed, { passive: true });
      window.addEventListener("resize", queueScrubbed);
    }
    els.forEach(function (el) {
      el.classList.add("is-in");                 /* so a later pass does not pick it up again */
      el.style.transition = "none";
      el._wd = parseFloat(el.dataset.revealDelay || "0") * 2;   /* the stagger, as a scroll offset */
      scrubbed.push(el);
    });
    paintScrubbed();
  }

  /* ── .w-reveal → .is-in ───────────────────────────────────────────────── */
  function initReveals(scope) {
    var els = (scope || document).querySelectorAll(".w-reveal:not(.is-in)");
    if (!els.length) return;
    if (W.reduced() || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    if (W.mobile()) { scrubReveals([].slice.call(els)); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var d = parseFloat(e.target.dataset.revealDelay || "0");
        setTimeout(function () { e.target.classList.add("is-in"); }, d * 1000);
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }
  W.initReveals = initReveals;

  /* ── money ────────────────────────────────────────────────────────────────
     Shopify hands prices over in cents. `window.Wango.moneyFormat` is written
     by theme.liquid from shop.money_format so the currency and separators
     follow the store's own settings rather than a hardcoded "₺". */
  W.money = function (cents) {
    var fmt = W.moneyFormat || "{{amount}}";
    var amount = (cents / 100);
    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, key) {
      switch (key) {
        case "amount": return amount.toLocaleString(W.locale || "tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case "amount_no_decimals": return Math.round(amount).toLocaleString(W.locale || "tr-TR");
        case "amount_with_comma_separator": return amount.toFixed(2).replace(".", ",");
        case "amount_no_decimals_with_comma_separator": return Math.round(amount).toLocaleString("de-DE");
        case "amount_with_period_and_space_separator": return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        default: return amount.toFixed(2);
      }
    });
  };

  /* ── cart ─────────────────────────────────────────────────────────────────
     Shopify's own AJAX Cart API. The Next.js build kept a localStorage cart
     because it had no backend; here the store IS the backend, so nothing is
     persisted client-side and the checkout is Shopify's real one. */
  var routes = {};
  W.setRoutes = function (r) { routes = r; };

  function refreshCount() {
    return fetch((routes.cart || "/cart") + ".js", { headers: { Accept: "application/json" } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        document.querySelectorAll("[data-cart-count]").forEach(function (el) {
          el.textContent = cart.item_count;
          el.hidden = cart.item_count === 0;
        });
        document.dispatchEvent(new CustomEvent("wango:cart", { detail: cart }));
        return cart;
      })
      .catch(function () { /* offline or blocked — leave the server-rendered count */ });
  }
  W.refreshCount = refreshCount;

  W.addToCart = function (id, quantity) {
    return W.addItems([{ id: id, quantity: quantity || 1 }]);
  };

  /** Adds several cart lines in one request (the two-colour set). */
  W.addItems = function (items) {
    return fetch((routes.cartAdd || "/cart/add") + ".js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.description || e.message || "cart"); });
      return r.json();
    }).then(function (res) {
      return refreshCount().then(function (cart) {
        /* the cart drawer opens on this */
        document.dispatchEvent(new CustomEvent("wango:added", { detail: { added: res, cart: cart } }));
        return res;
      });
    });
  };

  W.changeLine = function (line, quantity) {
    return fetch((routes.cartChange || "/cart/change") + ".js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ line: line, quantity: quantity })
    }).then(function (r) { return r.json(); });
  };

  /* ── header ───────────────────────────────────────────────────────────── */
  function initHeader() {
    var header = document.querySelector("[data-header]");
    if (!header) return;
    /* Sections marked data-header-tone="light" flip the bar to dark type while
       they sit under it (probe a point just inside the bar's vertical middle),
       otherwise it is white-on-white. */
    /* Once per frame at most, every read before any write, and the class only
       touched when it actually changes (each toggle restyled the header). */
    var lights = [].slice.call(document.querySelectorAll('[data-header-tone="light"]'));
    var wasScrolled = null, wasLight = null, headQueued = false;
    var onScroll = function () {
      headQueued = false;
      var scrolled = window.scrollY > 40;
      var under = false;
      if (lights.length) {
        /* the bar's own middle: it moves down when the announcement bar sits above it */
        var hb = header.getBoundingClientRect(), y = hb.top + hb.height / 2;
        for (var i = 0; i < lights.length && !under; i++) {
          var r = lights[i].getBoundingClientRect();
          if (r.top <= y && r.bottom >= y) under = true;
        }
      }
      if (scrolled !== wasScrolled) { wasScrolled = scrolled; header.classList.toggle("is-scrolled", scrolled); }
      if (under !== wasLight) { wasLight = under; header.classList.toggle("is-light", under); }
    };
    onScroll();
    window.addEventListener("scroll", function () {
      if (!headQueued) { headQueued = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    /* a frame queued in a background tab may never run: don't let it latch */
    document.addEventListener("visibilitychange", function () { if (!document.hidden) onScroll(); });

    var nav = document.querySelector("[data-nav-overlay]");
    var burger = header.querySelector("[data-burger]");
    if (!nav || !burger) return;

    var bars = nav.querySelectorAll("[data-nav-bars] div");
    var bg = nav.querySelector("[data-nav-bg]");
    var panel = nav.querySelector("[data-nav-panel]");
    var items = nav.querySelectorAll(".w-nav__item");
    var closeBtn = nav.querySelector("[data-nav-close]");
    var open = false;
    var focusTimer = 0;

    /* The five-bar "sliding stairs" sequence, kept exactly as the original:
       the RIGHTMOST bar leads on open (`from: "end"`), the leftmost on close. */
    function play(opening) {
      if (!window.gsap) {
        bars.forEach(function (b) { b.style.height = opening ? "100%" : "0%"; });
        bg.style.opacity = panel.style.opacity = opening ? 1 : 0;
        items.forEach(function (i) { i.style.opacity = opening ? 1 : 0; });
        return;
      }
      if (W.reduced()) {
        gsap.set(bars, { height: opening ? "100%" : "0%" });
        gsap.set([bg, panel], { opacity: opening ? 1 : 0 });
        gsap.set(items, { rotateX: 0, opacity: opening ? 1 : 0 });
        return;
      }
      var tl = gsap.timeline(), ease = "power2.out";
      if (opening) {
        tl.fromTo(bars, { height: "0%" }, { height: "100%", duration: 0.5, stagger: { each: 0.05, from: "end" }, ease }, 0)
          .to(bg, { opacity: 1, duration: 0.5, ease }, 0.2)
          .to(panel, { opacity: 1, duration: 0.4, ease }, 0.4)
          .fromTo(items, { rotateX: 90, opacity: 0, transformOrigin: "50% 0%" },
                         { rotateX: 0, opacity: 1, duration: 0.55, stagger: 0.06, ease }, 0.45);
      } else {
        tl.to(items, { rotateX: 90, opacity: 0, duration: 0.3, stagger: 0.04, ease }, 0)
          .to(panel, { opacity: 0, duration: 0.25, ease }, 0.1)
          .to(bg, { opacity: 0, duration: 0.4, ease }, 0.2)
          .to(bars, { height: "0%", duration: 0.45, stagger: { each: 0.05, from: "start" }, ease }, 0.25);
      }
    }

    function setOpen(next) {
      open = next;
      nav.setAttribute("aria-hidden", String(!open));
      burger.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
      if (W.lenis) open ? W.lenis.stop() : W.lenis.start();
      burger.querySelectorAll("span").forEach(function (s, i) {
        s.style.top = (open ? 21 : 15 + i * 6) + "px";
        s.style.opacity = open && i === 1 ? 0 : 1;
        s.style.transform = "translateX(-50%) " + (open ? (i === 0 ? "rotate(45deg)" : i === 2 ? "rotate(-45deg)" : "scale(0)") : "");
      });
      play(open);
      clearTimeout(focusTimer);
      if (open) focusTimer = setTimeout(function () { closeBtn && closeBtn.focus(); }, 420);
    }
    setOpen(false);

    /* Wide screens: the compact drop-down instead of the full-screen overlay. */
    var drop = header.querySelector("[data-nav-drop]");
    var scrim = document.querySelector("[data-nav-drop-scrim]");
    var wide = window.matchMedia("(min-width: 900px)");
    var dropOpen = false;
    function morphBurger(on) {
      burger.querySelectorAll("span").forEach(function (s, i) {
        s.style.top = (on ? 21 : 15 + i * 6) + "px";
        s.style.opacity = on && i === 1 ? 0 : 1;
        s.style.transform = "translateX(-50%) " + (on ? (i === 0 ? "rotate(45deg)" : i === 2 ? "rotate(-45deg)" : "scale(0)") : "");
      });
    }
    function setDrop(next) {
      if (!drop) return;
      dropOpen = next;
      drop.classList.toggle("is-open", next);
      scrim && scrim.classList.toggle("is-open", next);
      drop.setAttribute("aria-hidden", String(!next));
      burger.setAttribute("aria-expanded", String(next));
      burger.setAttribute("aria-controls", "wango-drop");
      drop.querySelectorAll("a").forEach(function (a) { a.tabIndex = next ? 0 : -1; });
      morphBurger(next);
      if (next) setTimeout(function () { var f = drop.querySelector("a"); f && f.focus({ preventScroll: true }); }, 60);
    }
    if (drop) {
      document.addEventListener("click", function (e) {
        if (dropOpen && !drop.contains(e.target) && !burger.contains(e.target)) setDrop(false);
      });
      drop.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setDrop(false); }); });
      window.addEventListener("keydown", function (e) { if (e.key === "Escape" && dropOpen) { setDrop(false); burger.focus(); } });
      var closeOnChange = function () { if (dropOpen) setDrop(false); if (open) setOpen(false); };
      if (wide.addEventListener) wide.addEventListener("change", closeOnChange);
    }

    burger.addEventListener("click", function () {
      if (drop && wide.matches) { setDrop(!dropOpen); return; }
      burger.setAttribute("aria-controls", "wango-nav");
      setOpen(!open);
    });
    closeBtn && closeBtn.addEventListener("click", function () { setOpen(false); });
    nav.querySelectorAll(".w-nav__item a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) setOpen(false); });
  }

  /* ── quantity steppers (product + cart) ───────────────────────────────── */
  function initQty(scope) {
    (scope || document).querySelectorAll("[data-qty]").forEach(function (box) {
      if (box.dataset.qtyReady) return;
      box.dataset.qtyReady = "1";
      var input = box.querySelector("input");
      box.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-qty-step]");
        if (!btn) return;
        var min = parseInt(input.min || "1", 10);
        var max = parseInt(input.max || "99", 10);
        var next = (parseInt(input.value, 10) || min) + parseInt(btn.dataset.qtyStep, 10);
        input.value = Math.min(max, Math.max(min, next));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  }
  W.initQty = initQty;

  function boot() {
    initHeader();
    initReveals();
    initQty();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // The theme editor swaps section HTML in place; re-run the generic bits.
  document.addEventListener("shopify:section:load", function (e) {
    initReveals(e.target);
    initQty(e.target);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });
})();
