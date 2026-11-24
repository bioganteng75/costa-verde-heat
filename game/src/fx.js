// fx.js — lightweight effects: a pooled particle cloud (sparks, dust, smoke,
// muzzle flashes), hitscan tracers, and floating cash/damage text sprites.
// Everything is pooled and reused; nothing allocates per frame.
CVH.fx = {
  MAX: 900,
  _i: 0,

  init(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.MAX * 3);
    this.col = new Float32Array(this.MAX * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.32, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < this.MAX; i++) {
      this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, drag: 1, grow: 0 });
      this.pos[i * 3 + 1] = -100;
    }
    // Tracers: a small pool of line segments that fade in a few frames.
    this.tracers = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this._tracerI = 0;
    // Smoke: soft dark sprites that rise off wrecked/damaged cars.
    this.smokes = [];
    const smokeTex = this._smokeTexture();
    for (let i = 0; i < 40; i++) {
      const m = new THREE.SpriteMaterial({ map: smokeTex, color: 0x555560, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.smokes.push({ s, life: 0, max: 1 });
    }
    this._smokeI = 0;
  },

  _smokeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  },

  spawn(x, y, z, opts) {
    const n = opts.n || 8;
    for (let k = 0; k < n; k++) {
      const i = this._i;
      this._i = (this._i + 1) % this.MAX;
      const p = this.parts[i];
      p.max = p.life = (opts.life || 0.5) * (0.6 + Math.random() * 0.7);
      const sp = opts.speed || 3;
      p.vx = (Math.random() - 0.5) * sp;
      p.vz = (Math.random() - 0.5) * sp;
      p.vy = Math.random() * (opts.up || 2.4);
      p.grav = opts.grav !== undefined ? opts.grav : -5;
      p.drag = opts.drag !== undefined ? opts.drag : 1;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const c = opts.color;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
  },

  sparks(p) { this.spawn(p.x, p.y || 0.7, p.z, { n: 10, color: { r: 1, g: 0.75, b: 0.25 }, speed: 4.5, life: 0.35, up: 2 }); },
  dust(p) { this.spawn(p.x, 0.25, p.z, { n: 5, color: { r: 0.85, g: 0.78, b: 0.6 }, speed: 1.6, life: 0.6, up: 1, grav: -0.6 }); },
  muzzle(p) { this.spawn(p.x, p.y, p.z, { n: 4, color: { r: 1, g: 0.85, b: 0.4 }, speed: 0.8, life: 0.09, up: 0.4, grav: 0 }); },
  bloodlessPuff(p) { this.spawn(p.x, 1, p.z, { n: 6, color: { r: 0.95, g: 0.4, b: 0.35 }, speed: 2, life: 0.3, up: 1.4 }); },
  confetti(p) { this.spawn(p.x, 2.2, p.z, { n: 26, color: { r: 1, g: 0.85, b: 0.2 }, speed: 3.4, life: 0.9, up: 3.4 }); },

  smoke(p, big) {
    const s = this.smokes[this._smokeI];
    this._smokeI = (this._smokeI + 1) % this.smokes.length;
    s.life = s.max = 1.1 + Math.random() * 0.5;
    s.s.position.set(p.x + (Math.random() - 0.5), 1.1, p.z + (Math.random() - 0.5));
    s.s.scale.set(big ? 2.4 : 1.4, big ? 2.4 : 1.4, 1);
    s.s.visible = true;
  },

  tracer(a, b) {
    const t = this.tracers[this._tracerI];
    this._tracerI = (this._tracerI + 1) % this.tracers.length;
    const arr = t.line.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
    arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
  },

  update(dt) {
    for (let i = 0; i < this.MAX; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vz *= d;
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      if (this.pos[i * 3 + 1] < 0.05) this.pos[i * 3 + 1] = 0.05;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.s.visible = false; s.s.material.opacity = 0; continue; }
      s.s.position.y += dt * 1.6;
      const f = 1 - s.life / s.max;
      s.s.material.opacity = 0.42 * Math.sin(Math.min(1, f + 0.15) * Math.PI);
      const sc = s.s.scale.x + dt * 1.4;
      s.s.scale.set(sc, sc, 1);
    }
  },
};
