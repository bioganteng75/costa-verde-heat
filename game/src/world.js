// world.js — Costa Verde layout data, Three.js scene, day cycle, collisions.
// Heading convention (see util): forward = (sin h, cos h). +x east (ocean side),
// +z south. Waterline at x = 252; sand strip x in [224, 252]; pier deck
// z in [36, 52], x in [250, 274].
(function () {
  'use strict';
  var U = CVH.util;

  var VX = [-200, -150, -100, -50, 0, 50, 100, 150, 200]; // avenues (run along z)
  var HZ = [-200, -150, -100, -50, 0, 50, 100, 150, 200]; // streets (run along x)
  var ROAD_HALF = 7;
  var BOUNDS = { minX: -262, maxX: 274, minZ: -262, maxZ: 262 };
  var WATER_X = 252;
  var SAND_X = 224;
  var PIER = { x0: 250, x1: 274, z0: 36, z1: 52 };

  // ---- named places / objective points (all on land, clear of buildings) ----
  var PLACES = {
    porch:      { x: 8,    z: 214,  label: 'Marisol’s porch' },
    police:     { x: -90,  z: 6,    label: 'Police station' },
    hospital:   { x: 110,  z: -90,  label: 'Hospital' },
    paynspray:  { x: -56,  z: -214, label: 'Pay ’n Spray' },
    marina:     { x: 238,  z: -60,  label: 'Marina' },
    pierEnd:    { x: 266,  z: 44,   label: 'Pier end' },
    beachDrop:  { x: 228,  z: 40,   label: 'Beach dropoff' }
  };
  var STANDS = [
    { x: 60, z: 10 }, { x: -110, z: -60 }, { x: 10, z: -110 },
    { x: 160, z: 60 }, { x: -60, z: 160 }
  ];
  var PACKAGES = [
    { x: 228, z: -120 }, { x: 260, z: 44 }, { x: 8, z: 222 }, { x: -214, z: 8 },
    { x: 214, z: -214 }, { x: -214, z: -214 }, { x: 214, z: 214 }, { x: 0, z: -214 },
    { x: -160, z: 214 }, { x: 228, z: 120 }, { x: -214, z: 120 }, { x: -120, z: -214 },
    { x: 214, z: 0 }, { x: 60, z: -160 }
  ];
  var WEAPONS = [
    { x: 66, z: 214, kind: 'pistol' }, { x: -214, z: -160, kind: 'smg' }
  ];
  var TAXI_POINTS = [
    { x: 57, z: -57 }, { x: -57, z: 57 }, { x: 107, z: 107 }, { x: -107, z: -107 },
    { x: 157, z: -7 }, { x: -157, z: 7 }, { x: 7, z: 157 }, { x: -7, z: -157 }
  ];
  var LANDMARKS = [
    { x: 0, z: 0 }, { x: 100, z: 100 }, { x: -100, z: 100 },
    { x: 100, z: -100 }, { x: -100, z: -100 }
  ];

  function auditPoints() {
    var pts = [];
    Object.keys(PLACES).forEach(function (k) { pts.push({ x: PLACES[k].x, z: PLACES[k].z, name: 'place:' + k }); });
    STANDS.forEach(function (s, i) { pts.push({ x: s.x, z: s.z, name: 'stand' + i }); });
    PACKAGES.forEach(function (s, i) { pts.push({ x: s.x, z: s.z, name: 'package' + i }); });
    WEAPONS.forEach(function (s, i) { pts.push({ x: s.x, z: s.z, name: 'weapon:' + s.kind }); });
    TAXI_POINTS.forEach(function (s, i) { pts.push({ x: s.x, z: s.z, name: 'taxi' + i }); });
    LANDMARKS.forEach(function (s, i) { pts.push({ x: s.x, z: s.z, name: 'landmark' + i }); });
    if (CVH.missions && CVH.missions.auditPoints) {
      CVH.missions.auditPoints().forEach(function (p) { pts.push(p); });
    }
    return pts;
  }

  function isOnLand(x, z) {
    if (x < WATER_X) return true;
    // pier deck
    return x >= PIER.x0 && x <= PIER.x1 && z >= PIER.z0 && z <= PIER.z1;
  }
  function inBounds(x, z) {
    return x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
  }

  // ---------------- scene ----------------
  var scene = null, sun = null, hemi = null, skyMat = null;
  var buildings = []; // {minX,maxX,minZ,maxZ}
  var dayT = 0.32;    // 0..1 day cycle; 0.86 = golden hour, 0.96 = dusk
  var windowMats = [];

  function mat(color, opts) {
    var m = new THREE.MeshLambertMaterial({ color: color });
    if (opts) for (var k in opts) m[k] = opts[k];
    return m;
  }

  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87b5d9);
    skyMat = scene.background;

    hemi = new THREE.HemisphereLight(0xcfe8ff, 0x54503e, 0.75);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffe3b3, 1.05);
    sun.position.set(-120, 180, 60);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0x404040, 0.35));

    var rng = U.makeRng(1337);

    // ground (city slab)
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), mat(0x6f7f5e));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05;
    scene.add(ground);
    // sand strip
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(WATER_X - SAND_X + 30, 620), mat(0xe3cf9e));
    sand.rotation.x = -Math.PI / 2; sand.position.set((SAND_X + WATER_X) / 2 + 8, 0.0, 0);
    scene.add(sand);
    // ocean
    var sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 620), mat(0x2e6f9e));
    sea.rotation.x = -Math.PI / 2; sea.position.set(WATER_X + 150, -0.4, 0);
    scene.add(sea);

    // roads
    var roadMat = mat(0x3c4147);
    var lineMat = mat(0xd8d3a0);
    VX.forEach(function (x) {
      var r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 560), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(x, 0.02, 0); scene.add(r);
      for (var z = -260; z <= 260; z += 16) {
        var dash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6), lineMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.04, z); scene.add(dash);
      }
    });
    HZ.forEach(function (z) {
      var r = new THREE.Mesh(new THREE.PlaneGeometry(560, ROAD_HALF * 2), roadMat);
      r.rotation.x = -Math.PI / 2; r.position.set(0, 0.03, z); scene.add(r);
    });

    // pier deck
    var pier = new THREE.Mesh(new THREE.BoxGeometry(PIER.x1 - PIER.x0, 1.2, PIER.z1 - PIER.z0), mat(0x8a6f4d));
    pier.position.set((PIER.x0 + PIER.x1) / 2, 0.4, (PIER.z0 + PIER.z1) / 2);
    scene.add(pier);

    // ---- buildings inside blocks, kept clear of every audit point ----
    var clearPts = auditPoints();
    function clearOf(x0, x1, z0, z1) {
      for (var i = 0; i < clearPts.length; i++) {
        var p = clearPts[i];
        var dx = Math.max(x0 - p.x, 0, p.x - x1);
        var dz = Math.max(z0 - p.z, 0, p.z - z1);
        if (dx * dx + dz * dz < 100) return false; // 10 m clearance
      }
      return true;
    }
    var palette = [0xc9b8a3, 0xa8b6c4, 0xd6c29a, 0xb0a0b8, 0x9fb8a4, 0xd0d0ce, 0xc4a28e];
    for (var bi = 0; bi < VX.length - 1; bi++) {
      for (var bj = 0; bj < HZ.length - 1; bj++) {
        var bx0 = VX[bi] + ROAD_HALF + 2, bx1 = VX[bi + 1] - ROAD_HALF - 2;
        var bz0 = HZ[bj] + ROAD_HALF + 2, bz1 = HZ[bj + 1] - ROAD_HALF - 2;
        for (var gx = 0; gx < 2; gx++) {
          for (var gz = 0; gz < 2; gz++) {
            var w = 13 + rng() * 3, d = 13 + rng() * 3;
            var cx = bx0 + (gx + 0.5) * (bx1 - bx0) / 2 + (rng() - 0.5) * 3;
            var cz = bz0 + (gz + 0.5) * (bz1 - bz0) / 2 + (rng() - 0.5) * 3;
            var x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
            if (!clearOf(x0, x1, z0, z1)) continue;
            var h = 9 + rng() * rng() * 34;
            var color = palette[Math.floor(rng() * palette.length)];
            var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
            b.position.set(cx, h / 2, cz);
            scene.add(b);
            // emissive-ish window band (separate material so we can brighten at dusk)
            var wm = new THREE.MeshBasicMaterial({ color: 0x2c3844 });
            windowMats.push(wm);
            var band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.15, h * 0.72, d + 0.15), wm);
            band.position.set(cx, h * 0.52, cz);
            band.scale.set(0.82, 1, 0.82);
            scene.add(band);
            buildings.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
          }
        }
      }
    }

    // palms along the beach + scattered in the city
    var trunkM = mat(0x7a5c38), leafM = mat(0x3f7d3a);
    function palm(x, z, s) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 5 * s, 5), trunkM);
      trunk.position.y = 2.5 * s; trunk.rotation.z = 0.08;
      g.add(trunk);
      for (var i = 0; i < 5; i++) {
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 3.4 * s, 4), leafM);
        var a = i / 5 * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 1.1 * s, 5.2 * s, Math.sin(a) * 1.1 * s);
        leaf.rotation.z = Math.cos(a) * 1.1;
        leaf.rotation.x = -Math.sin(a) * 1.1;
        g.add(leaf);
      }
      g.position.set(x, 0, z);
      scene.add(g);
    }
    for (var pz = -240; pz <= 240; pz += 24) palm(220, pz + (rng() - 0.5) * 6, 0.9 + rng() * 0.4);
    palm(216, 44, 1.1); palm(216, 32, 1.0);

    // porch house (Marisol's) — small house at the spawn apron
    var house = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 8), mat(0xe0d6c2));
    house.position.set(8, 2.25, 224); scene.add(house);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(7.6, 2.6, 4), mat(0xa34a3a));
    roof.position.set(8, 5.8, 224); roof.rotation.y = Math.PI / 4; scene.add(roof);

    // police station + hospital blocks (landmarks, outside collision set)
    var ps = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 10), mat(0x5a6f8f));
    ps.position.set(-99, 3.5, 16); scene.add(ps);
    var hs = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 10), mat(0xe8e8e8));
    hs.position.set(118, 4.5, -90); scene.add(hs);
    var cross = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xd23b3b }));
    cross.position.set(111.8, 6.5, -90); cross.rotation.y = -Math.PI / 2; scene.add(cross);

    // food stand kiosks
    STANDS.forEach(function (s, i) {
      var k = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3), mat([0xe07b39, 0x39b5e0, 0xe0c339, 0x7be039, 0xe039a5][i % 5]));
      k.position.set(s.x, 1.3, s.z); scene.add(k);
      var awn = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 4), mat(0xffffff));
      awn.position.set(s.x, 2.85, s.z); scene.add(awn);
    });

    // glowing signs at dusk (basic materials read as neon)
    function sign(text, x, y, z, color) {
      var c = document.createElement('canvas'); c.width = 256; c.height = 64;
      var g = c.getContext('2d');
      g.fillStyle = '#101018'; g.fillRect(0, 0, 256, 64);
      g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color; g.fillText(text, 128, 34);
      var tex = new THREE.CanvasTexture(c);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(x, y, z); m.rotation.y = -Math.PI / 2;
      scene.add(m);
      return m;
    }
    sign('HOTEL SOL', 206, 15, -6, '#ffb347');
    sign('CAFE MARINA', 206, 9, 26, '#7be0ff');

    applyDay();
    return scene;
  }

  // day cycle: dayT 0..1; sun angle + colours; 0.86 golden, 0.96 deep dusk
  function applyDay() {
    if (!sun) return;
    var t = dayT;
    var ang = (t - 0.25) * Math.PI * 2; // sunrise .25, noon .5, sunset .86ish
    var elev = Math.sin(ang);
    var warm = U.clamp(1 - Math.abs(elev) * 1.6, 0, 1);
    var day = U.clamp(elev * 1.4 + 0.25, 0.06, 1);
    sun.position.set(Math.cos(ang) * 220, Math.max(18, elev * 240), 90);
    sun.intensity = 0.25 + day * 0.95;
    sun.color.setHSL(0.1 + 0.03 * day, 0.65 * warm + 0.15, 0.62);
    hemi.intensity = 0.25 + day * 0.55;
    var sky = new THREE.Color().setHSL(0.58 - warm * 0.1, 0.55, 0.32 + day * 0.38 - warm * 0.05);
    if (scene) scene.background = sky;
    var win = (t > 0.78 || t < 0.2) ? 0xffca6a : 0x2c3844;
    windowMats.forEach(function (m) { m.color.setHex(win); });
  }
  function advanceDay(dt) {
    dayT += dt / 420; // ~7 minute full cycle
    if (dayT > 1) dayT -= 1;
    applyDay();
  }
  function setDayT(t) { dayT = t; applyDay(); }

  // circle vs building AABBs: push out; returns corrected {x,z}
  function collide(x, z, r) {
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) {
        var dxl = x - (b.minX - r), dxr = (b.maxX + r) - x;
        var dzl = z - (b.minZ - r), dzr = (b.maxZ + r) - z;
        var m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) x = b.minX - r;
        else if (m === dxr) x = b.maxX + r;
        else if (m === dzl) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    return { x: x, z: z };
  }
  function hitsBuilding(x, z, r) {
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
    }
    return false;
  }

  CVH.world = {
    VX: VX, HZ: HZ, ROAD_HALF: ROAD_HALF, BOUNDS: BOUNDS,
    WATER_X: WATER_X, SAND_X: SAND_X, PIER: PIER,
    PLACES: PLACES, STANDS: STANDS, PACKAGES: PACKAGES, WEAPONS: WEAPONS,
    TAXI_POINTS: TAXI_POINTS, LANDMARKS: LANDMARKS,
    auditPoints: auditPoints,
    isOnLand: isOnLand, inBounds: inBounds,
    build: build,
    get scene() { return scene; },
    get buildings() { return buildings; },
    get dayT() { return dayT; },
    setDayT: setDayT, advanceDay: advanceDay,
    collide: collide, hitsBuilding: hitsBuilding
  };
})();
