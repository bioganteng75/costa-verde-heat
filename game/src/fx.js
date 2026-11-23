// fx.js — particle bursts (sparks, dust, smoke, sparkles), muzzle flashes
// and camera trauma/shake. Particles live in one THREE.Points cloud with a
// fixed pool so the frame cost never spikes.
window.CVH = window.CVH || {};

CVH.fx = {
  MAX: 900,
  _n: 0,
  _pos: null, _col: null, _vel: null, _life: null, _maxLife: null, _grav: null,
  points: null,
  shakeAmt: 0,
  _flash: null, _flashT: 0,

  init(scene) {
    const geo = new THREE.BufferGeometry();
    this._pos = new Float32Array(this.MAX * 3);
    this._col = new Float32Array(this.MAX * 3);
    this._vel = new Float32Array(this.MAX * 3);
    this._life = new Float32Array(this.MAX);
    this._maxLife = new Float32Array(this.MAX);
    this._grav = new Float32Array(this.MAX);
    for (let i = 0; i < this.MAX; i++) { this._pos[i * 3 + 1] = -100; }
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this._col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Muzzle flash: a small additive plane we park at the gun for a frame.
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcf6e, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this._flash = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), flashMat);
    this._flash.visible = false;
    scene.add(this._flash);
  },

  burst(x, y, z, opts) {
    const o = opts || {};
    const count = o.count || 10;
    const color = new THREE.Color(o.color || 0xffffff);
    const spread = o.spread || 3;
    const up = o.up || 2.5;
    const life = o.life || 0.55;
    for (let n = 0; n < count; n++) {
      const i = this._n; this._n = (this._n + 1) % this.MAX;
      this._pos[i * 3] = x; this._pos[i * 3 + 1] = y; this._pos[i * 3 + 2] = z;
      this._vel[i * 3] = (Math.random() - 0.5) * spread * 2;
      this._vel[i * 3 + 1] = Math.random() * up;
      this._vel[i * 3 + 2] = (Math.random() - 0.5) * spread * 2;
      const jitter = 0.8 + Math.random() * 0.45;
      this._col[i * 3] = color.r * jitter; this._col[i * 3 + 1] = color.g * jitter; this._col[i * 3 + 2] = color.b * jitter;
      this._life[i] = this._maxLife[i] = life * (0.5 + Math.random() * 0.8);
      this._grav[i] = o.gravity !== undefined ? o.gravity : -3.5;
    }
  },

  sparks(x, y, z) { this.burst(x, y, z, { count: 12, color: 0xffb347, spread: 3.4, up: 3, life: 0.4, gravity: -7 }); },
  dust(x, y, z) { this.burst(x, y, z, { count: 5, color: 0xd8c49a, spread: 1.1, up: 1.1, life: 0.7, gravity: 0.6 }); },
  smoke(x, y, z) { this.burst(x, y, z, { count: 3, color: 0x555560, spread: 0.7, up: 2.4, life: 1.15, gravity: 1.4 }); },
  sparkle(x, y, z) { this.burst(x, y, z, { count: 14, color: 0x7dff8a, spread: 1.6, up: 2.6, life: 0.6, gravity: -1 }); },
  bloodlessPuff(x, y, z) { this.burst(x, y, z, { count: 8, color: 0xcfd4da, spread: 2, up: 2, life: 0.45 }); },

  muzzle(x, y, z, camPos) {
    if (!this._flash) return;
    this._flash.position.set(x, y, z);
    this._flash.lookAt(camPos.x, camPos.y, camPos.z);
    this._flash.rotation.z = Math.random() * Math.PI;
    this._flash.material.opacity = 0.95;
    this._flash.visible = true;
    this._flashT = 0.045;
    this.burst(x, y, z, { count: 3, color: 0xffdf9e, spread: 1.2, up: 0.6, life: 0.18, gravity: 0 });
  },

  addShake(amount) { this.shakeAmt = Math.min(1.2, this.shakeAmt + amount); },

  // Random camera offset that decays; main adds this to the camera.
  shakeOffset(out) {
    const a = this.shakeAmt;
    out.set((Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a * 0.35, (Math.random() - 0.5) * a * 0.5);
    return out;
  },

  update(dt) {
    for (let i = 0; i < this.MAX; i++) {
      if (this._life[i] <= 0) continue;
      this._life[i] -= dt;
      if (this._life[i] <= 0) { this._pos[i * 3 + 1] = -100; continue; }
      this._vel[i * 3 + 1] += this._grav[i] * dt;
      this._pos[i * 3] += this._vel[i * 3] * dt;
      this._pos[i * 3 + 1] += this._vel[i * 3 + 1] * dt;
      this._pos[i * 3 + 2] += this._vel[i * 3 + 2] * dt;
      if (this._pos[i * 3 + 1] < 0.05) { this._pos[i * 3 + 1] = 0.05; this._vel[i * 3 + 1] = 0; }
    }
    if (this.points) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
    if (this._flashT > 0) {
      this._flashT -= dt;
      if (this._flashT <= 0 && this._flash) { this._flash.visible = false; this._flash.material.opacity = 0; }
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.6);
  },
};
