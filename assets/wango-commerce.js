/* ==========================================================================
   Commerce behaviour · product form, cart page, newsletter, tilt grid.
   Everything here talks to Shopify's own cart/checkout — the Next.js build's
   localStorage cart and fake checkout are gone.
   ========================================================================== */
(function () {
  "use strict";
  var W = window.Wango || {};
  var reduced = W.reduced ? W.reduced() : false;

  /* ── product tilt grid (the two SKU cards fanning in) ─────────────────── */
  function initTiltGrid(root) {
    if (reduced || !window.gsap || !window.ScrollTrigger) return;
    var items = root.querySelectorAll(".ptg-card");
    if (!items.length) return;
    /* A rotated card's axis-aligned box is wider than the card: at 10deg a
       342px card measures 415px, which on a 390px phone widened the document
       and gave the whole page a horizontal scroll. The tilt is decorative, so
       it shrinks on narrow screens instead of being clipped. */
    var tilt = window.innerWidth < 768 ? 4 : 10;
    gsap.set(items, { y: 140, rotate: function (i) { return i % 2 === 0 ? -tilt : tilt; }, opacity: 0 });
    /* Phones: the fan-in is scrubbed by the scroll instead of playing once on
       a timer (see Wango.mobile in wango-core). */
    if (W.mobile && W.mobile()) {
      gsap.to(items, {
        y: 0, rotate: 0, opacity: 1, ease: "power2.out", stagger: 0.15,
        scrollTrigger: { trigger: root, start: "top 92%", end: "top 38%", scrub: true }
      });
      return;
    }
    gsap.to(items, {
      y: 0, rotate: 0, opacity: 1, duration: 1, ease: "back.out(1.5)", stagger: 0.15,
      scrollTrigger: { trigger: root, start: "top 78%" }
    });
  }

  /* ── set grid: buy straight from the card ─────────────────────────────── */
  function initQuickAdd(root) {
    var status = root.querySelector("[data-quick-status]");
    root.querySelectorAll("[data-quick-add]").forEach(function (btn) {
      var label = btn.textContent.trim();
      var card = btn.closest(".ptg-card, .w-coll__card, [data-quick-scope]");
      var go = card && card.querySelector("[data-quick-go]");
      btn.addEventListener("click", function () {
        if (btn.disabled || !W.addItems) return;
        var items = btn.dataset.quickAdd.split(",").filter(Boolean).map(function (id) { return { id: Number(id), quantity: 1 }; });
        btn.disabled = true;
        btn.textContent = "…";
        W.addItems(items).then(function () {
          if (btn.closest("[data-quick-reload]")) { window.location.reload(); return; }
          btn.textContent = "✓ " + (btn.dataset.added || "Sepete eklendi");
          btn.classList.add("is-added");
          if (go) go.hidden = false;
          if (status) status.textContent = btn.dataset.added || "Sepete eklendi";
          setTimeout(function () { btn.textContent = label; btn.classList.remove("is-added"); btn.disabled = false; }, 2600);
        }).catch(function (err) {
          btn.textContent = label;
          btn.disabled = false;
          if (status) status.textContent = err.message;
          btn.classList.add("is-error");
          setTimeout(function () { btn.classList.remove("is-error"); }, 1600);
        });
      });
    });
  }

  /* ── cart drawer ─────────────────────────────────────────────────────────
     Opens after every successful add (the "wango:added" event from
     Wango.addItems) and from the header's cart pill. Everything inside is
     drawn from Shopify's /cart.js, so it is always the real cart. */
  function initDrawer(root) {
    var panel = root.querySelector(".w-drawer__panel");
    var linesEl = root.querySelector("[data-drawer-lines]");
    var emptyEl = root.querySelector("[data-drawer-empty]");
    var upsellEl = root.querySelector("[data-drawer-upsell]");
    var footEl = root.querySelector("[data-drawer-foot]");
    var subEl = root.querySelector("[data-drawer-subtotal]");
    var countEl = root.querySelector("[data-drawer-count]");
    var addedEl = root.querySelector("[data-drawer-added]");
    var products = [];
    try { products = JSON.parse((document.querySelector("[data-drawer-products]") || {}).textContent || "[]"); } catch (e) {}
    var money = W.money || function (c) { return (c / 100).toFixed(2); };
    var isOpen = false, lastFocus = null, addedTimer = 0;

    function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
    function sized(url, w) { if (!url) return ""; return url + (url.indexOf("?") > -1 ? "&" : "?") + "width=" + w; }

    var totalEl = root.querySelector("[data-drawer-total]");
    var shipEl = root.querySelector("[data-drawer-ship]");
    var shownTotal = null, tweenId = 0, enterNext = false;
    var trash = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.8h6V7m-8 0 .8 12.2a1.8 1.8 0 0 0 1.8 1.8h4.8a1.8 1.8 0 0 0 1.8-1.8L17 7"/></svg>';

    /* dispatch date: two working days from today, weekends skipped */
    (function () {
      if (!shipEl) return;
      var d = new Date(), left = 2;
      while (left > 0) { d.setDate(d.getDate() + 1); var w = d.getDay(); if (w !== 0 && w !== 6) left--; }
      shipEl.textContent = "en geç " + d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }) + " kargoda";
    })();

    /* subtotal and button total count to the new value instead of jumping */
    function showTotal(cents) {
      var from = shownTotal == null ? cents : shownTotal, id = ++tweenId, t0 = performance.now();
      shownTotal = cents;
      if (from === cents || (W.reduced && W.reduced())) { subEl.textContent = totalEl.textContent = money(cents); return; }
      (function step(t) {
        if (id !== tweenId) return;
        var k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3);
        var v = Math.round(from + (cents - from) * e);
        subEl.textContent = totalEl.textContent = money(v);
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    }

    function render(cart) {
      if (!cart) return;
      var items = cart.items || [];
      countEl.textContent = cart.item_count || "";
      countEl.hidden = !cart.item_count;
      emptyEl.hidden = items.length > 0;
      footEl.hidden = items.length === 0;
      linesEl.innerHTML = items.map(function (it, i) {
        var opts = it.product_has_only_default_variant ? "" : '<span class="w-drawer__opt">' + esc(it.variant_title) + "</span>";
        return '<li class="w-drawer__line' + (enterNext ? " is-enter" : "") + '" style="--i:' + i + '">' +
          '<a class="w-drawer__img" href="' + esc(it.url) + '">' + (it.image ? '<img src="' + esc(sized(it.image, 240)) + '" alt="" width="84" height="84" loading="lazy">' : "") + "</a>" +
          '<div class="w-drawer__info">' +
            '<a class="w-drawer__title" href="' + esc(it.url) + '">' + esc(it.product_title) + "</a>" + opts +
            '<b class="w-drawer__price">' + money(it.final_line_price) + "</b>" +
            '<div class="w-drawer__ctl">' +
              '<div class="w-qty w-qty--sm"><button type="button" data-line-step="-1" data-line="' + (i + 1) + '" aria-label="Azalt">&minus;</button>' +
              '<span aria-live="polite">' + it.quantity + "</span>" +
              '<button type="button" data-line-step="1" data-line="' + (i + 1) + '" aria-label="Artır">+</button></div>' +
              '<button type="button" class="w-drawer__rm" data-line-remove="' + (i + 1) + '" aria-label="' + esc(it.product_title) + ' ürününü kaldır">' + trash + "</button>" +
            "</div>" +
          "</div>" +
        "</li>";
      }).join("");
      enterNext = false;
      showTotal(cart.total_price);

      /* other colour: the first listed product not in the cart yet */
      var inCart = {};
      items.forEach(function (it) { inCart[it.product_id] = true; });
      var extra = null;
      for (var k = 0; k < products.length; k++) { if (!inCart[products[k].product_id] && products[k].available) { extra = products[k]; break; } }
      if (extra && items.length) {
        upsellEl.hidden = false;
        upsellEl.innerHTML =
          '<div class="w-drawer__upcard">' +
            '<div class="w-drawer__uppic">' + (extra.image ? '<img src="' + esc(extra.image) + '" alt="" width="96" height="96" loading="lazy">' : "") + "</div>" +
            '<div class="w-drawer__upcopy"><span class="w-drawer__up-head">Diğer rengi de ekle</span>' +
              "<b>" + esc(extra.title) + "</b><em>Biri senin, biri yanındakinin · " + money(extra.price) + "</em>" +
              '<button type="button" class="w-btn w-btn--solid" data-drawer-add="' + extra.variant_id + '">Sepete ekle</button>' +
            "</div>" +
          "</div>";
      } else { upsellEl.hidden = true; upsellEl.innerHTML = ""; }
    }

    function load() {
      return fetch("/cart.js", { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); }).then(function (c) { render(c); return c; });
    }

    function open(flash) {
      if (!isOpen) {
        isOpen = true; lastFocus = document.activeElement;
        /* the page behind sinks back a little around what the visitor was looking at */
        var main = document.getElementById("MainContent");
        if (main) main.style.transformOrigin = "50% " + Math.round(window.scrollY + window.innerHeight / 2) + "px";
        linesEl.querySelectorAll(".w-drawer__line").forEach(function (li) { li.classList.remove("is-enter"); void li.offsetWidth; li.classList.add("is-enter"); });
        root.setAttribute("aria-hidden", "false");
        root.classList.add("is-open");
        document.documentElement.classList.add("has-drawer");
        if (W.lenis) W.lenis.stop();
        setTimeout(function () { panel.focus({ preventScroll: true }); }, 60);
      }
      clearTimeout(addedTimer);
      addedEl.hidden = !flash;
      if (flash) addedTimer = setTimeout(function () { addedEl.hidden = true; }, 3200);
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove("is-open");
      root.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("has-drawer");
      if (W.lenis) W.lenis.start();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    document.addEventListener("wango:added", function (e) {
      enterNext = !isOpen;
      if (e.detail && e.detail.cart) render(e.detail.cart); else load();
      open(true);
    });
    document.querySelectorAll('.w-cart-pill, a[href="' + ((W.routes && W.routes.cart) || "/cart") + '"].w-cart-pill').forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        load(); open(false);
      });
    });
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-drawer-close], [data-drawer-close-link]")) { if (!e.target.closest("[data-drawer-close-link]")) e.preventDefault(); close(); return; }
      var step = e.target.closest("[data-line-step]");
      var rm = e.target.closest("[data-line-remove]");
      var add = e.target.closest("[data-drawer-add]");
      if (step || rm) {
        var line = parseInt((step || rm).dataset.line || rm.dataset.lineRemove, 10);
        var cur = step ? parseInt(step.parentNode.querySelector("span").textContent, 10) : 0;
        var qty = rm ? 0 : Math.max(0, cur + parseInt(step.dataset.lineStep, 10));
        root.classList.add("is-busy");
        W.changeLine(line, qty).then(function (cart) { render(cart); if (W.refreshCount) W.refreshCount(); })
          .finally(function () { root.classList.remove("is-busy"); });
      }
      if (add) {
        add.disabled = true;
        /* addItems fires wango:added, which re-draws the drawer */
        W.addItems([{ id: Number(add.dataset.drawerAdd), quantity: 1 }]).catch(function () { add.disabled = false; });
      }
    });
    window.addEventListener("keydown", function (e) {
      if (!isOpen) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") {   /* keep focus inside the panel */
        var f = panel.querySelectorAll("a[href], button:not([disabled])");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ── sticky buy bar on the product page ───────────────────────────────── */
  function initBuybar(root) {
    var bar = root.querySelector("[data-buybar]");
    var real = root.querySelector("[data-add-to-cart]");
    if (!bar || !real || !("IntersectionObserver" in window)) return;
    var go = bar.querySelector("[data-buybar-go]");
    var price = bar.querySelector("[data-buybar-price]");
    var realPrice = root.querySelector("[data-price]");
    var footer = document.querySelector("footer, .shopify-section-group-footer-group");
    var realGone = false, footerIn = false;
    function paint() {
      var on = realGone && !footerIn;
      bar.classList.toggle("is-on", on);
      bar.setAttribute("aria-hidden", String(!on));
      go.tabIndex = on ? 0 : -1;
      document.documentElement.classList.toggle("has-buybar", on);
    }
    new IntersectionObserver(function (e) {
      /* off screen either way: scrolled past, or (on a short phone) not reached yet */
      realGone = !e[0].isIntersecting;
      paint();
    }).observe(real);
    if (footer) new IntersectionObserver(function (e) { footerIn = e[0].isIntersecting; paint(); }).observe(footer);
    go.addEventListener("click", function () {
      if (real.disabled) return;
      if (price && realPrice) price.textContent = realPrice.firstChild ? realPrice.firstChild.textContent.trim() : price.textContent;
      real.click();
      go.textContent = "✓ " + (real.dataset.labelAdded || "Sepete eklendi");
      setTimeout(function () { go.textContent = real.dataset.labelAdd || "Sepete ekle"; }, 2400);
    });
  }

  /* ── product detail ───────────────────────────────────────────────────── */
  function initProductForm(root) {
    var dataEl = root.querySelector("[data-product-json]");
    var variants = [];
    if (dataEl) {
      try { variants = JSON.parse(dataEl.textContent) || []; } catch (e) { variants = []; }
    }
    var form = root.querySelector("[data-product-form]");
    var idInput = root.querySelector("[data-variant-id]");
    var priceEl = root.querySelector("[data-price]");
    var compareEl = root.querySelector("[data-compare-price]");
    var submit = root.querySelector("[data-add-to-cart]");
    var status = root.querySelector("[data-cart-status]");
    var hero = root.querySelector("[data-pdp-hero]");

    /* gallery: thumbnails swap the hero shot */
    var thumbs = root.querySelectorAll("[data-thumb]");
    function showShot(key) {
      if (!hero) return;
      var shown = false;
      hero.querySelectorAll("img").forEach(function (img) {
        var on = img.dataset.mediaId === String(key);
        img.classList.toggle("is-on", on);
        if (on) shown = true;
      });
      if (!shown) {
        var first = hero.querySelector("img");
        if (first) first.classList.add("is-on");
      }
      thumbs.forEach(function (t) { t.setAttribute("aria-pressed", String(t.dataset.thumb === String(key))); });
    }
    thumbs.forEach(function (t) {
      t.addEventListener("click", function () { showShot(t.dataset.thumb); });
    });

    /* variants */
    function selectedOptions() {
      var out = [];
      root.querySelectorAll("[data-option-index]").forEach(function (group) {
        var checked = group.querySelector("input:checked");
        out[parseInt(group.dataset.optionIndex, 10)] = checked ? checked.value : null;
      });
      return out;
    }
    function currentVariant() {
      var sel = selectedOptions();
      if (!sel.length) return variants[0];
      return variants.find(function (v) {
        return v.options.every(function (o, i) { return sel[i] == null || o === sel[i]; });
      });
    }
    function sync() {
      var v = currentVariant();
      if (!v) {
        if (submit) { submit.disabled = true; submit.textContent = submit.dataset.labelUnavailable || submit.textContent; }
        return;
      }
      if (idInput) idInput.value = v.id;
      if (priceEl) priceEl.firstChild ? (priceEl.childNodes[0].nodeValue = W.money(v.price)) : (priceEl.textContent = W.money(v.price));
      if (compareEl) {
        var showCompare = v.compare_at_price && v.compare_at_price > v.price;
        compareEl.hidden = !showCompare;
        if (showCompare) compareEl.textContent = W.money(v.compare_at_price);
      }
      if (submit) {
        submit.disabled = !v.available;
        submit.textContent = v.available ? (submit.dataset.labelAdd || "Sepete ekle") : (submit.dataset.labelSoldout || "Tükendi");
      }
      if (v.featured_media_id) showShot(v.featured_media_id);
      // Keep the address bar in step so a shared link opens on the same variant.
      if (window.history && window.history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set("variant", v.id);
        window.history.replaceState({}, "", url);
      }
    }
    root.querySelectorAll("[data-option-index] input").forEach(function (input) {
      input.addEventListener("change", function () {
        var label = input.closest("[data-option-index]").querySelector("[data-option-value]");
        if (label) label.textContent = input.value;
        sync();
      });
    });
    if (variants.length) sync();

    /* add to cart — AJAX so the visitor is not thrown off the page */
    if (form && submit) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var qtyInput = form.querySelector('[name="quantity"]');
        var qty = Math.max(1, parseInt(qtyInput && qtyInput.value, 10) || 1);
        var id = idInput && idInput.value;
        if (!id) return;
        submit.disabled = true;
        var original = submit.textContent;
        W.addToCart(parseInt(id, 10), qty).then(function () {
          submit.textContent = submit.dataset.labelAdded || "Sepete eklendi";
          if (status) status.textContent = submit.dataset.labelAdded || "Sepete eklendi";
          setTimeout(function () { submit.textContent = original; submit.disabled = false; }, 2200);
        }).catch(function (err) {
          submit.disabled = false;
          if (status) status.textContent = err.message;
        });
      });
    }
  }

  /* ── cart page ────────────────────────────────────────────────────────── */
  function initCart(root) {
    function update(line, quantity) {
      root.setAttribute("aria-busy", "true");
      W.changeLine(line, quantity).then(function () { window.location.reload(); });
    }
    root.addEventListener("change", function (e) {
      var input = e.target.closest("[data-line-qty]");
      if (!input) return;
      var q = Math.max(0, parseInt(input.value, 10) || 0);
      update(parseInt(input.dataset.lineQty, 10), q);
    });
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-line-remove]");
      if (!btn) return;
      e.preventDefault();
      update(parseInt(btn.dataset.lineRemove, 10), 0);
    });
  }

  /* ── newsletter ───────────────────────────────────────────────────────────
     Shopify's customer form does the real work (the address lands in the
     store's customer list, tagged `newsletter`). The script only adds the
     client-side checks the server form has no equivalent for. */
  function initNewsletter(root) {
    var form = root.querySelector("form");
    var error = root.querySelector("[data-news-error]");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      var email = form.querySelector('input[type="email"]');
      var consent = form.querySelector('input[type="checkbox"]');
      var value = (email && email.value || "").trim();
      // Deliberately permissive: one @, a dot in the domain, no spaces.
      // Strict regexes reject plenty of valid real addresses.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        e.preventDefault();
        if (error) { error.hidden = false; error.textContent = error.dataset.msgEmail; }
        return;
      }
      if (consent && !consent.checked) {
        e.preventDefault();
        if (error) { error.hidden = false; error.textContent = error.dataset.msgConsent; }
        return;
      }
      if (error) error.hidden = true;
    });
  }

  var MAP = [
    ["[data-tilt-grid]", function (el) { initTiltGrid(el); initQuickAdd(el); }],
    ["[data-product-root]", function (el) { initProductForm(el); initBuybar(el); }],
    ["[data-quick-scope]", initQuickAdd],
    ["[data-cart-drawer]", initDrawer],
    ["[data-cart-root]", initCart],
    ["[data-newsletter]", initNewsletter]
  ];
  function boot(scope) {
    MAP.forEach(function (pair) {
      (scope || document).querySelectorAll(pair[0]).forEach(function (el) {
        if (el.dataset.wangoReady) return;
        el.dataset.wangoReady = "1";
        pair[1](el);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(); });
  else boot();
  document.addEventListener("shopify:section:load", function (e) { boot(e.target); });
})();
