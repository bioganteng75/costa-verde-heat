// Costa Verde Heat — keyboard + mouse input and pointer lock.
// Losing pointer lock mid-play auto-pauses the game (requirement: Esc under
// pointer lock must pause); main.js installs CVH.input.onLockLost.
CVH.input = (function () {
  const keys = {};
  let mouseDX = 0, mouseDY = 0;
  let locked = false;

  const api = {
    keys: keys,
    onLockLost: null,
    onAnyKey: null,

    isDown: function (code) { return !!keys[code]; },

    consumeMouse: function () {
      const d = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },

    isLocked: function () { return locked; },

    lock: function (el) {
      if (el && el.requestPointerLock) {
        try {
          const p = el.requestPointerLock();
          if (p && p.catch) p.catch(function () { /* headless may refuse */ });
        } catch (e) { /* headless may refuse */ }
      }
    },

    init: function (canvas) {
      window.addEventListener('keydown', function (e) {
        if (e.repeat) return;
        keys[e.code] = true;
        if (api.onAnyKey) api.onAnyKey(e.code);
        if (['ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
      });
      window.addEventListener('keyup', function (e) { keys[e.code] = false; });
      window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

      document.addEventListener('pointerlockchange', function () {
        const was = locked;
        locked = document.pointerLockElement === canvas;
        if (was && !locked && api.onLockLost) api.onLockLost();
      });
      document.addEventListener('mousemove', function (e) {
        if (!locked) return;
        mouseDX += e.movementX || 0;
        mouseDY += e.movementY || 0;
      });
    }
  };
  return api;
})();
