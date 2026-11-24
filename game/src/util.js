// util.js — shared helpers for Costa Verde Heat 3D: seeded randomness, math,
// formatting, and the safe storage wrapper every save/load goes through.
window.CVH = window.CVH || {};

CVH.u = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  // Smoothly interpolate between two headings (radians), taking the short way.
  angleLerp(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  },
  angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  dist2(x1, z1, x2, z2) { const dx = x2 - x1, dz = z2 - z1; return Math.sqrt(dx * dx + dz * dz); },
  fmtMoney(n) { return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
  fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  },
  // mulberry32: tiny deterministic PRNG so a seed always builds the same city.
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  range(r, a, b) { return a + r() * (b - a); },
  pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; },
};

// Safe storage (QA fix): localStorage throws in sandboxed iframes and in some
// privacy modes. Every read/write/delete in the game funnels through here and
// degrades to "no save" instead of breaking a button or the boot sequence.
CVH.store = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable: play on */ }
  },
  del(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* nothing to delete anyway */ }
  },
  getJSON(key) {
    const raw = this.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  },
  setJSON(key, obj) { this.set(key, JSON.stringify(obj)); },
};
