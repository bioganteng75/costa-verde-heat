'use strict';
// Costa Verde Heat 3D — lightweight effects: one pooled point-particle system
// (sparks, smoke, dust, muzzle sparks) and a small pool of tracer bolts.
// Everything is pre-allocated; spawning never allocates mid-frame.

CVH.fx = {
  MAX: 700,
  _n: 0,
  _pos: null,
  _vel: null,
  _life: null,
  _maxLife: null,
  _grav: null,
  _points: null,
  _geo: null,
  _tracers: [],
  _shake: 0,

  init: function (scene) {
    this._pos = new Float32Array(this.MAX * 3);
    this._vel = new Float32Array(this.MAX * 3);
    this._col = new Float32Array(this.MAX * 3);
    this._life = new Float32Array(this.MAX);
    this._maxLife = new Float32Array(this.MAX);
    this._grav = new Float32Array(this.MAX);
    this._geo = new THREE.BufferGeometry();
    this._geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
    this._geo.setAttribute('color', new THREE.BufferAttribute(this._col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true
    });
    this._points = new THREE.Points(this._geo, mat);
    this._points.frustumCulled = false;
    // Park every particle far below the city until spawned.
    for (let i = 0; i < this.MAX; i++) this._pos[i * 3 + 1] = -100;
    scene.add(this._points);

    const tGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    const tMat = new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(tGeo, tMat.clone());
      m.visible = false;
      scene.add(m);
      this._tracers.push({ mesh: m, life: 0 });
    }
  },

  _spawn: function (x, y, z, vx, vy, vz, r, g, b, life, grav) {
    const i = this._n;
    this._n = (this._n + 1) % this.MAX;
    this._pos[i * 3] = x; this._pos[i * 3 + 1] = y; this._pos[i * 3 + 2] = z;
    this._vel[i * 3] = vx; this._vel[i * 3 + 1] = vy; this._vel[i * 3 + 2] = vz;
    this._col[i * 3] = r; this._col[i * 3 + 1] = g; this._col[i * 3 + 2] = b;
    this._life[i] = life; this._maxLife[i] = life; this._grav[i] = grav;
  },

  sparks: function (p, n) {
    for (let k = 0; k < (n || 10); k++) {
      const a = Math.random() * CVH.TAU, s = 2 + Math.random() * 4;
      this._spawn(p.x, p.y + 0.4, p.z,
        Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s,
        1.0, 0.72 + Math.random() * 0.28, 0.25, 0.3 + Math.random() * 0.35, -9);
    }
  },

  smoke: function (p) {
    this._spawn(p.x + (Math.random() - 0.5) * 0.5, p.y + 1.1, p.z + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.4, 1.1 + Math.random() * 0.7, (Math.random() - 0.5) * 0.4,
      0.32, 0.32, 0.34, 1.1 + Math.random() * 0.7, 1.6);
  },

  dust: function (p, n) {
    for (let k = 0; k < (n || 6); k++) {
      const a = Math.random() * CVH.TAU, s = 0.6 + Math.random() * 1.4;
      this._spawn(p.x, p.y + 0.25, p.z, Math.cos(a) * s, 0.5 + Math.random(), Math.sin(a) * s,
        0.76, 0.7, 0.6, 0.5 + Math.random() * 0.4, -0.6);
    }
  },

  muzzle: function (p, dir) {
    for (let k = 0; k < 4; k++) {
      this._spawn(p.x, p.y, p.z,
        dir.x * 6 + (Math.random() - 0.5) * 2, dir.y * 6 + (Math.random() - 0.5) * 2, dir.z * 6 + (Math.random() - 0.5) * 2,
        1.0, 0.8, 0.35, 0.07 + Math.random() * 0.05, 0);
    }
  },

  bloodless_puff: function (p) { // soft grey-green puff when a punch lands
    for (let k = 0; k < 5; k++) {
      this._spawn(p.x, p.y + 1.1, p.z, (Math.random() - 0.5) * 1.6, 0.8, (Math.random() - 0.5) * 1.6,
        0.6, 0.62, 0.55, 0.35, -1);
    }
  },

  tracer: function (from, to) {
    for (let i = 0; i < this._tracers.length; i++) {
      const t = this._tracers[i];
      if (t.life > 0) continue;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.5) return;
      t.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      t.mesh.scale.set(1, 1, len);
      t.mesh.lookAt(to.x, to.y, to.z);
      t.mesh.visible = true;
      t.life = 0.055;
      return;
    }
  },

  shake: function (amount) { this._shake = Math.min(0.55, this._shake + amount); },
  shakeOffset: function () {
    if (this._shake <= 0.001) return null;
    return {
      x: (Math.random() - 0.5) * this._shake,
      y: (Math.random() - 0.5) * this._shake * 0.7
    };
  },

  update: function (dt) {
    for (let i = 0; i < this.MAX; i++) {
      if (this._life[i] <= 0) continue;
      this._life[i] -= dt;
      if (this._life[i] <= 0) { this._pos[i * 3 + 1] = -100; continue; }
      this._vel[i * 3 + 1] += this._grav[i] * dt;
      this._pos[i * 3] += this._vel[i * 3] * dt;
      this._pos[i * 3 + 1] += this._vel[i * 3 + 1] * dt;
      this._pos[i * 3 + 2] += this._vel[i * 3 + 2] * dt;
    }
    this._geo.attributes.position.needsUpdate = true;
    this._geo.attributes.color.needsUpdate = true;
    for (let i = 0; i < this._tracers.length; i++) {
      const t = this._tracers[i];
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    this._shake = Math.max(0, this._shake - dt * 1.4);
  }
};
