/* ==========================================================================
   Origin page · the scroll-driven sections.
     [data-marquee]    infinite drag marquee
     [data-xfade]      displacement-map crossfade + its story captions
     [data-stack]      stacked "moment" cards
     [data-grid3d]     3D scroll grid
     [data-morph]      silhouette morph switcher
     [data-wallpaper]  typographic wallpaper marquee
     [data-split]      pinned split-reveal panel
     [data-scenes]     scenario carousel
   ========================================================================== */
(function () {
  "use strict";
  var W = window.Wango || {};
  var reduced = W.reduced ? W.reduced() : false;

  /* ── drag marquee ─────────────────────────────────────────────────────────
     Six looped copies sit in a flex track; wheel/drag nudges a target-X and
     the current-X chases it at a fixed lerp, wrapping by one sequence width
     so the loop never runs out of slides. */
  var SHIFT_RATIO = 0.16;   /* parallax shift cap, as a fraction of frame width */
  var PARALLAX_SCALE = 1.34; /* must satisfy (S-1)/2 >= SHIFT_RATIO, or a shift bares an edge */

  function initMarquee(root) {
    var track = root.querySelector("[data-marquee-track]");
    if (!track || reduced) return;
    var total = parseInt(root.dataset.slideCount, 10) || 1;
    function isMobile() { return window.innerWidth < 1000; }
    var slideWidth = isMobile() ? 215 : 390;

    var s = { currentX: 0, targetX: 0, dragging: false, startX: 0, lastX: 0 };
    s.currentX = s.targetX = -(total * slideWidth * 2);

    function wrap() {
      var seq = slideWidth * total;
      if (s.currentX > -seq) { s.currentX -= seq; s.targetX -= seq; }
      else if (s.currentX < -seq * 4) { s.currentX += seq; s.targetX += seq; }
      track.style.transform = "translateX(" + s.currentX + "px)";
    }

    var items = track.querySelectorAll(".w-marquee__item");
    function parallax() {
      var vw = window.innerWidth / 2;
      items.forEach(function (item) {
        var img = item.querySelector("img");
        if (!img) return;
        var r = item.getBoundingClientRect();
        var dist = (r.left + r.width / 2) - vw;
        var cap = SHIFT_RATIO * r.width;
        var shift = Math.max(-cap, Math.min(cap, dist * -0.25));
        img.style.transform = "translateX(" + shift + "px) scale(" + PARALLAX_SCALE + ")";
      });
    }

    (function tick() {
      s.currentX += (s.targetX - s.currentX) * 0.05;
      wrap(); parallax();
      requestAnimationFrame(tick);
    })();

    root.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      s.targetX -= Math.max(Math.min(e.deltaY * 1.75, 150), -150);
    }, { passive: false });

    function down(x) { s.dragging = true; s.startX = x; s.lastX = s.targetX; }
    function move(x) { if (s.dragging) s.targetX = s.lastX + (x - s.startX) * 1.5; }
    function up() { s.dragging = false; }
    root.addEventListener("mousedown", function (e) { down(e.clientX); });
    window.addEventListener("mousemove", function (e) { move(e.clientX); });
    window.addEventListener("mouseup", up);
    root.addEventListener("touchstart", function (e) { down(e.touches[0].clientX); }, { passive: true });
    window.addEventListener("touchmove", function (e) { move(e.touches[0].clientX); }, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("resize", function () { slideWidth = isMobile() ? 215 : 390; });
  }

  /* ── displacement crossfade ───────────────────────────────────────────── */
  var FRAG_XFADE =
    "uniform sampler2D u_texture0; uniform sampler2D u_texture1; uniform sampler2D u_displacement;" +
    "uniform float u_progress; uniform float u_strength; uniform float u_rgbShift; uniform float u_scale;" +
    "uniform vec2 u_resolution; uniform vec2 u_textureResolution0; uniform vec2 u_textureResolution1;" +
    "varying vec2 vUv;" +
    "vec2 coverUV(vec2 uv, vec2 planeRes, vec2 texRes) {" +
    "  float scale = max(planeRes.x / texRes.x, planeRes.y / texRes.y);" +
    "  vec2 newSize = texRes * scale;" +
    "  return uv * (planeRes / newSize) + (newSize - planeRes) / 2.0 / newSize;" +
    "}" +
    "void main() {" +
    "  float disp = texture2D(u_displacement, vUv).r;" +
    "  disp = mix(disp, disp * (sin(vUv.y * 10.0 + u_progress * 6.28) * 0.5 + 0.5), 0.3);" +
    "  vec2 uv0 = coverUV(vUv, u_resolution, u_textureResolution0);" +
    "  vec2 uv1 = coverUV(vUv, u_resolution, u_textureResolution1);" +
    "  float scaleEffect = 1.0 + u_progress * (1.0 - u_progress) * u_scale;" +
    "  vec2 center = vec2(0.5);" +
    "  vec2 d0 = (uv0 - center) / scaleEffect + center + u_progress * disp * u_strength * vec2(1.0, 0.5);" +
    "  vec2 d1 = (uv1 - center) * scaleEffect + center - (1.0 - u_progress) * disp * u_strength * vec2(1.0, 0.5);" +
    "  float o = u_progress * (1.0 - u_progress) * u_rgbShift;" +
    "  vec4 tex0 = vec4(texture2D(u_texture0, d0 + vec2(o,0.0)).r, texture2D(u_texture0, d0).g, texture2D(u_texture0, d0 - vec2(o,0.0)).b, texture2D(u_texture0, d0).a);" +
    "  vec4 tex1 = vec4(texture2D(u_texture1, d1 + vec2(o,0.0)).r, texture2D(u_texture1, d1).g, texture2D(u_texture1, d1 - vec2(o,0.0)).b, texture2D(u_texture1, d1).a);" +
    "  gl_FragColor = mix(tex0, tex1, smoothstep(0.0, 1.0, u_progress));" +
    "}";

  function initXfade(outer) {
    var sticky = outer.querySelector("[data-xfade-sticky]");
    var fallbackImg = sticky && sticky.querySelector("img");
    var srcs = (outer.dataset.images || "").split("|").filter(Boolean);
    var captions = outer.parentElement.querySelectorAll("[data-xfade-caption]");
    var dots = outer.parentElement.querySelectorAll("[data-xfade-dots] i");

    outer.style.height = (srcs.length * 100) + "vh";

    function showCaption(i) {
      captions.forEach(function (c) {
        var on = parseInt(c.dataset.frame, 10) === i;
        c.hidden = !on;
        if (on) { c.classList.remove("w-fadeup"); void c.offsetWidth; c.classList.add("w-fadeup"); }
      });
      dots.forEach(function (d, n) { d.classList.toggle("is-on", n === i); });
    }
    showCaption(0);

    if (reduced || srcs.length < 2 || !window.WangoGL) return;

    var canvas = document.createElement("canvas");
    sticky.appendChild(canvas);
    var gl = WangoGL.quad(canvas, { frag: FRAG_XFADE });
    if (!gl) return;
    if (fallbackImg) fallbackImg.style.display = "none";

    /* Generated noise displacement map, standing in for the source's own file. */
    var nc = document.createElement("canvas");
    nc.width = nc.height = 256;
    var nctx = nc.getContext("2d");
    var nimg = nctx.createImageData(256, 256);
    for (var i = 0; i < nimg.data.length; i += 4) {
      var v = Math.random() * 255;
      nimg.data[i] = nimg.data[i + 1] = nimg.data[i + 2] = v; nimg.data[i + 3] = 255;
    }
    nctx.putImageData(nimg, 0, 0);
    gl.set("u_displacement", { texture: nc });
    gl.set("u_progress", 0); gl.set("u_strength", 0.8);
    gl.set("u_rgbShift", 0.05); gl.set("u_scale", 0.15);

    function resize() {
      var w = sticky.clientWidth, h = sticky.clientHeight;
      gl.resize(w, h);
      gl.set("u_resolution", [w, h]);
    }
    resize();
    new ResizeObserver(resize).observe(sticky);

    var images = [], loaded = 0, current = 0, target = 0, busy = false;
    srcs.forEach(function (src, n) {
      WangoGL.loadImage(src).then(function (img) {
        images[n] = img;
        if (++loaded === srcs.length) {
          gl.set("u_texture0", { texture: images[0] });
          gl.set("u_texture1", { texture: images[0] });
          gl.set("u_textureResolution0", [images[0].naturalWidth, images[0].naturalHeight]);
          gl.set("u_textureResolution1", [images[0].naturalWidth, images[0].naturalHeight]);
        }
      }).catch(function () {});
    });

    function transitionTo(index) {
      if (index !== current) showCaption(index);
      if (index === current || busy || !images[index] || loaded !== srcs.length) { target = index; return; }
      target = index; busy = true;
      gl.set("u_texture1", { texture: images[index] });
      gl.set("u_textureResolution1", [images[index].naturalWidth, images[index].naturalHeight]);
      var p = { v: 0 };
      gsap.to(p, {
        v: 1, duration: 0.8, ease: "power3.inOut",
        onUpdate: function () { gl.set("u_progress", p.v); },
        onComplete: function () {
          gl.set("u_texture0", { texture: images[index] });
          gl.set("u_textureResolution0", [images[index].naturalWidth, images[index].naturalHeight]);
          gl.set("u_progress", 0);
          current = index; busy = false;
          if (target !== current) transitionTo(target);
        }
      });
    }

    ScrollTrigger.create({
      trigger: outer, start: "top top", end: "bottom bottom", scrub: true,
      onUpdate: function (self) {
        if (loaded !== srcs.length) return;
        transitionTo(Math.round(self.progress * (srcs.length - 1)));
      }
    });

    (function tick() { gl.render(); requestAnimationFrame(tick); })();
  }

  /* ── stacked cards ────────────────────────────────────────────────────── */
  function initStack(root) {
    if (!window.gsap) return;
    if (window.CustomEase && !CustomEase.get("stackEase")) CustomEase.create("stackEase", "0.83, 0, 0.17, 1");
    var ease = window.CustomEase ? "stackEase" : "power3.inOut";
    var busy = false;

    function splitChars(el, text) {
      el.innerHTML = "";
      for (var i = 0; i < text.length; i++) {
        var span = document.createElement("span");
        span.textContent = text[i] === " " ? " " : text[i];
        span.style.position = "relative";
        span.style.display = "inline-block";
        el.appendChild(span);
      }
    }
    function cards() { return Array.prototype.slice.call(root.querySelectorAll(".sl-card")); }
    function position() {
      gsap.to(cards(), {
        y: function (i) { return (-18 + 18 * i) + "%"; },
        z: function (i) { return 18 * i; },
        duration: reduced ? 0 : 1, ease: ease, stagger: -0.08
      });
    }
    cards().forEach(function (card) {
      var h3 = card.querySelector(".sl-copy h3"), p = card.querySelector(".sl-copy p");
      if (h3) splitChars(h3, h3.dataset.text || "");
      if (p) splitChars(p, p.dataset.text || "");
    });
    position();

    // Source used a flat -220px tuned to its own fixed card height; yPercent of
    // the span's own box clears a responsive card at any size.
    gsap.set(root.querySelectorAll(".sl-card .sl-copy h3 span"), { yPercent: -400 });
    gsap.set(root.querySelectorAll(".sl-card .sl-copy p span"), { y: 60, opacity: 0 });
    var last = cards()[cards().length - 1];
    if (last) {
      gsap.set(last.querySelectorAll(".sl-copy h3 span"), { yPercent: 0 });
      gsap.set(last.querySelectorAll(".sl-copy p span"), { y: 0, opacity: 1 });
    }

    root.addEventListener("click", function () {
      if (busy || reduced) return;
      busy = true;
      var list = cards(), lastCard = list.pop(), upcoming = list[list.length - 1];
      if (!upcoming) { busy = false; return; }
      gsap.to(lastCard.querySelectorAll(".sl-copy h3 span"), { yPercent: 400, duration: 0.7, ease: ease, stagger: 0.03 });
      gsap.to(lastCard.querySelectorAll(".sl-copy p span"), { y: 40, opacity: 0, duration: 0.45, ease: "power3.out", stagger: 0.015 });
      gsap.to(lastCard, {
        y: "+=160%", duration: 0.78, ease: ease,
        onComplete: function () {
          root.prepend(lastCard);
          position();
          gsap.set(lastCard.querySelectorAll(".sl-copy h3 span"), { yPercent: -400 });
          gsap.set(lastCard.querySelectorAll(".sl-copy p span"), { y: 60, opacity: 0 });
          setTimeout(function () { busy = false; }, 420);
        }
      });
      gsap.to(upcoming.querySelectorAll(".sl-copy h3 span"), { yPercent: 0, duration: 0.9, ease: ease, stagger: 0.04 });
      gsap.to(upcoming.querySelectorAll(".sl-copy p span"), { y: 0, opacity: 1, duration: 0.55, ease: "power3.out", stagger: 0.02, delay: 0.12 });
    });
  }

  /* ── 3D scroll grid ───────────────────────────────────────────────────── */
  function initGrid3d(root) {
    if (reduced || !window.gsap) return;
    var wrap = root.querySelector(".s3g-wrap");
    if (!wrap) return;
    var items = root.querySelectorAll(".s3g-item");
    var inners = root.querySelectorAll(".s3g-item-inner");
    gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: wrap, start: "top bottom+=5%", end: "bottom top-=5%", scrub: true }
    })
      .set(wrap, { rotationY: 25 })
      .set(items, { z: function () { return gsap.utils.random(-1600, 200); } })
      .fromTo(items, { xPercent: function () { return gsap.utils.random(-1000, -500); } },
                     { xPercent: function () { return gsap.utils.random(500, 1000); } }, 0)
      .fromTo(inners, { scale: 2 }, { scale: 0.5 }, 0);
  }

  /* ── silhouette morph ─────────────────────────────────────────────────── */
  function initMorph(root) {
    var canvas = root.querySelector("canvas");
    var readout = root.querySelector("[data-morph-readout]");
    var buttons = root.querySelectorAll("[data-morph-pick]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    canvas.width = 720; canvas.height = 900;

    var srcs = (root.dataset.images || "").split("|").filter(Boolean);
    var n = srcs.length;
    if (!n) return;
    var imgs = [], loaded = 0;
    srcs.forEach(function (src, i) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { imgs[i] = img; loaded++; };
      img.src = src;
    });

    var progress = 1, target = 1, startVal = 1, startTs = null, animId = null;

    (function render() {
      if (loaded === n) {
        var p = progress;
        var base = Math.floor(p - 1) % n;
        var from = ((base % n) + n) % n;
        var to = (from + 1) % n;
        var t = p - 1 - Math.floor(p - 1);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.drawImage(imgs[from], 0, 0, canvas.width, canvas.height);
        if (t > 0.001) { ctx.globalAlpha = t; ctx.drawImage(imgs[to], 0, 0, canvas.width, canvas.height); }
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(render);
    })();

    function shortestPath(start, end, len) {
      var diffs = [end - start, end + len - start, end - (start + len)];
      var abs = diffs.map(Math.abs);
      return diffs[abs.indexOf(Math.min.apply(null, abs))];
    }
    function animate(ts) {
      if (!startTs) startTs = ts;
      var elapsed = ts - startTs, duration = 900;
      if (elapsed < duration) {
        var val = startVal + shortestPath(startVal, target, n) * (elapsed / duration);
        if (val > n) val -= n;
        if (val < 1) val += n;
        progress = val;
        animId = requestAnimationFrame(animate);
      } else {
        progress = target; animId = null; startTs = null;
      }
      if (readout) readout.textContent = progress.toFixed(2);
    }
    buttons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        if (animId) cancelAnimationFrame(animId);
        startTs = null; startVal = progress; target = i + 1;
        animId = requestAnimationFrame(animate);
      });
    });
  }

  /* ── typographic wallpaper ────────────────────────────────────────────── */
  function initWallpaper(root) {
    if (reduced || !window.gsap) return;
    root.querySelectorAll(".wwm-row").forEach(function (row, i) {
      gsap.fromTo(row, { xPercent: 0 }, {
        xPercent: 15 * (i % 2 === 0 ? -1 : 1), ease: "none",
        scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: true }
      });
    });
  }

  /* ── split reveal panel ───────────────────────────────────────────────── */
  function initSplit(outer) {
    if (reduced || !window.gsap) return;
    var root = outer.querySelector(".srp");
    if (!root) return;
    var left = root.querySelector(".srp-left"), right = root.querySelector(".srp-right");
    var center = root.querySelector(".srp-center"), second = root.querySelector(".srp-second");
    gsap.set(left, { xPercent: 140, opacity: 0.15, scale: 1.6 });
    gsap.set(right, { xPercent: -140, opacity: 0.15, scale: 1.6 });
    gsap.set(second, { autoAlpha: 0, y: 40 });
    // A sticky wrapper rather than pin:true — pinning fights Lenis.
    gsap.timeline({ scrollTrigger: { trigger: outer, start: "top top", end: "bottom bottom", scrub: 1 } })
      .to(left, { xPercent: 0, opacity: 1, scale: 1, ease: "power2.out" }, 0)
      .to(right, { xPercent: 0, opacity: 1, scale: 1, ease: "power2.out" }, 0)
      .to(center, { scale: 1, ease: "power2.out" }, 0)
      .to(second, { autoAlpha: 1, y: 0, ease: "power2.out" }, 0.4);
  }

  /* ── scenario carousel ─────────────────────────────────────────────────
     Embla in the React build; here the native CSS scroll-snap track drives
     itself and only the tab ↔ panel sync needs script. */
  function initScenes(root) {
    var viewport = root.querySelector("[data-scenes-viewport]");
    var slides = root.querySelectorAll("[data-scene-slide]");
    var tabs = root.querySelectorAll("[data-scene-tab]");
    if (!viewport || !slides.length) return;

    function select(i) {
      slides.forEach(function (s, n) { s.classList.toggle("is-active", n === i); });
      tabs.forEach(function (t, n) { t.setAttribute("aria-selected", String(n === i)); });
    }
    select(0);

    /* The tab → panel glide is animated by hand rather than with
       `behavior: "smooth"`. Measured in this exact markup: a native smooth
       scroll on a `scroll-snap-type: x mandatory` container either lands on
       the wrong slide or (with snap switched off first) never starts at all —
       scrollLeft stayed at its origin for the whole animation. Setting
       scrollLeft per frame always moves, and snap is disabled only for the
       duration so it cannot grab the in-flight position; the scroll↔tab sync
       is suppressed at the same time so an intermediate frame cannot
       re-select a slide behind the target. */
    var animating = false;
    function glideTo(i) {
      var from = viewport.scrollLeft;
      var to = slides[i].offsetLeft - slides[0].offsetLeft;
      if (Math.abs(to - from) < 2) return;
      animating = true;
      viewport.style.scrollSnapType = "none";
      if (W.reduced()) {
        viewport.scrollLeft = to;
        viewport.style.scrollSnapType = "";
        animating = false;
        return;
      }
      var t0 = performance.now(), dur = 520;
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);            /* power3.out */
        viewport.scrollLeft = from + (to - from) * e;
        if (p < 1) { requestAnimationFrame(step); return; }
        viewport.style.scrollSnapType = "";
        /* Hold the sync off a moment longer: restoring snap emits one more
           scroll event, and on the LAST slide the scroll clamps short of the
           target, so that trailing event would otherwise re-select the
           slide before it and leave the tab and the panel disagreeing. */
        setTimeout(function () { animating = false; }, 180);
      })(t0);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(i); glideTo(i); });
    });

    /* Throttled on a timestamp rather than a requestAnimationFrame latch.
       A rAF latch (`ticking = true` until the frame runs) never clears in a
       backgrounded tab, because rAF does not fire there — measured: after one
       hidden-tab scroll the sync stopped for good and never recovered when
       the tab came back. A timestamp cannot get stuck. */
    var lastSync = 0;
    function syncFromScroll() {
      var now = Date.now();
      if (animating || now - lastSync < 80) return;
      lastSync = now;
      var x = viewport.scrollLeft + slides[0].offsetLeft;
      var best = 0, bestD = Infinity;
      slides.forEach(function (s, n) {
        var d = Math.abs(s.offsetLeft - x);
        if (d < bestD) { bestD = d; best = n; }
      });
      select(best);
    }
    viewport.addEventListener("scroll", syncFromScroll, { passive: true });
  }

  var MAP = [
    ["[data-marquee]", initMarquee],
    ["[data-xfade]", initXfade],
    ["[data-stack]", initStack],
    ["[data-grid3d]", initGrid3d],
    ["[data-morph]", initMorph],
    ["[data-wallpaper]", initWallpaper],
    ["[data-split]", initSplit],
    ["[data-scenes]", initScenes]
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
