'use strict';
// Costa Verde Heat 3D — the city itself. A road grid (8 avenues x 6 streets)
// of low-poly blocks with canvas-texture facades whose windows light up at
// dusk, named landmarks, a beach and marina on the east shore, cash packages,
// weapon pickups, food stands, the Pay 'n Spray, and a ~7 minute day cycle.
// All layout is derived from one seeded RNG, so a seed always builds the
// same city. Collision is circle-vs-AABB against `colliders`.

CVH.world = {
  PITCH: 52,
  ROADW: 13,
  colliders: [],
  packages: [],
  stands: [],
  pickups: [],
  boats: [],
  facadeMats: [],
  lampHeadMat: null,
  sun: null,
  hemi: null,
  water: null,
  foam: null,
  phase: 0.2,       // 0..1 across the whole day cycle
  dusk: 0,          // 0 day .. 1 full dusk, drives lamps/windows/headlights
  paynspray: null,  // {minX,maxX,minZ,maxZ} service pad
  pier: { x0: 226, x1: 272, z: -26 },
  safehousePos: { x: -156, z: 122 },
  policePos: { x: -104, z: 20 },
  hospitalPos: { x: -104, z: -84 },
  bounds: { minX: -228, maxX: 246, minZ: -172, maxZ: 172 },

  roadX: function (i) { return -182 + i * 52; },
  roadZ: function (j) { return -130 + j * 52; },
  cellCX: function (i) { return (this.roadX(i) + this.roadX(i + 1)) / 2; },
  cellCZ: function (j) { return (this.roadZ(j) + this.roadZ(j + 1)) / 2; },

  // ---- canvas texture helpers -------------------------------------------------
  _canvas: function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },

  facadeTextures: function (wall, trim) {
    const rng = CVH.rng;
    const mapC = this._canvas(128, 256);
    const g = mapC.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, 128, 256);
    g.fillStyle = trim; g.fillRect(0, 0, 128, 10); g.fillRect(0, 246, 128, 10);
    const litC = this._canvas(128, 256);
    const lg = litC.getContext('2d');
    lg.fillStyle = '#000000'; lg.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 5; c++) {
        const x = 10 + c * 23, y = 18 + r * 23;
        g.fillStyle = 'rgba(24,32,44,0.9)';
        g.fillRect(x, y, 14, 15);
        g.fillStyle = 'rgba(160,200,230,0.35)';
        g.fillRect(x, y, 14, 5);
        if (rng() < 0.46) {
          lg.fillStyle = rng() < 0.8 ? '#ffc46b' : '#ffe9b0';
          lg.fillRect(x, y, 14, 15);
        }
      }
    }
    const map = new THREE.CanvasTexture(mapC);
    const emissiveMap = new THREE.CanvasTexture(litC);
    return { map: map, emissiveMap: emissiveMap };
  },

  signTexture: function (text, bg, fg, sub) {
    const c = this._canvas(512, 128);
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 52px Arial, sans-serif';
    g.fillText(text, 256, sub ? 48 : 64);
    if (sub) {
      g.font = 'bold 26px Arial, sans-serif';
      g.fillText(sub, 256, 96);
    }
    return new THREE.CanvasTexture(c);
  },

  groundTexture: function () {
    const c = this._canvas(2048, 1440);
    const g = c.getContext('2d');
    const W = 2048, H = 1440;
    const px = function (x) { return (x + 240) / 540 * W; };
    const pz = function (z) { return (z + 190) / 380 * H; };
    // Base: asphalt.
    g.fillStyle = '#43484e'; g.fillRect(0, 0, W, H);
    // Sand beach on the east shore.
    const sandGrad = g.createLinearGradient(px(204), 0, px(252), 0);
    sandGrad.addColorStop(0, '#d9c491');
    sandGrad.addColorStop(1, '#efe0ae');
    g.fillStyle = sandGrad;
    g.fillRect(px(204), 0, px(252) - px(204), H);
    // Sand speckle.
    g.fillStyle = 'rgba(160,130,80,0.25)';
    for (let i = 0; i < 900; i++) {
      g.fillRect(px(206) + CVH.rng() * (px(252) - px(206)), CVH.rng() * H, 3, 3);
    }
    // Block interiors: sidewalk slabs with a slightly darker lot inside.
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 5; j++) {
        const x0 = this.roadX(i) + this.ROADW / 2, x1 = this.roadX(i + 1) - this.ROADW / 2;
        const z0 = this.roadZ(j) + this.ROADW / 2, z1 = this.roadZ(j + 1) - this.ROADW / 2;
        g.fillStyle = '#8f959a';
        g.fillRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
        g.fillStyle = '#7e858b';
        g.fillRect(px(x0 + 3), pz(z0 + 3), px(x1 - 3) - px(x0 + 3), pz(z1 - 3) - pz(z0 + 3));
      }
    }
    // Road paint: dashed centre lines.
    g.fillStyle = '#e8e4d2';
    for (let i = 0; i < 8; i++) {
      const x = px(this.roadX(i));
      for (let z = -168; z < 168; z += 12) g.fillRect(x - 2, pz(z), 4, pz(z + 6) - pz(z));
    }
    for (let j = 0; j < 6; j++) {
      const z = pz(this.roadZ(j));
      for (let x = -220; x < 200; x += 12) g.fillRect(px(x), z - 2, px(x + 6) - px(x), 4);
    }
    // Crosswalks at intersections.
    g.fillStyle = 'rgba(240,240,235,0.75)';
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 6; j++) {
        const cx = px(this.roadX(i)), cz = pz(this.roadZ(j));
        for (let s = -2; s <= 2; s++) {
          g.fillRect(cx - 16, cz + s * 7 - 2, 32, 4);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  },

  // ---- build -------------------------------------------------------------------
  build: function (scene) {
    const rng = CVH.rng;
    this.colliders = [];
    this.packages = [];
    this.stands = [];
    this.pickups = [];
    this.boats = [];
    this.facadeMats = [];

    // Lights.
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a7a5a, 0.75);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -70; this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70; this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xbfd9e8, 120, 420);

    // Ground.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(540, 380),
      new THREE.MeshLambertMaterial({ map: this.groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(30, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    // Water + foam line.
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x2b6f96, transparent: true, opacity: 0.94 });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(190, 380), waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(252 + 95, 0.12, 0);
    scene.add(this.water);
    this.foam = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 380),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.set(251, 0.16, 0);
    scene.add(this.foam);

    this._buildBlocks(scene);
    this._buildMarina(scene);
    this._buildVegetation(scene);
    this._buildLamps(scene);
    this._buildPickups(scene);
    this.applyTimeOfDay(scene);
  },

  _addCollider: function (cx, cz, w, d) {
    this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  },

  _building: function (scene, cx, cz, w, d, h, mat, roofMat) {
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    const roof = new THREE.Mesh(geo, roofMat);
    roof.scale.set(w + 0.7, 0.5, d + 0.7);
    roof.position.set(cx, h + 0.25, cz);
    scene.add(roof);
    this._addCollider(cx, cz, w, d);
    return m;
  },

  _sign: function (scene, text, sub, bg, fg, x, y, z, rotY, w) {
    const tex = this.signTexture(text, bg, fg, sub);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w || 11, (w || 11) / 4),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
    return m;
  },

  _buildBlocks: function (scene) {
    const rng = CVH.rng;
    const palettes = [
      ['#c9b8a3', '#8a7a63'], ['#b7c4c9', '#6f8288'], ['#d8c9a8', '#97865f'],
      ['#c4a49a', '#8a6a5e'], ['#aebfc0', '#71868a'], ['#e0d3b8', '#a08d64']
    ];
    const mats = palettes.map((p) => {
      const t = this.facadeTextures(p[0], p[1]);
      const m = new THREE.MeshLambertMaterial({
        map: t.map, emissive: 0xffc46b, emissiveMap: t.emissiveMap, emissiveIntensity: 0
      });
      this.facadeMats.push(m);
      return m;
    });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x4c4640 });

    const LANDMARKS = {
      '1,2': 'police', '1,0': 'hospital', '6,1': 'hotel', '3,2': 'bank',
      '4,4': 'paynspray', '6,3': 'cafe', '0,4': 'safehouse'
    };
    const LOTS = { '2,1': true, '5,3': true, '3,0': true };
    const PARKS = { '2,3': true, '5,1': true };

    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 5; j++) {
        const key = i + ',' + j;
        const cx = this.cellCX(i), cz = this.cellCZ(j);
        const kind = LANDMARKS[key];
        if (kind) { this._landmark(scene, kind, cx, cz, mats, roofMat); continue; }
        if (LOTS[key]) { this._parkingLot(scene, cx, cz); continue; }
        if (PARKS[key]) { this._park(scene, cx, cz); continue; }
        // Ordinary tower: taller toward the middle of the city.
        const centrality = 1 - Math.min(1, Math.hypot(cx, cz) / 240);
        const w = CVH.rand(24, 33), d = CVH.rand(24, 33);
        const h = CVH.rand(10, 20) + centrality * CVH.rand(14, 30);
        this._building(scene, cx, cz, w, d, h, CVH.pick(mats), roofMat);
      }
    }
  },

  _landmark: function (scene, kind, cx, cz, mats, roofMat) {
    const white = new THREE.MeshLambertMaterial({ color: 0xe8e6df });
    if (kind === 'police') {
      const m = new THREE.MeshLambertMaterial({ color: 0x9fb2c8 });
      this._building(scene, cx, cz, 30, 26, 13, m, roofMat);
      this._sign(scene, 'POLICE', 'COSTA VERDE PD', '#16283f', '#bcd6f5', cx, 10.5, cz + 13.4, 0, 13);
    } else if (kind === 'hospital') {
      this._building(scene, cx, cz, 32, 26, 15, white, roofMat);
      this._sign(scene, 'HOSPITAL', 'ST. MARINA GENERAL', '#eef0ee', '#c22f2f', cx, 12, cz + 13.4, 0, 14);
    } else if (kind === 'hotel') {
      const m = new THREE.MeshLambertMaterial({ color: 0xf0dfba });
      this._building(scene, cx, cz, 30, 28, 56, m, roofMat);
      this._sign(scene, 'HOTEL SOL', '★ ★ ★ ★ ★', '#3a2c12', '#ffd977', cx + 15.4, 40, cz, Math.PI / 2, 16);
      this._sign(scene, 'HOTEL SOL', null, '#3a2c12', '#ffd977', cx, 8, cz + 14.4, 0, 13);
    } else if (kind === 'bank') {
      const m = new THREE.MeshLambertMaterial({ color: 0xcfd4d2 });
      this._building(scene, cx, cz, 30, 26, 12, m, roofMat);
      this._sign(scene, 'BANCO VERDE', null, '#123324', '#7fe0a8', cx, 9.5, cz + 13.4, 0, 14);
    } else if (kind === 'cafe') {
      const m = new THREE.MeshLambertMaterial({ color: 0xe6c9a0 });
      this._building(scene, cx, cz, 24, 20, 7, m, roofMat);
      this._sign(scene, 'CAFE MARINA', null, '#40260f', '#ffb46b', cx, 5.6, cz + 10.4, 0, 12);
    } else if (kind === 'safehouse') {
      const m = new THREE.MeshLambertMaterial({ color: 0xd9b48c });
      this._building(scene, cx, cz, 16, 13, 6, m, roofMat);
      this._sign(scene, 'SAFEHOUSE', null, '#2c2118', '#ffd9a0', cx, 4.6, cz + 6.9, 0, 8);
    } else if (kind === 'paynspray') {
      this._paynsprayGarage(scene, cx, cz);
    }
  },

  _paynsprayGarage: function (scene, cx, cz) {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c4 });
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    const wall = (x, z, w, d, h) => {
      const m = new THREE.Mesh(geo, wallMat);
      m.scale.set(w, h, d);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      scene.add(m);
      this._addCollider(x, z, w, d);
    };
    // Open-front garage facing north (toward the street at roadZ(4)).
    wall(cx - 8.5, cz + 2, 1.4, 16, 6.5);       // west wall
    wall(cx + 8.5, cz + 2, 1.4, 16, 6.5);       // east wall
    wall(cx, cz + 9.6, 18.4, 1.4, 6.5);         // back wall
    const roof = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x37414a }));
    roof.scale.set(19, 0.6, 17.5);
    roof.position.set(cx, 6.8, cz + 2);
    scene.add(roof);
    // Service pad the player drives onto.
    const pad = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x5f7d8c }));
    pad.scale.set(15, 0.12, 15);
    pad.position.set(cx, 0.06, cz + 1);
    scene.add(pad);
    this.paynspray = { minX: cx - 7.5, maxX: cx + 7.5, minZ: cz - 6.5, maxZ: cz + 8.5, cx: cx, cz: cz };
    this._sign(scene, "PAY 'N SPRAY", 'REPAIRS · RESPRAYS', '#20303a', '#8fd8ff', cx, 5.6, cz - 6.4, Math.PI, 13);
  },

  _parkingLot: function (scene, cx, cz) {
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    const slab = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x565b60 }));
    slab.scale.set(36, 0.14, 36);
    slab.position.set(cx, 0.07, cz);
    slab.receiveShadow = true;
    scene.add(slab);
    // Painted bays.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d0 });
    for (let k = -2; k <= 2; k++) {
      const line = new THREE.Mesh(geo, lineMat);
      line.scale.set(0.25, 0.02, 9);
      line.position.set(cx + k * 6.4, 0.16, cz - 10);
      scene.add(line);
      const line2 = line.clone();
      line2.position.z = cz + 10;
      scene.add(line2);
    }
  },

  _park: function (scene, cx, cz) {
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    const grass = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x69a355 }));
    grass.scale.set(36, 0.14, 36);
    grass.position.set(cx, 0.07, cz);
    grass.receiveShadow = true;
    scene.add(grass);
    for (let k = 0; k < 4; k++) {
      this._palm(scene, cx + CVH.rand(-14, 14), cz + CVH.rand(-14, 14));
    }
  },

  _palm: function (scene, x, z) {
    const trunkMat = CVH.world._trunkMat || (CVH.world._trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
    const leafMat = CVH.world._leafMat || (CVH.world._leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9142 }));
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 3.6, 6), trunkMat);
    trunk.position.set(x, 1.8, z);
    trunk.rotation.z = CVH.rand(-0.1, 0.1);
    trunk.castShadow = true;
    scene.add(trunk);
    const fronds = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.0, 7), leafMat);
    fronds.scale.y = 0.4;
    fronds.position.set(x + trunk.rotation.z * -3.4, 3.8, z);
    scene.add(fronds);
    const fronds2 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.8, 6), leafMat);
    fronds2.scale.y = 0.35;
    fronds2.rotation.y = 0.7;
    fronds2.position.copy(fronds.position);
    fronds2.position.y += 0.25;
    scene.add(fronds2);
  },

  _buildVegetation: function (scene) {
    // A palm row along the beach and a few at the marina.
    for (let z = -150; z <= 150; z += 25) this._palm(scene, 214 + CVH.rand(-2, 2), z + CVH.rand(-4, 4));
    this._palm(scene, 222, -40); this._palm(scene, 222, -12); this._palm(scene, 220, 20);
    this._palm(scene, 138, -34); this._palm(scene, 174, -34);
  },

  _buildLamps: function (scene) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4147 });
    this.lampHeadMat = new THREE.MeshLambertMaterial({ color: 0x666a60, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5, 5);
    const headGeo = new THREE.SphereGeometry(0.22, 8, 6);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 6; j++) {
        const x = this.roadX(i) + 7.6, z = this.roadZ(j) + 7.6;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, 2.5, z);
        scene.add(pole);
        const head = new THREE.Mesh(headGeo, this.lampHeadMat);
        head.position.set(x, 5.05, z);
        scene.add(head);
      }
    }
  },

  _buildMarina: function (scene) {
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    const deck = new THREE.Mesh(geo, woodMat);
    deck.scale.set(46, 0.5, 6);
    deck.position.set(249, 0.55, this.pier.z);
    deck.castShadow = true;
    scene.add(deck);
    const postGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 6);
    for (let x = 230; x <= 268; x += 7.6) {
      for (const dz of [-2.6, 2.6]) {
        const post = new THREE.Mesh(postGeo, woodMat);
        post.position.set(x, 0, this.pier.z + dz);
        scene.add(post);
      }
    }
    // Moored boats, bobbing in updateVisuals.
    const hullCols = [0xd8574a, 0x4a7fd8, 0xf0ead8, 0x57b06a, 0xe8a13a];
    for (let k = 0; k < 5; k++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: hullCols[k] }));
      hull.scale.set(4.6, 1.0, 1.9);
      hull.position.y = 0.35;
      boat.add(hull);
      const bow = new THREE.Mesh(geo, hull.material);
      bow.scale.set(1.4, 0.9, 1.3);
      bow.position.set(2.8, 0.35, 0);
      bow.rotation.y = Math.PI / 4;
      boat.add(bow);
      const cabin = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xf2f0e8 }));
      cabin.scale.set(1.7, 0.9, 1.3);
      cabin.position.set(-0.5, 1.2, 0);
      boat.add(cabin);
      if (k % 2 === 0) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.6, 5),
          new THREE.MeshLambertMaterial({ color: 0xcccccc }));
        mast.position.set(0.7, 3.1, 0);
        boat.add(mast);
      }
      boat.position.set(238 + k * 7.5, 0.15, this.pier.z + (k % 2 === 0 ? -6.5 : 6.5));
      boat.rotation.y = Math.PI / 2 + CVH.rand(-0.08, 0.08);
      scene.add(boat);
      this.boats.push({ group: boat, phase: CVH.rand(0, CVH.TAU) });
    }
  },

  _buildPickups: function (scene) {
    // 14 cash packages — every spot is on a sidewalk, lot, park, pier or the
    // beach, i.e. audited clear of every building footprint above.
    const spots = [
      [-122, -18], [-86, -86], [137, -52], [0, 19], [-52, 52], [104, -52],
      [-52, -52], [104, 52], [0, -104], [266, -26], [228, -120], [228, 120],
      [-142, 90], [71, 104]
    ];
    const boxGeo = new THREE.BoxGeometry(0.55, 0.4, 0.55);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x1d7a34, emissiveIntensity: 0.7 });
    spots.forEach(function (s, idx) {
      const m = new THREE.Mesh(boxGeo, boxMat);
      m.position.set(s[0], 0.8, s[1]);
      scene.add(m);
      CVH.world.packages.push({ id: idx, x: s[0], z: s[1], mesh: m, taken: false });
    });
    // Weapon pickups: pistol by the police station, SMG at the marina.
    const mkPickup = function (x, z, kind, col) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 8, 20),
        new THREE.MeshBasicMaterial({ color: col }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.25;
      grp.add(ring);
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.85),
        new THREE.MeshLambertMaterial({ color: 0x22262b }));
      gun.position.y = 0.85;
      gun.rotation.y = 0.6;
      grp.add(gun);
      grp.position.set(x, 0, z);
      scene.add(grp);
      CVH.world.pickups.push({ x: x, z: z, kind: kind, mesh: grp, taken: false });
    };
    mkPickup(-104, -19, 'pistol', 0xffc46b);
    mkPickup(240, -26, 'smg', 0xff7a5c);

    // Food stands: a kiosk with an awning; main.js handles the heal-for-cash.
    const standSpots = [[-60, 44], [96, -60], [216, -96], [222, -36], [-44, -44]];
    const baseMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d2 });
    const awnMat = new THREE.MeshLambertMaterial({ color: 0xd8574a });
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    standSpots.forEach(function (s) {
      const grp = new THREE.Group();
      const base = new THREE.Mesh(geo, baseMat);
      base.scale.set(3.2, 2.2, 2.2);
      base.position.y = 1.1;
      base.castShadow = true;
      grp.add(base);
      const awn = new THREE.Mesh(geo, awnMat);
      awn.scale.set(3.8, 0.16, 3.0);
      awn.position.set(0, 2.55, 0.3);
      awn.rotation.x = 0.18;
      grp.add(awn);
      grp.position.set(s[0], 0, s[1]);
      scene.add(grp);
      CVH.world._addCollider(s[0], s[1], 3.2, 2.2);
      CVH.world.stands.push({ x: s[0], z: s[1], price: 15, heal: 45 });
    });
  },

  // ---- time of day ---------------------------------------------------------------
  applyTimeOfDay: function (scene) {
    const p = this.phase;
    const theta = p * Math.PI; // sun arc: rises at p=0, sets at p=1
    const elev = Math.sin(theta);
    // Dusk gathers as the sun sinks in the last stretch of the arc: golden
    // hour around phase 0.8, full dusk by 0.9, sunset at the wrap.
    const rawDusk = CVH.clamp((0.72 - elev) / 0.5, 0, 1);
    this.dusk = CVH.smooth(rawDusk) * (p > 0.45 ? 1 : 0.25);
    const d = this.dusk;
    const sunCol = new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff9a4d), d);
    this.sun.color.copy(sunCol);
    this.sun.intensity = CVH.lerp(1.15, 0.55, d);
    this.hemi.intensity = CVH.lerp(0.75, 0.34, d);
    const sky = new THREE.Color(0xbfd9e8).lerp(new THREE.Color(0xdd8a52), d);
    if (scene) {
      scene.fog.color.copy(sky);
      if (scene.background) scene.background.copy(sky); else scene.background = sky.clone();
    }
    for (let i = 0; i < this.facadeMats.length; i++) this.facadeMats[i].emissiveIntensity = d * 0.95;
    if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = d * 1.6;
    if (this.water) this.water.material.color.setHex(0x2b6f96).lerp(new THREE.Color(0x274b6e), d);
  },

  sunFollow: function (focus) {
    const theta = this.phase * Math.PI;
    this.sun.position.set(
      focus.x + Math.cos(theta) * 130,
      26 + Math.sin(theta) * 120,
      focus.z + 46
    );
    this.sun.target.position.set(focus.x, 0, focus.z);
  },

  update: function (dt, scene) {
    this.phase = (this.phase + dt / 420) % 1; // a full day in about 7 minutes
    this.applyTimeOfDay(scene);
    this.updateVisuals(dt);
  },

  // Animation that is safe to run while the game is frozen for a screenshot.
  updateVisuals: function (dt) {
    const t = performance.now() / 1000;
    if (this.water) this.water.position.y = 0.12 + Math.sin(t * 0.9) * 0.05;
    if (this.foam) this.foam.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.4));
    for (let i = 0; i < this.boats.length; i++) {
      const b = this.boats[i];
      b.group.position.y = 0.15 + Math.sin(t * 0.8 + b.phase) * 0.09;
      b.group.rotation.z = Math.sin(t * 0.6 + b.phase) * 0.03;
    }
    for (let i = 0; i < this.packages.length; i++) {
      const pk = this.packages[i];
      if (pk.taken) continue;
      pk.mesh.rotation.y += dt * 2.2;
      pk.mesh.position.y = 0.8 + Math.sin(t * 2.4 + pk.id) * 0.14;
    }
    for (let i = 0; i < this.pickups.length; i++) {
      const pu = this.pickups[i];
      if (pu.taken) continue;
      pu.mesh.rotation.y += dt * 1.4;
    }
  },

  // Push a circle (x,z,r) out of every building AABB. Mutates and returns pos.
  collide: function (pos, r) {
    const cs = this.colliders;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const nx = CVH.clamp(pos.x, c.minX, c.maxX);
      const nz = CVH.clamp(pos.z, c.minZ, c.maxZ);
      let dx = pos.x - nx, dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // Centre is inside the box: leave by the nearest face.
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const near = pos.z - c.minZ, far = c.maxZ - pos.z;
        const m = Math.min(left, right, near, far);
        if (m === left) pos.x = c.minX - r;
        else if (m === right) pos.x = c.maxX + r;
        else if (m === near) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
    // The marina pier reaches past the beach bound; let the player walk it
    // (its end holds a cash package that must stay reachable).
    const maxX = (pos.z > -30 && pos.z < -22) ? 270 : this.bounds.maxX;
    pos.x = CVH.clamp(pos.x, this.bounds.minX, maxX);
    pos.z = CVH.clamp(pos.z, this.bounds.minZ, this.bounds.maxZ);
    return pos;
  }
};
