// player.js — the runner: low-poly character, procedural walk, camera-basis
// movement (right = forward x up), combat, entering/exiting vehicles.
// The logical position (player.x/z) rides with the car while driving, so
// missions, police and the minimap all read the car position.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;

  function mat(c) { return new THREE.MeshLambertMaterial({ color: c }); }

  var mesh = null, legL = null, legR = null, armL = null, armR = null;
  var P = {
    x: 8, z: 206, heading: Math.PI, hp: 100, maxHp: 100,
    cash: 120, weapon: 'fist', driving: null, walkPhase: 0,
    fireCd: 0, dead: false, speedNow: 0
  };

  function build() {
    mesh = new THREE.Group();
    legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), mat(0x27324a));
    legL.position.set(-0.15, 0.43, 0); mesh.add(legL);
    legR = legL.clone(); legR.position.x = 0.15; mesh.add(legR);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.36), mat(0xd8542e));
    torso.position.y = 1.26; mesh.add(torso);
    armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), mat(0xd8542e));
    armL.position.set(-0.45, 1.28, 0); mesh.add(armL);
    armR = armL.clone(); armR.position.x = 0.45; mesh.add(armR);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), mat(0xd9a877));
    head.position.y = 1.9; mesh.add(head);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), mat(0x1c2a38));
    cap.position.y = 2.12; mesh.add(cap);
    var brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.3), mat(0x1c2a38));
    brim.position.set(0, 2.06, 0.32); mesh.add(brim);
    mesh.position.set(P.x, 0, P.z);
    W.scene.add(mesh);
    return mesh;
  }

  function witnessCrime(amount, x, z) {
    var witnessed = false;
    CVH.peds.list.forEach(function (p) {
      if (p.visible && U.dist(p.x, p.z, x, z) < 30) witnessed = true;
    });
    if (CVH.police && CVH.police.force.length) witnessed = true;
    if (witnessed && CVH.police) CVH.police.addHeat(amount);
    CVH.threat.x = x; CVH.threat.z = z; CVH.threat.active = true; CVH.threat.t = 1.2;
  }

  function attack() {
    var f = U.fwd(P.heading);
    if (P.weapon === 'fist') {
      CVH.audio.punch();
      var tx = P.x + f.x * 1.6, tz = P.z + f.z * 1.6;
      var hit = false;
      CVH.peds.list.forEach(function (p) {
        if (p.visible && U.dist(p.x, p.z, tx, tz) < 1.4) {
          p.fleeT = 3; hit = true;
          if (CVH.fx) CVH.fx.burst(p.x, 1.4, p.z, 0xd8542e, 6);
        }
      });
      var car = CVH.vehicles.nearestCar(tx, tz, 2.2);
      if (car) { CVH.vehicles.damage(car, 4); hit = true; }
      if (hit) witnessCrime(18, P.x, P.z);
      P.fireCd = 0.32;
      return;
    }
    // hitscan weapon
    var rate = P.weapon === 'smg' ? 0.1 : 0.34;
    P.fireCd = rate;
    CVH.audio.shot(P.weapon === 'smg');
    if (CVH.fx) CVH.fx.muzzle(P.x + f.x * 0.7, 1.45, P.z + f.z * 0.7);
    var bestT = 42, bestPed = null, bestCar = null;
    CVH.peds.list.forEach(function (p) {
      if (!p.visible) return;
      var dx = p.x - P.x, dz = p.z - P.z;
      var t = dx * f.x + dz * f.z;
      if (t < 0 || t > bestT) return;
      var side = Math.abs(dx * -f.z + dz * f.x);
      if (side < 0.8) { bestT = t; bestPed = p; bestCar = null; }
    });
    CVH.vehicles.cars.forEach(function (c) {
      if (c.dead) return;
      var dx = c.x - P.x, dz = c.z - P.z;
      var t = dx * f.x + dz * f.z;
      if (t < 0 || t > bestT) return;
      var side = Math.abs(dx * -f.z + dz * f.x);
      if (side < 1.6) { bestT = t; bestCar = c; bestPed = null; }
    });
    if (bestPed) {
      bestPed.fleeT = 4;
      if (CVH.fx) CVH.fx.burst(bestPed.x, 1.3, bestPed.z, 0xb83030, 10);
      witnessCrime(30, P.x, P.z);
    } else if (bestCar) {
      CVH.vehicles.damage(bestCar, P.weapon === 'smg' ? 7 : 16);
      if (CVH.fx) CVH.fx.burst(bestCar.x, 1, bestCar.z, 0xffca6a, 6);
      witnessCrime(22, P.x, P.z);
    } else {
      witnessCrime(12, P.x, P.z);
    }
  }

  function enterCar(car) {
    if (!car || car.dead) return false;
    var wasPolice = car.driver === 'police' || car.type === 'police';
    if (car.type === 'police' && CVH.police) CVH.police.removeFromForce(car); // fix: stolen cruiser leaves the force NOW
    if (car.driver === 'traffic') witnessCrime(20, P.x, P.z);
    if (wasPolice) witnessCrime(26, P.x, P.z);
    car.driver = 'player';
    car.lane = null;
    P.driving = car;
    mesh.visible = false;
    CVH.audio.engine();
    if (car.isMissionCar && CVH.missions) CVH.missions.onSteal(car);
    return true;
  }
  function exitCar() {
    var car = P.driving;
    if (!car) return;
    car.driver = 'parked';
    car.speed = 0;
    P.driving = null;
    var r = U.rightOf(U.fwd(car.heading));
    P.x = car.x - r.x * 2.0;
    P.z = car.z - r.z * 2.0;
    var c = W.collide(P.x, P.z, 0.5);
    P.x = c.x; P.z = c.z;
    mesh.visible = true;
  }

  function update(dt, camYaw) {
    if (P.dead) return;
    P.fireCd = Math.max(0, P.fireCd - dt);
    var input = CVH.input;

    if (P.driving) {
      var car = P.driving;
      var throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
      var steer = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) + (input.down('KeyD') || input.down('ArrowRight') ? -1 : 0);
      // A steers toward increasing heading (same handedness as on-foot strafe)
      CVH.vehicles.driveStep(car, throttle, steer, dt);
      P.x = car.x; P.z = car.z; // logical position rides with the car
      P.heading = car.heading;
      P.speedNow = Math.abs(car.speed);
      if (car.speed > 14) { CVH.threat.x = P.x; CVH.threat.z = P.z; CVH.threat.active = true; CVH.threat.t = 0.4; }
      if (input.pressed('KeyE')) exitCar();
      return;
    }

    // on foot: camera-basis movement, right = forward x up
    var f = U.fwd(camYaw);
    var r = U.rightOf(f);
    var mf = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    var mr = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    var mx = f.x * mf + r.x * mr;
    var mz = f.z * mf + r.z * mr;
    var len = Math.sqrt(mx * mx + mz * mz);
    var speed = 4.7;
    P.speedNow = 0;
    if (len > 0.01) {
      mx /= len; mz /= len;
      P.x += mx * speed * dt;
      P.z += mz * speed * dt;
      P.speedNow = speed;
      var targetHeading = Math.atan2(mx, mz);
      var dh = U.wrapAngle(targetHeading - P.heading);
      P.heading += dh * Math.min(1, dt * 10);
      P.walkPhase += dt * 9;
    }
    var c = W.collide(P.x, P.z, 0.55);
    P.x = U.clamp(c.x, W.BOUNDS.minX + 1, W.BOUNDS.maxX - 1);
    P.z = U.clamp(c.z, W.BOUNDS.minZ + 1, W.BOUNDS.maxZ - 1);
    if (!W.isOnLand(P.x, P.z)) P.x = Math.min(P.x, W.WATER_X - 0.6);

    // traffic can hurt
    CVH.vehicles.cars.forEach(function (car2) {
      if (car2.driver === 'traffic' && Math.abs(car2.speed) > 5 && U.dist(car2.x, car2.z, P.x, P.z) < 1.9) {
        hurt(12);
        var f2 = U.fwd(car2.heading);
        P.x += f2.x * 2.4; P.z += f2.z * 2.4;
      }
    });

    if ((input.pressed('KeyF') || input.pressed('Mouse0')) && P.fireCd <= 0) attack();
    if (input.pressed('KeyE')) {
      var near = CVH.vehicles.nearestCar(P.x, P.z, 3.4);
      if (near) enterCar(near);
    }

    // animate + place mesh
    mesh.position.set(P.x, 0, P.z);
    mesh.rotation.y = P.heading;
    var swing = P.speedNow > 0 ? Math.sin(P.walkPhase) * 0.6 : 0;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8; armR.rotation.x = swing * 0.8;
  }

  function hurt(amount) {
    if (P.dead) return;
    P.hp -= amount;
    CVH.audio.hurt();
    if (P.hp <= 0) {
      P.hp = 0; P.dead = true;
      if (CVH.onWasted) CVH.onWasted();
    }
  }
  function heal(amount) { P.hp = Math.min(P.maxHp, P.hp + amount); }

  CVH.player = {
    data: P,
    build: build,
    update: update,
    enterCar: enterCar,
    exitCar: exitCar,
    attack: attack,
    hurt: hurt,
    heal: heal,
    get mesh() { return mesh; }
  };
  CVH.threat = { x: 0, z: 0, active: false, t: 0 };
})();
