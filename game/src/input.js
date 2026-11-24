// input.js — keyboard + mouse state, drag orbit and pointer lock.
// Owns CVH.input: a `keys` set for held keys, edge-triggered `pressed`
// flags consumed once per frame, mouse orbit deltas for the camera, and
// the pointer-lock-loss callback used by QA item 3 (auto-pause).
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};

  var input = CVH.input = {
    keys: {},
    pressed: {},
    mouseDown: false,
    orbitDX: 0,        // accumulated orbit drag, consumed by the camera
    orbitDY: 0,
    locked: false,
    onLockLost: null   // set by main.js — QA item 3 hook
  };

  function code(e) { return e.code || e.key; }

  window.addEventListener('keydown', function (e) {
    var c = code(e);
    if (!input.keys[c]) input.pressed[c] = true;
    input.keys[c] = true;
    if (c === 'Space' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { input.keys[code(e)] = false; });
  window.addEventListener('blur', function () { input.keys = {}; input.mouseDown = false; });

  // Called by main at the end of each logic frame.
  input.postFrame = function () {
    input.pressed = {};
    input.orbitDX = 0; input.orbitDY = 0;
  };
  input.down = function () {
    for (var i = 0; i < arguments.length; i++) if (input.keys[arguments[i]]) return true;
    return false;
  };
  input.hit = function () {
    for (var i = 0; i < arguments.length; i++) if (input.pressed[arguments[i]]) return true;
    return false;
  };

  // Mouse: holding the left button aims/fires (player.js reads
  // mouseDown); movement while held — or any movement while pointer
  // locked — orbits the camera.
  var lastX = 0, lastY = 0, dragging = false;

  input.attach = function (canvas) {
    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) {
        input.mouseDown = true;
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        if (CVH.audio) CVH.audio.unlock();
      }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { input.mouseDown = false; dragging = false; }
    });
    window.addEventListener('mousemove', function (e) {
      var dx = 0, dy = 0;
      if (input.locked) {
        dx = e.movementX || 0; dy = e.movementY || 0;
      } else if (dragging) {
        dx = e.clientX - lastX; dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
      } else {
        return;
      }
      input.orbitDX += dx; input.orbitDY += dy;
    });
    canvas.addEventListener('click', function () {
      // Clicking the playfield asks for pointer lock on desktop Chrome;
      // gameplay also works fully without it via drag-orbit.
      if (CVH.state === 'playing' && !input.locked && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (e) { /* not critical */ }
      }
    });
  };

  document.addEventListener('pointerlockchange', function () {
    var was = input.locked;
    input.locked = !!document.pointerLockElement;
    // QA item 3: the browser exits pointer lock on Esc WITHOUT sending a
    // keydown — main.js registers onLockLost to pause the game for us.
    if (was && !input.locked && typeof input.onLockLost === 'function') input.onLockLost();
  });
  input.exitLock = function () {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  };
})();
