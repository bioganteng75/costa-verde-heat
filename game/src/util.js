// Costa Verde Heat — shared utilities: namespace, math, safe storage, debug hooks.
// Heading convention (used by every module):
//   heading h, forward F(h) = (-sin h, 0, -cos h)  (h = 0 faces -Z, "north")
//   right   R(h) = cross(F, up) = (cos h, 0, -sin h)
//   a mesh built facing -Z shows F(h) when mesh.rotation.y = h.
window.CVH = window.CVH || {};

CVH.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
CVH.lerp = function (a, b, t) { return a + (b - a) * t; };
CVH.rand = function (a, b) { return a + Math.random() * (b - a); };
CVH.randInt = function (a, b) { return Math.floor(CVH.rand(a, b + 1)); };
CVH.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
CVH.dist2d = function (ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); };

// Deterministic RNG for world generation so the city layout (and the
// objective audit) is identical on every load.
CVH.mulberry32 = function (seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

// Wrap an angle to (-PI, PI].
CVH.wrapAngle = function (a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
};
CVH.angleDelta = function (from, to) { return CVH.wrapAngle(to - from); };
CVH.turnToward = function (from, to, maxStep) {
  const d = CVH.angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
};
CVH.forwardOf = function (h) { return { x: -Math.sin(h), z: -Math.cos(h) }; };
CVH.rightOf = function (h) { return { x: Math.cos(h), z: -Math.sin(h) }; };
// Heading whose forward points along (dx, dz).
CVH.headingOf = function (dx, dz) { return Math.atan2(-dx, -dz); };

// ---------------------------------------------------------------------------
// Safe storage: EVERY localStorage access in the game goes through CVH.store.
// In sandboxed frames localStorage can throw on any touch; the wrapper
// catches that once, falls back to an in-memory map, and never throws.
// ---------------------------------------------------------------------------
CVH.store = (function () {
  const KEY_PREFIX = '';
  const mem = new Map();
  let broken = false;
  function raw() { return window.localStorage; }
  return {
    get: function (key, fallback) {
      if (!broken) {
        try {
          const v = raw().getItem(KEY_PREFIX + key);
          if (v !== null && v !== undefined) return v;
        } catch (e) { broken = true; }
      }
      return mem.has(key) ? mem.get(key) : (fallback === undefined ? null : fallback);
    },
    set: function (key, value) {
      mem.set(key, String(value));
      if (!broken) {
        try { raw().setItem(KEY_PREFIX + key, String(value)); } catch (e) { broken = true; }
      }
    },
    remove: function (key) {
      mem.delete(key);
      if (!broken) {
        try { raw().removeItem(KEY_PREFIX + key); } catch (e) { broken = true; }
      }
    },
    getJSON: function (key, fallback) {
      const v = this.get(key, null);
      if (v === null) return fallback;
      try { return JSON.parse(v); } catch (e) { return fallback; }
    },
    setJSON: function (key, obj) { this.set(key, JSON.stringify(obj)); },
    isBroken: function () { return broken; }
  };
})();

// Debug / test hooks. The playtest drives the game through these.
CVH.debug = {
  lastArrowAngle: 0,     // minimap player-arrow rotation, radians, set every minimap draw
  freeze: false,         // when true the rAF loop renders but does not advance the sim
  step: null,            // installed by main.js: step(dt) advances one fixed update
  teleport: null,        // installed by player.js
  ready: false
};
