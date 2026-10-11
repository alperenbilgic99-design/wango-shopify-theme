/* ==========================================================================
   wango-extras · [data-popup] launch popup · [data-rail] card rail
   ========================================================================== */
(function () {
  "use strict";
  var W = window.Wango || {};
  var inEditor = !!(window.Shopify && window.Shopify.designMode);

  /* ── launch popup ─────────────────────────────────────────────────────────
     Opens a set delay after the page's opening animation has finished. Each
     hero announces that with Wango.introDone() (a "wango:intro-done" event);
     a page with no opening counts from the load instead. A dismissal is kept
     for `data-days` days, a sign-up for good. */
  var POPUP_KEY = "wango-popup";

  function popupState() {
    try { return JSON.parse(localStorage.getItem(POPUP_KEY) || "null"); } catch (e) { return null; }
  }
  function rememberPopup(state) {
    try { localStorage.setItem(POPUP_KEY, JSON.stringify({ s: state, t: Date.now() })); } catch (e) { /* private mode */ }
  }

  function initPopup(root) {
    var card = root.querySelector(".w-popup__card");
    if (!card) return;
    var days = parseFloat(root.dataset.days) || 7;
    var delay = (parseFloat(root.dataset.delay) || 0) * 1000;
    var posted = !!root.querySelector("[data-popup-posted]");
    var errored = !!root.querySelector("[data-popup-errored]");
    var open = false, lastFocus = null, hideTimer = 0;
    /* A wide screen gets a modal (the page behind is held still); a phone gets
       a sheet along the bottom edge and the page keeps scrolling under it. */
    var modal = window.matchMedia("(min-width: 768px)").matches;

    function show() {
      if (open) return;
      open = true;
      clearTimeout(hideTimer);
      lastFocus = document.activeElement;
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      /* A forced reflow gives the opening transition its "from" state. Not a
         requestAnimationFrame: that never fires in a background tab, and the
         popup would then stay invisible when the visitor comes back. */
      void root.offsetWidth;
      root.classList.add("is-open");
      if (modal) {
        if (W.lenis) W.lenis.stop();
        var field = card.querySelector('input[type="email"]') || card.querySelector("[data-popup-close]");
        setTimeout(function () { if (open && field) field.focus({ preventScroll: true }); }, 350);
      }
    }
    function hide(remember) {
      if (!open) return;
      open = false;
      root.classList.remove("is-open");
      root.setAttribute("aria-hidden", "true");
      if (modal && W.lenis) W.lenis.start();
      hideTimer = setTimeout(function () { root.hidden = true; }, 450);
      if (remember) rememberPopup("x");
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-popup-close]")) hide(!posted);
      var copy = e.target.closest("[data-popup-copy]");
      if (copy) {
        var label = copy.querySelector("[data-popup-copy-label]");
        var done = function () { if (label) label.textContent = copy.dataset.copied || label.textContent; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(copy.dataset.popupCopy).then(done, function () {});
        else done();
      }
    });
    window.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) hide(!posted); });

    /* The theme editor shows it while its section is selected, so it can be edited. */
    if (inEditor) {
      document.addEventListener("shopify:section:select", function (e) { if (e.target.contains(root)) show(); });
      document.addEventListener("shopify:section:deselect", function (e) { if (e.target.contains(root)) hide(false); });
      return;
    }

    if (posted) { rememberPopup("in"); show(); return; }   /* came back from the sign-up */
    if (errored) { show(); return; }                        /* came back with a form error */

    var state = popupState();
    if (state && (state.s === "in" || Date.now() - state.t < days * 864e5)) return;

    var armed = false;
    function arm() {
      if (armed) return;
      armed = true;
      setTimeout(show, delay);
    }
    var hasIntro = !!document.querySelector("[data-origin-hero], [data-boxhero]");
    if (hasIntro && !W._intro) {
      document.addEventListener("wango:intro-done", arm, { once: true });
    } else if (document.readyState === "complete") {
      arm();
    } else {
      window.addEventListener("load", arm, { once: true });
    }
  }

  /* ── card rail ────────────────────────────────────────────────────────────
     The track is a native scroll-snap container: a finger or a trackpad moves
     it with no script at all. Everything below only READS its scrollLeft (the
     progress line, the counter, the picture parallax) or writes it on an
     explicit action (the arrows, a mouse drag, the arrow keys). */
  function initRail(root) {
    var viewport = root.querySelector("[data-rail-viewport]");
    var cards = [].slice.call(root.querySelectorAll("[data-rail-card]"));
    if (!viewport || !cards.length) return;
    var fill = root.querySelector("[data-rail-fill]");
    var current = root.querySelector("[data-rail-current]");
    var prev = root.querySelector("[data-rail-prev]");
    var next = root.querySelector("[data-rail-next]");
    var imgs = cards.map(function (c) { return c.querySelector(".w-rail__img img"); });
    var reduced = W.reduced ? W.reduced() : false;
    var index = 0, queued = false, gliding = false;

    function maxScroll() { return Math.max(1, viewport.scrollWidth - viewport.clientWidth); }
    function offsetOf(i) { return cards[i].offsetLeft - cards[0].offsetLeft; }

    function paint() {
      queued = false;
      var x = viewport.scrollLeft, p = Math.min(1, Math.max(0, x / maxScroll()));
      if (fill) fill.style.transform = "scaleX(" + Math.max(0.04, p).toFixed(4) + ")";

      if (!gliding) {
        var best = 0, bestD = Infinity;
        for (var i = 0; i < cards.length; i++) {
          var d = Math.abs(offsetOf(i) - x);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (x >= maxScroll() - 2) best = cards.length - 1;      /* the last card may never reach the left edge */
        setIndex(best);
      }
      updateArrows();

      /* each picture slides a little against its own card as the card crosses
         the screen: a pure function of where the card is, so it holds still
         the moment the track does */
      if (!reduced) {
        var vr = viewport.getBoundingClientRect(), mid = vr.left + vr.width / 2;
        for (var k = 0; k < cards.length; k++) {
          if (!imgs[k]) continue;
          var r = cards[k].getBoundingClientRect();
          if (r.right < vr.left - 80 || r.left > vr.right + 80) continue;
          var t = ((r.left + r.width / 2) - mid) / vr.width;       /* -0.5 … 0.5 across the viewport */
          imgs[k].style.transform = "translate3d(" + (t * -9).toFixed(2) + "%,0,0) scale(1.2)";
        }
      }
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(paint); } }

    function setIndex(i) {
      if (i === index && current && current.textContent) { updateArrows(); return; }
      index = i;
      if (current) current.textContent = (i + 1 < 10 ? "0" : "") + (i + 1);
      cards.forEach(function (c, n) { c.classList.toggle("is-current", n === i); });
      updateArrows();
    }
    function updateArrows() {
      var x = viewport.scrollLeft;
      if (prev) prev.disabled = x <= 2;
      if (next) next.disabled = x >= maxScroll() - 2;
    }

    /* Stepped by hand rather than with behavior:"smooth": on a mandatory
       scroll-snap container a native smooth scroll lands on the wrong card or
       does not start at all (measured on the scenario carousel). Snap is off
       only while the glide runs. */
    function glideTo(i) {
      i = Math.min(cards.length - 1, Math.max(0, i));
      var from = viewport.scrollLeft, to = Math.min(offsetOf(i), maxScroll());
      if (Math.abs(to - from) < 2) return;
      setIndex(i);
      if (reduced) { viewport.scrollLeft = to; queue(); return; }
      gliding = true;
      viewport.style.scrollSnapType = "none";
      var t0 = performance.now(), dur = 520;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        viewport.scrollLeft = from + (to - from) * e;
        if (p < 1) { requestAnimationFrame(step); return; }
        viewport.style.scrollSnapType = "";
        setTimeout(function () { gliding = false; queue(); }, 160);
      })(t0);
    }
    /* Steps are taken from where the track actually IS, not from the counter:
       at the far end several cards share the same (clamped) scroll position,
       so "index - 1" could point at a card that is already fully in view and
       the arrow would do nothing. */
    function stepBy(dir) {
      var x = viewport.scrollLeft, i;
      if (dir > 0) {
        for (i = 0; i < cards.length; i++) if (offsetOf(i) > x + 4) return glideTo(i);
        glideTo(cards.length - 1);
      } else {
        for (i = cards.length - 1; i >= 0; i--) if (offsetOf(i) < x - 4) return glideTo(i);
        glideTo(0);
      }
    }
    if (prev) prev.addEventListener("click", function () { stepBy(-1); });
    if (next) next.addEventListener("click", function () { stepBy(1); });
    viewport.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); stepBy(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); stepBy(-1); }
    });

    /* Mouse drag (a touch already scrolls natively). A drag that actually
       moved swallows the click that ends it, so the last card's link does not
       fire by accident. */
    var drag = null;
    viewport.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: viewport.scrollLeft, moved: false };
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      if (!drag.moved) { drag.moved = true; viewport.classList.add("is-dragging"); viewport.style.scrollSnapType = "none"; }
      viewport.scrollLeft = drag.left - dx;
    });
    function endDrag() {
      if (!drag) return;
      var moved = drag.moved;
      drag = null;
      if (!moved) return;
      viewport.classList.remove("is-dragging");
      /* settle on the nearest card, then hand the track back to scroll-snap */
      var x = viewport.scrollLeft, best = 0, bestD = Infinity;
      for (var i = 0; i < cards.length; i++) { var d = Math.abs(offsetOf(i) - x); if (d < bestD) { bestD = d; best = i; } }
      viewport.style.scrollSnapType = "";
      glideTo(best);
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("click", function (e) {
      if (viewport.dataset.dragged) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    viewport.addEventListener("pointerdown", function () { delete viewport.dataset.dragged; });
    window.addEventListener("pointermove", function () { if (drag && drag.moved) viewport.dataset.dragged = "1"; });
    viewport.addEventListener("dragstart", function (e) { e.preventDefault(); });

    viewport.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    current && (current.textContent = "");
    paint();
  }

  var MAP = [["[data-popup]", initPopup], ["[data-rail]", initRail]];
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
