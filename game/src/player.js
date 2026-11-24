// player.js — the runner: on-foot movement on the camera basis, driving,
// entering cars (a stolen cruiser leaves the police force at once),
// fists and guns, health and cash.
// Movement basis (mandatory): forward = facing(camYaw), right =
// cross(forward, up); W adds forward, S subtracts it, A subtracts
// right (moves LEFT), D adds right (moves RIGHT). While driving, the
// player's logical position IS the car's position.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var WALK = 4.7;
  var SPRINT_MULT = 1.7;

  var player = {
    x: 8, z: 47, heading: Math.PI, // face the avenue (+z side is the porch)
    camYaw: Math.PI, camPitch: 0.32,
    health: 100, cash: 120,
    driving: false, car: null,
    weapon: 'fist', ammoPistol: 0, ammoSmg: 0,
    mesh: null, walkPhase: 0, moveAmount: 0,
    fireCooldown: 0, punchCooldown: 0,
    dead: false
  };

  player.pos = function () {
    if (player.driving && player.car) return { x: player.car.x, z: player.car.z };
    return { x: player.x, z: player.z };
  };

  player.speedScalar = function () {
    if (player.driving && player.car) return player.car.speed;
    return player.moveAmount * WALK;
  };

  player.build = function (scene) {
    player.mesh = CVH.world.makeHumanoid(0xd93425, 0x24303e, 0xc98d5e);
    player.mesh.position.set(player.x, 0, player.z);
    scene.add(player.mesh);
  };

  player.reset = function () {
    player.x = 8; player.z = 47;
    player.heading = Math.PI; player.camYaw = Math.PI;
    player.health = 100; player.cash = 120;
    player.weapon = 'fist'; player.ammoPistol = 0; player.ammoSmg = 0;
    player.driving = false; player.car = null;
    player.dead = false;
    if (player.mesh) {
      player.mesh.visible = true;
      player.mesh.position.set(player.x, 0, player.z);
      player.mesh.rotation.y = player.heading;
    }
  };

  player.respawnAt = function (x, z) {
    player.exitCar(true);
    player.x = x; player.z = z;
    player.health = 100;
    player.dead = false;
    if (player.mesh) {
      player.mesh.visible = true;
      player.mesh.position.set(x, CVH.world.groundY(x, z), z);
    }
  };

  // --------------------------------------------------------------
  // Vehicles
  // --------------------------------------------------------------
  player.nearestCar = function (maxD) {
    var best = null, bestD = maxD || 3.4;
    var list = CVH.vehicles.all;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.dead) continue;
      var d = U.dist(player.x, player.z, c.x, c.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  };

  player.enterCar = function (car) {
    if (!car || car.dead) return false;
    // A stolen cruiser leaves the force the moment you take the wheel.
    if (car.driver === 'police') CVH.police.removeFromForce(car);
    if (car.driver === 'traffic') {
      var i = CVH.vehicles.traffic.indexOf(car);
      if (i >= 0) CVH.vehicles.traffic.splice(i, 1);
    }
    car.driver = 'player';
    car.speed = 0;
    player.driving = true;
    player.car = car;
    player.x = car.x; player.z = car.z;
    player.heading = car.yaw;
    if (player.mesh) player.mesh.visible = false;
    if (CVH.audio) CVH.audio.door();
    return true;
  };

  player.exitCar = function (silent) {
    if (!player.driving || !player.car) { player.driving = false; player.car = null; return; }
    var car = player.car;
    if (car.driver === 'player') car.driver = 'parked';
    var side = U.rightOf(car.yaw);
    player.x = car.x + side.x * 2.4;
    player.z = car.z + side.z * 2.4;
    var fixed = CVH.world.collideCircle(player.x, player.z, 0.5);
    player.x = fixed.x; player.z = fixed.z;
    player.heading = car.yaw;
    player.camYaw = car.yaw;
    player.driving = false;
    player.car = null;
    if (player.mesh) {
      player.mesh.visible = true;
      player.mesh.position.set(player.x, CVH.world.groundY(player.x, player.z), player.z);
      player.mesh.rotation.y = player.heading;
    }
    if (!silent && CVH.audio) CVH.audio.door();
  };

  player.tryInteract = function () {
    if (CVH.state !== 'playing') return;
    if (player.driving) { player.exitCar(false); return; }
    var car = player.nearestCar(3.4);
    if (car) { player.enterCar(car); return; }
    // food stand?
    var stands = CVH.world.stands || [];
    for (var i = 0; i < stands.length; i++) {
      if (U.dist(player.x, player.z, stands[i].x, stands[i].z) < 3.2) {
        if (player.cash >= 10 && player.health < 100) {
          player.cash -= 10;
          player.health = Math.min(100, player.health + 30);
          if (CVH.audio) CVH.audio.heal();
          if (CVH.hud) CVH.hud.toast('Burger +30 HP  (-$10)');
        } else if (CVH.hud) {
          CVH.hud.toast(player.cash < 10 ? 'Not enough cash' : 'Health is full');
        }
        return;
      }
    }
  };

  // --------------------------------------------------------------
  // Combat
  // --------------------------------------------------------------
  player.giveWeapon = function (kind) {
    if (kind === 'pistol') { player.ammoPistol += 24; if (player.weapon === 'fist') player.weapon = 'pistol'; }
    if (kind === 'smg') { player.ammoSmg += 60; player.weapon = 'smg'; }
  };

  function fireGun(dt) {
    var isSmg = player.weapon === 'smg';
    var ammo = isSmg ? player.ammoSmg : player.ammoPistol;
    if (ammo <= 0) {
      if (isSmg && player.ammoPistol > 0) player.weapon = 'pistol';
      else if (!isSmg) player.weapon = 'fist';
      return;
    }
    if (isSmg) player.ammoSmg--; else player.ammoPistol--;
    if (CVH.audio) CVH.audio.shot(isSmg);
    var origin = player.pos();
    var h = player.driving && player.car ? player.car.yaw : player.heading;
    var f = U.facing(h);
    // nearest ped or car inside a forward cone, up to 42 m
    var bestT = 42, bestPed = null, bestCar = null;
    var peds = CVH.world.peds;
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (!p.visible || p.state === 'down') continue;
      var dx = p.x - origin.x, dz = p.z - origin.z;
      var t = dx * f.x + dz * f.z;
      if (t < 1 || t > bestT) continue;
      var perp = Math.abs(dx * f.z - dz * f.x);
      if (perp < 1.1) { bestT = t; bestPed = p; bestCar = null; }
    }
    var cars = CVH.vehicles.all;
    for (i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (player.driving && c === player.car) continue;
      var cx = c.x - origin.x, cz = c.z - origin.z;
      var t2 = cx * f.x + cz * f.z;
      if (t2 < 1 || t2 > bestT) continue;
      var perp2 = Math.abs(cx * f.z - cz * f.x);
      if (perp2 < c.radius + 0.4) { bestT = t2; bestCar = c; bestPed = null; }
    }
    if (bestPed) {
      CVH.world.knockDownPed(bestPed);
      if (CVH.fx) CVH.fx.bloodless(bestPed.x, 1, bestPed.z);
      CVH.police.addHeat(70);
    } else if (bestCar) {
      CVH.vehicles.damage(bestCar, isSmg ? 9 : 14);
      if (CVH.fx) CVH.fx.sparks(bestCar.x, 0.8, bestCar.z);
      CVH.police.addHeat(45);
    } else {
      CVH.police.addHeat(18); // shots fired in public
    }
  }

  function punch() {
    var origin = player.pos();
    var peds = CVH.world.peds;
    for (var i = 0; i < peds.length; i++) {
      var p = peds[i];
      if (p.visible && p.state !== 'down' && U.dist(origin.x, origin.z, p.x, p.z) < 2.3) {
        CVH.world.knockDownPed(p);
        if (CVH.audio) CVH.audio.punch();
        CVH.police.addHeat(30); // witnessed punch
        return;
      }
    }
    var cars = CVH.vehicles.all;
    for (i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (player.driving && c === player.car) continue;
      if (U.dist(origin.x, origin.z, c.x, c.z) < c.radius + 1.2) {
        CVH.vehicles.damage(c, 5);
        if (CVH.audio) CVH.audio.punch();
        if (CVH.fx) CVH.fx.sparks(c.x, 0.8, c.z);
        CVH.police.addHeat(30);
        return;
      }
    }
  }

  // --------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------
  player.update = function (dt) {
    player.fireCooldown -= dt;
    player.punchCooldown -= dt;
    var input = CVH.input;

    if (player.driving && player.car) {
      var car = player.car;
      var throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
      var steer = (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0) + (input.down('KeyD') || input.down('ArrowRight') ? -1 : 0);
      CVH.vehicles.driveStep(car, dt, throttle, steer);
      // car-to-car bumps
      var all = CVH.vehicles.all;
      for (var i = 0; i < all.length; i++) {
        var o = all[i];
        if (o === car) continue;
        var d = U.dist(car.x, car.z, o.x, o.z);
        var min = car.radius + o.radius - 0.4;
        if (d < min && d > 0.01) {
          var push = (min - d) / 2;
          var nx = (o.x - car.x) / d, nz = (o.z - car.z) / d;
          o.x += nx * push; o.z += nz * push;
          car.x -= nx * push; car.z -= nz * push;
          if (Math.abs(car.speed) > 8) {
            CVH.vehicles.damage(o, 7);
            CVH.vehicles.damage(car, 4);
            if (CVH.audio) CVH.audio.crash();
            CVH.police.addHeat(25);
          }
          car.speed *= 0.7;
          CVH.vehicles.syncMesh(o);
          CVH.vehicles.syncMesh(car);
        }
      }
      player.x = car.x; player.z = car.z;   // logical position rides with the car
      player.heading = car.yaw;
      player.moveAmount = Math.abs(car.speed) / 10;
      if (CVH.audio) CVH.audio.engine(car.speed / car.spec.top, true);
      // Pay 'n Spray: drive onto the pad
      var ps = CVH.world.payNSpray;
      if (ps && car.health < 100 && U.dist(car.x, car.z, ps.x, ps.z) < 4.5 && Math.abs(car.speed) < 1) {
        if (player.cash >= 50) {
          player.cash -= 50;
          CVH.vehicles.repair(car);
          CVH.police.addHeat(-160); // fresh paint shakes some heat
          if (CVH.hud) CVH.hud.toast('Pay \'n Spray: repaired, heat down  (-$50)');
          if (CVH.audio) CVH.audio.cash();
        }
      }
    } else {
      if (CVH.audio) CVH.audio.engine(0, false);
      // mouse look
      var md = input.takeMouseDelta();
      if (input.locked) {
        player.camYaw -= md.x * 0.0032;
        player.camPitch = U.clamp(player.camPitch + md.y * 0.0026, -0.05, 1.0);
      }
      var f = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
      var s = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) + (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0);
      var fwd = U.facing(player.camYaw);
      var rgt = U.rightOf(player.camYaw);
      var mx = fwd.x * f + rgt.x * s;
      var mz = fwd.z * f + rgt.z * s;
      var len = Math.sqrt(mx * mx + mz * mz);
      player.moveAmount = len > 0 ? 1 : 0;
      if (len > 0) {
        mx /= len; mz /= len;
        var sp = WALK * (input.down('ShiftLeft') || input.down('ShiftRight') ? SPRINT_MULT : 1);
        player.x += mx * sp * dt;
        player.z += mz * sp * dt;
        var want = U.headingOf(mx, mz);
        player.heading += U.angDiff(want, player.heading) * Math.min(1, dt * 12);
        player.walkPhase += dt * 9;
      }
      var fixed = CVH.world.collideCircle(player.x, player.z, 0.5);
      player.x = fixed.x; player.z = fixed.z;
      var W = CVH.world.bounds;
      player.x = U.clamp(player.x, W.minX, CVH.world.onPier(player.x, player.z) ? W.maxX - 1 : 250);
      player.z = U.clamp(player.z, W.minZ, W.maxZ);
      if (player.mesh) {
        player.mesh.position.set(player.x, CVH.world.groundY(player.x, player.z), player.z);
        player.mesh.rotation.y = player.heading;
        CVH.world.animHumanoid(player.mesh, player.walkPhase, player.moveAmount);
      }
    }

    // combat inputs
    var wantFire = input.firing || input.down('Space');
    if (wantFire && player.weapon !== 'fist' && player.fireCooldown <= 0) {
      fireGun();
      player.fireCooldown = player.weapon === 'smg' ? 0.09 : 0.28;
    } else if (wantFire && player.weapon === 'fist' && player.punchCooldown <= 0 && !player.driving) {
      punch();
      player.punchCooldown = 0.4;
    }
    if (input.down('Digit1')) player.weapon = 'fist';
    if (input.down('Digit2') && player.ammoPistol > 0) player.weapon = 'pistol';
    if (input.down('Digit3') && player.ammoSmg > 0) player.weapon = 'smg';

    // slow health regen
    if (player.health > 0 && player.health < 100) player.health = Math.min(100, player.health + dt * 1.2);
    if (player.health <= 0 && !player.dead) player.dead = true;
  };

  // Camera: orbit on foot, chase while driving.
  player.updateCamera = function (camera, dt) {
    if (player.driving && player.car) {
      var car = player.car;
      var back = U.facing(car.yaw);
      var tx = car.x - back.x * 9.5;
      var tz = car.z - back.z * 9.5;
      var ty = CVH.world.groundY(car.x, car.z) + 3.4;
      var k = Math.min(1, dt * 5);
      camera.position.x += (tx - camera.position.x) * k;
      camera.position.y += (ty - camera.position.y) * k;
      camera.position.z += (tz - camera.position.z) * k;
      camera.lookAt(car.x + back.x * 7, 1.4, car.z + back.z * 7);
    } else {
      var f = U.facing(player.camYaw);
      var dist = 6.8;
      var cx = player.x - f.x * dist;
      var cz = player.z - f.z * dist;
      var cy = CVH.world.groundY(player.x, player.z) + 2.4 + player.camPitch * 3.2;
      camera.position.set(cx, cy, cz);
      camera.lookAt(player.x + f.x * 5, 1.5, player.z + f.z * 5);
    }
  };

  CVH.player = player;
})();
