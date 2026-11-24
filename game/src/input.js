// input.js — keyboard and mouse state, edge detection, and pointer lock.
// The game polls this each frame; nothing in here knows about game rules.
CVH.input = {
  keys: {},
  pressed: {},        // true only on the frame a key went down
  mouseDX: 0,
  mouseDY: 0,
  mouseDown: false,
  mouseClicked: false, // edge: left button went down this frame
  locked: false,
  onLockLost: null,    // set by main: called when pointer lock drops mid-play

  init(canvas) {
    const self = this;
    window.addEventListener('keydown', (e) => {
      if (!self.keys[e.code]) self.pressed[e.code] = true;
      self.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { self.keys[e.code] = false; });
    window.addEventListener('blur', () => { self.keys = {}; self.mouseDown = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { self.mouseDown = true; self.mouseClicked = true; }
      self._dragX = e.clientX; self._dragY = e.clientY; self._dragging = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) self.mouseDown = false;
      self._dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (self.locked) {
        self.mouseDX += e.movementX || 0;
        self.mouseDY += e.movementY || 0;
      } else if (self._dragging) {
        self.mouseDX += e.clientX - self._dragX;
        self.mouseDY += e.clientY - self._dragY;
        self._dragX = e.clientX; self._dragY = e.clientY;
      }
    });

    // QA fix: browsers exit pointer lock on Esc WITHOUT delivering a keydown,
    // so "Esc to pause" silently fails in pointer-lock mode. Treat the lock
    // loss itself as the pause signal while playing.
    document.addEventListener('pointerlockchange', () => {
      const was = self.locked;
      self.locked = document.pointerLockElement === canvas;
      if (was && !self.locked && typeof self.onLockLost === 'function') self.onLockLost();
    });
  },

  lockPointer(canvas) {
    if (!this.locked && canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (e) { /* drag-orbit still works */ }
    }
  },

  down(code) { return !!this.keys[code]; },
  hit(code) { return !!this.pressed[code]; },

  // Movement axes from WASD + arrows: x = strafe right, z = forward.
  moveAxes() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  },

  // Called at the very end of each frame: clear edge-triggered state.
  postUpdate() {
    this.pressed = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
  },
};
