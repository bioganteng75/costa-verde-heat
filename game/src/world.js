// world.js — Costa Verde itself: the road grid, city blocks with canvas-
// textured facades, the landmark buildings and their signs, beach,
// marina pier and water, palms, lamps, food stands, cash packages and
// weapon pickups. Owns CVH.world, CVH.points and the building collider
// list every other system collides / audits against. Also drives the
// ~7-minute day cycle that drifts into warm dusk.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};
  var THREE = window.THREE;

  // ------------------------------------------------------------ layout
  var ROAD_XS = [-180, -120, -60, 0, 60, 120, 180];   // avenues (run along z)
  var ROAD_ZS = [-150, -90, -30, 30, 90, 150];        // streets (run along x)
  var ROAD_W = 15;
  var MINX = -238, MAXX = 238, MINZ = -208, MAXZ = 208;
  var WATER_X = 250;                                   // waterline (east)
  var PIER = { x0: 234, x1: 276, z0: -34, z1: -6 };    // marina pier deck

  CVH.WORLD = {
    ROAD_XS: ROAD_XS, ROAD_ZS: ROAD_ZS, ROAD_W: ROAD_W,
    MINX: MINX, MAXX: MAXX, MINZ: MINZ, MAXZ: MAXZ,
    WATER_X: WATER_X, PIER: PIER
  };

  var colliders = CVH.colliders = [];   // {x0,x1,z0,z1} buildings & kiosks
  var facadeMats = [];
  var lampMat = null;
  var waterMat = null, waterTex = null;
  var boats = [];
  var hotelSignMat = null;

  CVH.dayT = 0.3;      // 0..1 across ~7 minutes
  CVH.dusk = 0;        // 0 = full day, 1 = full dusk glow

  // ------------------------------------------------------------- points
  // Every gameplay-critical coordinate in the city. All of them sit on
  // roads, sidewalks, aprons, sand or the pier — never inside a block —
  // and the playtest audits each one against the colliders (fix 5).
  var points = CVH.points = {
    spawn:      { x: -150, z: 96 },
    porch:      { x: -150, z: 104 },   // Marisol Vega, at the safehouse
    safehouse:  { x: -150, z: 104 },
    police:     { x: -90,  z: -102 },
    hospital:   { x: 30,   z: -102 },
    pnsPad:     { x: 90,   z: 100 },
    beachDrop:  { x: 228,  z: 40 },
    pierEnd:    { x: 264,  z: -20 },
    taxiSpots: [
      { x: 10, z: 40 }, { x: -50, z: 40 }, { x: 70, z: -20 }, { x: 130, z: 100 },
      { x: -110, z: -80 }, { x: -170, z: 20 }, { x: 190, z: 40 }, { x: 40, z: 160 },
      { x: -40, z: -140 }, { x: 100, z: -140 }, { x: -160, z: -140 }, { x: 190, z: -100 }
    ]
  };

  // ------------------------------------------------------- canvas help
  function canvasTex(w, h, draw, repX, repY) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if (repX || repY) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repX || 1, repY || 1);
    }
    t.anisotropy = 2;
    return t;
  }

  function signTexture(text, bg, fg, sub) {
    return canvasTex(512, 128, function (g, w, h) {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = fg;
      g.font = 'bold 58px Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2 + 2);
      if (sub) {
        g.font = 'bold 26px Arial, sans-serif';
        g.fillText(sub, w / 2, h / 2 + 38);
      }
    });
  }

  // ------------------------------------------------------------ facades
  var FACADE_BASES = ['#c9b8a3', '#a8bfc9', '#d6c290', '#b7a6c4', '#9fc4ae', '#d0a08e'];
  function makeFacades(rng) {
    for (var v = 0; v < 6; v++) {
      (function (v) {
        var base = FACADE_BASES[v];
        var cols = 6, rows = 10;
        var map = canvasTex(128, 256, function (g, w, h) {
          g.fillStyle = base; g.fillRect(0, 0, w, h);
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h - 14, w, 14);
          var cw = w / cols, ch = h / rows;
          for (var x = 0; x < cols; x++) for (var y = 0; y < rows; y++) {
            g.fillStyle = 'rgba(40,50,66,0.85)';
            g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
          }
        });
        var litSeed = CVH.makeRng(900 + v);
        var emis = canvasTex(128, 256, function (g, w, h) {
          g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
          var cw = w / cols, ch = h / rows;
          for (var x = 0; x < cols; x++) for (var y = 0; y < rows; y++) {
            if (litSeed() < 0.42) {
              g.fillStyle = litSeed() < 0.5 ? '#ffca7a' : '#ffe9b0';
              g.fillRect(x * cw + 3, y * ch + 4, cw - 6, ch - 8);
            }
          }
        });
        var m = new THREE.MeshLambertMaterial({
          map: map, emissiveMap: emis, emissive: new THREE.Color(0xffbe78), emissiveIntensity: 0
        });
        facadeMats.push(m);
      })(v);
    }
  }

  function box(w, h, d, mat, x, y, z, parent, shadow) {
    var mesh = new THREE.Mesh(CVH._unitBox, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    if (shadow !== false) { mesh.castShadow = true; mesh.receiveShadow = true; }
    (parent || CVH.scene).add(mesh);
    return mesh;
  }

  function addCollider(x, z, w, d) {
    colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }

  function signMesh(text, bg, fg, w, h, x, y, z, ry, sub) {
    var mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg, sub) });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry || 0;
    CVH.scene.add(m);
    return mat;
  }

  // -------------------------------------------------------------- build
  var world = CVH.world = {
    packages: [],
    pickups: [],
    stands: [],
    sun: null,
    hemi: null
  };

  world.build = function (scene) {
    CVH._unitBox = new THREE.BoxGeometry(1, 1, 1);
    var rng = CVH.makeRng(CVH.seed * 7919 + 13);
    makeFacades(rng);

    // -- ground base (sand colour everywhere; the city slab sits on top)
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 520),
      new THREE.MeshLambertMaterial({ color: 0xd9c49a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(40, -0.05, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    var slab = new THREE.Mesh(new THREE.PlaneGeometry(452, 424),
      new THREE.MeshLambertMaterial({ color: 0xa9a49b }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(-16, 0, 0);
    slab.receiveShadow = true;
    scene.add(slab);

    // -- beach sand (east strip) and the sea
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(66, 424),
      new THREE.MeshLambertMaterial({ color: 0xe6cf9f }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(222, 0.02, 0);
    sand.receiveShadow = true;
    scene.add(sand);

    waterTex = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#2f7ea6'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.20)'; g.lineWidth = 3;
      for (var i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(0, i * 22 + 6);
        g.bezierCurveTo(w * 0.3, i * 22, w * 0.6, i * 22 + 12, w, i * 22 + 4);
        g.stroke();
      }
    }, 10, 10);
    waterMat = new THREE.MeshLambertMaterial({ map: waterTex, transparent: true, opacity: 0.94 });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(190, 460), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(WATER_X + 95, 0.22, 0);
    scene.add(water);
    world._water = water;

    // -- roads (asphalt with edge lines + dashed centre line in texture)
    var roadTexV = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#3c3f45'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8e4da'; g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
      g.fillStyle = '#f5c542'; g.fillRect(w / 2 - 2, 6, 4, 44);
    }, 1, 30);
    var roadMatV = new THREE.MeshLambertMaterial({ map: roadTexV });
    var roadTexH = canvasTex(128, 128, function (g, w, h) {
      g.fillStyle = '#3c3f45'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8e4da'; g.fillRect(0, 4, w, 4); g.fillRect(0, h - 8, w, 4);
      g.fillStyle = '#f5c542'; g.fillRect(6, h / 2 - 2, 44, 4);
    }, 30, 1);
    var roadMatH = new THREE.MeshLambertMaterial({ map: roadTexH });
    var walkMat = new THREE.MeshLambertMaterial({ color: 0xcac4b8 });
    var i, j;
    for (i = 0; i < ROAD_XS.length; i++) {
      var rp = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 424), roadMatV);
      rp.rotation.x = -Math.PI / 2; rp.position.set(ROAD_XS[i], 0.03, 0);
      rp.receiveShadow = true; scene.add(rp);
      box(3, 0.09, 424, walkMat, ROAD_XS[i] - 9, 0.045, 0, scene, false).receiveShadow = true;
      box(3, 0.09, 424, walkMat, ROAD_XS[i] + 9, 0.045, 0, scene, false).receiveShadow = true;
    }
    for (j = 0; j < ROAD_ZS.length; j++) {
      var rp2 = new THREE.Mesh(new THREE.PlaneGeometry(482, ROAD_W), roadMatH);
      rp2.rotation.x = -Math.PI / 2; rp2.position.set(-8, 0.03, ROAD_ZS[j]);
      rp2.receiveShadow = true; scene.add(rp2);
      box(482, 0.09, 3, walkMat, -8, 0.045, ROAD_ZS[j] - 9, scene, false).receiveShadow = true;
      box(482, 0.09, 3, walkMat, -8, 0.045, ROAD_ZS[j] + 9, scene, false).receiveShadow = true;
    }

    // -- pier deck + boats
    var deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    box(PIER.x1 - PIER.x0, 0.3, PIER.z1 - PIER.z0, deckMat,
      (PIER.x0 + PIER.x1) / 2, 0.02, (PIER.z0 + PIER.z1) / 2, scene, false).receiveShadow = true;
    var hullCols = [0xd95f43, 0x3f7fbf, 0xe8e3d8, 0x53a06a];
    for (i = 0; i < 4; i++) {
      var boat = new THREE.Group();
      var hull = box(7, 1.4, 2.6, new THREE.MeshLambertMaterial({ color: hullCols[i] }), 0, 0.4, 0, boat);
      hull.castShadow = false;
      box(2.6, 1.1, 1.8, new THREE.MeshLambertMaterial({ color: 0xf2efe8 }), -0.4, 1.4, 0, boat, false);
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5, 5),
        new THREE.MeshLambertMaterial({ color: 0x777777 }));
      mast.position.set(1.2, 3.4, 0); boat.add(mast);
      boat.position.set(252 + (i % 2) * 14, 0.25, i < 2 ? -46 - i * 6 : 8 + i * 7);
      boat.rotation.y = (i % 2 ? -0.2 : 0.25);
      scene.add(boat);
      boats.push({ g: boat, ph: i * 1.7 });
    }

    buildBlocks(rng);
    buildLandmarks();
    buildNature(rng);
    buildStands();
    buildCollectables();

    // -- lights: one sun with a tight shadow box + hemisphere fill
    var hemi = new THREE.HemisphereLight(0xbfdcff, 0x8a7a5f, 0.75);
    scene.add(hemi);
    world.hemi = hemi;
    var sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -95; sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -95;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    scene.add(sun.target);
    world.sun = sun;
  };

  // ------------------------------------------------------------ blocks
  // Landmark plots (block centres) that random buildings must skip.
  var PLOTS = {
    '-90,-120': 'police', '30,-120': 'hospital', '90,120': 'pns',
    '-150,120': 'safehouse', '150,-60': 'hotel', '-30,60': 'bank'
  };
  function blockKey(cx, cz) { return cx + ',' + cz; }

  function buildBlocks(rng) {
    var cols = [], rows = [], i, j;
    for (i = 0; i < ROAD_XS.length - 1; i++) cols.push((ROAD_XS[i] + ROAD_XS[i + 1]) / 2);
    for (j = 0; j < ROAD_ZS.length - 1; j++) rows.push((ROAD_ZS[j] + ROAD_ZS[j + 1]) / 2);
    for (i = 0; i < cols.length; i++) {
      for (j = 0; j < rows.length; j++) {
        var cx = cols[i], cz = rows[j];
        if (PLOTS[blockKey(cx, cz)]) continue;
        var central = Math.abs(cx) <= 60 && Math.abs(cz) <= 60;
        var n = 1 + Math.floor(rng() * (central ? 3 : 4));
        for (var k = 0; k < n; k++) {
          var w = CVH.randRange(rng, 12, n === 1 ? 34 : 20);
          var d = CVH.randRange(rng, 12, n === 1 ? 34 : 20);
          var bx = cx + (n === 1 ? 0 : CVH.randRange(rng, -13, 13));
          var bz = cz + (n === 1 ? 0 : CVH.randRange(rng, -13, 13));
          bx = CVH.clamp(bx, cx - 22 + w / 2, cx + 22 - w / 2);
          bz = CVH.clamp(bz, cz - 22 + d / 2, cz + 22 - d / 2);
          // never overlap an earlier collider in the same block
          var clash = false;
          for (var c = 0; c < colliders.length; c++) {
            var cc = colliders[c];
            if (bx + w / 2 > cc.x0 - 1 && bx - w / 2 < cc.x1 + 1 && bz + d / 2 > cc.z0 - 1 && bz - d / 2 < cc.z1 + 1) { clash = true; break; }
          }
          if (clash) continue;
          var h = central ? CVH.randRange(rng, 16, 46) : CVH.randRange(rng, 8, 30);
          var mat = facadeMats[Math.floor(rng() * facadeMats.length)];
          box(w, h, d, mat, bx, h / 2, bz);
          // rooftop cap so tops are not see-through bright
          box(w + 0.2, 0.3, d + 0.2, new THREE.MeshLambertMaterial({ color: 0x6b6259 }), bx, h + 0.15, bz, null, false);
          addCollider(bx, bz, w, d);
        }
      }
    }
  }

  function landmarkBlock(cx, cz, w, d, h, mat, roofColor) {
    box(w, h, d, mat, cx, h / 2, cz);
    box(w + 0.2, 0.3, d + 0.2, new THREE.MeshLambertMaterial({ color: roofColor || 0x6b6259 }), cx, h + 0.15, cz, null, false);
    addCollider(cx, cz, w, d);
  }

  function buildLandmarks() {
    var white = new THREE.MeshLambertMaterial({ color: 0xe9e6df });
    var blue = new THREE.MeshLambertMaterial({ color: 0x4a6b8a });
    var red = new THREE.MeshLambertMaterial({ color: 0xb84a3f });

    // Police HQ — porch/spawn point sits south of the block, on the apron.
    landmarkBlock(-90, -120, 32, 24, 15, blue);
    signMesh('POLICE', '#20344d', '#cfe6ff', 20, 5, -90, 11, -107.8, 0, 'COSTA VERDE HQ');
    // Hospital
    landmarkBlock(30, -120, 32, 24, 17, white);
    box(4, 10, 1, red, 30, 13, -107.6);
    box(10, 4, 1, red, 30, 13, -107.6);
    signMesh('HOSPITAL', '#e9e6df', '#b8302a', 20, 5, 30, 6.5, -107.8, 0);
    // Pay 'n Spray — garage with a dark open mouth facing the z=90 street.
    landmarkBlock(90, 120, 30, 22, 9, new THREE.MeshLambertMaterial({ color: 0x707880 }));
    box(16, 6.5, 0.6, new THREE.MeshLambertMaterial({ color: 0x14181c }), 90, 3.25, 108.7);
    signMesh("PAY 'N SPRAY", '#173d2a', '#7dffb0', 22, 5.5, 90, 8.2, 108.6, 0, 'REPAIRS · RESPRAYS');
    // Safehouse — Marisol's porch.
    landmarkBlock(-150, 120, 26, 20, 10, new THREE.MeshLambertMaterial({ color: 0xd8b98a }));
    box(28, 0.5, 6, new THREE.MeshLambertMaterial({ color: 0x8a6f4d }), -150, 0.25, 107);
    signMesh('SAFEHOUSE', '#4d3420', '#ffd98a', 16, 4, -150, 7.5, 109.8, 0);
    // Hotel Sol — the tall tower on the east side.
    landmarkBlock(150, -60, 30, 26, 44, facadeMats[2]);
    hotelSignMat = signMesh('HOTEL SOL', '#3d2030', '#ffb0d8', 24, 6, 150, 38, -46.8, 0, '★ ★ ★ ★');
    // Banco Verde
    landmarkBlock(-30, 60, 30, 24, 13, new THREE.MeshLambertMaterial({ color: 0x9db8a4 }));
    signMesh('BANCO VERDE', '#1e3d2a', '#b0ffd0', 22, 5, -30, 9, 47.8, 0);
    // Cafe Marina — small beach cafe on the sand edge.
    landmarkBlock(200, -60, 11, 9, 4.5, new THREE.MeshLambertMaterial({ color: 0xf0e2c8 }));
    signMesh('CAFE MARINA', '#5d3a1a', '#ffe1a8', 12, 3, 200, 3.6, -55.3, 0);
  }

  function buildNature(rng) {
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    var frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    var lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: new THREE.Color(0xffdf9a), emissiveIntensity: 0.15 });

    function palm(x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.24, 3.6, 6), trunkMat);
      trunk.position.y = 1.8;
      trunk.rotation.z = CVH.randRange(rng, -0.09, 0.09);
      trunk.castShadow = true;
      g.add(trunk);
      var crown = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.15, 7), frondMat);
      crown.rotation.x = Math.PI;
      crown.position.y = 3.9;
      crown.castShadow = true;
      g.add(crown);
      g.position.set(x, 0, z);
      CVH.scene.add(g);
    }
    var z;
    for (z = -196; z <= 196; z += 26) palm(214 + (rng() * 6 - 3), z);
    palm(206, -44); palm(206, -76); palm(196, 22); palm(206, 128);
    palm(-196, 60); palm(-196, -40); palm(40, -196); palm(-80, 196);

    // Street lamps at alternating intersections.
    var lampGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 5);
    var headGeo = new THREE.SphereGeometry(0.32, 8, 6);
    for (var i = 0; i < ROAD_XS.length; i++) {
      for (var j = 0; j < ROAD_ZS.length; j++) {
        if ((i + j) % 2 !== 0) continue;
        var pole = new THREE.Mesh(lampGeo, lampPoleMat);
        pole.position.set(ROAD_XS[i] + 10.6, 2.8, ROAD_ZS[j] + 10.6);
        CVH.scene.add(pole);
        var head = new THREE.Mesh(headGeo, lampMat);
        head.position.set(ROAD_XS[i] + 10.6, 5.7, ROAD_ZS[j] + 10.6);
        CVH.scene.add(head);
      }
    }
  }

  var STAND_DEFS = [
    { name: 'TACO SOL', x: 11, z: 44, fx: 7.6, fz: 44, col: '#c9552e' },
    { name: 'AREPA MIA', x: -70, z: -44, fx: -66.6, fz: -44, col: '#2e7fc9' },
    { name: 'FRUTA FRESCA', x: 130, z: 16, fx: 126.6, fz: 16, col: '#53a06a' },
    { name: 'EMPANADA SUR', x: -130, z: 136, fx: -126.6, fz: 136, col: '#c92e7f' },
    { name: 'CAFE PLAYA', x: 197, z: 96, fx: 192.5, fz: 96, col: '#7a4dc9' }
  ];
  function buildStands() {
    for (var i = 0; i < STAND_DEFS.length; i++) {
      var s = STAND_DEFS[i];
      var g = new THREE.Group();
      box(3.4, 2.3, 2.6, new THREE.MeshLambertMaterial({ color: 0xf2ead8 }), 0, 1.15, 0, g);
      var awnTex = canvasTex(64, 64, function (gg, w, h) {
        gg.fillStyle = s.col; gg.fillRect(0, 0, w, h);
        gg.fillStyle = '#ffffff';
        for (var x = 0; x < w; x += 16) gg.fillRect(x, 0, 8, h);
      });
      var awn = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 3.4),
        new THREE.MeshLambertMaterial({ map: awnTex }));
      awn.position.set(0, 2.6, 0.2); awn.rotation.x = 0.18; awn.castShadow = true;
      g.add(awn);
      g.position.set(s.x, 0, s.z);
      CVH.scene.add(g);
      signMesh(s.name, '#22201c', '#ffe9b0', 4.4, 1.1, s.x, 3.3, s.z - 1.2, 0);
      addCollider(s.x, s.z, 3.4, 2.6);
      world.stands.push({ x: s.x, z: s.z, fx: s.fx, fz: s.fz, name: s.name });
    }
  }

  var PACKAGE_SPOTS = [
    [9.8, -60], [-128, 20.2], [222, -120], [270, -12], [-150, -99.8], [66, -140],
    [190, 150], [-196, -20], [120, 99.8], [-30, -161], [232, 120], [60, 140],
    [-88, 30], [205, -178]
  ];
  function buildCollectables() {
    var pkgMat = new THREE.MeshLambertMaterial({ color: 0x35d465, emissive: new THREE.Color(0x1d7a3a), emissiveIntensity: 0.7 });
    for (var i = 0; i < PACKAGE_SPOTS.length; i++) {
      var m = box(0.85, 0.85, 0.85, pkgMat, PACKAGE_SPOTS[i][0], 0.8, PACKAGE_SPOTS[i][1], null, false);
      m.rotation.y = 0.6;
      world.packages.push({ x: PACKAGE_SPOTS[i][0], z: PACKAGE_SPOTS[i][1], mesh: m, taken: false, ph: i * 0.9 });
    }
    function pickup(kind, x, z, color) {
      var g = new THREE.Group();
      var body = box(0.9, 0.28, 0.36, new THREE.MeshLambertMaterial({ color: color }), 0, 0, 0, g, false);
      body.rotation.z = 0.2;
      box(0.3, 0.34, 0.3, new THREE.MeshLambertMaterial({ color: 0x222222 }), 0.25, -0.12, 0, g, false);
      g.position.set(x, 1.0, z);
      CVH.scene.add(g);
      world.pickups.push({ kind: kind, x: x, z: z, mesh: g, taken: false });
    }
    pickup('pistol', -186, 128, 0x3a3f45);
    pickup('smg', 266, -26, 0x5a4632);
  }

  // ------------------------------------------------------------ queries
  function inPier(x, z) { return x >= PIER.x0 && x <= PIER.x1 && z >= PIER.z0 && z <= PIER.z1; }

  world.isLand = function (x, z) { return x < WATER_X || inPier(x, z); };
  world.inBounds = function (x, z) {
    if (z < MINZ || z > MAXZ) return false;
    if (inPier(x, z)) return true;
    return x >= MINX && x <= MAXX;
  };
  world.clearOfBuildings = function (x, z, r) {
    r = r || 0;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false;
    }
    return true;
  };
  // The reachability audit used by missions and by the playtest (fix 5).
  world.auditPoint = function (x, z, r) {
    var res = {
      inBounds: world.inBounds(x, z),
      onLand: world.isLand(x, z),
      clear: world.clearOfBuildings(x, z, r === undefined ? 0.6 : r)
    };
    res.ok = res.inBounds && res.onLand && res.clear;
    return res;
  };

  // Push a point out of buildings and back inside the world. Returns true
  // when a building was hit (vehicles use it for crash detection).
  world.collide = function (pos, r) {
    var hit = false;
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (pos.x > c.x0 - r && pos.x < c.x1 + r && pos.z > c.z0 - r && pos.z < c.z1 + r) {
        var dxl = pos.x - (c.x0 - r), dxr = (c.x1 + r) - pos.x;
        var dzl = pos.z - (c.z0 - r), dzr = (c.z1 + r) - pos.z;
        var m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.x0 - r;
        else if (m === dxr) pos.x = c.x1 + r;
        else if (m === dzl) pos.z = c.z0 - r;
        else pos.z = c.z1 + r;
        hit = true;
      }
    }
    // world edge / waterline
    var maxX = inPier(pos.x, pos.z) ? PIER.x1 - 0.4 : MAXX;
    if (pos.x > maxX) { pos.x = maxX; hit = true; }
    if (pos.x < MINX) { pos.x = MINX; hit = true; }
    if (pos.z < MINZ) { pos.z = MINZ; hit = true; }
    if (pos.z > MAXZ) { pos.z = MAXZ; hit = true; }
    if (pos.x > WATER_X - r && !inPier(pos.x, pos.z)) { pos.x = WATER_X - r; hit = true; }
    return hit;
  };

  world.nearestRoadPoint = function (x, z, out) {
    var bx = ROAD_XS[0], bz = ROAD_ZS[0], bd = Infinity, i, d;
    for (i = 0; i < ROAD_XS.length; i++) { d = Math.abs(x - ROAD_XS[i]); if (d < bd) { bd = d; bx = ROAD_XS[i]; } }
    var bdz = Infinity;
    for (i = 0; i < ROAD_ZS.length; i++) { d = Math.abs(z - ROAD_ZS[i]); if (d < bdz) { bdz = d; bz = ROAD_ZS[i]; } }
    if (bd <= bdz) { out.x = bx; out.z = CVH.clamp(z, MINZ + 4, MAXZ - 4); }
    else { out.x = CVH.clamp(x, MINX + 4, MAXX - 4); out.z = bz; }
    return out;
  };

  // --------------------------------------------------------- day cycle
  var sunDir = null;
  world.update = function (dt, focus) {
    CVH.dayT = (CVH.dayT + dt / 420) % 1;
    var p = CVH.dayT;
    var ang = p * Math.PI;                       // sun arc east -> west
    var elev = Math.sin(ang);
    var daylight = CVH.clamp(elev * 1.5 + 0.12, 0.16, 1);
    var dusk = CVH.clamp(1 - Math.abs(elev) * 1.9, 0, 1) * (p > 0.03 && p < 0.97 ? 1 : 0.35);
    CVH.dusk = dusk;

    if (!sunDir) sunDir = new THREE.Vector3();
    sunDir.set(Math.cos(ang), Math.max(elev, 0.06) * 0.9 + 0.12, 0.38).normalize();
    var sun = world.sun;
    sun.position.set(focus.x + sunDir.x * 170, sunDir.y * 170, focus.z + sunDir.z * 170);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.intensity = 0.35 + daylight * 0.85;
    sun.color.setHSL(0.11 - dusk * 0.045, 0.5 * dusk + 0.12, 0.72 - dusk * 0.08);
    world.hemi.intensity = 0.28 + daylight * 0.5;

    if (!CVH._skyColor) CVH._skyColor = new THREE.Color();
    var sky = CVH._skyColor;
    sky.setHSL(0.58 - dusk * 0.42, 0.62 - dusk * 0.12, 0.72 - daylight * 0.06 - dusk * 0.14);
    if (CVH.renderer) CVH.renderer.setClearColor(sky);
    if (CVH.scene && CVH.scene.fog) {
      CVH.scene.fog.color.copy(sky);
      CVH.scene.fog.near = 190 - dusk * 50;
      CVH.scene.fog.far = 460 - dusk * 90;
    }
    var i;
    for (i = 0; i < facadeMats.length; i++) facadeMats[i].emissiveIntensity = dusk * 0.95;
    if (lampMat) lampMat.emissiveIntensity = 0.15 + dusk * 1.6;
    if (hotelSignMat) hotelSignMat.color.setHSL(0.9, 0.5, 0.75 + Math.sin(CVH.time * 2.2) * 0.1);

    // water shimmer + boat bobbing
    if (waterTex) { waterTex.offset.x = (CVH.time * 0.008) % 1; waterTex.offset.y = Math.sin(CVH.time * 0.3) * 0.01; }
    if (world._water) world._water.position.y = 0.22 + Math.sin(CVH.time * 0.7) * 0.05;
    for (i = 0; i < boats.length; i++) {
      boats[i].g.position.y = 0.25 + Math.sin(CVH.time * 0.8 + boats[i].ph) * 0.09;
      boats[i].g.rotation.z = Math.sin(CVH.time * 0.6 + boats[i].ph) * 0.02;
    }
    // packages gently spin/bob so they read as pickups
    var pk = world.packages;
    for (i = 0; i < pk.length; i++) {
      if (pk[i].taken) continue;
      pk[i].mesh.rotation.y += dt * 1.6;
      pk[i].mesh.position.y = 0.8 + Math.sin(CVH.time * 2 + pk[i].ph) * 0.14;
    }
    for (i = 0; i < world.pickups.length; i++) {
      if (world.pickups[i].taken) continue;
      world.pickups[i].mesh.rotation.y += dt * 1.2;
    }
  };

  CVH._skyColor = null; // set by main after scene creation (needs THREE.Color)
})();
