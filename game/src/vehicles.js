// vehicles.js — low-poly car factory, traffic AI, arcade driving, pedestrians.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;

  var TYPES = {
    sedan:  { len: 4.2, wid: 1.9, h: 0.85, top: 24, accel: 9,  colors: [0xb8452e, 0x2e6db8, 0xc0c4cc, 0x3a3f45, 0x7a4fa3, 0x2e8f6d] },
    coupe:  { len: 4.0, wid: 1.85, h: 0.7, top: 31, accel: 13, colors: [0xe0a52e, 0xd23b3b, 0x22242a, 0x2ee0c8] },
    taxi:   { len: 4.2, wid: 1.9, h: 0.85, top: 24, accel: 9,  colors: [0xf2b21b] },
    van:    { len: 4.8, wid: 2.0, h: 1.5, top: 19, accel: 7,  colors: [0xd8d8d8, 0x708090, 0x4a6741] },
    moto:   { len: 2.2, wid: 0.7, h: 0.6, top: 33, accel: 15, colors: [0x222222, 0xb82e2e, 0x2e4fb8] },
    police: { len: 4.3, wid: 1.95, h: 0.85, top: 30, accel: 12, colors: [0xf0f0f0] }
  };

  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }
  var wheelMat = mat(0x181818);
  var glassMat = mat(0x1c2a38);

  function buildMesh(type, color) {
    var t = TYPES[type];
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(t.wid, t.h, t.len), mat(color));
    body.position.y = 0.45 + t.h / 2;
    g.add(body);
    if (type === 'moto') {
      var rider = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.5), mat(0x33415e));
      rider.position.set(0, 1.35, -0.1); g.add(rider);
      var w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.12, 10), wheelMat);
      w1.rotation.z = Math.PI / 2; w1.position.set(0, 0.36, 0.85); g.add(w1);
      var w2 = w1.clone(); w2.position.z = -0.85; g.add(w2);
      return g;
    }
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.82, t.h * 0.75, t.len * 0.45), glassMat);
    cabin.position.set(0, 0.45 + t.h + t.h * 0.35, -t.len * 0.04);
    g.add(cabin);
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 10);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (s) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(s[0] * (t.wid / 2), 0.36, s[1] * (t.len / 2 - 0.7));
      g.add(w);
    });
    if (type === 'police') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      bar.position.set(0, 0.45 + t.h + t.h * 0.75 + 0.12, -t.len * 0.04);
      bar.name = 'lightbar';
      g.add(bar);
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(t.wid + 0.04, 0.3, t.len * 0.9), mat(0x22335c));
      stripe.position.y = 0.75; g.add(stripe);
    }
    if (type === 'taxi') {
      var signMesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffe14d }));
      signMesh.position.set(0, 0.45 + t.h + t.h * 0.75 + 0.1, -t.len * 0.04);
      g.add(signMesh);
    }
    // headlights (visible at dusk)
    var hl = new THREE.Mesh(new THREE.BoxGeometry(t.wid * 0.7, 0.16, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    hl.position.set(0, 0.72, t.len / 2 + 0.02);
    g.add(hl);
    return g;
  }

  var cars = [];
  var rng = U.makeRng(4242);

  function spawnCar(type, x, z, heading, driver, color) {
    var t = TYPES[type];
    var c = color !== undefined ? color : t.colors[Math.floor(rng() * t.colors.length)];
    var mesh = buildMesh(type, c);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    W.scene.add(mesh);
    var car = {
      type: type, mesh: mesh, x: x, z: z, heading: heading,
      speed: 0, driver: driver || 'parked', color: c,
      hp: 100, dead: false, isMissionCar: false, flashT: 0,
      lane: null
    };
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    var i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    if (car.mesh && car.mesh.parent) car.mesh.parent.remove(car.mesh);
  }

  // lane assignment for traffic: axis 'V' travels along z on avenue line x;
  // dir +1 => heading 0 (forward +z), lane offset -3.5 (right-hand traffic);
  // dir -1 => heading PI, lane offset +3.5. 'H' travels along x on street z.
  function assignLane(car, axis, line, dir) {
    car.lane = { axis: axis, line: line, dir: dir };
    if (axis === 'V') {
      car.x = line + (dir > 0 ? -3.5 : 3.5);
      car.heading = dir > 0 ? 0 : Math.PI;
    } else {
      car.z = line + (dir > 0 ? 3.5 : -3.5);
      car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }
  function randomLane(car, nearX, nearZ) {
    var axis = rng() < 0.5 ? 'V' : 'H';
    var lines = axis === 'V' ? W.VX : W.HZ;
    var line = lines[Math.floor(rng() * lines.length)];
    var dir = rng() < 0.5 ? 1 : -1;
    assignLane(car, axis, line, dir);
    // position along the road: biased near (nearX, nearZ) but not on top of it
    var along = (axis === 'V' ? nearZ : nearX) + (rng() < 0.5 ? -1 : 1) * (60 + rng() * 120);
    along = U.clamp(along, -250, 250);
    if (axis === 'V') car.z = along; else car.x = along;
  }

  function syncMesh(car) {
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    if (car.type === 'police') {
      var bar = car.mesh.getObjectByName('lightbar');
      if (bar) {
        car.flashT += 0.12;
        bar.material.color.setHex(Math.sin(car.flashT * 14) > 0 ? 0xff4444 : 0x4444ff);
      }
    }
  }

  // generic arcade drive step shared by player + police AI
  function driveStep(car, throttle, steer, dt) {
    var t = TYPES[car.type];
    if (car.dead) { car.speed = 0; return; }
    var target = throttle > 0 ? t.top : (throttle < 0 ? -8 : 0);
    var rate = throttle !== 0 ? t.accel : 10;
    if (car.speed < target) car.speed = Math.min(target, car.speed + rate * dt);
    else if (car.speed > target) car.speed = Math.max(target, car.speed - rate * 1.6 * dt);
    if (Math.abs(car.speed) > 0.05) {
      car.heading += steer * dt * 1.7 * (car.speed >= 0 ? 1 : -1) * U.clamp(Math.abs(car.speed) / 6, 0.25, 1);
    }
    var f = U.fwd(car.heading);
    car.x += f.x * car.speed * dt;
    car.z += f.z * car.speed * dt;
    var c = W.collide(car.x, car.z, 1.5);
    if (c.x !== car.x || c.z !== car.z) car.speed *= 0.55;
    car.x = U.clamp(c.x, W.BOUNDS.minX + 2, W.BOUNDS.maxX - 2);
    car.z = U.clamp(c.z, W.BOUNDS.minZ + 2, W.BOUNDS.maxZ - 2);
    if (!W.isOnLand(car.x, car.z)) { // water: stop at the shore
      car.x = Math.min(car.x, W.WATER_X - 1);
      car.speed = 0;
    }
    syncMesh(car);
  }

  function damage(car, amount) {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.dead = true;
      car.speed = 0;
      car.mesh.traverse(function (o) {
        if (o.material && o.material.color && o.name !== 'lightbar') o.material = o.material.clone(), o.material.color.multiplyScalar(0.35);
      });
    }
  }

  function nearestCar(x, z, maxDist) {
    var best = null, bd = maxDist;
    cars.forEach(function (c) {
      if (c.dead) return;
      var d = U.dist(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  // ---------- traffic ----------
  var TRAFFIC_TYPES = ['sedan', 'sedan', 'coupe', 'taxi', 'van', 'moto'];
  function initTraffic(px, pz) {
    for (var i = 0; i < 13; i++) {
      var type = TRAFFIC_TYPES[Math.floor(rng() * TRAFFIC_TYPES.length)];
      var car = spawnCar(type, 0, 0, 0, 'traffic');
      randomLane(car, px, pz);
      car.speed = 8 + rng() * 3;
      syncMesh(car);
    }
    // parked cars at curbs
    var spots = [[-46.5, -80], [53.5, 60], [-103.5, 120], [146.5, -30], [3.5, -170],
      [-153.5, -120], [196.5, 90], [-46.5, 170], [103.5, -60], [-196.5, 30],
      [53.5, -190], [-3.5, 90], [156.5, 180], [-106.5, -190]];
    spots.forEach(function (s, i2) {
      var type = TRAFFIC_TYPES[i2 % TRAFFIC_TYPES.length];
      var car = spawnCar(type, s[0], s[1], rng() < 0.5 ? 0 : Math.PI, 'parked');
      syncMesh(car);
    });
  }

  function updateTraffic(dt, px, pz) {
    cars.forEach(function (car) {
      if (car.driver !== 'traffic' || !car.lane || car.dead) return;
      var L = car.lane;
      // slow for a vehicle ahead in the same lane
      var ahead = false;
      cars.forEach(function (o) {
        if (o === car || o.dead) return;
        var dx = o.x - car.x, dz = o.z - car.z;
        var f = U.fwd(car.heading);
        var along = dx * f.x + dz * f.z;
        var side = Math.abs(dx * -f.z + dz * f.x);
        if (along > 0 && along < 10 && side < 2.2) ahead = true;
      });
      var target = ahead ? 0 : 9.5;
      car.speed += U.clamp(target - car.speed, -14 * dt, 5 * dt);
      var f2 = U.fwd(car.heading);
      car.x += f2.x * car.speed * dt;
      car.z += f2.z * car.speed * dt;
      // intersection turn / straighten onto lane line
      if (L.axis === 'V') {
        car.x += ( (L.line + (L.dir > 0 ? -3.5 : 3.5)) - car.x) * Math.min(1, dt * 3);
        for (var i = 0; i < W.HZ.length; i++) {
          if (Math.abs(car.z - W.HZ[i]) < 1.6 && rng() < 0.35) {
            assignLane(car, 'H', W.HZ[i], rng() < 0.5 ? 1 : -1);
            car.z = W.HZ[i] + (car.lane.dir > 0 ? 3.5 : -3.5);
            break;
          }
        }
      } else {
        car.z += ( (L.line + (L.dir > 0 ? 3.5 : -3.5)) - car.z) * Math.min(1, dt * 3);
        for (var j = 0; j < W.VX.length; j++) {
          if (Math.abs(car.x - W.VX[j]) < 1.6 && rng() < 0.35) {
            assignLane(car, 'V', W.VX[j], rng() < 0.5 ? 1 : -1);
            car.x = W.VX[j] + (car.lane.dir > 0 ? -3.5 : 3.5);
            break;
          }
        }
      }
      if (!W.inBounds(car.x, car.z) || U.dist(car.x, car.z, px, pz) > 330) {
        randomLane(car, px, pz);
      }
      syncMesh(car);
    });
  }

  // ---------- pedestrians ----------
  var peds = [];
  var pedWaypoints = [];
  function buildPedMesh(color) {
    var g = new THREE.Group();
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), mat(0x2c2c34));
    legL.position.set(-0.14, 0.4, 0); legL.name = 'legL'; g.add(legL);
    var legR = legL.clone(); legR.position.x = 0.14; legR.name = 'legR'; g.add(legR);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), mat(color));
    torso.position.y = 1.18; g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), mat(0xd9a877));
    head.position.y = 1.78; g.add(head);
    return g;
  }
  function initPeds() {
    W.VX.forEach(function (x) {
      for (var z = -250; z <= 250; z += 25) { pedWaypoints.push({ x: x - 10.5, z: z }); pedWaypoints.push({ x: x + 10.5, z: z }); }
    });
    W.HZ.forEach(function (z) {
      for (var x = -250; x <= 250; x += 25) { pedWaypoints.push({ x: x, z: z - 10.5 }); pedWaypoints.push({ x: x, z: z + 10.5 }); }
    });
    var colors = [0xc45a7a, 0x5a7ac4, 0x7ac45a, 0xc4a35a, 0x9a5ac4, 0x5ac4b8, 0xd97b2e, 0x8a8f99];
    for (var i = 0; i < 40; i++) {
      var wp = pedWaypoints[Math.floor(rng() * pedWaypoints.length)];
      var mesh = buildPedMesh(colors[i % colors.length]);
      mesh.position.set(wp.x, 0, wp.z);
      W.scene.add(mesh);
      peds.push({
        mesh: mesh, x: wp.x, z: wp.z, heading: rng() * Math.PI * 2,
        tx: wp.x, tz: wp.z, speed: 1.4 + rng() * 0.7, walkPhase: rng() * 6,
        fleeT: 0, visible: true, isPassenger: false
      });
    }
  }
  function pickTarget(p, px, pz) {
    var best = null, bd = 1e9;
    for (var i = 0; i < 12; i++) {
      var wp = pedWaypoints[Math.floor(rng() * pedWaypoints.length)];
      var d = U.dist(p.x, p.z, wp.x, wp.z);
      if (d > 15 && d < 110 && d < bd) { bd = d; best = wp; }
    }
    if (best) { p.tx = best.x; p.tz = best.z; }
  }
  function updatePeds(dt, px, pz, threat) {
    peds.forEach(function (p) {
      if (!p.visible) return;
      var dPlayer = U.dist(p.x, p.z, px, pz);
      if (dPlayer > 280) { // recycle near the player
        var wp = pedWaypoints[Math.floor(rng() * pedWaypoints.length)];
        p.x = U.clamp(wp.x + (px - wp.x) * 0.4, -255, 250);
        p.z = U.clamp(wp.z + (pz - wp.z) * 0.4, -255, 255);
        pickTarget(p, px, pz);
      }
      var fleeing = false;
      if (threat && threat.active && U.dist(p.x, p.z, threat.x, threat.z) < 16) p.fleeT = 2.5;
      if (p.fleeT > 0) {
        p.fleeT -= dt;
        fleeing = true;
        var fx = p.x - (threat ? threat.x : px), fz = p.z - (threat ? threat.z : pz);
        var fl = Math.sqrt(fx * fx + fz * fz) || 1;
        p.tx = p.x + fx / fl * 18; p.tz = p.z + fz / fl * 18;
      }
      var dx = p.tx - p.x, dz = p.tz - p.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.2) { if (!fleeing) pickTarget(p, px, pz); }
      else {
        var sp = fleeing ? 4.6 : p.speed;
        p.heading = Math.atan2(dx, dz);
        p.x += dx / d * sp * dt;
        p.z += dz / d * sp * dt;
        var c = W.collide(p.x, p.z, 0.5);
        p.x = c.x; p.z = c.z;
        if (!W.isOnLand(p.x, p.z)) p.x = Math.min(p.x, W.SAND_X + 20);
        p.walkPhase += dt * (fleeing ? 13 : 8);
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      var legL = p.mesh.getObjectByName('legL');
      var legR = p.mesh.getObjectByName('legR');
      if (legL && legR) {
        legL.rotation.x = Math.sin(p.walkPhase) * 0.55;
        legR.rotation.x = -Math.sin(p.walkPhase) * 0.55;
      }
    });
  }

  CVH.vehicles = {
    TYPES: TYPES, cars: cars,
    spawnCar: spawnCar, removeCar: removeCar,
    driveStep: driveStep, damage: damage, nearestCar: nearestCar,
    syncMesh: syncMesh, initTraffic: initTraffic, updateTraffic: updateTraffic,
    randomLane: randomLane
  };
  CVH.peds = {
    list: peds, init: initPeds, update: updatePeds
  };
})();
