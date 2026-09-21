/* ==========================================================================
   Product page · [data-boxhero] · [data-explode] · [data-sound]
   ========================================================================== */
(function () {
  "use strict";
  var W = window.Wango || {};
  var reduced = W.reduced ? W.reduced() : false;

  /* ── box-reveal hero: centred stack easing into two columns ───────────────
     A hand-rolled FLIP, NOT Flip.from({ absolute: true }).

     `absolute: true` pulls both elements out of flow for the whole tween. The
     wrapper's height then collapses to 0, and the section (which centres its
     content) re-centres around nothing; on the last frame the elements return
     to flow and the video jumps ~112px straight up in a single frame. That
     was the "teleport" — measured by seeking the tween: the video's centre-y
     went 609 → 542 across 95% of the tween, then 542 → 430 on the final frame.

     Here the layout switches ONCE, instantly, to its final state; every
     element is then pulled back to where it visibly was with a transform and
     eased to rest. Nothing leaves the flow, so the wrapper never collapses and
     there is no frame at which anything jumps. The video rides a diagonal
     path (left and up); the copy rides the mirror path (right and down).
     Below md (and under reduced motion) the centred stack IS the permanent
     layout, so there is nothing to animate. */
  function centreOf(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }

  function initBoxHero(section) {
    var wrap = section.querySelector("[data-boxhero-wrap]");
    if (!wrap || reduced || !window.gsap) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    var text = wrap.querySelector(".w-boxhero__text");
    var media = wrap.querySelector(".w-boxhero__media");
    var visual = media && media.firstElementChild;   /* the max-width box the eye actually sees */
    if (!text || !media || !visual) return;

    setTimeout(function () {
      if (wrap.classList.contains("is-split")) return;
      gsap.killTweensOf([text, media]);

      var tFirst = centreOf(text.getBoundingClientRect());
      var vFirst = centreOf(visual.getBoundingClientRect());

      wrap.classList.add("is-split");                   /* final layout, instantly */

      var tLast = centreOf(text.getBoundingClientRect());
      var vLast = centreOf(visual.getBoundingClientRect());
      var mRect = media.getBoundingClientRect();
      var scale = vFirst.w / vLast.w;

      var EASE = "power2.inOut", DUR = 1.7;
      /* copy: translate only — scaling text would distort it */
      gsap.fromTo(text,
        { x: tFirst.x - tLast.x, y: tFirst.y - tLast.y },
        { x: 0, y: 0, duration: DUR, ease: EASE, clearProps: "transform" });

      /* video: scale about the visual's own centre, so it neither drifts nor
         pops while it settles into the narrower column */
      gsap.fromTo(media,
        { x: vFirst.x - vLast.x, y: vFirst.y - vLast.y, scale: scale,
          transformOrigin: (vLast.x - mRect.left) + "px " + (vLast.y - mRect.top) + "px" },
        { x: 0, y: 0, scale: 1, duration: DUR, ease: EASE, clearProps: "transform,transformOrigin" });
    }, 2400); /* lets the intro settle first */
  }

  /* ── exploded view: video currentTime scrubbed off scroll ─────────────── */
  function initExplode(outer) {
    var video = outer.querySelector("video");
    var callouts = outer.querySelectorAll("[data-explode-callout]");
    if (!video) return;

    if (reduced) {
      // No scrub to tie to: land on the fully-exploded last frame and show
      // every callout rather than never revealing them.
      video.pause();
      video.addEventListener("loadedmetadata", function () { video.currentTime = video.duration || 0; }, { once: true });
      callouts.forEach(function (el) { el.style.opacity = 1; el.style.transform = "none"; });
      return;
    }
    if (!window.ScrollTrigger) return;

    video.pause();
    var ready = false, target = 0;
    video.addEventListener("loadedmetadata", function () { ready = true; });
    if (window.Wango && Wango.videoFromBlob) Wango.videoFromBlob(video);
    gsap.set(callouts, { opacity: 0, y: 24 });
    /* One seek in flight at a time, started from the ticker: a seek per scroll
       event cancelled the previous one before a frame landed. */
    gsap.ticker.add(function () {
      if (!ready || !video.duration || video.seeking) return;
      if (Math.abs(video.currentTime - target) > 0.01) video.currentTime = target;
    });

    ScrollTrigger.create({
      trigger: outer, start: "top top", end: "bottom bottom", scrub: 1,
      onUpdate: function (self) {
        var p = self.progress;
        // The first ~70% drives the explode; the callouts arrive after, one
        // at a time, so they label the parts instead of competing with them.
        if (ready && video.duration) {
          target = gsap.utils.clamp(0, 1, p / 0.7) * video.duration;
        }
        callouts.forEach(function (el, i) {
          var inAmt = gsap.utils.clamp(0, 1, (p - (0.72 + i * 0.1)) / 0.12);
          gsap.set(el, { opacity: inAmt, y: 24 * (1 - inAmt) });
        });
      }
    });
  }

  /* ── sound filter ─────────────────────────────────────────────────────── */
  var EARBUD_X_PCT = 0.5, EARBUD_Y_PCT = 0.42, EARBUD_W = 130;

  function initSound(root) {
    var canvas = root.querySelector("canvas");
    var heading = root.querySelector("[data-sound-head]");
    var audioEl = root.querySelector("audio");
    var button = root.querySelector("[data-sound-filter]");
    var muteBtn = root.querySelector("[data-sound-mute]");
    var outLabel = root.querySelector("[data-sound-outlabel]");
    if (!canvas || !heading) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var muted = false, filtered = false;
    if (heading) { heading.style.opacity = reduced ? 1 : 0; heading.style.transform = reduced ? "none" : "translateY(18px)"; }

    var w = 0, h = 0;
    function resize() {
      var rect = root.getBoundingClientRect();
      w = rect.width; h = rect.height;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    new ResizeObserver(resize).observe(root);

    /* The source PNG's "black" is a photographic near-black, not #000, so
       drawn straight onto the canvas it shows as a faint rectangle. Zeroing
       the alpha of every near-black pixel once removes the box regardless of
       the exact source black level. */
    var earbudCanvas = null;
    var earbud = new Image();
    earbud.crossOrigin = "anonymous";
    earbud.onload = function () {
      var off = document.createElement("canvas");
      off.width = earbud.naturalWidth; off.height = earbud.naturalHeight;
      var oc = off.getContext("2d");
      if (!oc) return;
      oc.drawImage(earbud, 0, 0);
      try {
        var frame = oc.getImageData(0, 0, off.width, off.height), d = frame.data, TH = 22;
        for (var p = 0; p < d.length; p += 4) if (d[p] < TH && d[p + 1] < TH && d[p + 2] < TH) d[p + 3] = 0;
        oc.putImageData(frame, 0, 0);
      } catch (e) { /* tainted canvas — draw it unkeyed rather than not at all */ }
      earbudCanvas = off;
    };
    if (root.dataset.earbud) earbud.src = root.dataset.earbud;

    /* Web Audio graph, created lazily on the first real user gesture. */
    var audioCtx = null, filterNode = null, gainNode = null;
    var RAW_FREQ = 19000, SOFT_FREQ = 650, RAW_GAIN = 0.5, SOFT_GAIN = 0.3;
    function ensureGraph() {
      if (audioCtx || !audioEl) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        var src = audioCtx.createMediaElementSource(audioEl);
        filterNode = audioCtx.createBiquadFilter();
        filterNode.type = "lowpass"; filterNode.frequency.value = RAW_FREQ;
        gainNode = audioCtx.createGain(); gainNode.gain.value = RAW_GAIN;
        src.connect(filterNode).connect(gainNode).connect(audioCtx.destination);
      } catch (e) { /* no Web Audio — the plain <audio> still plays, unfiltered */ }
    }
    function startAudio() {
      if (muted || !audioEl || !audioEl.getAttribute("src")) return;
      ensureGraph();
      if (audioCtx) audioCtx.resume().catch(function () {});
      audioEl.play().catch(function () {});
    }
    function stopAudio() { if (audioEl) audioEl.pause(); }
    function rampFilter(on) {
      if (!audioCtx || !filterNode || !gainNode) return;
      var now = audioCtx.currentTime;
      filterNode.frequency.cancelScheduledValues(now);
      filterNode.frequency.setValueAtTime(filterNode.frequency.value, now);
      filterNode.frequency.linearRampToValueAtTime(on ? SOFT_FREQ : RAW_FREQ, now + 1.3);
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(on ? SOFT_GAIN : RAW_GAIN, now + 1.3);
    }

    var reach = { v: 0 };
    if (button) button.addEventListener("click", function () {
      startAudio(); rampFilter(true);
      if (window.gsap) {
        gsap.to(reach, { v: 1, duration: 1.8, ease: "power2.out" });
        gsap.to(button, { opacity: 0, duration: 0.5, ease: "power1.out", onComplete: finishFilter });
      } else { reach.v = 1; finishFilter(); }
    });
    function finishFilter() {
      filtered = true;
      if (button) { button.disabled = true; button.textContent = button.dataset.labelOn || button.textContent; }
      if (outLabel) outLabel.textContent = outLabel.dataset.labelOn || outLabel.textContent;
    }

    if (muteBtn) muteBtn.addEventListener("click", function () {
      muted = !muted;
      muteBtn.setAttribute("aria-pressed", String(muted));
      muteBtn.querySelectorAll("[data-mute-on]").forEach(function (n) { n.style.display = muted ? "" : "none"; });
      muteBtn.querySelectorAll("[data-mute-off]").forEach(function (n) { n.style.display = muted ? "none" : ""; });
      if (!audioEl) return;
      audioEl.muted = muted;
      // Muting must actually stop the sound, not just silence a running stream.
      if (muted) audioEl.pause();
      else {
        var r = root.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) startAudio();
      }
    });

    /* A fanned BUNDLE of thin parallel strands — "noisy" = many strands fanned
       wide with per-strand jitter; "filtered" = one clean strand, no fan.
       Real elapsed time feeds every sin(), so there is no loop point to jump at. */
    var STRANDS = 7;
    function strandParams(i) {
      var seed = i * 1.3713 + 0.4;
      return { freq: 7 + (i % 4) * 2.4 + Math.sin(seed) * 1.1, speed: 1.9 + (i % 3) * 0.55, phase: seed * 3.1, jitterAmp: 3 + (i % 4) * 1.6 };
    }
    function drawBundle(x0, x1, cy, t, strands, fan, fromLeft, reachFrac) {
      var span = x1 - x0, drawSpan = span * reachFrac;
      if (drawSpan <= 1) return;
      ctx.globalAlpha = Math.min(1, reachFrac / 0.12);
      var steps = Math.max(2, Math.round(drawSpan / 5));
      for (var s = 0; s < strands; s++) {
        var pr = strandParams(s);
        var strandT = strands > 1 ? s / (strands - 1) - 0.5 : 0;
        ctx.beginPath();
        for (var i = 0; i <= steps; i++) {
          var x = x0 + (drawSpan * i) / steps;
          var nx = (x - x0) / span;
          var converge = fromLeft ? 1 - nx : nx;
          var baseY = strandT * fan * converge;
          var wobble = Math.sin(nx * pr.freq + t * pr.speed + pr.phase) * (pr.jitterAmp * (0.4 + 0.6 * converge));
          var edgeFade = fromLeft
            ? Math.min(1, nx / 0.1) * Math.min(1, (1 - nx) / 0.04)
            : Math.min(1, (1 - nx) / 0.1) * Math.min(1, nx / 0.04);
          var py = cy + (baseY + wobble) * edgeFade;
          if (i === 0) ctx.moveTo(x, py); else ctx.lineTo(x, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function tick(tMs) {
      if (!reduced) requestAnimationFrame(tick);
      var t = tMs / 1000;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
      var cx = w * EARBUD_X_PCT, cy = h * EARBUD_Y_PCT;

      // Explicit same-colour zero-alpha stop — never the bare "transparent"
      // keyword, which fades toward black and leaves a visible ring.
      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, EARBUD_W * 1.6);
      glow.addColorStop(0, "rgba(176,166,230,0.22)");
      glow.addColorStop(1, "rgba(176,166,230,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - EARBUD_W * 1.6, cy - EARBUD_W * 1.6, EARBUD_W * 3.2, EARBUD_W * 3.2);

      ctx.save();
      ctx.strokeStyle = "rgba(165,175,225,0.6)"; ctx.lineWidth = 1.1;
      ctx.shadowColor = "rgba(165,175,225,0.4)"; ctx.shadowBlur = 4;
      drawBundle(0, cx - EARBUD_W * 0.5, cy, t, STRANDS, 52, true, 1);
      ctx.restore();

      if (reach.v > 0.001) {
        ctx.save();
        ctx.strokeStyle = "rgba(215,212,248,0.85)"; ctx.lineWidth = 1.5;
        ctx.shadowColor = "rgba(205,198,255,0.55)"; ctx.shadowBlur = 7;
        drawBundle(cx + EARBUD_W * 0.5, w, cy, t, 1, 0, false, reach.v);
        ctx.restore();
      }

      if (earbudCanvas) {
        var iw = EARBUD_W, ih = iw * (earbudCanvas.height / earbudCanvas.width || 1.5);
        ctx.drawImage(earbudCanvas, cx - iw / 2, cy - ih / 2, iw, ih);
      }
    }
    if (reduced) { setTimeout(function () { tick(0); }, 300); } else { requestAnimationFrame(tick); }

    /* Hysteresis so a section sitting on the boundary can't stutter the track
       on and off: START at ≥50% visible, STOP only once fully gone. */
    new IntersectionObserver(function (entries) {
      var e = entries[0];
      if (!e) return;
      if (e.intersectionRatio >= 0.5) {
        startAudio();
        if (!reduced && window.gsap) gsap.to(heading, { opacity: 1, y: 0, duration: 1, ease: "power2.out" });
        else { heading.style.opacity = 1; heading.style.transform = "none"; }
      } else if (!e.isIntersecting) {
        stopAudio();
      }
    }, { threshold: [0, 0.5] }).observe(root);

    // Audio in a background tab is the same problem as audio off-screen.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopAudio();
      else {
        var r = root.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) startAudio();
      }
    });
  }

  /* ── scroll product reveal ("Origin dönüyor") ────────────────────────────
     Ported from ProductScrollReveal in lib/product-reveal.tsx. A tall outer
     wrapper + `position: sticky` on the stage gives "stays put while you
     scroll through it" in pure CSS, so GSAP never reparents a live node.
     ONE scroll progress value drives everything:
       1 · the eyebrow holds dead-centre, then lifts and blurs away
       2 · a circular scene-wipe grows from the centre
       3 · the title rises into that same centre spot
       4 · a spec divider scales in, then two tooltips rise at their own marks
       …while the case spins 4 full turns.
     Scroll only sets a TARGET; a rAF loop eases the model toward it with a
     frame-rate-independent factor, so the spin stays a continuous glide even
     when scroll events arrive coarsely. */
  function initScrollReveal(outer) {
    var root = outer.querySelector(".psr-root");
    var host = outer.querySelector("[data-psr-model]");
    if (!root || !host) return;
    var header1 = root.querySelector(".psr-header-1");
    var mask = root.querySelector(".psr-mask");
    var header2 = root.querySelector(".psr-header-2");
    var header2h = root.querySelector(".psr-header-2 h1");
    var dividers = root.querySelectorAll(".psr-divider");
    var revealGroups = [0, 1].map(function (i) {
      return root.querySelectorAll(".psr-tooltip:nth-child(" + (i + 1) + ") .psr-reveal");
    });

    /* No motion / no WebGL: a plain, fully-readable end state instead of a
       stage that never reveals anything. */
    function showStatic() {
      outer.style.height = "auto";
      root.style.position = "relative";
      root.style.height = "auto";
      root.style.minHeight = "0";
      if (header1) header1.style.display = "none";
      mask.style.clipPath = "none";
      mask.style.position = "relative";
      mask.style.padding = "4rem 0";
      host.style.display = "none";
      header2.style.position = "relative";
      header2.style.transform = "none";
      header2.style.opacity = 1; header2.style.visibility = "visible";
      dividers.forEach(function (d) { d.style.transform = "none"; });
      root.querySelectorAll(".psr-reveal").forEach(function (n) { n.style.transform = "none"; n.style.opacity = 1; n.style.visibility = "visible"; });
      var tips = mask.querySelector(".psr-tooltips");
      if (tips) { tips.style.position = "relative"; tips.style.bottom = "auto"; tips.style.marginTop = "2rem"; }
    }

    var view = reduced || !window.WangoCase3D ? null : WangoCase3D.create(host);
    if (!view) { showStatic(); return; }

    /* eyebrow: split into chars that rise once the section is reached */
    var h1 = header1 && header1.querySelector("h1");
    var charSpans = [];
    var split = null;
    if (h1 && window.SplitText) {
      try {
        gsap.registerPlugin(SplitText);
        split = SplitText.create(h1, { type: "chars", charsClass: "char" });
        split.chars.forEach(function (c) { c.innerHTML = "<span>" + c.innerHTML + "</span>"; });
        charSpans = h1.querySelectorAll(".char > span");
        gsap.set(charSpans, { yPercent: 110 });
        ScrollTrigger.create({
          trigger: root, start: "75% bottom",
          onEnter: function () { gsap.to(charSpans, { yPercent: 0, duration: 1, ease: "power3.out", stagger: 0.03 }); },
          onLeaveBack: function () { gsap.to(charSpans, { yPercent: 110, duration: 1, ease: "power3.out", stagger: 0.03 }); }
        });
      } catch (e) { charSpans = []; }
    }

    var SPINS = 4, scrollP = 0, curSpin = 0, last = performance.now();
    (function loop() {
      var now = performance.now();
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      curSpin += (scrollP * SPINS * Math.PI * 2 - curSpin) * (1 - Math.exp(-dt * 6));
      view.setSpin(curSpin);
      view.render(dt);
      requestAnimationFrame(loop);
    })();

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function easeOut(v) { return 1 - Math.pow(1 - v, 3); }

    gsap.set(header2, { yPercent: 42, autoAlpha: 0, scale: 0.92 });
    gsap.set(header2h, { yPercent: 0 });
    gsap.set(dividers, { scaleX: 0 });
    revealGroups.forEach(function (g) { gsap.set(g, { yPercent: 125, autoAlpha: 0 }); });

    /* Driven with gsap.set (no per-tick tween churn) so nothing snaps
       alignment mid-move. */
    function choreo(p) {
      var e = easeOut(clamp01((p - 0.04) / 0.16));
      gsap.set(header1, { yPercent: -64 * e, autoAlpha: 1 - e, filter: "blur(" + (5 * e).toFixed(2) + "px)" });

      var m = clamp01((p - 0.12) / 0.15);
      gsap.set(mask, { clipPath: "circle(" + (m * 122).toFixed(2) + "% at 50% 50%)" });

      var t2 = easeOut(clamp01((p - 0.2) / 0.22));
      gsap.set(header2, { yPercent: 42 * (1 - t2), autoAlpha: t2, scale: 0.92 + 0.08 * t2 });
      /* once the tooltips are due, nudge the title up so it clears them */
      gsap.set(header2h, { yPercent: -16 * easeOut(clamp01((p - 0.62) / 0.28)) });

      gsap.set(dividers, { scaleX: clamp01((p - 0.42) / 0.16) });
      [0.6, 0.78].forEach(function (trg, i) {
        var r = easeOut(clamp01((p - trg) / 0.16));
        gsap.set(revealGroups[i], { yPercent: 125 * (1 - r), autoAlpha: r });
      });
    }
    choreo(0);

    ScrollTrigger.create({
      trigger: outer, start: "top top", end: "bottom bottom", pin: false, scrub: 0.6,
      onUpdate: function (self) { scrollP = self.progress; choreo(self.progress); }
    });
  }

  /* ── orbit gallery ────────────────────────────────────────────────────────
     Ported from OrbitGallery in lib/sliders.tsx. Frames ride a tilted oval;
     the ring idles slowly, speeds up with the wheel, and hovering one frame
     scales it while dimming the rest. */
  function initOrbit(gallery) {
    if (reduced || !window.gsap) return;
    var cfg = { ovalWidthRatio: 0.36, ovalHeightRatio: 0.3, tiltAngle: -18, idleRotationSpeed: 0.035,
                scrollAcceleration: 0.0055, maxRotationSpeed: 2.5, speedEasing: 0.05,
                hoverScale: 1.1, idleZoom: 1.12, dimmedBrightness: 0.35 };
    var nodes = gallery.querySelectorAll(".sl-orbit-item");
    var items = Array.prototype.map.call(nodes, function (wrapper, i) {
      return { wrapper: wrapper, frame: wrapper.querySelector(".sl-orbit-frame"), image: wrapper.querySelector("img"),
               angle: (i / nodes.length) * Math.PI * 2 };
    });
    var rx = 0, ry = 0, tCos = 0, tSin = 0;
    function measure() {
      var b = gallery.getBoundingClientRect();
      rx = b.width * cfg.ovalWidthRatio; ry = b.height * cfg.ovalHeightRatio;
      var rad = cfg.tiltAngle * Math.PI / 180; tCos = Math.cos(rad); tSin = Math.sin(rad);
    }
    measure();
    function place(item, rotation) {
      var a = item.angle + rotation, ox = Math.cos(a) * rx, oy = Math.sin(a) * ry;
      item.wrapper.style.transform = "translate(" + (ox * tCos - oy * tSin) + "px, " + (ox * tSin + oy * tCos) + "px)";
    }
    items.forEach(function (it) { place(it, 0); });

    var ringRotation = 0, direction = 1, speed = cfg.idleRotationSpeed, px = -1, py = -1, hovered = null;
    gallery.addEventListener("wheel", function (e) {
      direction = e.deltaY > 0 ? 1 : -1;
      speed = Math.min(speed + Math.abs(e.deltaY) * cfg.scrollAcceleration, cfg.maxRotationSpeed);
    }, { passive: true });
    gallery.addEventListener("mousemove", function (e) {
      var r = gallery.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top;
    });
    gallery.addEventListener("mouseleave", function () { px = py = -1; });
    window.addEventListener("resize", measure);

    function applyHover(active) {
      items.forEach(function (item) {
        var isActive = item === active, isDimmed = !!active && !isActive;
        gsap.to(item.frame, { scale: isActive ? cfg.hoverScale : 1, duration: 1, ease: "expo.out", overwrite: true });
        gsap.to(item.image, { scale: isActive ? 1 : cfg.idleZoom, duration: 1, ease: "expo.out", overwrite: true });
        gsap.to(item.wrapper, { filter: "saturate(" + (isDimmed ? 0 : 1) + ") brightness(" + (isDimmed ? cfg.dimmedBrightness : 1) + ")",
                                duration: 1, ease: "expo.out", overwrite: true });
      });
    }

    (function tick() {
      speed += (cfg.idleRotationSpeed - speed) * cfg.speedEasing;
      ringRotation += speed * direction;
      var rad = ringRotation * Math.PI / 180;
      var under = null;
      if (px >= 0) {
        var gb = gallery.getBoundingClientRect();
        var el = document.elementFromPoint(px + gb.left, py + gb.top);
        var wrap = el && el.closest && el.closest(".sl-orbit-item");
        under = items.filter(function (it) { return it.wrapper === wrap; })[0] || null;
      }
      if (under !== hovered) { applyHover(under); hovered = under; }
      items.forEach(function (it) { place(it, rad); });
      requestAnimationFrame(tick);
    })();
  }

  var MAP = [["[data-boxhero]", initBoxHero], ["[data-explode]", initExplode], ["[data-sound]", initSound],
             ["[data-scroll-reveal]", initScrollReveal], ["[data-orbit]", initOrbit]];
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
