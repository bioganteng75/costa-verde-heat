// world.js — Costa Verde itself: a seeded low-poly coastal city on a road
// grid. Buildings are boxes dressed in canvas-generated facade textures whose
// windows glow at dusk; the ground is one big painted canvas (roads, dashes,
// crosswalks, sidewalks, sand). Also owns collision AABBs and every pickup,
// stand and service point the other systems query.
CVH.world = {
  PITCH: 52,          // distance between road centrelines
  ROAD: 13,           // road width
  COLS: 8,            // blocks across (x)
  ROWS: 6,            // blocks deep (z)
  X0: -250, X1: 290,  // ground plane extent (extra room for beach + sea)
  Z0: -190, Z1: 190,
  WATER_X: 252,       // land ends here; sea beyond

  buildings: [],      // { aabb:{x0,z0,x1,z1}, h }
  colliders: [],      // AABBs only, for fast collision tests
  lamps: [],
  boats: [],
  stands: [],         // food stands { x, z }
  pickups: { packages: [], weapons: [] },
  spray: null,        // Pay 'n Spray { x, z, r }
  safehouse: null,    // { x, z } driveway / Marisol marker
  hospital: null,
  station: null,
  _facadeMats: [],
  _lampMat: null,
  _signMats: [],

  roadX(i) { return -this.COLS * this.PITCH / 2 + i * this.PITCH; },  // i in 0..COLS
  roadZ(j) { return -this.ROWS * this.PITCH / 2 + j * this.PITCH; },  // j in 0..ROWS

  isRoad(x, z) {
    const half = this.ROAD / 2 + 0.6;
    for (let i = 0; i <= this.COLS; i++) if (Math.abs(x - this.roadX(i)) < half) return true;
    for (let j = 0; j <= this.ROWS; j++) if (Math.abs(z - this.roadZ(j)) < half) return true;
    return false;
  },

  nearestIntersection(x, z) {
    let bx = this.roadX(0), bz = this.roadZ(0), bd = Infinity;
    for (let i = 0; i <= this.COLS; i++) for (let j = 0; j <= this.ROWS; j++) {
      const d = CVH.u.dist2(x, z, this.roadX(i), this.roadZ(j));
      if (d < bd) { bd = d; bx = this.roadX(i); bz = this.roadZ(j); }
    }
    return { x: bx, z: bz };
  },

  randomRoadPoint(r) {
    const i = Math.floor(r() * (this.COLS + 1));
    const j = Math.floor(r() * (this.ROWS + 1));
    if (r() < 0.5) return { x: this.roadX(i), z: CVH.u.range(r, this.roadZ(0), this.roadZ(this.ROWS)) };
    return { x: CVH.u.range(r, this.roadX(0), this.roadX(this.COLS)), z: this.roadZ(j) };
  },

  // Push a circle (pos {x,z}, radius r) out of every building and the sea.
  collideCircle(pos, r) {
    for (const b of this.colliders) {
      const nx = CVH.u.clamp(pos.x, b.x0, b.x1);
      const nz = CVH.u.clamp(pos.z, b.z0, b.z1);
      let dx = pos.x - nx, dz = pos.z - nz;
      let d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 0.0001) {
          // Centre inside the box: push out along the smallest penetration.
          const pl = pos.x - b.x0, pr = b.x1 - pos.x, pt = pos.z - b.z0, pb = b.z1 - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.x0 - r; else if (m === pr) pos.x = b.x1 + r;
          else if (m === pt) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        } else {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * r;
          pos.z = nz + (dz / d) * r;
        }
      }
    }
    if (pos.x > this.WATER_X - r) pos.x = this.WATER_X - r;
    if (pos.x < this.X0 + 14 + r) pos.x = this.X0 + 14 + r;
    if (pos.z < this.Z0 + 14 + r) pos.z = this.Z0 + 14 + r;
    if (pos.z > this.Z1 - 14 - r) pos.z = this.Z1 - 14 - r;
  },

  pointInBuilding(x, z, pad) {
    for (const b of this.colliders) {
      if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
    }
    return false;
  },

  // ---- textures ------------------------------------------------------------
  _facadeTexture(base, trim) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    g.fillStyle = trim; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10);
    g.fillStyle = 'rgba(30,40,52,0.85)';
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 5; col++) {
        g.fillRect(10 + col * 23, 20 + row * 19, 14, 11);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  },

  _emissiveTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
    const r = CVH.u.rng(777);
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 5; col++) {
        if (r() < 0.42) {
          g.fillStyle = r() < 0.8 ? '#ffca7a' : '#bfe3ff';
          g.fillRect(10 + col * 23, 20 + row * 19, 14, 11);
        }
      }
    }
    return new THREE.CanvasTexture(c);
  },

  _signTexture(text, bg, fg) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 112);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(7, 7, 498, 98);
    g.fillStyle = fg;
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  },

  _groundTexture() {
    const S = 4; // px per metre
    const W = (this.X1 - this.X0) * S, H = (this.Z1 - this.Z0) * S;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const px = (x) => (x - this.X0) * S;
    const pz = (z) => (z - this.Z0) * S;
    // Base: warm pavement.
    g.fillStyle = '#9aa08f'; g.fillRect(0, 0, W, H);
    // Block interiors: alternating plaza / grass tones.
    const r = CVH.u.rng(4242);
    for (let i = 0; i < this.COLS; i++) for (let j = 0; j < this.ROWS; j++) {
      const x0 = this.roadX(i) + this.ROAD / 2, x1 = this.roadX(i + 1) - this.ROAD / 2;
      const z0 = this.roadZ(j) + this.ROAD / 2, z1 = this.roadZ(j + 1) - this.ROAD / 2;
      g.fillStyle = r() < 0.4 ? '#8fae62' : (r() < 0.5 ? '#a8a08e' : '#99937f');
      g.fillRect(px(x0), pz(z0), (x1 - x0) * S, (z1 - z0) * S);
    }
    // Roads.
    g.fillStyle = '#3a3f46';
    for (let i = 0; i <= this.COLS; i++) g.fillRect(px(this.roadX(i) - this.ROAD / 2), pz(this.Z0 + 10), this.ROAD * S, (this.Z1 - this.Z0 - 20) * S);
    for (let j = 0; j <= this.ROWS; j++) g.fillRect(px(this.X0 + 10), pz(this.roadZ(j) - this.ROAD / 2), (this.WATER_X - this.X0 - 8) * S, this.ROAD * S);
    // Lane dashes.
    g.fillStyle = '#e8e4d2';
    for (let i = 0; i <= this.COLS; i++) {
      for (let z = this.Z0 + 16; z < this.Z1 - 14; z += 9) {
        if (this._nearIntersectionZ(z)) continue;
        g.fillRect(px(this.roadX(i)) - 1, pz(z), 2, 4.4 * S);
      }
    }
    for (let j = 0; j <= this.ROWS; j++) {
      for (let x = this.X0 + 16; x < this.WATER_X - 4; x += 9) {
        if (this._nearIntersectionX(x)) continue;
        g.fillRect(px(x), pz(this.roadZ(j)) - 1, 4.4 * S, 2);
      }
    }
    // Crosswalks at intersections.
    g.fillStyle = 'rgba(240,240,235,0.75)';
    for (let i = 0; i <= this.COLS; i++) for (let j = 0; j <= this.ROWS; j++) {
      const cx = this.roadX(i), cz = this.roadZ(j), hw = this.ROAD / 2;
      for (let s = -2; s <= 2; s++) {
        g.fillRect(px(cx - hw - 1.6), pz(cz + s * 2.4 - 0.8), 1.4 * S, 1.6 * S);
        g.fillRect(px(cx + hw + 0.2), pz(cz + s * 2.4 - 0.8), 1.4 * S, 1.6 * S);
        g.fillRect(px(cx + s * 2.4 - 0.8), pz(cz - hw - 1.6), 1.6 * S, 1.4 * S);
        g.fillRect(px(cx + s * 2.4 - 0.8), pz(cz + hw + 0.2), 1.6 * S, 1.4 * S);
      }
    }
    // Beach sand east of the last avenue.
    const sandGrad = g.createLinearGradient(px(224), 0, px(this.WATER_X + 6), 0);
    sandGrad.addColorStop(0, '#cbb98d');
    sandGrad.addColorStop(1, '#efdfae');
    g.fillStyle = sandGrad;
    g.fillRect(px(224), 0, (this.X1 - 224) * S, H);
    // A promenade strip along the sand.
    g.fillStyle = '#b7ab90';
    g.fillRect(px(224), 0, 3.4 * S, H);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  },
  _nearIntersectionZ(z) { for (let j = 0; j <= this.ROWS; j++) if (Math.abs(z - this.roadZ(j)) < this.ROAD / 2 + 2) return true; return false; },
  _nearIntersectionX(x) { for (let i = 0; i <= this.COLS; i++) if (Math.abs(x - this.roadX(i)) < this.ROAD / 2 + 2) return true; return false; },

  // ---- construction ----------------------------------------------------------
  build(scene, seed) {
    const r = CVH.u.rng(seed || 1234);
    this.buildings = []; this.colliders = []; this.lamps = []; this.boats = [];
    this.stands = []; this.pickups = { packages: [], weapons: [] };
    this._facadeMats = []; this._signMats = [];

    // Ground.
    const groundTex = this._groundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.X1 - this.X0, this.Z1 - this.Z0),
      new THREE.MeshLambertMaterial({ map: groundTex })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((this.X0 + this.X1) / 2, 0, (this.Z0 + this.Z1) / 2);
    ground.receiveShadow = true;
    scene.add(ground);

    // Sea: animated plane east of the sand.
    const seaC = document.createElement('canvas');
    seaC.width = seaC.height = 128;
    const sg = seaC.getContext('2d');
    sg.fillStyle = '#1d6f8e'; sg.fillRect(0, 0, 128, 128);
    sg.strokeStyle = 'rgba(255,255,255,0.35)'; sg.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      sg.beginPath();
      sg.arc(14 + i * 20, 20 + (i % 3) * 38, 9, 0.3, Math.PI - 0.6);
      sg.stroke();
    }
    const seaTex = new THREE.CanvasTexture(seaC);
    seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
    seaTex.repeat.set(10, 14);
    this._seaTex = seaTex;
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(190, this.Z1 - this.Z0 + 60),
      new THREE.MeshLambertMaterial({ map: seaTex, color: 0x9fd4e8 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(this.WATER_X + 92, -0.25, 0);
    scene.add(sea);

    // Facade materials (shared per palette so dusk glow is one dial).
    const palettes = [
      ['#e8dcc4', '#8a6f4d'], ['#d96f4e', '#7a3b28'], ['#7fb5b0', '#3d6b66'],
      ['#e5e0ea', '#6a6076'], ['#e9b44c', '#8a6420'], ['#c96f8e', '#6e3548'],
    ];
    const emissiveTex = this._emissiveTexture();
    for (const [base, trim] of palettes) {
      const mat = new THREE.MeshLambertMaterial({
        map: this._facadeTexture(base, trim),
        emissive: 0xffb45e, emissiveMap: emissiveTex, emissiveIntensity: 0,
      });
      this._facadeMats.push(mat);
    }
    this._roofMat = new THREE.MeshLambertMaterial({ color: 0x5c564c });
    this._concreteMat = new THREE.MeshLambertMaterial({ color: 0xb0a890 });

    // Landmark block assignments (block indices i,j).
    const landmark = { '1,1': 'station', '6,4': 'hospital', '3,2': 'hotel', '4,2': 'bank', '2,4': 'spray', '0,5': 'safehouse', '5,0': 'cafe' };

    for (let i = 0; i < this.COLS; i++) {
      for (let j = 0; j < this.ROWS; j++) {
        const key = i + ',' + j;
        const bx0 = this.roadX(i) + this.ROAD / 2 + 2.5, bx1 = this.roadX(i + 1) - this.ROAD / 2 - 2.5;
        const bz0 = this.roadZ(j) + this.ROAD / 2 + 2.5, bz1 = this.roadZ(j + 1) - this.ROAD / 2 - 2.5;
        const kind = landmark[key];
        if (kind === 'safehouse') { this._buildSafehouse(scene, bx0, bx1, bz0, bz1); continue; }
        if (kind === 'spray') { this._buildSpray(scene, bx0, bx1, bz0, bz1); continue; }
        if (kind) { this._buildLandmark(scene, kind, bx0, bx1, bz0, bz1, r); continue; }
        if (r() < 0.12) { this._buildPlaza(scene, bx0, bx1, bz0, bz1, r); continue; }
        // Ordinary block: 2x2 lots, most filled.
        const mx = (bx0 + bx1) / 2, mz = (bz0 + bz1) / 2;
        const lots = [[bx0, bz0, mx, mz], [mx, bz0, bx1, mz], [bx0, mz, mx, bz1], [mx, mz, bx1, bz1]];
        const downtown = (i >= 2 && i <= 5 && j >= 1 && j <= 4);
        for (const [lx0, lz0, lx1, lz1] of lots) {
          if (r() < 0.18) continue;
          const w = CVH.u.range(r, 9, Math.min(15.5, lx1 - lx0 - 2));
          const d = CVH.u.range(r, 9, Math.min(15.5, lz1 - lz0 - 2));
          const cx = (lx0 + lx1) / 2 + CVH.u.range(r, -1.5, 1.5);
          const cz = (lz0 + lz1) / 2 + CVH.u.range(r, -1.5, 1.5);
          const h = downtown ? CVH.u.range(r, 16, 46) : CVH.u.range(r, 7, 19);
          this._addBuilding(scene, cx, cz, w, d, h, Math.floor(r() * this._facadeMats.length));
        }
      }
    }

    this._buildMarina(scene, r);
    this._buildPalmsAndLamps(scene, r);
    this._buildStands(scene);
    this._buildPickups(scene, r);
    return this;
  },

  _addBuilding(scene, cx, cz, w, d, h, paletteIdx, sign) {
    const mat = this._facadeMats[paletteIdx % this._facadeMats.length];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      [mat, mat, this._roofMat, this._roofMat, mat, mat]
    );
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const aabb = { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 };
    this.buildings.push({ aabb, h });
    this.colliders.push(aabb);
    if (sign) {
      const tex = this._signTexture(sign.text, sign.bg, sign.fg);
      const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: false });
      this._signMats.push(sm);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.92, 17), 3.4), sm);
      // Face the nearest road: put the sign on the south face, slightly proud.
      plane.position.set(cx, Math.min(h - 2.4, 6.5), cz + d / 2 + 0.06);
      scene.add(plane);
    }
    return mesh;
  },

  _buildLandmark(scene, kind, bx0, bx1, bz0, bz1, r) {
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    if (kind === 'station') {
      this._addBuilding(scene, cx, cz, 26, 15, 10, 3, { text: 'POLICE', bg: '#1d3f8e', fg: '#ffffff' });
      this.station = { x: cx, z: bz1 + 8 };
    } else if (kind === 'hospital') {
      this._addBuilding(scene, cx, cz, 24, 16, 15, 3, { text: 'HOSPITAL', bg: '#e8e8e8', fg: '#c22e2e' });
      this.hospital = { x: cx, z: bz1 + 8 };
    } else if (kind === 'hotel') {
      this._addBuilding(scene, cx, cz, 18, 18, 52, 4, { text: 'HOTEL SOL', bg: '#20303e', fg: '#ffd76a' });
    } else if (kind === 'bank') {
      this._addBuilding(scene, cx, cz, 22, 15, 13, 5, { text: 'BANCO VERDE', bg: '#14532d', fg: '#e8f5e0' });
    } else if (kind === 'cafe') {
      this._addBuilding(scene, cx, cz, 16, 12, 8, 1, { text: 'CAFE MARINA', bg: '#7a3b28', fg: '#ffe9c9' });
      this._addBuilding(scene, cx - 11, cz + 8, 10, 9, 18, 0);
    }
  },

  _buildSafehouse(scene, bx0, bx1, bz0, bz1) {
    const cx = bx0 + 10, cz = bz0 + 9;
    this._addBuilding(scene, cx, cz, 13, 10, 6.5, 0);
    // Driveway apron east of the house: Marisol's marker lives here.
    this.safehouse = { x: cx + 13.5, z: cz + 2 };
    const drive = new THREE.Mesh(new THREE.PlaneGeometry(15, 9), this._concreteMat);
    drive.rotation.x = -Math.PI / 2;
    drive.position.set(cx + 12, 0.02, cz + 2);
    drive.receiveShadow = true;
    scene.add(drive);
  },

  _buildSpray(scene, bx0, bx1, bz0, bz1) {
    const cx = (bx0 + bx1) / 2, cz = bz0 + 9;
    this._addBuilding(scene, cx, cz, 24, 11, 7.5, 2, { text: "PAY 'N SPRAY", bg: '#0f5132', fg: '#b8ffd9' });
    // Open apron south of the garage: drive in to get sprayed.
    this.spray = { x: cx, z: cz + 13, r: 6.5 };
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), this._concreteMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(cx, 0.02, cz + 13);
    apron.receiveShadow = true;
    scene.add(apron);
  },

  _buildPlaza(scene, bx0, bx1, bz0, bz1, r) {
    // Open lot: a few palms and a low kiosk, no colliders except the kiosk.
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    this._addBuilding(scene, cx, cz, 6, 5, 3.2, 1);
    for (let k = 0; k < 3; k++) {
      this._addPalm(scene, bx0 + 4 + r() * (bx1 - bx0 - 8), bz0 + 4 + r() * (bz1 - bz0 - 8), r);
    }
  },

  _palmMats: null,
  _addPalm(scene, x, z, r) {
    if (!this._palmMats) {
      const leafC = document.createElement('canvas');
      leafC.width = 128; leafC.height = 64;
      const lg = leafC.getContext('2d');
      lg.clearRect(0, 0, 128, 64);
      lg.strokeStyle = '#3e7d32'; lg.lineWidth = 5; lg.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        lg.beginPath();
        lg.moveTo(64, 60);
        lg.quadraticCurveTo(64 + (i - 3) * 14, 22, 64 + (i - 3) * 20, 44 + Math.abs(i - 3) * 4);
        lg.stroke();
      }
      const leafTex = new THREE.CanvasTexture(leafC);
      this._palmMats = {
        trunk: new THREE.MeshLambertMaterial({ color: 0x8a6b48 }),
        leaf: new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.4, side: THREE.DoubleSide }),
      };
    }
    const g = new THREE.Group();
    const trunkH = CVH.u.range(r, 4.5, 6.5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, trunkH, 6), this._palmMats.trunk);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = CVH.u.range(r, -0.09, 0.09);
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), this._palmMats.leaf);
      frond.position.y = trunkH + 0.25;
      frond.rotation.y = (i / 3) * Math.PI;
      frond.rotation.x = -0.5;
      frond.castShadow = true;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    this.colliders.push({ x0: x - 0.35, z0: z - 0.35, x1: x + 0.35, z1: z + 0.35 });
  },

  _buildPalmsAndLamps(scene, r) {
    // Palms along the promenade and scattered on sidewalks.
    for (let z = this.Z0 + 26; z < this.Z1 - 16; z += CVH.u.range(r, 14, 22)) {
      this._addPalm(scene, 228 + r() * 14, z, r);
    }
    for (let k = 0; k < 26; k++) {
      const p = this.randomRoadPoint(r);
      const x = p.x + (r() < 0.5 ? -1 : 1) * (this.ROAD / 2 + 1.6);
      const z = p.z + (r() < 0.5 ? -1 : 1) * (this.ROAD / 2 + 1.6);
      if (!this.pointInBuilding(x, z, 1)) this._addPalm(scene, x, z, r);
    }
    // Street lamps at intersection corners.
    this._lampMat = new THREE.MeshLambertMaterial({ color: 0x444a50, emissive: 0xffc37a, emissiveIntensity: 0 });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4249 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6);
    const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
    for (let i = 0; i <= this.COLS; i++) for (let j = 0; j <= this.ROWS; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = this.roadX(i) + this.ROAD / 2 + 0.8, z = this.roadZ(j) + this.ROAD / 2 + 0.8;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 2.7, z);
      scene.add(pole);
      const head = new THREE.Mesh(headGeo, this._lampMat);
      head.position.set(x, 5.5, z);
      scene.add(head);
      this.lamps.push(head);
    }
  },

  _buildMarina(scene, r) {
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 7), woodMat);
    pier.position.set(this.WATER_X + 15, 0.35, 78);
    pier.castShadow = true;
    scene.add(pier);
    const hullCols = [0xe8e4da, 0xd96f4e, 0x7fb5b0, 0xe9b44c];
    for (let k = 0; k < 4; k++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.1, 2.2), new THREE.MeshLambertMaterial({ color: hullCols[k % 4] }));
      hull.position.y = 0.4;
      boat.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 1.6), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
      cabin.position.set(-0.4, 1.3, 0);
      boat.add(cabin);
      boat.position.set(this.WATER_X + 8 + k * 8, 0, 66 + (k % 2) * 22);
      boat.rotation.y = Math.PI / 2 + CVH.u.range(r, -0.2, 0.2);
      scene.add(boat);
      this.boats.push({ g: boat, phase: r() * 6 });
    }
  },

  _buildStands(scene) {
    const spots = [
      { x: this.roadX(2) + 9, z: this.roadZ(1) + 9 },
      { x: this.roadX(5) - 9, z: this.roadZ(3) + 9 },
      { x: this.roadX(7) + 9, z: this.roadZ(5) - 9 },
      { x: this.roadX(1) - 9, z: this.roadZ(4) - 9 },
      { x: 226, z: this.roadZ(2) + 4 },
    ];
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe2725b });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xf5eeda });
    for (const s of spots) {
      if (this.pointInBuilding(s.x, s.z, 2)) { s.x += 6; }
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.1, 2.2), bodyMat);
      body.position.y = 1.05; body.castShadow = true;
      g.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 3), roofMat);
      roof.position.y = 2.35;
      g.add(roof);
      g.position.set(s.x, 0, s.z);
      scene.add(g);
      this.stands.push({ x: s.x, z: s.z, mesh: g });
      this.colliders.push({ x0: s.x - 1.5, z0: s.z - 1.1, x1: s.x + 1.5, z1: s.z + 1.1 });
    }
  },

  _buildPickups(scene, r) {
    // Candidate spots: sidewalk corners and block edges all over the city.
    const candidates = [];
    for (let i = 0; i < this.COLS; i++) for (let j = 0; j < this.ROWS; j++) {
      const bx0 = this.roadX(i) + this.ROAD / 2 + 3.4, bx1 = this.roadX(i + 1) - this.ROAD / 2 - 3.4;
      const bz0 = this.roadZ(j) + this.ROAD / 2 + 3.4, bz1 = this.roadZ(j + 1) - this.ROAD / 2 - 3.4;
      candidates.push({ x: bx0, z: bz0 }, { x: bx1, z: bz1 }, { x: bx1, z: bz0 }, { x: bx0, z: bz1 },
        { x: (bx0 + bx1) / 2, z: bz0 }, { x: (bx0 + bx1) / 2, z: bz1 });
    }
    // Audit: never inside (or hugging) a building, never in the spray zone.
    const valid = candidates.filter((p) => {
      if (this.pointInBuilding(p.x, p.z, 2.2)) return false;
      if (this.spray && CVH.u.dist2(p.x, p.z, this.spray.x, this.spray.z) < 9) return false;
      return true;
    });
    // Spread the packages across the map: sort by a seeded shuffle, then thin
    // out anything too close to an already-chosen package.
    for (let i = valid.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); const t = valid[i]; valid[i] = valid[k]; valid[k] = t; }
    const chosen = [];
    for (const p of valid) {
      if (chosen.length >= 14) break;
      if (chosen.some((q) => CVH.u.dist2(p.x, p.z, q.x, q.z) < 34)) continue;
      chosen.push(p);
    }
    const pkgMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xa87b00, emissiveIntensity: 0.55 });
    const pkgGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    chosen.forEach((p, idx) => {
      const mesh = new THREE.Mesh(pkgGeo, pkgMat);
      mesh.position.set(p.x, 0.8, p.z);
      mesh.castShadow = true;
      scene.add(mesh);
      this.pickups.packages.push({ id: idx, x: p.x, z: p.z, mesh, taken: false });
    });
    // Weapons: a pistol in the alley by the safehouse block, an SMG behind the bank block.
    const weaponSpots = [
      { kind: 'pistol', x: this.roadX(0) + 10, z: this.roadZ(5) - 10 },
      { kind: 'smg', x: this.roadX(5) - 10, z: this.roadZ(2) + 10 },
    ];
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x2c3138, emissive: 0x224466, emissiveIntensity: 0.4 });
    for (const w of weaponSpots) {
      let x = w.x, z = w.z;
      if (this.pointInBuilding(x, z, 2)) { x += 8; z += 8; }
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.34), gunMat);
      mesh.position.set(x, 0.75, z);
      scene.add(mesh);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 20),
        new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.06, z);
      scene.add(ring);
      this.pickups.weapons.push({ kind: w.kind, x, z, mesh, ring, taken: false });
    }
  },

  // Per-frame life: sea shimmer, bobbing boats, dusk-reactive materials.
  update(dt, t, duskF) {
    if (this._seaTex) this._seaTex.offset.x = (t * 0.014) % 1;
    for (const b of this.boats) {
      b.g.position.y = Math.sin(t * 1.3 + b.phase) * 0.16;
      b.g.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.03;
    }
    for (const p of this.pickups.packages) {
      if (!p.taken) { p.mesh.rotation.y += dt * 2.2; p.mesh.position.y = 0.8 + Math.sin(t * 3 + p.id) * 0.14; }
    }
    for (const w of this.pickups.weapons) {
      if (!w.taken) { w.mesh.rotation.y += dt * 1.6; }
    }
    for (const m of this._facadeMats) m.emissiveIntensity = duskF * 0.85;
    if (this._lampMat) this._lampMat.emissiveIntensity = duskF * 1.6;
  },
};
