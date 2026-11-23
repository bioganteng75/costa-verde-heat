// world.js — builds Costa Verde: a low-poly coastal city on a road grid.
// The ground (roads, markings, sidewalks, beach) is one big canvas texture;
// buildings are boxes with canvas window textures that light up at dusk.
// Also owns collision (circle vs building AABBs) and all landmark spots.
window.CVH = window.CVH || {};

CVH.world = {
  // Layout constants ------------------------------------------------------------
  PITCH: 62,            // block pitch (46 block + 16 road)
  BLOCK: 46,
  COLS: 8, ROWS: 6,
  MIN_X: -262, MAX_X: 298, MIN_Z: -200, MAX_Z: 200,
  SHORE_X: 296,         // water starts here

  roadXs: [], roadZs: [],
  buildings: [],        // {minX,maxX,minZ,maxZ,h,name?}
  palms: [],            // {x,z}
  lampMat: null,
  windowMats: [],
  pickups: { packages: [], weapons: [] },
  landmarks: null,

  _waterTex: null, _foamTex: null, _ring: null, _t: 0,

  // Canvas helpers ---------------------------------------------------------------
  _canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },

  _facadeTextures(base, trim) {
    // Diffuse: facade colour with a grid of shaded windows.
    const c = this._canvas(128, 256), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    g.fillStyle = trim; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10);
    // Emissive: black except the same windows in warm light.
    const e = this._canvas(128, 256), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 256);
    const rng = CVH.util.mulberry32(base.length * 977 + 13);
    for (let r = 0; r < 11; r++) {
      for (let col = 0; col < 5; col++) {
        const x = 10 + col * 23, y = 18 + r * 20;
        const lit = rng() > 0.45;
        g.fillStyle = lit ? '#5b7186' : '#3d4c5c';
        g.fillRect(x, y, 14, 12);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, 14, 3);
        if (lit) { ge.fillStyle = '#ffb85c'; ge.fillRect(x, y, 14, 12); }
      }
    }
    const map = new THREE.CanvasTexture(c);
    const emissiveMap = new THREE.CanvasTexture(e);
    return { map, emissiveMap };
  },

  _groundTexture() {
    // One 4 px/unit canvas for the whole city floor: blocks, roads, dashes,
    // crosswalks, the Pay 'n Spray lot, the marina apron and the beach.
    const S = 4, W = (this.MAX_X - this.MIN_X) * S, H = (this.MAX_Z - this.MIN_Z) * S;
    const c = this._canvas(W, H), g = c.getContext('2d');
    const X = (x) => (x - this.MIN_X) * S, Z = (z) => (z - this.MIN_Z) * S;
    g.fillStyle = '#79816f'; g.fillRect(0, 0, W, H);                       // base ground
    // Block aprons (sidewalk concrete)
    g.fillStyle = '#a9adb0';
    for (let i = 0; i < this.COLS; i++) for (let j = 0; j < this.ROWS; j++) {
      const bx = (i - (this.COLS - 1) / 2) * this.PITCH, bz = (j - (this.ROWS - 1) / 2) * this.PITCH;
      g.fillRect(X(bx - 29), Z(bz - 29), 58 * S, 58 * S);
    }
    // Roads
    g.fillStyle = '#33363d';
    for (const rx of this.roadXs) g.fillRect(X(rx - 8), 0, 16 * S, H);
    for (const rz of this.roadZs) g.fillRect(0, Z(rz - 8), W, 16 * S);
    // Lane dashes
    g.fillStyle = '#d8c95a';
    for (const rx of this.roadXs) for (let z = this.MIN_Z + 6; z < this.MAX_Z - 6; z += 12) {
      if (this.roadZs.some((rz) => Math.abs(z - rz) < 11)) continue;
      g.fillRect(X(rx - 0.35), Z(z), 0.7 * S, 5 * S);
    }
    for (const rz of this.roadZs) for (let x = this.MIN_X + 6; x < 262 - 6; x += 12) {
      if (this.roadXs.some((rx) => Math.abs(x - rx) < 11)) continue;
      g.fillRect(X(x), Z(rz - 0.35), 5 * S, 0.7 * S);
    }
    // Crosswalks at every intersection
    g.fillStyle = 'rgba(235,238,240,0.85)';
    for (const rx of this.roadXs) for (const rz of this.roadZs) {
      for (let s = -6; s <= 6; s += 3) {
        g.fillRect(X(rx + s - 0.8), Z(rz - 10.5), 1.6 * S, 4.5 * S);
        g.fillRect(X(rx + s - 0.8), Z(rz + 6), 1.6 * S, 4.5 * S);
        g.fillRect(X(rx - 10.5), Z(rz + s - 0.8), 4.5 * S, 1.6 * S);
        g.fillRect(X(rx + 6), Z(rz + s - 0.8), 4.5 * S, 1.6 * S);
      }
    }
    // Pay 'n Spray lot (block col 6, row 3)
    const px = (6 - 3.5) * this.PITCH, pz = (3 - 2.5) * this.PITCH;
    g.fillStyle = '#8e9296'; g.fillRect(X(px - 29), Z(pz - 29), 58 * S, 58 * S);
    g.strokeStyle = '#e8e8e8'; g.lineWidth = 2;
    for (let b = 0; b < 4; b++) g.strokeRect(X(px - 24 + b * 13), Z(pz + 12), 11 * S, 15 * S);
    // Beach: flat sand east of the last road, then the shoreline foam line
    g.fillStyle = '#e6d29c'; g.fillRect(X(262), 0, (this.MAX_X - 262) * S, H);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(X(this.SHORE_X - 2), 0, 2 * S, H);
    // Marina apron (planks) on the beach at z ≈ -120
    g.fillStyle = '#9a7d55'; g.fillRect(X(258), Z(-136), (this.SHORE_X - 258) * S, 34 * S);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  },

  _signSprite(text, color) {
    const c = this._canvas(512, 96), g = c.getContext('2d');
    g.fillStyle = 'rgba(10,14,20,0.72)'; g.fillRect(0, 0, 512, 96);
    g.font = 'bold 52px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color || '#ffd76e'; g.fillText(text, 256, 52);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    spr.scale.set(22, 4.1, 1);
    return spr;
  },

  // Build ----------------------------------------------------------------------
  build(scene, seed) {
    const rng = CVH.util.mulberry32(seed || 1);
    const U = CVH.util;
    for (let k = 0; k <= this.COLS; k++) this.roadXs.push(-248 + k * this.PITCH);
    for (let k = 0; k <= this.ROWS; k++) this.roadZs.push(-186 + k * this.PITCH);

    // Ground + water
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.MAX_X - this.MIN_X, this.MAX_Z - this.MIN_Z),
      new THREE.MeshLambertMaterial({ map: this._groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((this.MIN_X + this.MAX_X) / 2, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    const wc = this._canvas(128, 128), wg = wc.getContext('2d');
    wg.fillStyle = '#1d6f8e'; wg.fillRect(0, 0, 128, 128);
    wg.strokeStyle = 'rgba(255,255,255,0.25)'; wg.lineWidth = 3;
    for (let i = 0; i < 5; i++) { wg.beginPath(); wg.moveTo(0, i * 30 + 8); wg.bezierCurveTo(40, i * 30, 90, i * 30 + 16, 128, i * 30 + 6); wg.stroke(); }
    this._waterTex = new THREE.CanvasTexture(wc);
    this._waterTex.wrapS = this._waterTex.wrapT = THREE.RepeatWrapping;
    this._waterTex.repeat.set(10, 16);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(280, this.MAX_Z - this.MIN_Z),
      new THREE.MeshLambertMaterial({ map: this._waterTex, color: 0x9fd4e8 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(this.SHORE_X + 140, -0.35, 0);
    scene.add(water);

    // Buildings
    const palettes = [
      this._facadeTextures('#c9b8a3', '#8a6f4d'), this._facadeTextures('#b7c3c9', '#5f7480'),
      this._facadeTextures('#d3a08a', '#96604a'), this._facadeTextures('#c4c9d4', '#6d7686'),
      this._facadeTextures('#e0d3ae', '#a68d54'), this._facadeTextures('#a8bfb2', '#5f7d6c'),
    ];
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4f55 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const downtown = { x: 0, z: 0 };
    for (let i = 0; i < this.COLS; i++) for (let j = 0; j < this.ROWS; j++) {
      const bx = (i - (this.COLS - 1) / 2) * this.PITCH, bz = (j - (this.ROWS - 1) / 2) * this.PITCH;
      if (i === 6 && j === 3) continue;                       // Pay 'n Spray lot
      if (i === 2 && j === 2) { this._plaza(scene, bx, bz, rng); continue; }
      const dc = U.dist2D(bx, bz, downtown.x, downtown.z) / 260;
      const mk = (cx, cz, w, d) => {
        const h = Math.max(9, (40 - dc * 26) * (0.65 + rng() * 0.75));
        const pal = palettes[Math.floor(rng() * palettes.length)];
        const map = pal.map.clone(); map.needsUpdate = true;
        map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(Math.max(1, Math.round(w / 15)), Math.max(1, Math.round(h / 22)));
        const em = pal.emissiveMap.clone(); em.needsUpdate = true;
        em.wrapS = em.wrapT = THREE.RepeatWrapping; em.repeat.copy(map.repeat);
        const mat = new THREE.MeshLambertMaterial({ map, emissiveMap: em, emissive: 0xffb765, emissiveIntensity: 0 });
        this.windowMats.push(mat);
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.set(w, h, d); m.position.set(cx, h / 2, cz);
        m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
        scene.add(m);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(w + 0.7, 0.7, d + 0.7); roof.position.set(cx, h + 0.35, cz);
        roof.matrixAutoUpdate = false; roof.updateMatrix();
        scene.add(roof);
        if (h > 26 && rng() > 0.5) {
          const ac = new THREE.Mesh(boxGeo, roofMat);
          ac.scale.set(4, 1.6, 3); ac.position.set(cx + (rng() - 0.5) * w * 0.4, h + 1.4, cz + (rng() - 0.5) * d * 0.4);
          ac.matrixAutoUpdate = false; ac.updateMatrix(); scene.add(ac);
        }
        this.buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h, cx, cz });
      };
      if (rng() > 0.72) { mk(bx - 12, bz, 20, 30 + rng() * 8); mk(bx + 12, bz, 20, 30 + rng() * 8); }
      else mk(bx, bz, 30 + rng() * 9, 30 + rng() * 9);
    }

    // Landmark signs on the nearest buildings
    const signAt = (x, z, text, color) => {
      let best = null, bd = 1e9;
      for (const b of this.buildings) { const d = U.dist2D(x, z, b.cx, b.cz); if (d < bd) { bd = d; best = b; } }
      if (!best) return;
      const spr = this._signSprite(text, color);
      spr.position.set(best.cx, Math.min(best.h - 2.5, 13), best.maxZ + 1.2);
      scene.add(spr); best.name = text;
    };
    signAt(114, 52, 'HOTEL SOL', '#ffd76e');
    signAt(52, -52, 'POLICE', '#9fd0ff');
    signAt(-72, -114, 'HOSPITAL', '#ff9d9d');
    signAt(20, 20, 'BANCO VERDE', '#a8ffb0');

    // Palms: cylinder trunk + squashed cone canopy
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6);
    const frondGeo = new THREE.ConeGeometry(3.1, 1.6, 7);
    const addPalm = (x, z) => {
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2.7; trunk.rotation.z = (rng() - 0.5) * 0.16; trunk.castShadow = true;
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.y = 5.6; frond.rotation.x = Math.PI; frond.castShadow = true;
      grp.add(trunk); grp.add(frond);
      grp.position.set(x, 0, z);
      grp.rotation.y = rng() * Math.PI * 2;
      scene.add(grp);
      this.palms.push({ x, z });
    };
    for (let n = 0; n < 54; n++) {
      const onBeach = n >= 34;
      const x = onBeach ? 266 + rng() * 26 : -250 + rng() * 505;
      const z = -190 + rng() * 380;
      if (!onBeach && this._onRoad(x, z, 3)) continue;
      if (this.buildings.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2)) continue;
      addPalm(x, z);
    }

    // Street lamps along the roads
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x554a2a });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6.4, 5);
    const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
    for (const rx of this.roadXs) for (let z = -186; z <= 186; z += 62) {
      for (const s of [-1, 1]) {
        const head = new THREE.Mesh(headGeo, this.lampMat);
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(rx + s * 8.6, 3.2, z + 14); pole.matrixAutoUpdate = false; pole.updateMatrix();
        head.position.set(rx + s * 8.6, 6.5, z + 14); head.matrixAutoUpdate = false; head.updateMatrix();
        scene.add(pole); scene.add(head);
      }
    }

    // Marina pier + boats
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x9a7d55 });
    const pier = new THREE.Mesh(boxGeo, woodMat);
    pier.scale.set(38, 0.8, 10); pier.position.set(this.SHORE_X + 16, 0.25, -120);
    pier.castShadow = true; scene.add(pier);
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
    const hull2Mat = new THREE.MeshLambertMaterial({ color: 0x3f7fae });
    [[308, -134, hullMat], [312, -106, hull2Mat]].forEach(([x, z, m]) => {
      const boat = new THREE.Mesh(boxGeo, m);
      boat.scale.set(9, 1.6, 3.4); boat.position.set(x, 0.15, z); boat.rotation.y = 0.2; scene.add(boat);
      const cabin = new THREE.Mesh(boxGeo, m);
      cabin.scale.set(3, 1.4, 2.4); cabin.position.set(x - 1, 1.5, z); cabin.rotation.y = 0.2; scene.add(cabin);
    });

    // Pay 'n Spray garage: back + side walls and a roof, open front, ring zone
    const gx = (6 - 3.5) * this.PITCH, gz = (3 - 2.5) * this.PITCH;
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x7fa8c9 });
    const mkWall = (x, z, w, d, h) => {
      const m = new THREE.Mesh(boxGeo, wallMat);
      m.scale.set(w, h, d); m.position.set(x, h / 2, z); m.castShadow = true; scene.add(m);
      this.buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, cx: x, cz: z });
    };
    mkWall(gx, gz - 13, 30, 1.6, 7); mkWall(gx - 15, gz, 1.6, 26, 7); mkWall(gx + 15, gz, 1.6, 26, 7);
    const groof = new THREE.Mesh(boxGeo, roofMat);
    groof.scale.set(33, 0.8, 30); groof.position.set(gx, 7.4, gz); scene.add(groof);
    const gsign = this._signSprite("PAY 'N SPRAY", '#8affd1');
    gsign.position.set(gx, 8.6, gz + 14); scene.add(gsign);
    this._ring = new THREE.Mesh(
      new THREE.RingGeometry(7.4, 8.6, 40),
      new THREE.MeshBasicMaterial({ color: 0x39d98a, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    this._ring.rotation.x = -Math.PI / 2; this._ring.position.set(gx, 0.06, gz);
    scene.add(this._ring);

    // Food stands: counter box + striped awning
    const standSpots = [[10, 10], [-114, -52], [114, 114], [72, -176], [176, 72]];
    const awnMats = [0xd94f4f, 0x3f8fd9, 0xf2b33d, 0x53b06a, 0xd97fb8].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    standSpots.forEach(([x, z], idx) => {
      const grp = new THREE.Group();
      const counter = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8e0cc }));
      counter.scale.set(4.4, 1.6, 2.2); counter.position.y = 0.8; counter.castShadow = true;
      const awn = new THREE.Mesh(boxGeo, awnMats[idx % awnMats.length]);
      awn.scale.set(5.2, 0.25, 3.4); awn.position.set(0, 2.9, 0.3); awn.rotation.x = 0.18;
      const post = new THREE.Mesh(boxGeo, poleMat);
      post.scale.set(0.18, 2.9, 0.18); post.position.set(-2.4, 1.45, 1.2);
      const post2 = post.clone(); post2.position.x = 2.4;
      grp.add(counter); grp.add(awn); grp.add(post); grp.add(post2);
      grp.position.set(x, 0, z);
      grp.rotation.y = (idx % 4) * Math.PI / 2;
      scene.add(grp);
      this.buildings.push({ minX: x - 2.4, maxX: x + 2.4, minZ: z - 1.6, maxZ: z + 1.6, h: 3, cx: x, cz: z });
    });

    // Landmarks ------------------------------------------------------------------
    this.landmarks = {
      safehouse: { x: -176, z: 132 },
      policeStation: { x: 52, z: -40 },
      hospital: { x: -72, z: -102 },
      hotel: { x: 114, z: 66 },
      marina: { x: 282, z: -120 },
      paynspray: { x: gx, z: gz, r: 9 },
      garageDrop: { x: gx, z: gz + 22 },
      foodStands: standSpots.map(([x, z]) => ({ x, z })),
    };

    // Pickups: cash packages (glowing green boxes) ------------------------------
    const pkgGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const pkgMat = new THREE.MeshBasicMaterial({ color: 0x51ff7a });
    // Spots are audited against worst-case building extents (blocks can
    // reach ±22 in x and ±19 in z from their centres), so every package
    // sits in a road corridor or a block corner a player can truly reach.
    const pkgSpots = [
      [-240, 178], [-9, -53], [58, -168], [-160, 60], [90, 122], [236, -180], [270, 60],
      [-90, -190], [150, -64], [-240, -60], [24, 66], [205, 178], [286, -96], [-128, -128],
    ];
    pkgSpots.forEach(([x, z], i) => {
      const m = new THREE.Mesh(pkgGeo, pkgMat);
      m.position.set(x, 1, z);
      scene.add(m);
      this.pickups.packages.push({ mesh: m, x, z, id: i, taken: false, baseY: 1 });
    });
    // Weapon pickups: pistol near the safehouse, SMG at the marina
    const wpnMat = new THREE.MeshBasicMaterial({ color: 0xffc44d });
    const wpnGeo = new THREE.BoxGeometry(1.1, 0.35, 0.35);
    [{ kind: 'pistol', x: -188, z: 128 }, { kind: 'smg', x: 282, z: -108 }].forEach((w) => {
      const m = new THREE.Mesh(wpnGeo, wpnMat);
      m.position.set(w.x, 0.8, w.z);
      scene.add(m);
      this.pickups.weapons.push({ mesh: m, x: w.x, z: w.z, kind: w.kind, taken: false, baseY: 0.8 });
    });

    return this;
  },

  _plaza(scene, bx, bz, rng) {
    // Open plaza block: a fountain disc and benches, no tower.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 0.5, 20),
      new THREE.MeshLambertMaterial({ color: 0x7fb6c9 })
    );
    disc.position.set(bx, 0.25, bz); disc.receiveShadow = true;
    scene.add(disc);
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let n = 0; n < 4; n++) {
      const a = n * Math.PI / 2 + 0.4;
      const bench = new THREE.Mesh(boxGeo, benchMat);
      bench.scale.set(4, 0.5, 1.1);
      bench.position.set(bx + Math.cos(a) * 11, 0.45, bz + Math.sin(a) * 11);
      bench.rotation.y = -a;
      scene.add(bench);
    }
  },

  _onRoad(x, z, pad) {
    for (const rx of this.roadXs) if (Math.abs(x - rx) < 8 + pad) return true;
    for (const rz of this.roadZs) if (Math.abs(z - rz) < 8 + pad) return true;
    return false;
  },

  // Push a circle (pos = {x,z} mutated) out of every building AABB and keep it
  // inside the city and out of the water. Returns true if it hit anything.
  collideCircle(pos, r) {
    let hit = false;
    for (const b of this.buildings) {
      const nx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = pos.x - b.minX, pr = b.maxX - pos.x, pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) pos.x = b.minX - r; else if (m === pr) pos.x = b.maxX + r;
          else if (m === pt) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        }
      }
    }
    if (pos.x < this.MIN_X + r) { pos.x = this.MIN_X + r; hit = true; }
    if (pos.x > this.SHORE_X - r * 0.4) { pos.x = this.SHORE_X - r * 0.4; hit = true; }
    if (pos.z < this.MIN_Z + r) { pos.z = this.MIN_Z + r; hit = true; }
    if (pos.z > this.MAX_Z - r) { pos.z = this.MAX_Z - r; hit = true; }
    return hit;
  },

  update(dt, dusk) {
    this._t += dt;
    if (this._waterTex) this._waterTex.offset.x = (this._t * 0.015) % 1;
    if (this.lampMat) this.lampMat.color.setRGB(0.33 + dusk * 0.67, 0.29 + dusk * 0.6, 0.16 + dusk * 0.3);
    for (const m of this.windowMats) m.emissiveIntensity = dusk * 0.95;
    if (this._ring) {
      const s = 1 + Math.sin(this._t * 3) * 0.05;
      this._ring.scale.set(s, s, 1);
      this._ring.material.opacity = 0.4 + 0.25 * Math.sin(this._t * 3);
    }
    for (const p of this.pickups.packages) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y = p.baseY + Math.sin(this._t * 2.4 + p.id) * 0.22;
    }
    for (const w of this.pickups.weapons) {
      if (w.taken) continue;
      w.mesh.rotation.y += dt * 1.6;
      w.mesh.position.y = w.baseY + Math.sin(this._t * 2 + 1) * 0.15;
    }
  },
};
