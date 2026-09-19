/* ==========================================================================
   wango-gl — a ~150-line fullscreen-quad WebGL runner.

   The Next.js build used three.js for four effects (Origin hero dissolve,
   wordmark video mask, displacement crossfade, SDF lens). Every one of them
   is an orthographic camera pointed at a single PlaneGeometry(2,2) with a
   ShaderMaterial — i.e. exactly a fullscreen quad. Shipping 385 KB of three.js
   to a storefront to draw one quad is not a trade worth making on a shop that
   is judged on Core Web Vitals, so the GLSL is carried over verbatim and only
   the plumbing is replaced.

   Differences from three.js that the ported shaders rely on:
     • `varying vec2 vUv` and the `uv` attribute are provided here too.
     • three.js prepends `projectionMatrix`/`modelViewMatrix`; the vertex
       shader below writes gl_Position directly instead, so the ported
       fragment shaders are unchanged but their vertex shaders are not used.
     • Textures default to CLAMP_TO_EDGE + LINEAR, matching three.js defaults.
   ========================================================================== */
(function (root) {
  "use strict";

  var VERT =
    "attribute vec2 aPos; varying vec2 vUv;" +
    "void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }";

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // Surfacing this is worth the console noise: a silent shader failure
      // renders a blank black box that looks exactly like "the image didn't load".
      console.error("[wango-gl] shader:", gl.getShaderInfoLog(s), src);
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{frag:string, uniforms:Object}} opts  uniform values are numbers,
   *        [x,y] arrays, or {texture:<img|video|canvas>} descriptors.
   * @returns {?Object} null when WebGL is unavailable — callers must fall back.
   */
  function quad(canvas, opts) {
    var gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, "precision highp float;\n" + opts.frag);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[wango-gl] link:", gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var locs = {};
    function uloc(name) {
      if (!(name in locs)) locs[name] = gl.getUniformLocation(prog, name);
      return locs[name];
    }

    var textures = {};   // name -> {tex, unit, source, dynamic}
    var nextUnit = 0;
    var values = {};

    function makeTexture(source) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      upload(tex, source);
      return tex;
    }

    function upload(tex, source) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } catch (e) {
        /* A cross-origin image without CORS headers taints the upload. The
           draw is simply skipped rather than throwing every frame. */
      }
    }

    function set(name, value) {
      values[name] = value;
      if (value && value.texture) {
        var t = textures[name];
        if (!t) {
          t = textures[name] = { tex: makeTexture(value.texture), unit: nextUnit++, source: value.texture, dynamic: !!value.dynamic };
        } else {
          t.source = value.texture;
          t.dynamic = !!value.dynamic;
          upload(t.tex, value.texture);
        }
        return;
      }
      gl.useProgram(prog);
      var l = uloc(name);
      if (l === null) return;
      if (Array.isArray(value)) {
        if (value.length === 2) gl.uniform2f(l, value[0], value[1]);
        else if (value.length === 3) gl.uniform3f(l, value[0], value[1], value[2]);
        else gl.uniform4f(l, value[0], value[1], value[2], value[3]);
      } else {
        gl.uniform1f(l, value);
      }
    }

    function resize(w, h, dpr) {
      var d = dpr || Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * d));
      canvas.height = Math.max(1, Math.round(h * d));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function render() {
      gl.useProgram(prog);
      var i = 0;
      for (var name in textures) {
        var t = textures[name];
        gl.activeTexture(gl.TEXTURE0 + t.unit);
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        // A <video> keeps producing new frames, so its texture is re-uploaded
        // every draw; still images are uploaded once.
        if (t.dynamic && t.source && t.source.readyState >= 2) upload(t.tex, t.source);
        var l = uloc(name);
        if (l !== null) gl.uniform1i(l, t.unit);
        i++;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function dispose() {
      for (var name in textures) gl.deleteTexture(textures[name].tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      var ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    }

    if (opts.uniforms) for (var k in opts.uniforms) set(k, opts.uniforms[k]);

    return { gl: gl, set: set, resize: resize, render: render, dispose: dispose, values: values };
  }

  /** Loads an image and resolves with it, or rejects — never hangs. */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  root.WangoGL = { quad: quad, loadImage: loadImage };
})(window);
