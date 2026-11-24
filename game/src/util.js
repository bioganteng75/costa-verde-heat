// util.js — shared helpers for Costa Verde Heat 3D.
// One global namespace, CVH, is shared by every module (classic scripts,
// no build step). This file owns: math helpers, the seeded RNG, angle
// helpers, the safe-storage wrapper (QA item 1) and tiny DOM helpers.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};

  // ---------------------------------------------------------------- math
  CVH.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  CVH.lerp = function (a, b, t) { return a + (b - a) * t; };
  CVH.dist2 = function (ax, az, bx, bz) {
    var dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  CVH.dist = function (ax, az, bx, bz) { return Math.sqrt(CVH.dist2(ax, az, bx, bz)); };

  // Wrap an angle to [-PI, PI).
  CVH.wrapAngle = function (a) {
    while (a >= Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  // Shortest signed turn from a to b.
  CVH.angleDelta = function (a, b) { return CVH.wrapAngle(b - a); };
  // Turn `a` toward `b` by at most `maxStep`.
  CVH.turnToward = function (a, b, maxStep) {
    var d = CVH.angleDelta(a, b);
    if (d > maxStep) d = maxStep;
    if (d < -maxStep) d = -maxStep;
    return a + d;
  };

  // Heading convention used by the whole game:
  //   a heading angle h names the ground direction (sin h, cos h) in (x, z).
  //   h = 0 faces +z ("south" on the minimap), h = PI faces -z ("north").
  CVH.headingVec = function (h, out) {
    out.x = Math.sin(h);
    out.z = Math.cos(h);
    return out;
  };
  CVH.vecHeading = function (x, z) { return Math.atan2(x, z); };

  // ---------------------------------------------------------------- rng
  // mulberry32 — small deterministic PRNG. The world is generated from a
  // seed so screenshot scenes (?seed=1) are reproducible frame for frame.
  CVH.makeRng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  CVH.randRange = function (rng, lo, hi) { return lo + rng() * (hi - lo); };
  CVH.randPick = function (rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; };

  // ------------------------------------------------------- safe storage
  // QA item 1: EVERY localStorage access in the game goes through this
  // wrapper. In a sandboxed iframe (no allow-same-origin) even reading
  // localStorage can throw; the wrapper swallows that and degrades to
  // "no save" instead of breaking NEW GAME / save / load.
  var memoryFallback = {};
  CVH.store = {
    get: function (key) {
      try {
        var v = window.localStorage.getItem(key);
        return (v === null || v === undefined) ? (key in memoryFallback ? memoryFallback[key] : null) : v;
      } catch (e) {
        return key in memoryFallback ? memoryFallback[key] : null;
      }
    },
    set: function (key, value) {
      memoryFallback[key] = value;
      try { window.localStorage.setItem(key, value); } catch (e) { /* iframe sandbox: keep the in-memory copy */ }
    },
    remove: function (key) {
      delete memoryFallback[key];
      try { window.localStorage.removeItem(key); } catch (e) { /* same as above */ }
    }
  };

  // ---------------------------------------------------------------- dom
  CVH.$ = function (id) { return document.getElementById(id); };
  CVH.el = function (tag, cls, parent, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  };
  CVH.fmtCash = function (n) {
    var s = String(Math.max(0, Math.floor(n)));
    var out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return '$' + s + out;
  };
  CVH.fmtTime = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  // Shared scratch vectors so hot paths do not allocate.
  CVH._v1 = { x: 0, z: 0 };
  CVH._v2 = { x: 0, z: 0 };
})();
