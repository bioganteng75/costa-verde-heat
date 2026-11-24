// input.js — keyboard state, edge presses, pointer-lock mouse look.
(function () {
  'use strict';

  var keys = {};
  var pressedSet = {};
  var mouseDX = 0;
  var mouseDY = 0;
  var locked = false;

  window.addEventListener('keydown', function (e) {
    if (!keys[e.code]) pressedSet[e.code] = true;
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });

  document.addEventListener('pointerlockchange', function () {
    var was = locked;
    locked = !!document.pointerLockElement;
    if (was && !locked && CVH.onLockLost) CVH.onLockLost();
  });
  document.addEventListener('mousemove', function (e) {
    if (!locked) return;
    mouseDX += e.movementX || 0;
    mouseDY += e.movementY || 0;
  });

  CVH.input = {
    down: function (code) { return !!keys[code]; },
    pressed: function (code) { return !!pressedSet[code]; },
    // test hook: simulate a key state
    setKey: function (code, isDown) {
      if (isDown && !keys[code]) pressedSet[code] = true;
      keys[code] = !!isDown;
    },
    endFrame: function () { pressedSet = {}; mouseDX = 0; mouseDY = 0; },
    consumeMouse: function () {
      var d = { dx: mouseDX, dy: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    get locked() { return locked; },
    lock: function (el) {
      try { if (el && el.requestPointerLock) el.requestPointerLock(); } catch (e) {}
    },
    unlock: function () {
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
    }
  };
})();
