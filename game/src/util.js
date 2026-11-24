// util.js — shared namespace, safe storage, math helpers, seeded RNG.
window.CVH = window.CVH || {};

(function () {
  'use strict';

  // ---------- safe storage wrapper ----------
  // EVERY localStorage access in the game goes through CVH.store.
  // If localStorage throws (sandboxed iframe, disabled cookies, quota),
  // we silently fall back to an in-memory map so the game never breaks.
  var memFallback = {};
  var store = {
    available: true,
    get: function (key) {
      try {
        var v = window.localStorage.getItem(key);
        return v === null || v === undefined ? (key in memFallback ? memFallback[key] : null) : v;
      } catch (e) {
        store.available = false;
        return key in memFallback ? memFallback[key] : null;
      }
    },
    set: function (key, value) {
      memFallback[key] = value;
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        store.available = false;
        return false;
      }
    },
    remove: function (key) {
      delete memFallback[key];
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (e) {
        store.available = false;
        return false;
      }
    }
  };
  CVH.store = store;

  // ---------- math helpers ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(x1, z1, x2, z2) { var dx = x2 - x1, dz = z2 - z1; return dx * dx + dz * dz; }
  function dist(x1, z1, x2, z2) { return Math.sqrt(dist2(x1, z1, x2, z2)); }
  // wrap angle to [-PI, PI]
  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  // heading convention: forward = (sin h, cos h) in xz-plane.
  function fwd(h) { return { x: Math.sin(h), z: Math.cos(h) }; }
  // right vector = forward x up  (for f=(fx,0,fz), up=(0,1,0): right = (-fz, 0, fx))
  function rightOf(f) { return { x: -f.z, z: f.x }; }

  // ---------- seeded RNG (mulberry32) ----------
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  CVH.util = {
    clamp: clamp,
    lerp: lerp,
    dist: dist,
    dist2: dist2,
    wrapAngle: wrapAngle,
    fwd: fwd,
    rightOf: rightOf,
    makeRng: makeRng
  };
})();
