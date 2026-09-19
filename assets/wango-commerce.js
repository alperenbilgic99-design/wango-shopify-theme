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
    gsap.set(items, { y: 140, rotate: function (i) { return i % 2 === 0 ? -10 : 10; }, opacity: 0 });
    gsap.to(items, {
      y: 0, rotate: 0, opacity: 1, duration: 1, ease: "back.out(1.5)", stagger: 0.15,
      scrollTrigger: { trigger: root, start: "top 78%" }
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
    ["[data-tilt-grid]", initTiltGrid],
    ["[data-product-root]", initProductForm],
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
