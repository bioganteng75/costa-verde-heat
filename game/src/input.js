'use strict';
// Costa Verde Heat 3D — keyboard + mouse input, pointer lock with drag-orbit
// fallback. Exposes held keys (down), one-frame key presses (hit), mouse
// deltas for the camera, and an onLockLost hook: browsers swallow the Esc
// keydown when pointer lock drops, so the game pauses off this callback.

CVH.input = {
  keys: {},
  pressed: {},
  mouseDX: 0,
  mouseDY: 0,
  mouseHeld: false,
  mouseClicked: false,
  locked: false,
  dragging: false,
  onLockLost: null,
  _canvas: null,
  _wasLocked: false,

  init: function (canvas) {
    this._canvas = canvas;
    const self = this;

    window.addEventListener('keydown', function (e) {
      if (!e.repeat) self.pressed[e.code] = true;
      self.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    window.addEventListener('blur', function () { self.keys = {}; self.mouseHeld = false; });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 0) {
        self.mouseHeld = true;
        self.mouseClicked = true;
        self.dragging = true;
      }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { self.mouseHeld = false; self.dragging = false; }
    });
    window.addEventListener('mousemove', function (e) {
      if (self.locked || self.dragging) {
        self.mouseDX += e.movementX || 0;
        self.mouseDY += e.movementY || 0;
      }
    });

    document.addEventListener('pointerlockchange', function () {
      self.locked = (document.pointerLockElement === canvas);
      if (!self.locked && self._wasLocked) {
        // Pointer lock was released mid-play (Esc): no keydown ever arrives
        // for that Esc, so main.js pauses the game from this hook instead.
        if (typeof self.onLockLost === 'function') self.onLockLost();
      }
      self._wasLocked = self.locked;
    });
  },

  requestLock: function () {
    if (this._canvas && !this.locked) {
      const p = this._canvas.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(function () { /* drag fallback still works */ });
    }
  },

  releaseLock: function () {
    if (this.locked) document.exitPointerLock();
  },

  down: function (code) { return !!this.keys[code]; },

  // One-shot press: true once per physical press, consumed by the caller.
  hit: function (code) {
    if (this.pressed[code]) { this.pressed[code] = false; return true; }
    return false;
  },

  clickHit: function () {
    if (this.mouseClicked) { this.mouseClicked = false; return true; }
    return false;
  },

  // Called by the main loop at the end of every frame.
  endFrame: function () {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
    this.pressed = {};
  }
};
