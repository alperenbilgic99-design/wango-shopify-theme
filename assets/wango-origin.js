/* ==========================================================================
   Origin page · the two WebGL openers.
   1. [data-origin-hero]  — timed dissolve from the painting into the product
                            macro (ported from origin-hero.tsx).
   2. [data-wordmark]     — a mouse-scrubbable video revealed through the
                            "wango" wordmark (ported from
                            wordmark-story-reveal.tsx).
   Both shaders are carried over verbatim; only three.js is replaced (see
   wango-gl.js for why).
   ========================================================================== */
(function () {
  "use strict";
  var W = window.Wango || {};

  /* Shared GLSL helpers — identical text to the React build's shaders. */
  var SOBEL =
    "mat3 sobelX = mat3(-1.,0.,1.,-2.,0.,2.,-1.,0.,1.);" +
    "mat3 sobelY = mat3(-1.,-2.,-1.,0.,0.,0.,1.,2.,1.);" +
    "float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }" +
    "float sobel(sampler2D tex, vec2 uv, vec2 texel){" +
    "  float gx=0.,gy=0.;" +
    "  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++){" +
    "    vec2 o = vec2(float(i),float(j))*texel;" +
    "    float l = lum(texture2D(tex, uv+o).rgb);" +
    "    gx += l * sobelX[i+1][j+1]; gy += l * sobelY[i+1][j+1];" +
    "  }" +
    "  return sqrt(gx*gx+gy*gy);" +
    "}";

  var NOISE =
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }" +
    "float noise(vec2 p){" +
    "  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);" +
    "  float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));" +
    "  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);" +
    "}" +
    "float fbm(vec2 p){ float v=0., a=0.5, fq=1.;" +
    "  for(int i=0;i<5;i++){ v += a*noise(p*fq); a*=0.5; fq*=2.; } return v; }";

  var FRAG_TOP =
    "uniform sampler2D uTexture; uniform vec2 uResolution; uniform vec2 uImageResolution;" +
    "uniform float uDissolve; uniform vec2 uCenter; uniform float uGrayscale;" +
    "uniform float uEdgeIntensity; uniform float uEdgeBrightness;" +
    "varying vec2 vUv;" + SOBEL + NOISE +
    "void main(){" +
    "  vec2 ratio = vec2(" +
    "    min((uResolution.x/uResolution.y)/(uImageResolution.x/uImageResolution.y), 1.0)," +
    "    min((uResolution.y/uResolution.x)/(uImageResolution.y/uImageResolution.x), 1.0));" +
    "  vec2 uv = vec2(vUv.x*ratio.x + (1.-ratio.x)*0.5, vUv.y*ratio.y + (1.-ratio.y)*0.5);" +
    "  vec4 texColor = texture2D(uTexture, uv);" +
    "  float gray = lum(texColor.rgb);" +
    "  texColor.rgb = mix(texColor.rgb, vec3(gray), uGrayscale);" +
    "  vec2 centeredUv = vUv - uCenter;" +
    "  float aspect = uResolution.x/uResolution.y;" +
    "  centeredUv.x *= aspect;" +
    "  float dist = length(centeredUv);" +
    "  float angle = atan(centeredUv.y, centeredUv.x);" +
    "  vec2 pixUv = floor(vUv*uResolution/6.0)*6.0/uResolution;" +
    "  float blockNoise = fbm(pixUv*100.0)*0.15;" +
    "  float angularNoise = fbm(vec2(angle*5.0, 0.0))*0.15;" +
    "  float noisyDist = dist + blockNoise + angularNoise;" +
    "  float maxDist = length(vec2(aspect*0.5, 0.5));" +
    "  float normalizedDist = noisyDist / maxDist;" +
    "  float dissolveThreshold = uDissolve * 1.5;" +
    "  vec2 texel = 1.0/uResolution;" +
    "  float edge = sobel(uTexture, uv, texel);" +
    "  edge = clamp(pow(edge, 0.7)*2.0, 0.0, 1.0);" +
    "  float dissolveMask = smoothstep(dissolveThreshold-0.03, dissolveThreshold, normalizedDist);" +
    "  vec3 baseColor = mix(texColor.rgb, vec3(0.0), uGrayscale);" +
    "  vec3 finalColor = baseColor;" +
    "  float edgeGlow = edge * uEdgeIntensity * 2.0 * (1.0 + uGrayscale*3.0);" +
    "  finalColor += vec3(1.0) * edgeGlow * uEdgeBrightness;" +
    "  float edgeZoneWidth = 0.15*(1.0-uDissolve) + 0.02;" +
    "  float edgeZone = smoothstep(dissolveThreshold-edgeZoneWidth, dissolveThreshold-edgeZoneWidth+0.04, normalizedDist)" +
    "                 * smoothstep(dissolveThreshold+0.02, dissolveThreshold-0.02, normalizedDist);" +
    "  float sparkle = hash(floor(vUv*uResolution/4.0)) * edgeZone;" +
    "  float edgeBrightness = (1.0-uDissolve) * uEdgeBrightness * (1.0 + uGrayscale*2.0);" +
    "  finalColor += vec3(sparkle*3.0*edgeBrightness);" +
    "  gl_FragColor = vec4(finalColor, dissolveMask * texColor.a);" +
    "}";

  var FRAG_BOTTOM =
    "uniform sampler2D uTexture; uniform vec2 uResolution; uniform vec2 uImageResolution;" +
    "uniform float uEdgeIntensity; uniform float uDarkness; uniform float uGrayscale;" +
    "varying vec2 vUv;" + SOBEL +
    "void main(){" +
    "  vec2 ratio = vec2(" +
    "    min((uResolution.x/uResolution.y)/(uImageResolution.x/uImageResolution.y), 1.0)," +
    "    min((uResolution.y/uResolution.x)/(uImageResolution.y/uImageResolution.x), 1.0));" +
    "  vec2 uv = vec2(vUv.x*ratio.x + (1.-ratio.x)*0.5, vUv.y*ratio.y + (1.-ratio.y)*0.5);" +
    "  vec4 texColor = texture2D(uTexture, uv);" +
    "  float gray = lum(texColor.rgb);" +
    "  texColor.rgb = mix(texColor.rgb, vec3(gray), uGrayscale);" +
    "  vec2 texel = 1.0/uResolution;" +
    "  float edge = sobel(uTexture, uv, texel);" +
    "  edge = clamp(pow(edge, 0.7)*2.0, 0.0, 1.0);" +
    "  vec3 baseColor = mix(texColor.rgb, vec3(0.0), uDarkness);" +
    "  baseColor += vec3(1.0) * edge * uEdgeIntensity * 2.0;" +
    "  gl_FragColor = vec4(clamp(baseColor, 0.0, 1.0), texColor.a);" +
    "}";

  /* ────────────────────────────────────────────────────────────────────────
     1 · Origin hero
     ──────────────────────────────────────────────────────────────────────── */
  function initOriginHero(section) {
    var host = section.querySelector("[data-origin-host]");
    var fallback = section.querySelector("[data-origin-fallback]");
    var caption = section.querySelector("[data-origin-caption]");
    var copy = section.querySelector("[data-origin-copy]");
    if (!host || !fallback || !caption || !copy) return;

    var artSrc = section.dataset.art;
    var revealSrc = section.dataset.reveal;

    // No motion: skip the WebGL dissolve, land on the end state.
    if (W.reduced() || !window.WangoGL) {
      fallback.style.opacity = 1;
      caption.style.opacity = 0;
      copy.style.opacity = 1;
      copy.style.transform = "none";
      return;
    }

    var cPhoto = document.createElement("canvas");
    var cArt = document.createElement("canvas");
    cPhoto.style.zIndex = "1";
    cArt.style.zIndex = "2";
    host.appendChild(cPhoto);
    host.appendChild(cArt);

    var glArt = WangoGL.quad(cArt, { frag: FRAG_TOP });
    var glPhoto = WangoGL.quad(cPhoto, { frag: FRAG_BOTTOM });
    if (!glArt || !glPhoto) { fallback.style.opacity = 1; copy.style.opacity = 1; copy.style.transform = "none"; return; }

    glArt.set("uCenter", [0.5, 0.5]);
    glArt.set("uDissolve", 0); glArt.set("uGrayscale", 0);
    glArt.set("uEdgeIntensity", 0); glArt.set("uEdgeBrightness", 1);
    glPhoto.set("uEdgeIntensity", 0.6); glPhoto.set("uDarkness", 1); glPhoto.set("uGrayscale", 1);

    var ready = { art: false, photo: false };
    WangoGL.loadImage(artSrc).then(function (img) {
      glArt.set("uTexture", { texture: img });
      glArt.set("uImageResolution", [img.naturalWidth, img.naturalHeight]);
      ready.art = true;
    }).catch(function () {});
    WangoGL.loadImage(revealSrc).then(function (img) {
      glPhoto.set("uTexture", { texture: img });
      glPhoto.set("uImageResolution", [img.naturalWidth, img.naturalHeight]);
      ready.photo = true;
    }).catch(function () { fallback.style.opacity = 1; });

    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      glArt.resize(w, h); glPhoto.resize(w, h);
      glArt.set("uResolution", [w, h]); glPhoto.set("uResolution", [w, h]);
    }
    resize();
    var ro = new ResizeObserver(resize);
    ro.observe(host);

    function applyProgress(p) {
      glArt.set("uDissolve", p);
      glArt.set("uGrayscale", Math.min(1, p / 0.4));
      glArt.set("uEdgeIntensity", p * 0.5);
      glArt.set("uEdgeBrightness", 1 - p);
      var accel = Math.min(1, p * 1.1);
      glPhoto.set("uEdgeIntensity", 0.6 * (1 - accel));
      glPhoto.set("uDarkness", 1 - accel);
      glPhoto.set("uGrayscale", 1 - accel);
    }
    applyProgress(0);

    // Time-driven, not scroll-linked: this must read as an intentional reveal
    // the visitor does not have to scroll to trigger.
    var state = { progress: 0 };
    var tl = gsap.timeline({ delay: 0.35 });
    tl.to(caption, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0)
      .to(caption, { opacity: 0, y: -14, duration: 0.55, ease: "power2.in" }, 3.2)
      .to(state, { progress: 1, duration: 5.5, ease: "power2.inOut", onUpdate: function () { applyProgress(state.progress); } }, 3.25)
      .fromTo(copy, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out" }, 6.5);

    (function tick() {
      if (ready.photo) glPhoto.render();
      if (ready.art) glArt.render();
      section._raf = requestAnimationFrame(tick);
    })();
  }

  /* ────────────────────────────────────────────────────────────────────────
     2 · Wordmark video reveal
     ──────────────────────────────────────────────────────────────────────── */
  var FRAG_WORDMARK =
    "uniform sampler2D uTexture; uniform sampler2D uMaskTex;" +
    "uniform vec2 uResolution; uniform vec2 uImageResolution;" +
    "uniform vec2 uAnchor; uniform vec2 uWordCentre; uniform float uZoom; uniform float uProgress;" +
    "uniform float uPhotoPosX; uniform float uPhotoScale;" +
    "uniform vec2 uMouse; uniform float uMouseStrength; uniform float uTime;" +
    "varying vec2 vUv;" +
    "vec2 cover(vec2 uv, vec2 res, vec2 imgRes, vec2 pos){" +
    "  vec2 ratio = vec2(" +
    "    min((res.x/res.y)/(imgRes.x/imgRes.y), 1.0)," +
    "    min((res.y/res.x)/(imgRes.y/imgRes.x), 1.0));" +
    "  return vec2(uv.x*ratio.x + (1.-ratio.x)*pos.x, uv.y*ratio.y + (1.-ratio.y)*pos.y);" +
    "}" +
    "void main(){" +
    "  vec2 photoUv = cover(vUv, uResolution, uImageResolution, vec2(uPhotoPosX, 0.5));" +
    "  photoUv = (photoUv - 0.5) / uPhotoScale + 0.5;" +
    "  float aspect = uResolution.x / uResolution.y;" +
    "  vec2 toMouse = (vUv - uMouse) * vec2(aspect, 1.0);" +
    "  float dist = length(toMouse);" +
    "  float ripple = sin(dist * 34.0 - uTime * 4.5) * exp(-dist * 6.5) * uMouseStrength;" +
    "  vec2 dir = dist > 0.0001 ? toMouse / dist : vec2(0.0);" +
    "  photoUv += dir * ripple * 0.014;" +
    "  float inBounds = step(0.0, photoUv.x) * step(photoUv.x, 1.0)" +
    "                 * step(0.0, photoUv.y) * step(photoUv.y, 1.0);" +
    "  vec4 texColor = texture2D(uTexture, clamp(photoUv, 0.0, 1.0));" +
    "  vec2 centreBlend = vec2(smoothstep(0.0, 0.6, uProgress));" +
    "  vec2 textureCentre = mix(uWordCentre, uAnchor, centreBlend);" +
    "  vec2 maskBase = cover(vUv, uResolution, vec2(4.0, 1.0), vec2(0.5, 0.5));" +
    "  vec2 maskUv = textureCentre + (maskBase - 0.5) / uZoom;" +
    "  float maskAlpha = texture2D(uMaskTex, clamp(maskUv, 0.0, 1.0)).r;" +
    "  gl_FragColor = vec4(texColor.rgb, texColor.a * maskAlpha * inBounds);" +
    "}";

  var SCRUB_SENSITIVITY = 0.8, START_ZOOM = 0.04, MAX_ZOOM = 220;
  var WORD_CENTRE = [0.5 - 0.06, 0.5], PHOTO_POS_X = 0.42, PHOTO_SCALE = 1.0;

  function initWordmark(outer) {
    var sticky = outer.querySelector("[data-wordmark-sticky]");
    var host = outer.querySelector("[data-wordmark-host]");
    var poster = outer.querySelector("[data-wordmark-poster]");
    var sideCopy = outer.querySelector("[data-wordmark-copy]");
    var continueOuter = document.querySelector("[data-wordmark-continue]");
    var cont = continueOuter && continueOuter.firstElementChild;
    var videoSrc = outer.dataset.video;

    var readBtn = outer.querySelector("[data-wordmark-read]");
    if (readBtn && continueOuter) {
      readBtn.addEventListener("click", function () { W.scrollTo(continueOuter); });
    }

    function showStatic() {
      if (poster) poster.style.opacity = 1;
      if (sideCopy) { sideCopy.style.opacity = 1; sideCopy.style.transform = "translate(-50%,-50%)"; }
      if (cont) { cont.style.opacity = 1; cont.style.transform = "none"; }
    }
    if (!sticky || !host || !videoSrc || W.reduced() || !window.WangoGL) return showStatic();

    /* Rasterise "wango" once, off-screen, then scan for a point that sits deep
       inside a solid stroke (margin on every side) — that is where the mask
       zoom converges, so the final frame lands on ink and never on a gap. */
    var MW = 800, MH = 200;
    var maskCanvas = document.createElement("canvas");
    maskCanvas.width = MW; maskCanvas.height = MH;
    var mctx = maskCanvas.getContext("2d");
    mctx.fillStyle = "#000"; mctx.fillRect(0, 0, MW, MH);
    mctx.fillStyle = "#fff";
    mctx.textAlign = "center"; mctx.textBaseline = "middle";
    mctx.font = '900 170px Quicksand, ui-rounded, system-ui, sans-serif';
    mctx.fillText("wango", MW / 2, MH / 2 + 8);

    var data = mctx.getImageData(0, 0, MW, MH).data;
    function isSolid(x, y) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) return false;
      return data[(y * MW + x) * 4] > 200;
    }
    var MARGIN = 10;
    function hasMargin(x, y) {
      for (var dy = -MARGIN; dy <= MARGIN; dy += MARGIN)
        for (var dx = -MARGIN; dx <= MARGIN; dx += MARGIN)
          if (!isSolid(x + dx, y + dy)) return false;
      return true;
    }
    var anchor = { x: MW / 2, y: MH / 2 }, found = false;
    for (var r = 0; r < Math.max(MW, MH) / 2 && !found; r += 4) {
      for (var a = 0; a < 360 && !found; a += 20) {
        var x = Math.round(MW / 2 + r * Math.cos(a * Math.PI / 180));
        var y = Math.round(MH / 2 + r * Math.sin(a * Math.PI / 180));
        if (hasMargin(x, y)) { anchor = { x: x, y: y }; found = true; }
      }
    }
    var anchorUv = [anchor.x / MW, 1 - anchor.y / MH];

    var canvas = document.createElement("canvas");
    host.appendChild(canvas);
    var gl = WangoGL.quad(canvas, { frag: FRAG_WORDMARK });
    if (!gl) return showStatic();

    gl.set("uMaskTex", { texture: maskCanvas });
    gl.set("uAnchor", anchorUv);
    gl.set("uWordCentre", WORD_CENTRE);
    gl.set("uPhotoPosX", PHOTO_POS_X);
    gl.set("uPhotoScale", PHOTO_SCALE);
    gl.set("uMouse", [0.5, 0.5]);
    gl.set("uMouseStrength", 0);
    gl.set("uTime", 0);
    gl.set("uZoom", START_ZOOM);
    gl.set("uProgress", 0);

    var videoEl = document.createElement("video");
    videoEl.src = videoSrc;
    videoEl.muted = true; videoEl.playsInline = true; videoEl.preload = "auto";
    videoEl.loop = true; videoEl.crossOrigin = "anonymous";

    var textured = false, durationKnown = false, targetTime = 0;
    videoEl.addEventListener("loadedmetadata", function () { durationKnown = true; });
    videoEl.addEventListener("loadeddata", function () {
      videoEl.currentTime = 0;
      gl.set("uTexture", { texture: videoEl, dynamic: true });
      gl.set("uImageResolution", [videoEl.videoWidth, videoEl.videoHeight]);
      textured = true;
      applyZoom(st ? st.progress : 0);
    }, { once: true });
    videoEl.load();

    function applyZoom(p) {
      var t = Math.min(Math.max(p, 0), 1);
      gl.set("uZoom", START_ZOOM * Math.pow(MAX_ZOOM / START_ZOOM, t));
      gl.set("uProgress", t);
    }

    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      gl.resize(w, h);
      gl.set("uResolution", [w, h]);
    }
    resize();
    new ResizeObserver(resize).observe(host);

    var t0 = performance.now(), mouseStrength = 0;
    (function tick() {
      mouseStrength *= 0.94;
      gl.set("uMouseStrength", mouseStrength);
      gl.set("uTime", (performance.now() - t0) / 1000);
      /* Scrub is eased inside the rAF loop rather than applied straight off
         mousemove: a big pointer jump then plays out as a continuous glide
         instead of one hard seek that paints a frame and stalls. */
      if (durationKnown && videoEl.readyState >= 2) {
        var cur = videoEl.currentTime, d = targetTime - cur;
        if (Math.abs(d) > 0.0015) videoEl.currentTime = cur + d * 0.22;
      }
      if (textured) gl.render();
      requestAnimationFrame(tick);
    })();

    var prevX = null;
    sticky.addEventListener("mousemove", function (e) {
      var rect = sticky.getBoundingClientRect();
      gl.set("uMouse", [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height]);
      mouseStrength = 1;
      if (prevX === null) { prevX = e.clientX; return; }
      var delta = e.clientX - prevX;
      prevX = e.clientX;
      if (!durationKnown || !videoEl.duration || isNaN(videoEl.duration)) return;
      var offset = (delta / window.innerWidth) * SCRUB_SENSITIVITY * videoEl.duration;
      targetTime = Math.min(Math.max(targetTime + offset, 0), videoEl.duration);
    });

    gsap.set(sideCopy, { opacity: 0, yPercent: -50, xPercent: -50, y: 24, scale: 0.985 });
    var st = ScrollTrigger.create({
      trigger: outer, start: "top top", end: "bottom bottom", scrub: 1,
      onUpdate: function (self) {
        applyZoom(self.progress);
        // The wordmark is visually gone well before t=1; 0.86–0.98 lands the
        // panel right after the shape disappears and lets it settle before the
        // pin releases.
        var sideIn = gsap.utils.clamp(0, 1, (self.progress - 0.86) / 0.12);
        var e = gsap.parseEase("power2.out")(sideIn);
        gsap.set(sideCopy, { opacity: e, y: 24 * (1 - e), scale: 0.985 + 0.015 * e });
      }
    });

    if (cont) {
      gsap.set(cont, { opacity: 0, y: 40 });
      ScrollTrigger.create({
        trigger: continueOuter, start: "top 75%", end: "top 35%", scrub: 1,
        onUpdate: function (self) { gsap.set(cont, { opacity: self.progress, y: 40 * (1 - self.progress) }); }
      });
    }
  }

  function boot(scope) {
    (scope || document).querySelectorAll("[data-origin-hero]").forEach(initOriginHero);
    (scope || document).querySelectorAll("[data-wordmark]").forEach(initWordmark);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { boot(); });
  else boot();
  document.addEventListener("shopify:section:load", function (e) { boot(e.target); });
})();
