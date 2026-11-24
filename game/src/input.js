// input.js — keyboard + mouse state and pointer-lock bookkeeping.
// Losing pointer lock while playing auto-pauses (wired in main.js via
// input.onLockLost). The playtest drives input.keys directly.
(function () {
  'use strict';
  var CVH = window.CVH;

  var input = {
    keys: {},            // KeyboardEvent.code -> bool
    locked: false,
    mouseDX: 0,
    mouseDY: 0,
    firing: false,       // left mouse held
    onLockLost: null,    // set by main.js
    onPauseKey: null,    // set by main.js (Esc / P)
    onMuteKey: null,     // set by main.js (M)
    onInteractKey: null, // set by main.js (E)
    onEnterKey: null,

    init: function (domElement) {
      window.addEventListener('keydown', function (ev) {
        if (ev.code === 'Space') ev.preventDefault();
        if (!input.keys[ev.code]) {
          if (ev.code === 'KeyM' && input.onMuteKey) input.onMuteKey();
          if ((ev.code === 'Escape' || ev.code === 'KeyP') && input.onPauseKey) input.onPauseKey();
          if (ev.code === 'KeyE' && input.onInteractKey) input.onInteractKey();
          if (ev.code === 'KeyF' && input.onEnterKey) input.onEnterKey();
        }
        input.keys[ev.code] = true;
      });
      window.addEventListener('keyup', function (ev) {
        input.keys[ev.code] = false;
      });
      window.addEventListener('blur', function () {
        input.keys = {};
        input.firing = false;
      });

      document.addEventListener('mousemove', function (ev) {
        if (input.locked) {
          input.mouseDX += ev.movementX || 0;
          input.mouseDY += ev.movementY || 0;
        }
      });
      document.addEventListener('mousedown', function (ev) {
        if (ev.button === 0) input.firing = true;
      });
      document.addEventListener('mouseup', function (ev) {
        if (ev.button === 0) input.firing = false;
      });

      document.addEventListener('pointerlockchange', function () {
        var wasLocked = input.locked;
        input.locked = document.pointerLockElement === domElement;
        if (wasLocked && !input.locked && input.onLockLost) input.onLockLost();
      });
    },

    requestLock: function (domElement) {
      try {
        var p = domElement.requestPointerLock && domElement.requestPointerLock();
        if (p && p.catch) p.catch(function () { /* user gesture needed */ });
      } catch (e) { /* ignored */ }
    },

    exitLock: function () {
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignored */ }
    },

    // Consume the accumulated mouse delta (called once per frame).
    takeMouseDelta: function () {
      var d = { x: input.mouseDX, y: input.mouseDY };
      input.mouseDX = 0;
      input.mouseDY = 0;
      return d;
    },

    down: function (code) { return !!input.keys[code]; }
  };

  CVH.input = input;
})();
