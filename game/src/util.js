'use strict';
// Costa Verde Heat 3D — shared helpers: seeded randomness, small math, and a
// fail-safe localStorage wrapper. Every other module hangs off window.CVH.

window.CVH = window.CVH || {};

CVH.TAU = Math.PI * 2;
CVH.UP = null; // set to a THREE.Vector3(0,1,0) by main.js once three.js is in

CVH.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
CVH.lerp = function (a, b, t) { return a + (b - a) * t; };
CVH.smooth = function (t) { t = CVH.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// Deterministic PRNG (mulberry32) so a given seed always builds the same city.
CVH.makeRng = function (seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// The live RNG; main.js reseeds it from the ?seed= parameter before world build.
CVH.rng = CVH.makeRng(20261124);
CVH.rand = function (a, b) { return a + CVH.rng() * (b - a); };
CVH.randInt = function (a, b) { return Math.floor(CVH.rand(a, b + 1)); };
CVH.pick = function (arr) { return arr[Math.floor(CVH.rng() * arr.length) % arr.length]; };
CVH.chance = function (p) { return CVH.rng() < p; };

CVH.dist2d = function (ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

// Wrap an angle to [-PI, PI).
CVH.angleWrap = function (a) {
  while (a >= Math.PI) a -= CVH.TAU;
  while (a < -Math.PI) a += CVH.TAU;
  return a;
};

// Turn `current` toward `target` by at most `maxStep` radians.
CVH.angleTurn = function (current, target, maxStep) {
  const d = CVH.angleWrap(target - current);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
};

// Safe storage: sandboxed iframes (no allow-same-origin) throw on ANY
// localStorage access, so every read/write/delete in the game goes through
// this wrapper and simply degrades to "no save" when storage is unavailable.
CVH.store = {
  get: function (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },
  set: function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: the run simply is not saved */ }
  },
  del: function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* nothing to delete when storage itself is unreachable */ }
  }
};

// Format helpers for the HUD.
CVH.fmtCash = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
CVH.fmtTime = function (sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
};
