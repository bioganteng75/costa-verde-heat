// util.js — shared namespace, safe storage, math helpers, seeded RNG.
// Costa Verde Heat: every module hangs off the single global CVH object.
(function () {
  'use strict';

  var CVH = (window.CVH = window.CVH || {});

  // ------------------------------------------------------------------
  // Safe storage: EVERY localStorage access in the game goes through
  // this wrapper. In sandboxed iframes localStorage can throw on any
  // touch; the wrapper swallows that and falls back to memory, so the
  // game always boots and NEW GAME always works.
  // ------------------------------------------------------------------
  var memoryFallback = {};
  var store = {
    available: true,
    get: function (key) {
      try {
        var v = window.localStorage.getItem(key);
        return v === null || v === undefined ? (key in memoryFallback ? memoryFallback[key] : null) : v;
      } catch (e) {
        store.available = false;
        return key in memoryFallback ? memoryFallback[key] : null;
      }
    },
    set: function (key, value) {
      memoryFallback[key] = value;
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        store.available = false;
        return false;
      }
    },
    remove: function (key) {
      delete memoryFallback[key];
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

  // ------------------------------------------------------------------
  // Math helpers
  // ------------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }
  // Shortest signed angular difference a-b wrapped to [-PI, PI].
  function angDiff(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  // Heading convention for the whole game: heading h faces the world
  // direction (-sin h, -cos h) in (x, z). h = 0 faces -z ("north" on
  // the minimap), h = -PI/2 faces +x ("east").
  function facing(h) { return { x: -Math.sin(h), z: -Math.cos(h) }; }
  // Heading that faces along direction (dx, dz).
  function headingOf(dx, dz) { return Math.atan2(-dx, -dz); }
  // Right vector of a heading: cross(forward, up) in world space.
  function rightOf(h) {
    var f = facing(h);
    return { x: -f.z, z: f.x };
  }

  CVH.util = {
    clamp: clamp,
    lerp: lerp,
    dist: dist,
    dist2: dist2,
    angDiff: angDiff,
    facing: facing,
    rightOf: rightOf,
    headingOf: headingOf,
    TAU: Math.PI * 2
  };

  // ------------------------------------------------------------------
  // Seeded RNG (mulberry32) — the city is identical for a given seed.
  // ------------------------------------------------------------------
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  CVH.makeRng = makeRng;

  // ------------------------------------------------------------------
  // Debug / test hooks. The playtest drives the game through these.
  // ------------------------------------------------------------------
  CVH.debug = {
    manual: false,          // when true, the rAF loop stops advancing the sim
    lastArrowAngle: 0,      // written by hud.drawMinimap on every draw
    exceptions: 0
  };
})();
