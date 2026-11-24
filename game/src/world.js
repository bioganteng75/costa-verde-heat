// world.js — Costa Verde: layout data, city building, day cycle, peds.
// Layout: avenues run along x at fixed z, streets along z at fixed x.
// Land ends at the sand strip (x 228..252); water beyond x = 252; the
// pier deck (x 246..270, z 32..48) reaches over the water.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var AVENUES = [-200, -120, -40, 40, 120, 200];   // z of horizontal roads
  var STREETS = [-200, -120, -40, 40, 120, 200];   // x of vertical roads
  var ROAD_HALF = 7;
  var WORLD = { minX: -248, maxX: 270, minZ: -248, maxZ: 248 };
  var WATER_X = 252;
  var PIER = { minX: 246, maxX: 270, minZ: 32, maxZ: 48 };

  var world = {
    avenues: AVENUES,
    streets: STREETS,
    roadHalf: ROAD_HALF,
    bounds: WORLD,
    waterX: WATER_X,
    pier: PIER,
    buildings: [],       // {minX,maxX,minZ,maxZ,h}
    objectives: [],      // {name,x,z} — every point the audit verifies
    peds: [],
    dayT: 0.3,
    dayLength: 420,      // seconds, day -> dusk
    holdDay: false,      // menu holds golden hour
    scene: null,
    sun: null,
    hemi: null,
    waterMat: null,
    windowMats: [],
    signMats: [],
    rng: null
  };

  world.addObjective = function (name, x, z) {
    world.objectives.push({ name: name, x: x, z: z });
    return world.objectives[world.objectives.length - 1];
  };

  world.onPier = function (x, z) {
    return x >= PIER.minX && x <= PIER.maxX && z >= PIER.minZ && z <= PIER.maxZ;
  };
  world.isLand = function (x, z) {
    if (x < WATER_X) return true;
    return world.onPier(x, z);
  };
  world.groundY = function (x, z) {
    return world.onPier(x, z) ? 0.3 : 0;
  };
  world.inBounds = function (x, z) {
    return x >= WORLD.minX && x <= WORLD.maxX && z >= WORLD.minZ && z <= WORLD.maxZ;
  };

  // Push a circle (x, z, r) out of every building AABB. Returns corrected point.
  world.collideCircle = function (x, z, r) {
    var bs = world.buildings;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      var nx = U.clamp(x, b.minX, b.maxX);
      var nz = U.clamp(z, b.minZ, b.maxZ);
      var dx = x - nx, dz = z - nz;
      var d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          var d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the smallest penetration
          var pl = x - b.minX, pr = b.maxX - x, pt = z - b.minZ, pb = b.maxZ - z;
          var m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r;
          else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r;
          else z = b.maxZ + r;
        }
      }
    }
    return { x: x, z: z };
  };

  world.pointClearOfBuildings = function (x, z, margin) {
    var bs = world.buildings;
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin) return false;
    }
    return true;
  };

  // The objective audit: every registered point must be inside the
  // world, on land (or on the pier deck) and clear of buildings.
  world.auditObjectives = function () {
    var failures = [];
    for (var i = 0; i < world.objectives.length; i++) {
      var o = world.objectives[i];
      if (!world.inBounds(o.x, o.z)) failures.push(o.name + ':out-of-bounds');
      else if (!world.isLand(o.x, o.z)) failures.push(o.name + ':in-water');
      else if (!world.pointClearOfBuildings(o.x, o.z, 1.5)) failures.push(o.name + ':inside-building');
    }
    return { count: world.objectives.length, failures: failures };
  };

  // A random point on a road centre line.
  world.randomRoadPoint = function (rng) {
    if (rng() < 0.5) {
      return { x: -240 + rng() * 480, z: AVENUES[(rng() * AVENUES.length) | 0], avenue: true };
    }
    return { x: STREETS[(rng() * STREETS.length) | 0], z: -240 + rng() * 480, avenue: false };
  };

  // ----------------------------------------------------------------
  // Humanoid figure builder (player + pedestrians share it).
  // Model faces -z at rotation 0. Parts swing around hip/shoulder pivots.
  // ----------------------------------------------------------------
  function makeHumanoid(shirtColor, pantsColor, skinColor) {
    var g = new THREE.Group();
    var mat = function (c) { return new THREE.MeshLambertMaterial({ color: c }); };
    function box(w, h, d, c, x, y, z) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    }
    function limb(w, h, d, c, x, y, z) {
      // pivot at the top of the limb
      var pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(0, -h / 2, 0);
      pivot.add(m);
      g.add(pivot);
      return pivot;
    }
    var parts = {};
    parts.legL = limb(0.22, 0.8, 0.24, pantsColor, -0.14, 0.85, 0);
    parts.legR = limb(0.22, 0.8, 0.24, pantsColor, 0.14, 0.85, 0);
    parts.torso = box(0.58, 0.7, 0.3, shirtColor, 0, 1.2, 0);
    parts.armL = limb(0.16, 0.65, 0.18, shirtColor, -0.38, 1.5, 0);
    parts.armR = limb(0.16, 0.65, 0.18, shirtColor, 0.38, 1.5, 0);
    parts.head = box(0.34, 0.36, 0.34, skinColor, 0, 1.75, 0);
    box(0.36, 0.1, 0.36, 0x22242c, 0, 1.95, 0); // cap
    g.userData.parts = parts;
    return g;
  }
  world.makeHumanoid = makeHumanoid;

  world.animHumanoid = function (fig, phase, amount) {
    var p = fig.userData.parts;
    if (!p) return;
    var s = Math.sin(phase) * 0.55 * amount;
    p.legL.rotation.x = s;
    p.legR.rotation.x = -s;
    p.armL.rotation.x = -s * 0.8;
    p.armR.rotation.x = s * 0.8;
  };

  // ----------------------------------------------------------------
  // Scene construction
  // ----------------------------------------------------------------
  function canvasTexture(draw, w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    return t;
  }

  function buildingTexture(base, litRatio, rng) {
    return canvasTexture(function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var cols = 6, rows = 10;
      var cw = w / cols, ch = h / rows;
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          var lit = rng() < litRatio;
          g.fillStyle = lit ? '#ffd98a' : '#2b3542';
          g.fillRect(i * cw + 3, j * ch + 3, cw - 6, ch - 6);
        }
      }
    }, 128, 256);
  }

  world.build = function (scene, seed) {
    world.scene = scene;
    var rng = (world.rng = CVH.makeRng(seed || 1));

    scene.fog = new THREE.Fog(0xcfd8e6, 120, 700);
    world.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x8a7a5f, 0.75);
    scene.add(world.hemi);
    world.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    world.sun.position.set(80, 140, -60);
    scene.add(world.sun);
    scene.add(new THREE.AmbientLight(0x404860, 0.5));

    // Ground: grass / city base
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0x5d7a4a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, 0);
    scene.add(ground);

    // Sand strip + beach
    var sand = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 540),
      new THREE.MeshLambertMaterial({ color: 0xe3cf9e })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(240, 0.0, 0);
    scene.add(sand);

    // Water
    world.waterMat = new THREE.MeshLambertMaterial({ color: 0x2e6f9e, transparent: true, opacity: 0.92 });
    var water = new THREE.Mesh(new THREE.PlaneGeometry(320, 560), world.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(252 + 160, -0.25, 0);
    scene.add(water);

    // Roads
    var roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
    var lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
    AVENUES.forEach(function (z) {
      var r = new THREE.Mesh(new THREE.PlaneGeometry(500, ROAD_HALF * 2), roadMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(-2, 0.01, z);
      scene.add(r);
      var l = new THREE.Mesh(new THREE.PlaneGeometry(500, 0.35), lineMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(-2, 0.02, z);
      scene.add(l);
    });
    STREETS.forEach(function (x) {
      var r = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 500), roadMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 0.012, 0);
      scene.add(r);
    });

    // Pier deck + posts
    var pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    var deck = new THREE.Mesh(new THREE.BoxGeometry(PIER.maxX - PIER.minX, 0.3, PIER.maxZ - PIER.minZ), pierMat);
    deck.position.set((PIER.minX + PIER.maxX) / 2, 0.15, (PIER.minZ + PIER.maxZ) / 2);
    scene.add(deck);

    // Marina: a few boat hulls in the water south of the pier
    var boatCols = [0xd9534f, 0x4f7ad9, 0xf2f2f2, 0x53b06a];
    for (var bi = 0; bi < 5; bi++) {
      var boat = new THREE.Group();
      var hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 2.6), new THREE.MeshLambertMaterial({ color: boatCols[bi % 4] }));
      hull.position.y = 0.4;
      boat.add(hull);
      var cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.8), new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }));
      cabin.position.set(-0.6, 1.5, 0);
      boat.add(cabin);
      boat.position.set(262 + (bi % 2) * 8, 0, -70 - bi * 14);
      boat.rotation.y = 0.2 * (bi - 2);
      scene.add(boat);
    }

    // Buildings per block
    var palette = ['#9a8f7d', '#7d8a9a', '#a89a86', '#8a7d95', '#97a08a', '#b09a7a'];
    var xEdges = [-248].concat(STREETS.map(function (s) { return s + ROAD_HALF; }));
    var xStarts = [-248].concat(STREETS.map(function (s) { return s + ROAD_HALF; }));
    var xEnds = STREETS.map(function (s) { return s - ROAD_HALF; }).concat([248]);
    var zStarts = xStarts, zEnds = xEnds;
    var winMats = [];
    for (var bx = 0; bx < xStarts.length; bx++) {
      for (var bz = 0; bz < zStarts.length; bz++) {
        var bx0 = xStarts[bx] + 9, bx1 = xEnds[bx] - 9;
        var bz0 = zStarts[bz] + 9, bz1 = zEnds[bz] - 9;
        if (bx1 - bx0 < 16 || bz1 - bz0 < 16) continue;
        if (bx0 > 200) continue; // beachfront stays open
        var n = 1 + ((rng() * 3) | 0);
        for (var k = 0; k < n; k++) {
          var bw = 12 + rng() * 16;
          var bd = 12 + rng() * 16;
          var cx = bx0 + rng() * Math.max(1, bx1 - bx0 - bw);
          var cz = bz0 + rng() * Math.max(1, bz1 - bz0 - bd);
          if (cx + bw > 224) continue;
          var hgt = 10 + rng() * 34;
          var base = palette[(rng() * palette.length) | 0];
          var tex = buildingTexture(base, 0.45, rng);
          var mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffca7a, emissiveMap: tex, emissiveIntensity: 0.0 });
          winMats.push(mat);
          var m = new THREE.Mesh(new THREE.BoxGeometry(bw, hgt, bd), mat);
          m.position.set(cx + bw / 2, hgt / 2, cz + bd / 2);
          scene.add(m);
          var roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.6, 0.5, bd + 0.6), new THREE.MeshLambertMaterial({ color: 0x4a4a52 }));
          roof.position.set(cx + bw / 2, hgt + 0.25, cz + bd / 2);
          scene.add(roof);
          world.buildings.push({ minX: cx, maxX: cx + bw, minZ: cz, maxZ: cz + bd, h: hgt });
        }
      }
    }
    world.windowMats = winMats;

    // Named signs (canvas textures) on billboard poles, facing the city
    function sign(text, color, x, y, z, ry) {
      var tex = canvasTexture(function (g, w, h) {
        g.fillStyle = '#14161f'; g.fillRect(0, 0, w, h);
        g.font = 'bold 44px Arial';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = color;
        g.fillText(text, w / 2, h / 2);
      }, 512, 96);
      var mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      world.signMats.push(mat);
      var grp = new THREE.Group();
      var p = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), mat);
      grp.add(p);
      var poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
      [-6, 6].forEach(function (off) {
        var len = Math.max(1, y - 1.4); // from just under the panel to the ground
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len, 5), poleMat);
        pole.position.set(off, -1.4 - len / 2, 0);
        grp.add(pole);
      });
      grp.position.set(x, y, z);
      grp.rotation.y = ry;
      scene.add(grp);
    }
    sign('HOTEL SOL', '#ffb84f', 210, 9, 29, -Math.PI / 2);   // beachfront, faces the city
    sign('CAFE MARINA', '#6fe3ff', 216, 6, 59, -Math.PI / 2); // by the pier approach
    sign('COSTA VERDE', '#ff7ab0', -47, 12, -33, Math.PI / 2); // downtown

    // Street lights along avenues (emissive lamp spheres)
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
    world.lampMat = lampMat;
    AVENUES.forEach(function (z) {
      for (var x = -220; x <= 220; x += 55) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 5), poleMat);
        pole.position.set(x, 2.7, z - ROAD_HALF - 0.6);
        scene.add(pole);
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), lampMat);
        lamp.position.set(x, 5.5, z - ROAD_HALF - 0.6);
        scene.add(lamp);
      }
    });

    // Palm trees on the beach
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    for (var pi = 0; pi < 16; pi++) {
      var px = 232 + rng() * 14;
      var pz = -230 + pi * 29 + rng() * 10;
      if (pz > 26 && pz < 54) continue; // keep the pier approach clear
      var palm = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 5.5, 5), trunkMat);
      trunk.position.y = 2.75;
      trunk.rotation.z = 0.08;
      palm.add(trunk);
      for (var li = 0; li < 5; li++) {
        var leaf = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.7), leafMat);
        leaf.position.y = 5.6;
        leaf.rotation.y = (li / 5) * Math.PI * 2;
        leaf.rotation.z = -0.5;
        leaf.translateX(1.4);
        palm.add(leaf);
      }
      palm.position.set(px, 0, pz);
      scene.add(palm);
    }

    buildLandmarks(scene);
    buildPeds(scene, rng);
    world.applyDay();
  };

  // Landmarks + their objective points (porch, police, hospital,
  // Pay 'n Spray, food stands, marina, beaches, pier).
  function buildLandmarks(scene) {
    function markerBuilding(x, z, color, label) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 8), new THREE.MeshLambertMaterial({ color: color }));
      m.position.set(x, 3.5, z);
      scene.add(m);
      var roof = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 9), new THREE.MeshLambertMaterial({ color: 0x333340 }));
      roof.position.set(x, 7.2, z);
      scene.add(roof);
      return m;
    }
    // Marisol's porch — where jobs start (on the z=40 avenue sidewalk)
    var porch = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 4), new THREE.MeshLambertMaterial({ color: 0xa0784f }));
    porch.position.set(12, 0.15, 51);
    scene.add(porch);
    markerBuilding(12, 58, 0xc9a06a);
    world.porch = { x: 12, z: 47 };
    world.addObjective('porch', 12, 47);
    world.addObjective('spawn', 8, 47);

    // Police station on the x=120 street
    markerBuilding(131, -40, 0x5a6f9e);
    world.policeStation = { x: 124, z: -40 };
    world.addObjective('police-station', 124, -40);

    // Hospital on the x=-120 street
    markerBuilding(-131, 40, 0xe8e8e8);
    world.hospital = { x: -124, z: 40 };
    world.addObjective('hospital', -124, 40);

    // Pay 'n Spray booth + pad east of downtown
    var booth = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 7), new THREE.MeshLambertMaterial({ color: 0x3f9e6e }));
    booth.position.set(52, 2.25, -112);
    scene.add(booth);
    var pad = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshLambertMaterial({ color: 0x2f7a52 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(52, 0.03, -120);
    scene.add(pad);
    world.payNSpray = { x: 52, z: -120 };
    world.addObjective('paynspray', 52, -120);

    // Food stands (healing)
    world.stands = [];
    var standPts = [[26, 49], [-66, -33], [146, 113], [-214, -47], [100, 214]];
    standPts.forEach(function (p, i) {
      var s = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.4), new THREE.MeshLambertMaterial({ color: 0xd96f4f }));
      body.position.y = 1.1;
      s.add(body);
      var awn = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 3), new THREE.MeshLambertMaterial({ color: 0xf2e3a0 }));
      awn.position.y = 2.5;
      s.add(awn);
      s.position.set(p[0], 0, p[1]);
      scene.add(s);
      world.stands.push({ x: p[0], z: p[1], name: 'stand-' + (i + 1) });
      world.addObjective('stand-' + (i + 1), p[0], p[1]);
    });

    world.addObjective('marina', 236, -80);
    world.addObjective('beach-north', 228, 200);
    world.addObjective('beach-south', 228, -200);
    world.addObjective('pier-end', 262, 40);
  }

  // ----------------------------------------------------------------
  // Pedestrians: 40 of them, wandering the road network.
  // ----------------------------------------------------------------
  var SHIRTS = [0xd9534f, 0x4f7ad9, 0x53b06a, 0xf2c14e, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x1abc9c];
  var PANTS = [0x2c3e50, 0x555f6e, 0x6e4f2c, 0x243024];
  var SKIN = [0xf2c79b, 0xc98d5e, 0x8a5a33, 0xffe0bd];

  function buildPeds(scene, rng) {
    for (var i = 0; i < 40; i++) {
      var fig = makeHumanoid(
        SHIRTS[(rng() * SHIRTS.length) | 0],
        PANTS[(rng() * PANTS.length) | 0],
        SKIN[(rng() * SKIN.length) | 0]
      );
      var p = world.randomRoadPoint(rng);
      var ped = {
        mesh: fig,
        x: p.x + (rng() * 6 - 3), z: p.z + (rng() * 6 - 3),
        heading: rng() * Math.PI * 2,
        tx: p.x, tz: p.z,
        speed: 1.1 + rng() * 0.9,
        phase: rng() * 6,
        state: 'wander',   // wander | flee | down
        downT: 0,
        visible: true
      };
      fig.position.set(ped.x, 0, ped.z);
      scene.add(fig);
      world.peds.push(ped);
    }
  }

  world.updatePeds = function (dt, playerPos, danger) {
    var rng = world.rng;
    for (var i = 0; i < world.peds.length; i++) {
      var ped = world.peds[i];
      if (!ped.visible) continue;
      if (ped.state === 'down') {
        ped.downT -= dt;
        ped.mesh.rotation.x = -Math.PI / 2;
        if (ped.downT <= 0) {
          ped.state = 'wander';
          ped.mesh.rotation.x = 0;
        }
        continue;
      }
      var dp = U.dist(ped.x, ped.z, playerPos.x, playerPos.z);
      // Recycle far-away peds back near the player so streets stay alive.
      if (dp > 190) {
        var p = world.randomRoadPoint(rng);
        ped.x = playerPos.x + U.clamp(p.x - playerPos.x, -90, 90) + (rng() * 30 - 15);
        ped.z = playerPos.z + U.clamp(p.z - playerPos.z, -90, 90) + (rng() * 30 - 15);
        if (!world.isLand(ped.x, ped.z)) { ped.x = 0; ped.z = 40; }
        ped.tx = ped.x; ped.tz = ped.z;
        dp = U.dist(ped.x, ped.z, playerPos.x, playerPos.z);
      }
      var fleeing = danger && dp < 16;
      if (fleeing) ped.state = 'flee'; else if (ped.state === 'flee' && dp >= 16) ped.state = 'wander';

      if (ped.state === 'flee') {
        var away = U.headingOf(ped.x - playerPos.x, ped.z - playerPos.z);
        ped.heading += U.angDiff(away, ped.heading) * Math.min(1, dt * 6);
        var f = U.facing(ped.heading);
        ped.x += f.x * 3.4 * dt;
        ped.z += f.z * 3.4 * dt;
        ped.phase += dt * 11;
      } else {
        var dx = ped.tx - ped.x, dz = ped.tz - ped.z;
        if (dx * dx + dz * dz < 4) {
          var np = world.randomRoadPoint(rng);
          // wander locally: target a nearby road point
          ped.tx = U.clamp(ped.x + (np.x - ped.x) * 0.3 + (rng() * 40 - 20), -244, 244);
          ped.tz = U.clamp(ped.z + (np.z - ped.z) * 0.3 + (rng() * 40 - 20), -244, 244);
          if (!world.isLand(ped.tx, ped.tz)) { ped.tx = ped.x; ped.tz = ped.z; }
        }
        var want = U.headingOf(dx, dz);
        ped.heading += U.angDiff(want, ped.heading) * Math.min(1, dt * 4);
        var f2 = U.facing(ped.heading);
        ped.x += f2.x * ped.speed * dt;
        ped.z += f2.z * ped.speed * dt;
        ped.phase += dt * 5.2;
      }
      var fixed = world.collideCircle(ped.x, ped.z, 0.5);
      ped.x = U.clamp(fixed.x, WORLD.minX, 250);
      ped.z = U.clamp(fixed.z, WORLD.minZ, WORLD.maxZ);
      ped.mesh.position.set(ped.x, world.groundY(ped.x, ped.z), ped.z);
      ped.mesh.rotation.y = ped.heading;
      world.animHumanoid(ped.mesh, ped.phase, 1);
    }
  };

  world.knockDownPed = function (ped) {
    ped.state = 'down';
    ped.downT = 6;
  };

  // ----------------------------------------------------------------
  // Day cycle
  // ----------------------------------------------------------------
  world.advanceDay = function (dt) {
    if (world.holdDay) return;
    world.dayT += dt / world.dayLength;
    if (world.dayT > 1) world.dayT -= 1;
    world.applyDay();
  };

  world.setDayT = function (t) {
    world.dayT = t;
    world.applyDay();
  };

  world.applyDay = function () {
    if (!world.sun) return;
    var t = world.dayT;
    var elev = Math.sin(Math.PI * U.clamp(t, 0, 1));       // 0 at dawn/dusk, 1 at noon
    var azim = U.lerp(-1.1, 1.1, t);
    world.sun.position.set(Math.sin(azim) * 160, 30 + elev * 150, -70);
    var duskness = U.clamp((t - 0.72) / 0.28, 0, 1);
    var warm = new THREE.Color(0xffb066);
    var noon = new THREE.Color(0xffffff);
    world.sun.color.copy(noon).lerp(warm, duskness);
    world.sun.intensity = 0.45 + elev * 0.75;
    world.hemi.intensity = 0.35 + elev * 0.45;
    var sky = new THREE.Color(0x9fd3f0).lerp(new THREE.Color(0x35406e), duskness * 0.85);
    world.scene.background = sky;
    world.scene.fog.color.copy(sky);
    for (var i = 0; i < world.windowMats.length; i++) {
      world.windowMats[i].emissiveIntensity = duskness * 0.85;
    }
    if (world.waterMat) world.waterMat.color.setHex(0x2e6f9e).lerp(new THREE.Color(0x27355e), duskness);
  };

  CVH.world = world;
})();
