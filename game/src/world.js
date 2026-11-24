// Costa Verde Heat — the city of Costa Verde: avenues, blocks, beach, marina,
// and every objective point the missions / taxi / audit care about.
// Layout guarantees (relied on by the objective audit):
//   * every objective point sits in a road corridor (<= 10 m from an avenue or
//     street centreline) or on the beach (x >= 226), never inside a building.
CVH.world = (function () {
  const AVENUES_X = [-216, -156, -96, -36, 24, 84, 144, 204]; // roads running along z
  const STREETS_Z = [-216, -156, -96, -36, 24, 84, 144, 204]; // roads running along x
  const ROAD_W = 14;
  const HALF = 280;
  const WATER_X = 252;   // waterline: land is x < WATER_X
  const BEACH_X = 226;   // sand starts here

  const P = {
    spawn: { x: 24, z: 44 },
    porch: { x: 17, z: 42 },              // Marisol Vega's porch
    policeStation: { x: -36, z: -104 },
    hospital: { x: 84, z: -148 },
    pnsPad: { x: 144, z: -60 },           // Pay 'n Spray pad, on the avenue
    boardwalk: { x: 236, z: 40 },
    volley: { x: 238, z: -60 },
    lighthouse: { x: 240, z: 200 },
    stands: [
      { x: 33, z: 90 }, { x: -87, z: 30 }, { x: 153, z: -150 }, { x: -207, z: -90 }
    ],
    weapons: [
      { kind: 'pistol', x: -96, z: 92 },
      { kind: 'smg', x: 204, z: -88 }
    ],
    packages: [
      { x: 24, z: -96 }, { x: -96, z: 24 }, { x: 144, z: 84 }, { x: -216, z: -216 },
      { x: 204, z: 204 }, { x: 236, z: 120 }, { x: 240, z: -140 }, { x: 84, z: -216 },
      { x: -36, z: 144 }, { x: 24, z: 228 }, { x: -156, z: -60 }, { x: 100, z: 24 },
      { x: 234, z: -40 }, { x: -60, z: -156 }
    ],
    taxiPickups: [
      { x: 24, z: 90 }, { x: -36, z: -42 }, { x: 144, z: 30 },
      { x: -156, z: 138 }, { x: 84, z: -150 }, { x: -216, z: -30 }
    ],
    taxiDropoffs: [
      { x: 204, z: 90 }, { x: -216, z: -102 }, { x: 24, z: 198 }, { x: 144, z: -210 },
      { x: -96, z: 30 }, { x: 228, z: 46 }, { x: 84, z: 138 }, { x: -156, z: -216 }
    ],
    jobs: [
      { name: 'Beach Run', stages: [{ x: 84, z: 30, label: 'Pick up the package downtown' }, { x: 228, z: 40, label: 'Deliver it to the beach' }] },
      { name: 'Harbour Debts', stages: [{ x: -156, z: -30, label: 'Meet the contact by the docks road' }, { x: 204, z: 150, label: 'Drop the payment on the east side' }] },
      { name: 'Coupe Getaway', carJob: true, stages: [{ x: 24, z: -210, label: 'Take the parked coupe' }, { x: -216, z: 90, label: 'Lose yourself on the west side', time: 150 }] },
      { name: 'Southbound Papers', stages: [{ x: 144, z: 198, label: 'Collect the papers down south' }, { x: -36, z: -150, label: 'Bring them to the north depot' }] },
      { name: 'Night Pharmacy', stages: [{ x: -96, z: 150, label: 'Grab the medical bag' }, { x: 84, z: -90, label: 'Rush it to the clinic district', time: 140 }] },
      { name: 'The Last Favour', stages: [{ x: 204, z: -210, label: 'Pick up Marisol\'s brother' }, { x: 17, z: 42, label: 'Bring him home to the porch' }] }
    ]
  };

  const buildings = []; // {minX, maxX, minZ, maxZ, h}

  function auditPoints() {
    const pts = [];
    function add(kind, p) { pts.push({ kind: kind, x: p.x, z: p.z }); }
    P.jobs.forEach(function (j, ji) { j.stages.forEach(function (s, si) { add('job' + (ji + 1) + '.' + (si + 1), s); }); });
    P.taxiPickups.forEach(function (p) { add('taxiPickup', p); });
    P.taxiDropoffs.forEach(function (p) { add('taxiDrop', p); });
    add('pns', P.pnsPad);
    P.stands.forEach(function (p) { add('stand', p); });
    P.packages.forEach(function (p) { add('package', p); });
    P.weapons.forEach(function (p) { add('weapon', p); });
    add('spawn', P.spawn); add('porch', P.porch);
    add('police', P.policeStation); add('hospital', P.hospital);
    add('boardwalk', P.boardwalk); add('volley', P.volley); add('lighthouse', P.lighthouse);
    return pts;
  }

  function distToRoad(x, z) {
    let d = Infinity;
    for (let i = 0; i < AVENUES_X.length; i++) d = Math.min(d, Math.abs(x - AVENUES_X[i]));
    for (let i = 0; i < STREETS_Z.length; i++) d = Math.min(d, Math.abs(z - STREETS_Z[i]));
    return d;
  }

  function pointClear(x, z, margin) {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return false;
    }
    return true;
  }

  function audit() {
    const pts = auditPoints();
    const failures = [];
    pts.forEach(function (p) {
      if (Math.abs(p.x) > HALF || Math.abs(p.z) > HALF) failures.push(p.kind + ' out of bounds');
      else if (p.x >= WATER_X) failures.push(p.kind + ' in the water');
      else if (!pointClear(p.x, p.z, 1.5)) failures.push(p.kind + ' inside a building');
      else if (!(distToRoad(p.x, p.z) <= 10 || p.x >= BEACH_X)) failures.push(p.kind + ' not on road or beach');
    });
    return { count: pts.length, failures: failures };
  }

  // Circle vs building AABBs: push the circle out along the smallest penetration.
  function collide(x, z, r) {
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      const nx = CVH.clamp(x, b.minX, b.maxX);
      const nz = CVH.clamp(z, b.minZ, b.maxZ);
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r; z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the thinnest side
          const pl = x - (b.minX - r), pr = (b.maxX + r) - x;
          const pt = z - (b.minZ - r), pb = (b.maxZ + r) - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r; else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r; else z = b.maxZ + r;
        }
      }
    }
    return { x: x, z: z };
  }

  function nearestRoadPoint(x, z) {
    let bx = AVENUES_X[0], bd = Infinity;
    AVENUES_X.forEach(function (ax) { const d = Math.abs(x - ax); if (d < bd) { bd = d; bx = ax; } });
    let bz = STREETS_Z[0]; bd = Infinity;
    STREETS_Z.forEach(function (sz) { const d = Math.abs(z - sz); if (d < bd) { bd = d; bz = sz; } });
    if (Math.abs(x - bx) < Math.abs(z - bz)) return { x: bx, z: z, axis: 'NS' };
    return { x: x, z: bz, axis: 'EW' };
  }

  // ------------------------------------------------------------------ build
  let sunLight = null, hemiLight = null, sceneRef = null;
  let lampMat = null, waterMat = null, windowMats = [];

  // Returns {map, emissiveMap}: facade with shaded windows for the day, and a
  // black texture with only the windows lit for night emissive.
  function windowsTexture(base, lit) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 128);
    const e = document.createElement('canvas'); e.width = 64; e.height = 128;
    const ge = e.getContext('2d');
    ge.fillStyle = '#000000'; ge.fillRect(0, 0, 64, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = 'rgba(20,26,34,0.85)';
      g.fillRect(6 + x * 15, 8 + y * 15, 9, 9);
      ge.fillStyle = lit;
      ge.fillRect(6 + x * 15, 8 + y * 15, 9, 9);
    }
    return { map: new THREE.CanvasTexture(c), emissiveMap: new THREE.CanvasTexture(e) };
  }

  function build(scene) {
    sceneRef = scene;
    const rng = CVH.mulberry32(20261124);

    hemiLight = new THREE.HemisphereLight(0xbfd9ff, 0x54503f, 0.9);
    scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
    sunLight.position.set(120, 180, 60);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x404050, 0.4));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(760, 760),
      new THREE.MeshLambertMaterial({ color: 0x4a5158 })
    );
    ground.rotation.x = -Math.PI / 2; ground.position.set(40, -0.05, 0);
    scene.add(ground);

    // sand + water
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(34, 620), new THREE.MeshLambertMaterial({ color: 0xd9c08a }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(239, 0.01, 0); scene.add(sand);
    waterMat = new THREE.MeshLambertMaterial({ color: 0x1d5f73 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 760), waterMat);
    water.rotation.x = -Math.PI / 2; water.position.set(WATER_X + 108, 0.02, 0); scene.add(water);

    // sidewalks then asphalt
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x6a7178 });
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x24272c });
    AVENUES_X.forEach(function (ax) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 6, 620), walkMat);
      w.rotation.x = -Math.PI / 2; w.position.set(ax, 0.03, 0); scene.add(w);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 620), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(ax, 0.05, 0); scene.add(r);
    });
    STREETS_Z.forEach(function (sz) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(620, ROAD_W + 6), walkMat);
      w.rotation.x = -Math.PI / 2; w.position.set(0, 0.04, sz); scene.add(w);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(620, ROAD_W), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.06, sz); scene.add(r);
    });

    // building materials: three tints sharing lit-window textures
    const tints = [['#8a8f96', '#ffd98a'], ['#7d7468', '#ffe9b0'], ['#6e7f8c', '#cfe8ff']];
    windowMats = tints.map(function (t) {
      const tex = windowsTexture(t[0], t[1]);
      return new THREE.MeshLambertMaterial({ map: tex.map, emissive: 0xffca7a, emissiveMap: tex.emissiveMap, emissiveIntensity: 0 });
    });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3c4046 });

    function addBuilding(cx, cz, w, d, h, matIdx) {
      const b = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h: h };
      buildings.push(b);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), windowMats[matIdx % windowMats.length]);
      mesh.position.set(cx, h / 2, cz);
      scene.add(mesh);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.7, d + 0.6), roofMat);
      roof.position.set(cx, h + 0.35, cz);
      scene.add(roof);
      return b;
    }

    // reserved blocks: porch house and Pay 'n Spray are placed by hand
    function blockKey(ai, si) { return ai + ':' + si; }
    const reserved = {};
    // block between avenues -36..24 (index 3) and streets 24..84 (index 4): porch
    reserved[blockKey(3, 4)] = true;
    // block between avenues 144..204 (index 6) and streets -96..-36 (index 2): Pay 'n Spray
    reserved[blockKey(6, 2)] = true;

    for (let ai = 0; ai < AVENUES_X.length - 1; ai++) {
      for (let si = 0; si < STREETS_Z.length - 1; si++) {
        const x0 = AVENUES_X[ai] + 11, x1 = AVENUES_X[ai + 1] - 11;
        const z0 = STREETS_Z[si] + 11, z1 = STREETS_Z[si + 1] - 11;
        if (reserved[blockKey(ai, si)]) continue;
        if (rng() < 0.18) {
          // park block
          const park = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ color: 0x4d7247 }));
          park.rotation.x = -Math.PI / 2;
          park.position.set((x0 + x1) / 2, 0.07, (z0 + z1) / 2);
          scene.add(park);
          for (let t = 0; t < 7; t++) addTree(scene, x0 + rng() * (x1 - x0), z0 + rng() * (z1 - z0), rng);
          continue;
        }
        const n = 2 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const w = 13 + rng() * 10, d = 13 + rng() * 10, h = 10 + rng() * rng() * 38;
          const cx = x0 + w / 2 + rng() * Math.max(1, (x1 - x0) - w);
          const cz = z0 + d / 2 + rng() * Math.max(1, (z1 - z0) - d);
          // avoid overlaps inside the block
          let ok = true;
          for (let q = 0; q < buildings.length; q++) {
            const b = buildings[q];
            if (cx + w / 2 > b.minX - 2 && cx - w / 2 < b.maxX + 2 && cz + d / 2 > b.minZ - 2 && cz - d / 2 < b.maxZ + 2) { ok = false; break; }
          }
          if (ok) addBuilding(cx, cz, w, d, h, Math.floor(rng() * 3));
        }
      }
    }

    // porch house (Marisol's) — block interior west of avenue 24, north of street 24
    addBuilding(6, 42.5, 11, 15, 7, 1);
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 17), new THREE.MeshLambertMaterial({ color: 0xb0533c }));
    porchRoof.position.set(13.5, 5.4, 42.5); scene.add(porchRoof);

    // Pay 'n Spray garage east of avenue 144
    addBuilding(166, -60, 14, 20, 8, 2);
    const pnsSign = new THREE.Mesh(new THREE.BoxGeometry(1, 3.4, 12), new THREE.MeshBasicMaterial({ color: 0x37d67a }));
    pnsSign.position.set(158.5, 6.5, -60); scene.add(pnsSign);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshBasicMaterial({ color: 0x37d67a, transparent: true, opacity: 0.35 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(P.pnsPad.x, 0.09, P.pnsPad.z); scene.add(pad);

    // police booth + hospital marker (non-colliding props on sidewalks)
    const booth = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 3), new THREE.MeshLambertMaterial({ color: 0x2b4d9b }));
    booth.position.set(-44, 1.7, -104); scene.add(booth);
    const hosp = new THREE.Mesh(new THREE.BoxGeometry(3, 3.4, 3), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
    hosp.position.set(92, 1.7, -148); scene.add(hosp);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xe33f3f }));
    cross.position.set(90.4, 2.2, -148); scene.add(cross);

    // food stands
    P.stands.forEach(function (s) {
      const g = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 2.2), new THREE.MeshLambertMaterial({ color: 0xc96f2e }));
      counter.position.y = 0.8; g.add(counter);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 3.2), new THREE.MeshLambertMaterial({ color: 0xe3b23c }));
      awning.position.y = 2.6; awning.rotation.z = 0.12; g.add(awning);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      pole.position.set(1.6, 1.3, 1); g.add(pole);
      const pole2 = pole.clone(); pole2.position.x = -1.6; g.add(pole2);
      g.position.set(s.x + 1.8, 0, s.z);
      scene.add(g);
    });

    // pier + marina
    const pier = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 10), new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
    pier.position.set(267, 0.8, 40); scene.add(pier);
    for (let i = 0; i < 5; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.4), new THREE.MeshLambertMaterial({ color: 0x6b543a }));
      post.position.set(254 + i * 7, 0, 36); scene.add(post);
      const post2 = post.clone(); post2.position.z = 44; scene.add(post2);
    }
    [-30, 96, 158].forEach(function (bz, i) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.4, 2.4), new THREE.MeshLambertMaterial({ color: [0xd8d8d8, 0x9bc4d8, 0xe0a37e][i % 3] }));
      hull.position.y = 0.5; boat.add(hull);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
      cabin.position.set(-0.4, 1.6, 0); boat.add(cabin);
      boat.position.set(262 + (i % 2) * 6, 0.15, bz);
      scene.add(boat);
    });

    // lighthouse
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 16, 10), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
    tower.position.set(246, 8, 200); scene.add(tower);
    const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
    lampRoom.position.set(246, 17, 200); scene.add(lampRoom);

    // beach palms + volley net
    for (let i = 0; i < 16; i++) {
      addPalm(scene, 232 + rng() * 14, -260 + i * 34 + rng() * 12, rng);
    }
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 9), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    net.position.set(P.volley.x, 1, P.volley.z); scene.add(net);

    // street lamps at intersections
    lampMat = new THREE.MeshBasicMaterial({ color: 0x554f3a });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    AVENUES_X.forEach(function (ax) {
      STREETS_Z.forEach(function (sz) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.6), poleMat);
        pole.position.set(ax + 8.4, 2.8, sz + 8.4); scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lampMat);
        bulb.position.set(ax + 8.4, 5.7, sz + 8.4); scene.add(bulb);
      });
    });
  }

  function addTree(scene, x, z, rng) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }));
    trunk.position.y = 0.8; g.add(trunk);
    const fol = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rng() * 0.9, 0), new THREE.MeshLambertMaterial({ color: 0x3f6b35 }));
    fol.position.y = 2.8; g.add(fol);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  function addPalm(scene, x, z, rng) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5.2), new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
    trunk.position.y = 2.6; trunk.rotation.z = 0.14; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const frond = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: 0x4d8a3f }));
      frond.position.y = 5.2;
      frond.rotation.y = (i / 5) * Math.PI * 2;
      frond.rotation.z = 0.5;
      frond.translateX(1.4);
      g.add(frond);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    scene.add(g);
  }

  // ------------------------------------------------------------ sky / day
  const SKY_KEYS = [
    [0.00, new THREE.Color(0x9db8d6), 0.75],
    [0.18, new THREE.Color(0xa9cdf2), 1.15],
    [0.45, new THREE.Color(0x9ec9ee), 1.1],
    [0.66, new THREE.Color(0xe9b57f), 0.95],
    [0.78, new THREE.Color(0xe07f52), 0.8],
    [0.86, new THREE.Color(0xc25e63), 0.62],
    [0.96, new THREE.Color(0x2e3a55), 0.34],
    [1.00, new THREE.Color(0x232c44), 0.3]
  ];
  function updateSky(dayT, scene) {
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let i = 0; i < SKY_KEYS.length - 1; i++) {
      if (dayT >= SKY_KEYS[i][0] && dayT <= SKY_KEYS[i + 1][0]) { a = SKY_KEYS[i]; b = SKY_KEYS[i + 1]; break; }
    }
    const span = (b[0] - a[0]) || 1;
    const f = CVH.clamp((dayT - a[0]) / span, 0, 1);
    const col = a[1].clone().lerp(b[1], f);
    scene.background = col;
    if (scene.fog) scene.fog.color.copy(col);
    const sunI = CVH.lerp(a[2], b[2], f);
    if (sunLight) {
      const ang = (dayT - 0.02) * Math.PI; // rises, sets by ~0.98
      sunLight.position.set(Math.cos(ang) * 160, Math.max(14, Math.sin(ang) * 190), 70);
      sunLight.intensity = sunI;
      const warm = new THREE.Color(0xffffff).lerp(new THREE.Color(0xff9a4d), CVH.clamp(1 - Math.sin(ang) * 1.6, 0, 1));
      sunLight.color.copy(warm);
    }
    if (hemiLight) hemiLight.intensity = 0.35 + sunI * 0.55;
    // darkness factor drives lit windows and street lamps
    const dark = CVH.clamp((0.62 - sunI) / 0.4, 0, 1);
    windowMats.forEach(function (m) { m.emissiveIntensity = dark * 0.95; });
    if (lampMat) lampMat.color.setHex(dark > 0.4 ? 0xffd98a : 0x554f3a);
    if (waterMat) waterMat.color.setHex(0x1d5f73).lerp(new THREE.Color(0x0d2438), dark * 0.7);
    return dark;
  }

  return {
    AVENUES_X: AVENUES_X, STREETS_Z: STREETS_Z, ROAD_W: ROAD_W,
    HALF: HALF, WATER_X: WATER_X, BEACH_X: BEACH_X,
    points: P, buildings: buildings,
    build: build, audit: audit, auditPoints: auditPoints,
    pointClear: pointClear, distToRoad: distToRoad,
    collide: collide, nearestRoadPoint: nearestRoadPoint,
    updateSky: updateSky
  };
})();
