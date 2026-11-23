// input.js — keyboard and mouse state for Costa Verde Heat 3D.
// One shared key set, edge-detected presses, and mouse-look deltas fed by
// either pointer lock (preferred) or plain dragging on the canvas.
window.CVH = window.CVH || {};

CVH.util = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
  // Shortest-path angle lerp, angles in radians.
  lerpAngle(a, b, t) {
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
  dist2D(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); },
  // Deterministic RNG so a seed always builds the same city.
  mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
};

CVH.input = {
  keys: new Set(),
  pressed: new Set(),       // codes that went down this frame
  mouseDX: 0,
  mouseDY: 0,
  mouseDown: false,
  firing: false,            // left button held (for SMG / punches)
  clicked: false,           // left button edge this frame
  locked: false,
  _dragging: false,

  init(canvas) {
    const self = this;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!self.keys.has(e.code)) self.pressed.add(e.code);
      self.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { self.keys.delete(e.code); });
    window.addEventListener('blur', () => { self.keys.clear(); self.firing = false; self.mouseDown = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        self.mouseDown = true; self.firing = true; self.clicked = true; self._dragging = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { self.mouseDown = false; self.firing = false; self._dragging = false; }
    });
    window.addEventListener('mousemove', (e) => {
      if (self.locked) {
        self.mouseDX += e.movementX || 0;
        self.mouseDY += e.movementY || 0;
      } else if (self._dragging) {
        self.mouseDX += e.movementX || 0;
        self.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      self.locked = document.pointerLockElement === canvas;
    });
  },

  // Ask for pointer lock; safe to call when the browser refuses (headless).
  requestLock(canvas) {
    try {
      if (!this.locked && canvas.requestPointerLock) {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (err) { /* pointer lock unavailable — drag look still works */ }
  },

  down(code) { return this.keys.has(code); },
  hit(code) { return this.pressed.has(code); },

  // Movement axes from WASD + arrows: x = strafe right, z = forward.
  moveAxis() {
    let x = 0, z = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, z };
  },

  // Called once per frame after consumers have read the deltas.
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
  },
};
