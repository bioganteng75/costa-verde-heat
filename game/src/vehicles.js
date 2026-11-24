// vehicles.js — every car in Costa Verde: six low-poly types built from
// boxes/cylinders, one shared arcade integrator, lane-following traffic
// AI with obstacle braking and a gridlock breaker, parked cars to steal,
// and the player-driving feel (drift handbrake included). Police and
// missions steer their cars by writing car.input; this module owns the
// physics, collisions and visuals. Owns CVH.vehicles and CVH.cars.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};
  var THREE = window.THREE;

  var cars = CVH.cars = [];
  var coneMat = null;      // shared by every headlight cone (dusk-driven)
  var rng = null;

  var TYPES = {
    sedan:  { len: 4.2, wid: 1.8, bodyH: 0.62, bodyY: 0.58, cabLen: 2.0, cabH: 0.52, wheel: 0.34, top: 26, accel: 15, colors: [0xb8452e, 0x2e6db8, 0xd8d3c8, 0x3f9e58, 0x7456a8, 0xc7c9cc] },
    sport:  { len: 4.3, wid: 1.85, bodyH: 0.5, bodyY: 0.5, cabLen: 1.7, cabH: 0.44, wheel: 0.35, top: 37, accel: 24, colors: [0xe03a2e, 0xf28c28, 0x22242a, 0x2ec4b8] },
    taxi:   { len: 4.2, wid: 1.8, bodyH: 0.62, bodyY: 0.58, cabLen: 2.0, cabH: 0.52, wheel: 0.34, top: 25, accel: 15, colors: [0xf2b134] },
    moto:   { len: 2.2, wid: 0.55, bodyH: 0.34, bodyY: 0.55, cabLen: 0, cabH: 0, wheel: 0.31, top: 34, accel: 26, colors: [0x22242a, 0xb82e3a, 0x2e6db8] },
    truck:  { len: 6.6, wid: 2.3, bodyH: 1.5, bodyY: 1.15, cabLen: 1.6, cabH: 0.9, wheel: 0.46, top: 20, accel: 10, colors: [0x8a8f96, 0x4a7a9e, 0xa8542e] },
    police: { len: 4.3, wid: 1.85, bodyH: 0.62, bodyY: 0.58, cabLen: 2.0, cabH: 0.52, wheel: 0.34, top: 32, accel: 21, colors: [0x1c2f4a] }
  };

  function coneTexture() {
    var c = document.createElement('canvas');
    c.width = 16; c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,240,200,0.85)');
    grad.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 16, 64);
    return new THREE.CanvasTexture(c);
  }

  var glassMat = null, tyreMat = null, chromeMat = null;

  function buildMesh(type, color) {
    var T = TYPES[type];
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshLambertMaterial({ color: color });
    var body = new THREE.Mesh(CVH._unitBox, bodyMat);
    body.scale.set(T.wid, T.bodyH, T.len);
    body.position.y = T.bodyY;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    if (type === 'truck') {
      var cargo = new THREE.Mesh(CVH._unitBox, new THREE.MeshLambertMaterial({ color: 0xdcd8d0 }));
      cargo.scale.set(2.2, 2.0, 4.2);
      cargo.position.set(0, 1.55, -1.0);
      cargo.castShadow = true;
      g.add(cargo);
      var cab = new THREE.Mesh(CVH._unitBox, bodyMat);
      cab.scale.set(2.2, 0.95, 1.5);
      cab.position.set(0, 0.95, 2.45);
      cab.castShadow = true;
      g.add(cab);
    } else if (type === 'moto') {
      var tank = new THREE.Mesh(CVH._unitBox, bodyMat);
      tank.scale.set(0.34, 0.3, 1.0);
      tank.position.set(0, 0.72, 0.25);
      g.add(tank);
      // rider: torso, head, legs — leans with steering (player.js poses
      // the player separately; this rider is for traffic/parked motos)
      var rider = new THREE.Group();
      var torso = new THREE.Mesh(CVH._unitBox, new THREE.MeshLambertMaterial({ color: 0x35424e }));
      torso.scale.set(0.44, 0.62, 0.26);
      torso.position.y = 0.35;
      rider.add(torso);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
      head.position.y = 0.85;
      rider.add(head);
      rider.position.set(0, 0.95, -0.15);
      rider.rotation.x = 0.25;
      g.add(rider);
      g.userData.rider = rider;
    } else {
      var cabMat = type === 'police' ? new THREE.MeshLambertMaterial({ color: 0xf0f2f4 }) : glassMat;
      var cab = new THREE.Mesh(CVH._unitBox, cabMat);
      cab.scale.set(T.wid - 0.25, T.cabH, T.cabLen);
      cab.position.set(0, T.bodyY + T.bodyH / 2 + T.cabH / 2 - 0.04, -0.15);
      cab.castShadow = true;
      g.add(cab);
      if (type === 'taxi') {
        var sign = new THREE.Mesh(CVH._unitBox, new THREE.MeshLambertMaterial({ color: 0xfff6c8, emissive: new THREE.Color(0xffdf7a), emissiveIntensity: 0.4 }));
        sign.scale.set(0.7, 0.18, 0.3);
        sign.position.set(0, cab.position.y + T.cabH / 2 + 0.1, -0.15);
        g.add(sign);
      }
    }

    // wheels — front pair sits in steer pivots
    var wheelGeo = new THREE.CylinderGeometry(T.wheel, T.wheel, 0.24, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    var wheels = [], pivots = [];
    var wx = T.wid / 2 - 0.05, wz = T.len / 2 - 0.75;
    var spots = [[-wx, wz, true], [wx, wz, true], [-wx, -wz, false], [wx, -wz, false]];
    for (var i = 0; i < 4; i++) {
      var pivot = new THREE.Group();
      pivot.position.set(spots[i][0], T.wheel, spots[i][1]);
      var wm = new THREE.Mesh(wheelGeo, tyreMat);
      wm.castShadow = true;
      pivot.add(wm);
      g.add(pivot);
      wheels.push(wm);
      if (spots[i][2]) pivots.push(pivot);
    }

    // brake lights (own material so braking can flare them)
    var brakeMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: new THREE.Color(0xff2222), emissiveIntensity: 0.35 });
    if (type !== 'moto') {
      [-1, 1].forEach(function (s) {
        var bl = new THREE.Mesh(CVH._unitBox, brakeMat);
        bl.scale.set(0.34, 0.14, 0.06);
        bl.position.set(s * (T.wid / 2 - 0.3), T.bodyY + 0.12, -T.len / 2 - 0.02);
        g.add(bl);
      });
    }

    // headlight cones: apex at the lamp, soft gradient to the base
    var cones = [];
    if (type !== 'moto') {
      [-1, 1].forEach(function (s) {
        var cg = new THREE.ConeGeometry(1.35, 9, 12, 1, true);
        cg.rotateX(-Math.PI / 2);
        cg.translate(0, 0, 4.5);
        var cone = new THREE.Mesh(cg, coneMat);
        cone.position.set(s * (T.wid / 2 - 0.35), 0.55, T.len / 2);
        cone.renderOrder = 4;
        g.add(cone);
        cones.push(cone);
      });
    }

    // police light bar with independently flashing halves
    var barMats = null;
    if (type === 'police') {
      var barBase = new THREE.Mesh(CVH._unitBox, chromeMat);
      barBase.scale.set(1.2, 0.09, 0.34);
      barBase.position.set(0, cab.position.y + T.cabH / 2 + 0.06, -0.15);
      g.add(barBase);
      var redMat = new THREE.MeshLambertMaterial({ color: 0x550000, emissive: new THREE.Color(0xff2020), emissiveIntensity: 0.2 });
      var blueMat = new THREE.MeshLambertMaterial({ color: 0x000055, emissive: new THREE.Color(0x2266ff), emissiveIntensity: 0.2 });
      var rl = new THREE.Mesh(CVH._unitBox, redMat);
      rl.scale.set(0.55, 0.16, 0.3); rl.position.set(-0.3, barBase.position.y + 0.12, -0.15);
      g.add(rl);
      var bl2 = new THREE.Mesh(CVH._unitBox, blueMat);
      bl2.scale.set(0.55, 0.16, 0.3); bl2.position.set(0.3, barBase.position.y + 0.12, -0.15);
      g.add(bl2);
      barMats = [redMat, blueMat];
    }
    return { group: g, wheels: wheels, pivots: pivots, brakeMat: brakeMat, barMats: barMats, bodyMat: bodyMat };
  }

  // ---------------------------------------------------------------- cars
  var vehicles = CVH.vehicles = {};

  vehicles.makeCar = function (type, x, z, yaw, opts) {
    opts = opts || {};
    if (!glassMat) {
      glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2733 });
      tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
      chromeMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ab });
      coneMat = new THREE.MeshBasicMaterial({
        map: coneTexture(), transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
      });
    }
    var T = TYPES[type];
    var color = opts.color !== undefined ? opts.color : T.colors[Math.floor((rng || Math.random)() * T.colors.length) % T.colors.length];
    var built = buildMesh(type, color);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = yaw;
    CVH.scene.add(built.group);
    var car = {
      mesh: built.group, type: type, color: color,
      yaw: yaw, speed: 0, steerVis: 0, wheelSpin: 0,
      driver: opts.driver || 'parked', // parked | traffic | police | player | wreck
      hp: 100, dead: false, radius: type === 'moto' ? 0.9 : (type === 'truck' ? 2.3 : 1.55),
      topSpeed: T.top, accel: T.accel,
      input: { throttle: 0, steer: 0, brake: false },
      wheels: built.wheels, pivots: built.pivots, brakeMat: built.brakeMat, barMats: built.barMats,
      axis: null, dir: 1, lane: 0, cruise: 10, stuckT: 0, turnCd: 0, turning: null,
      smokeT: Math.random() * 0.2, crashCd: 0, mission: !!opts.mission,
      pos: built.group.position
    };
    built.group.children[0].userData.car = car; // raycast back-reference
    cars.push(car);
    return car;
  };

  vehicles.removeCar = function (car) {
    var i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    CVH.scene.remove(car.mesh);
  };

  vehicles.nearestCar = function (x, z, maxDist, pred) {
    var best = null, bd = maxDist * maxDist;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (pred && !pred(c)) continue;
      var d = CVH.dist2(x, z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  // Lane offset for right-hand traffic given the road axis and direction:
  // avenue (travel along z): facing +z, the right-hand lane is at -x.
  // street (travel along x): facing +x, the right-hand lane is at +z.
  function laneFor(axis, dir) {
    if (axis === 'z') return dir > 0 ? -3.6 : 3.6;
    return dir > 0 ? 3.6 : -3.6;
  }

  function placeOnRoad(car, focus, minD, maxD) {
    var W = CVH.WORLD;
    for (var tries = 0; tries < 24; tries++) {
      var axis = rng() < 0.5 ? 'z' : 'x';
      var dir = rng() < 0.5 ? 1 : -1;
      var road = axis === 'z' ? W.ROAD_XS[Math.floor(rng() * W.ROAD_XS.length)] : W.ROAD_ZS[Math.floor(rng() * W.ROAD_ZS.length)];
      var along = CVH.randRange(rng, -195, 195);
      var x = axis === 'z' ? road + laneFor(axis, dir) : along;
      var z = axis === 'z' ? along : road + laneFor(axis, dir);
      var d = CVH.dist(x, z, focus.x, focus.z);
      if (d < minD || d > maxD) continue;
      car.axis = axis; car.dir = dir;
      car.lane = road + laneFor(axis, dir);
      car.pos.x = x; car.pos.z = z;
      car.yaw = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      car.speed = 0;
      car.turning = null;
      return true;
    }
    return false;
  }

  // Take a car that was doing something else (e.g. a police cruiser whose
  // heat just died — QA item 4) and fold it into ordinary traffic.
  vehicles.adoptAsTraffic = function (car) {
    var W = CVH.WORLD;
    var bx = W.ROAD_XS[0], bz = W.ROAD_ZS[0], bdx = 1e9, bdz = 1e9, i;
    for (i = 0; i < W.ROAD_XS.length; i++) { var dx = Math.abs(car.pos.x - W.ROAD_XS[i]); if (dx < bdx) { bdx = dx; bx = W.ROAD_XS[i]; } }
    for (i = 0; i < W.ROAD_ZS.length; i++) { var dz = Math.abs(car.pos.z - W.ROAD_ZS[i]); if (dz < bdz) { bdz = dz; bz = W.ROAD_ZS[i]; } }
    var fwd = CVH.headingVec(car.yaw, CVH._v1);
    if (bdx <= bdz) {
      car.axis = 'z'; car.dir = fwd.z >= 0 ? 1 : -1; car.lane = bx + laneFor('z', car.dir);
    } else {
      car.axis = 'x'; car.dir = fwd.x >= 0 ? 1 : -1; car.lane = bz + laneFor('x', car.dir);
    }
    car.driver = 'traffic';
    car.cruise = 9 + rng() * 4;
    car.turning = null;
  };

  vehicles.spawnInitial = function () {
    rng = CVH.makeRng(CVH.seed * 31 + 7);
    var focus = CVH.points.spawn;
    var types = ['sedan', 'sedan', 'sport', 'taxi', 'sedan', 'moto', 'sedan', 'truck', 'sedan', 'taxi', 'sport', 'sedan', 'moto'];
    for (var i = 0; i < types.length; i++) {
      var c = vehicles.makeCar(types[i], 0, 0, 0, { driver: 'traffic' });
      c.cruise = 8.5 + rng() * 4.5;
      placeOnRoad(c, focus, 45, 170);
    }
    // parked cars along the avenue kerbs — stealable stock for the player
    var spots = [
      [8.2, -34], [-68.2, 52], [51.8, -64], [111.8, 128], [-111.8, -118],
      [171.8, 66], [-171.8, -156], [8.2, 156], [-51.8, 22], [119.8, -24]
    ];
    var ptypes = ['sedan', 'sport', 'sedan', 'sedan', 'truck', 'sedan', 'moto', 'sport', 'sedan', 'sedan'];
    for (i = 0; i < spots.length; i++) {
      vehicles.makeCar(ptypes[i], spots[i][0], spots[i][1], 0, { driver: 'parked' });
    }
  };

  // ------------------------------------------------------------- physics
  function damage(car, amount) {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.hp = 0;
      car.dead = true;
      if (car.driver === 'traffic') car.driver = 'wreck';
      CVH.fx.smoke(car.pos.x, 1.2, car.pos.z, true, 6);
    }
  }
  vehicles.damage = damage;

  function integrate(car, dt) {
    var inp = car.input;
    if (car.dead) { inp.throttle = 0; inp.brake = true; }
    var target = inp.throttle >= 0 ? inp.throttle * car.topSpeed : inp.throttle * 9;
    if (inp.brake) target = 0;
    var rate;
    if (inp.brake) rate = 34;
    else if (Math.abs(target) > Math.abs(car.speed)) rate = car.accel;
    else rate = car.accel * 1.7;
    if (car.speed < target) car.speed = Math.min(target, car.speed + rate * dt);
    else car.speed = Math.max(target, car.speed - rate * dt);

    var sf = CVH.clamp(car.speed / 5, -1, 1);
    if (Math.abs(car.speed) > 0.25) {
      var steerRate = 1.85 * (inp.drift ? 1.55 : 1);
      car.yaw += inp.steer * steerRate * dt * sf;
    }
    car.steerVis = CVH.lerp(car.steerVis, inp.steer * 0.42, Math.min(1, dt * 10));

    var fwd = CVH.headingVec(car.yaw, CVH._v1);
    car.pos.x += fwd.x * car.speed * dt;
    car.pos.z += fwd.z * car.speed * dt;

    // building / world collision for the cars that leave the road network
    if (car.driver === 'player' || car.driver === 'police') {
      var before = car.speed;
      var hit = CVH.world.collide(car.pos, car.radius * 0.72);
      if (hit && Math.abs(before) > 6.5 && car.crashCd <= 0) {
        car.crashCd = 0.35;
        damage(car, Math.abs(before) * 1.1);
        CVH.fx.sparks(car.pos.x + fwd.x * 2, 0.7, car.pos.z + fwd.z * 2, 10);
        if (car.driver === 'player') {
          CVH.fx.addShake(0.35);
          CVH.audio.crash(Math.abs(before) > 13);
        } else {
          CVH.audio.crash(false);
        }
        car.speed = before * 0.3;
      } else if (hit) {
        car.speed *= 0.6;
      }
    }
    car.crashCd = Math.max(0, car.crashCd - dt);

    // visuals
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.yaw;
    if (car.type === 'moto') car.mesh.rotation.z = -car.steerVis * 0.5;
    car.wheelSpin += car.speed * dt / 0.34;
    for (var i = 0; i < car.wheels.length; i++) car.wheels[i].rotation.x = car.wheelSpin;
    for (i = 0; i < car.pivots.length; i++) car.pivots[i].rotation.y = car.steerVis;
    var braking = inp.brake || (inp.throttle < -0.05 && car.speed > 0.5) || (Math.abs(inp.throttle) < 0.05 && car.speed > 2);
    car.brakeMat.emissiveIntensity = braking ? 2.2 : 0.35;
    if (car.barMats) {
      var ph = Math.sin(CVH.time * 11 + car.pos.x);
      car.barMats[0].emissiveIntensity = ph > 0 ? 3.2 : 0.15;
      car.barMats[1].emissiveIntensity = ph > 0 ? 0.15 : 3.2;
    }
    if (car.dead) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = 0.14;
        CVH.fx.smoke(car.pos.x, 1.1, car.pos.z, true, 1);
      }
    }
  }

  // car-vs-car: soft push-apart with damage on hard hits
  function collideCars(focus) {
    for (var i = 0; i < cars.length; i++) {
      var a = cars[i];
      if (a.driver === 'parked' || a.driver === 'wreck') { /* still an obstacle */ }
      for (var j = i + 1; j < cars.length; j++) {
        var b = cars[j];
        var rr = a.radius + b.radius;
        var d2 = CVH.dist2(a.pos.x, a.pos.z, b.pos.x, b.pos.z);
        if (d2 > rr * rr || d2 === 0) continue;
        var d = Math.sqrt(d2);
        var nx = (b.pos.x - a.pos.x) / d, nz = (b.pos.z - a.pos.z) / d;
        var push = (rr - d) / 2 + 0.02;
        var aMovable = a.driver !== 'parked' && a.driver !== 'wreck';
        var bMovable = b.driver !== 'parked' && b.driver !== 'wreck';
        if (aMovable) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
        if (bMovable) { b.pos.x += nx * push; b.pos.z += nz * push; }
        var rel = Math.abs(a.speed - b.speed);
        if (rel > 5) {
          damage(a, rel * 0.8);
          damage(b, rel * 0.8);
          CVH.fx.sparks((a.pos.x + b.pos.x) / 2, 0.7, (a.pos.z + b.pos.z) / 2, 8);
          if (a.driver === 'player' || b.driver === 'player') {
            CVH.fx.addShake(0.3);
            CVH.audio.crash(rel > 11);
            var other = a.driver === 'player' ? b : a;
            if (CVH.police) {
              if (other.type === 'police' && other.driver === 'police') CVH.police.reportCrime(a.pos.x, a.pos.z, 55, true);
              else CVH.police.reportCrime(a.pos.x, a.pos.z, 22, false);
            }
          }
          a.speed *= 0.55; b.speed *= 0.55;
        }
      }
    }
  }

  // --------------------------------------------------------- traffic AI
  function trafficThink(car, dt, focus) {
    var inp = car.input;
    if (car.dead) { inp.throttle = 0; inp.brake = true; return; }

    // recycle far-away traffic so the player's streets stay populated
    var dFocus = CVH.dist(car.pos.x, car.pos.z, focus.x, focus.z);
    if (dFocus > 200) { placeOnRoad(car, focus, 80, 140); return; }

    // obstacle scan: anything (car or pedestrian) close ahead in my lane
    var fwd = CVH.headingVec(car.yaw, CVH._v1);
    var blocked = false, slowAhead = false;
    var k, o;
    for (k = 0; k < cars.length; k++) {
      o = cars[k];
      if (o === car) continue;
      var rx = o.pos.x - car.pos.x, rz = o.pos.z - car.pos.z;
      var ahead = rx * fwd.x + rz * fwd.z;
      var lat = Math.abs(rx * fwd.z - rz * fwd.x);
      if (ahead > 0 && ahead < 10 && lat < 2.1) { blocked = true; break; }
      if (ahead >= 10 && ahead < 17 && lat < 2.1) slowAhead = true;
    }
    if (!blocked && CVH.peds) {
      for (k = 0; k < CVH.peds.length; k++) {
        var p = CVH.peds[k];
        if (p.state === 'down') continue;
        var prx = p.x - car.pos.x, prz = p.z - car.pos.z;
        var pa = prx * fwd.x + prz * fwd.z;
        var pl = Math.abs(prx * fwd.z - prz * fwd.x);
        if (pa > 0 && pa < 6.5 && pl < 1.6) { blocked = true; break; }
      }
    }

    var desired = blocked ? 0 : (slowAhead ? car.cruise * 0.45 : car.cruise);
    inp.brake = desired === 0 && car.speed > 0.8;
    inp.throttle = CVH.clamp(desired / car.topSpeed, 0, 1);

    // gridlock breaker: stuck too long -> quietly respawn elsewhere
    if (Math.abs(car.speed) < 0.4 && desired > 0) {
      car.stuckT += dt;
      if (car.stuckT > 4.5) { car.stuckT = 0; placeOnRoad(car, focus, 70, 150); return; }
    } else car.stuckT = 0;

    // steering: chase a point on my lane a little ahead; turns at
    // intersections swing wide toward the exit lane first
    car.turnCd -= dt;
    var W = CVH.WORLD;
    if (!car.turning && car.turnCd <= 0) {
      var cross = car.axis === 'z' ? W.ROAD_ZS : W.ROAD_XS;
      var along = car.axis === 'z' ? car.pos.z : car.pos.x;
      for (k = 0; k < cross.length; k++) {
        if (Math.abs(along - cross[k]) < 1.4 && rng() < 0.012 + 0.3 * dt) {
          var nd = rng() < 0.5 ? 1 : -1;
          var naxis = car.axis === 'z' ? 'x' : 'z';
          car.turning = {
            axis: naxis, dir: nd,
            fixed: cross[k] + laneFor(naxis, nd),
            exitX: naxis === 'x' ? car.pos.x + nd * 16 : cross[k] + laneFor(naxis, nd),
            exitZ: naxis === 'z' ? car.pos.z + nd * 16 : cross[k] + laneFor(naxis, nd)
          };
          car.turnCd = 4;
          break;
        }
      }
    }
    var tx, tz;
    if (car.turning) {
      tx = car.turning.exitX; tz = car.turning.exitZ;
      var travelYaw = car.turning.axis === 'z' ? (car.turning.dir > 0 ? 0 : Math.PI) : (car.turning.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (Math.abs(CVH.angleDelta(car.yaw, travelYaw)) < 0.12) {
        car.axis = car.turning.axis;
        car.dir = car.turning.dir;
        car.lane = car.turning.fixed;
        car.turning = null;
      }
    } else if (car.axis === 'z') {
      tx = car.lane; tz = car.pos.z + car.dir * 11;
    } else {
      tx = car.pos.x + car.dir * 11; tz = car.lane;
    }
    var wantYaw = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    inp.steer = CVH.clamp(CVH.angleDelta(car.yaw, wantYaw) * 1.6, -1, 1);
  }

  // -------------------------------------------------------------- update
  vehicles.update = function (dt, focus) {
    if (coneMat) coneMat.opacity = CVH.dusk * 0.34;
    var i;
    for (i = 0; i < cars.length; i++) {
      var car = cars[i];
      if (car.driver === 'traffic') trafficThink(car, dt, focus);
      if (car.driver !== 'parked' && car.driver !== 'wreck') integrate(car, dt);
      else {
        // parked/wrecked cars still flash nothing and sit still, but a
        // wreck keeps smoking
        if (car.dead) {
          car.smokeT -= dt;
          if (car.smokeT <= 0) { car.smokeT = 0.16; CVH.fx.smoke(car.pos.x, 1.1, car.pos.z, true, 1); }
        }
        car.mesh.position.copy(car.pos);
      }
    }
    collideCars(focus);
  };
})();
