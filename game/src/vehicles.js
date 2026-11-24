// vehicles.js — car factory (6 types), arcade physics, traffic AI.
// A car: { mesh, x, z, y, yaw, speed, type, driver, health, dead, ... }
// driver is one of: 'player' | 'traffic' | 'police' | 'parked' | 'wreck' | 'mission'
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var TYPES = {
    sedan:  { len: 4.2, wid: 1.9, h: 0.62, top: 26, accel: 11, grip: 2.6, colors: [0xb0483e, 0x3e6fb0, 0xb0b6bd, 0x3f3f46, 0x6a9e5f] },
    coupe:  { len: 4.0, wid: 1.85, h: 0.52, top: 33, accel: 15, grip: 3.0, colors: [0xe0a52c, 0xc23b6e, 0x2c2c34] },
    sport:  { len: 4.1, wid: 1.9, h: 0.48, top: 38, accel: 18, grip: 3.2, colors: [0xd93425, 0x2570d9, 0xf2f2f2] },
    truck:  { len: 5.4, wid: 2.2, h: 0.95, top: 21, accel: 8, grip: 2.2, colors: [0x7a8894, 0x9e5f3f, 0x4f6152] },
    van:    { len: 4.8, wid: 2.0, h: 0.95, top: 23, accel: 9, grip: 2.3, colors: [0xd8d8d8, 0x5f7a9e, 0x8a8f5f] },
    moto:   { len: 2.2, wid: 0.7, h: 0.55, top: 36, accel: 17, grip: 3.4, colors: [0x22242c, 0xb03030, 0x2c6eb0] }
  };
  var TYPE_NAMES = Object.keys(TYPES);

  var vehicles = {
    all: [],
    traffic: [],
    TYPES: TYPES
  };

  function buildMesh(type, color, isPolice) {
    var spec = TYPES[type];
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f4f6 : color });
    var darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1e24 });
    var glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });

    if (type === 'moto') {
      var frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, spec.len), bodyMat);
      frame.position.y = 0.55;
      g.add(frame);
      var seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.9), darkMat);
      seat.position.set(0, 0.82, 0.25);
      g.add(seat);
      var wgeo = new THREE.CylinderGeometry(0.34, 0.34, 0.12, 10);
      var wf = new THREE.Mesh(wgeo, darkMat);
      wf.rotation.z = Math.PI / 2;
      wf.position.set(0, 0.34, -spec.len / 2 + 0.2);
      g.add(wf);
      var wb = wf.clone();
      wb.position.z = spec.len / 2 - 0.2;
      g.add(wb);
      return g;
    }

    var body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, spec.h, spec.len), bodyMat);
    body.position.y = 0.35 + spec.h / 2;
    g.add(body);
    if (isPolice) {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.04, 0.22, spec.len * 0.7), new THREE.MeshLambertMaterial({ color: 0x2456a8 }));
      stripe.position.y = 0.35 + spec.h / 2;
      g.add(stripe);
    }
    var cabinH = type === 'van' || type === 'truck' ? spec.h * 0.75 : 0.42;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.82, cabinH, spec.len * 0.42), glassMat);
    cabin.position.set(0, 0.35 + spec.h + cabinH / 2 - 0.05, -spec.len * 0.04);
    g.add(cabin);
    // wheels
    var wgeo2 = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10);
    var positions = [
      [-spec.wid / 2, -spec.len / 2 + 0.8], [spec.wid / 2, -spec.len / 2 + 0.8],
      [-spec.wid / 2, spec.len / 2 - 0.8], [spec.wid / 2, spec.len / 2 - 0.8]
    ];
    var wheels = [];
    positions.forEach(function (p) {
      var w = new THREE.Mesh(wgeo2, darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.36, p[1]);
      g.add(w);
      wheels.push(w);
    });
    g.userData.wheels = wheels;
    // headlights + a fake light cone that shows at dusk
    var hlMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    [-spec.wid / 3, spec.wid / 3].forEach(function (x) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hlMat);
      hl.position.set(x, 0.62, -spec.len / 2 - 0.02);
      g.add(hl);
    });
    var coneMat = new THREE.MeshBasicMaterial({ color: 0xffedb5, transparent: true, opacity: 0.0, depthWrite: false });
    var cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 10, 1, true), coneMat);
    cone.rotation.x = Math.PI / 2 + 0.12;
    cone.position.set(0, 0.55, -spec.len / 2 - 4.4);
    g.add(cone);
    g.userData.coneMat = coneMat;

    if (isPolice) {
      var bar = new THREE.Group();
      var base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.4), darkMat);
      bar.add(base);
      var redMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
      var blueMat = new THREE.MeshBasicMaterial({ color: 0x2a5cff });
      var red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.34), redMat);
      red.position.set(-0.3, 0.12, 0);
      bar.add(red);
      var blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.34), blueMat);
      blue.position.set(0.3, 0.12, 0);
      bar.add(blue);
      bar.position.set(0, 0.35 + spec.h + cabinH + 0.02, -spec.len * 0.04);
      g.add(bar);
      g.userData.lightMats = { red: redMat, blue: blueMat };
    }
    return g;
  }

  vehicles.spawn = function (type, x, z, yaw, driver, colorOverride) {
    var spec = TYPES[type];
    var color = colorOverride !== undefined ? colorOverride : spec.colors[(Math.random() * spec.colors.length) | 0];
    var mesh = buildMesh(type, color, driver === 'police');
    mesh.position.set(x, CVH.world.groundY(x, z), z);
    mesh.rotation.y = yaw;
    CVH.world.scene.add(mesh);
    var car = {
      mesh: mesh, type: type, spec: spec,
      x: x, z: z, yaw: yaw, speed: 0,
      driver: driver, health: 100, dead: false,
      tx: x, tz: z, // traffic target
      stuckT: 0, flashT: Math.random() * 6,
      radius: Math.max(spec.len, spec.wid) / 2
    };
    vehicles.all.push(car);
    if (driver === 'traffic') vehicles.traffic.push(car);
    return car;
  };

  vehicles.remove = function (car) {
    var i = vehicles.all.indexOf(car);
    if (i >= 0) vehicles.all.splice(i, 1);
    i = vehicles.traffic.indexOf(car);
    if (i >= 0) vehicles.traffic.splice(i, 1);
    if (CVH.police) CVH.police.removeFromForce(car);
    if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
  };

  vehicles.damage = function (car, amount) {
    if (car.dead) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.speed = 0;
      if (CVH.fx) CVH.fx.smoke(car.x, 1.2, car.z);
      if (CVH.audio) CVH.audio.crash();
    }
  };

  vehicles.repair = function (car) {
    car.health = 100;
    car.dead = false;
  };

  // Arcade drive step: throttle -1..1, steer -1..1 (left positive).
  vehicles.driveStep = function (car, dt, throttle, steer) {
    if (car.dead) { car.speed = 0; syncMesh(car); return; }
    var spec = car.spec;
    if (throttle > 0) car.speed += spec.accel * throttle * dt;
    else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= 26 * dt; // brake
      else car.speed += spec.accel * 0.55 * throttle * dt; // reverse
    } else {
      car.speed -= car.speed * 0.55 * dt; // drag
      if (Math.abs(car.speed) < 0.04) car.speed = 0;
    }
    car.speed = U.clamp(car.speed, -spec.top * 0.4, spec.top);
    if (Math.abs(car.speed) > 0.05) {
      var dirSign = car.speed >= 0 ? 1 : -1;
      car.yaw += steer * spec.grip * dt * dirSign * Math.min(1, Math.abs(car.speed) / 6);
    }
    var f = U.facing(car.yaw);
    car.x += f.x * car.speed * dt;
    car.z += f.z * car.speed * dt;
    collideWorld(car);
    syncMesh(car);
  };

  function collideWorld(car) {
    var fixed = CVH.world.collideCircle(car.x, car.z, car.radius * 0.8);
    if (fixed.x !== car.x || fixed.z !== car.z) {
      car.x = fixed.x; car.z = fixed.z;
      if (Math.abs(car.speed) > 7) {
        vehicles.damage(car, 6);
        if (CVH.audio) CVH.audio.crash();
      }
      car.speed *= 0.45;
    }
    var W = CVH.world.bounds;
    car.x = U.clamp(car.x, W.minX, CVH.world.onPier(car.x, car.z) ? W.maxX : 250);
    car.z = U.clamp(car.z, W.minZ, W.maxZ);
  }

  function syncMesh(car) {
    car.mesh.position.set(car.x, CVH.world.groundY(car.x, car.z), car.z);
    car.mesh.rotation.y = car.yaw;
    var wheels = car.mesh.userData.wheels;
    if (wheels) {
      for (var i = 0; i < wheels.length; i++) wheels[i].rotation.x += car.speed * 0.05;
    }
    var coneMat = car.mesh.userData.coneMat;
    if (coneMat) {
      var t = CVH.world.dayT;
      coneMat.opacity = U.clamp((t - 0.7) / 0.3, 0, 1) * 0.16;
    }
  }
  vehicles.syncMesh = syncMesh;

  // ----------------------------------------------------------------
  // Traffic AI: follow the road grid, right-hand lanes, random turns.
  // ----------------------------------------------------------------
  function laneTarget(car) {
    // pick the next intersection ahead (or a fresh road point)
    var f = U.facing(car.yaw);
    var best = null, bestD = 1e9;
    var xs = CVH.world.streets, zs = CVH.world.avenues;
    var i, cx, cz, dx, dz, d;
    for (i = 0; i < xs.length; i++) for (var j = 0; j < zs.length; j++) {
      cx = xs[i]; cz = zs[j];
      dx = cx - car.x; dz = cz - car.z;
      d = dx * dx + dz * dz;
      if (d < 100) continue;
      var dot = (dx * f.x + dz * f.z) / Math.sqrt(d);
      if (dot > 0.86 && d < bestD) { bestD = d; best = { x: cx, z: cz }; }
    }
    if (!best) {
      var p = CVH.world.randomRoadPoint(Math.random);
      best = { x: p.x, z: p.z };
    }
    car.tx = best.x; car.tz = best.z;
  }

  vehicles.updateTraffic = function (dt, playerPos) {
    for (var i = 0; i < vehicles.traffic.length; i++) {
      var car = vehicles.traffic[i];
      if (car.dead || car.driver !== 'traffic') continue;
      var dx = car.tx - car.x, dz = car.tz - car.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 6) laneTarget(car);
      var want = U.headingOf(dx, dz);
      var diff = U.angDiff(want, car.yaw);
      var steer = U.clamp(diff * 1.6, -1, 1);
      // slow for the car ahead
      var throttle = 0.55;
      var f = U.facing(car.yaw);
      for (var j = 0; j < vehicles.all.length; j++) {
        var o = vehicles.all[j];
        if (o === car) continue;
        var ox = o.x - car.x, oz = o.z - car.z;
        var od = Math.sqrt(ox * ox + oz * oz);
        if (od < 7 && ox * f.x + oz * f.z > 0) { throttle = 0; break; }
      }
      vehicles.driveStep(car, dt, throttle, steer);
      // recycle strays that wandered too far from the player
      if (U.dist(car.x, car.z, playerPos.x, playerPos.z) > 230) {
        var p = CVH.world.randomRoadPoint(Math.random);
        car.x = U.clamp(playerPos.x + (p.x - playerPos.x), -240, 240);
        car.z = U.clamp(playerPos.z + (p.z - playerPos.z), -240, 240);
        car.yaw = Math.random() < 0.5 ? Math.PI / 2 : 0;
        laneTarget(car);
        syncMesh(car);
      }
    }
  };

  // Seed the city with parked cars + moving traffic.
  vehicles.seedCity = function (scene) {
    var rng = CVH.makeRng(99);
    var parkedSpots = [
      ['sedan', 30, 47.5], ['coupe', -52, -47.5], ['van', 90, 113], ['sedan', -160, 33],
      ['truck', 150, -33], ['moto', 16, -47], ['sedan', -90, -113], ['coupe', 210, 47],
      ['van', -214, 120], ['sedan', 60, 207], ['moto', -30, 193], ['truck', -190, -207]
    ];
    parkedSpots.forEach(function (s) {
      vehicles.spawn(s[0], s[1], s[2], Math.PI / 2, 'parked');
    });
    for (var i = 0; i < 10; i++) {
      var p = CVH.world.randomRoadPoint(rng);
      var type = TYPE_NAMES[(rng() * TYPE_NAMES.length) | 0];
      var car = vehicles.spawn(type, U.clamp(p.x, -235, 235), U.clamp(p.z, -235, 235), rng() < 0.5 ? -Math.PI / 2 : Math.PI, 'traffic');
      laneTarget(car);
    }
  };

  CVH.vehicles = vehicles;
})();
