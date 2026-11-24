// police.js — wanted heat, stars, cruiser spawning and pursuit, bust.
// Rules that matter:
//  * spawnCruiser ALWAYS finds a spot: up to 40 samples in the 52–85 m
//    annulus around the player, then a constructive fallback.
//  * entering a cruiser removes it from `force` at once (see player.js);
//    pursuit only steers cars whose driver is exactly 'police'.
//  * heat decays only with no live cruiser within 115 m ("contact").
//  * on stand-down, dead cruisers become 'wreck', intact ones become
//    traffic — a wreck is never revived as traffic.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var police = {
    heat: 0,          // 0..500
    force: [],        // cruisers currently on duty
    bust: 0,          // 0..1 bust meter
    spawnCooldown: 0,
    flashPhase: 0
  };

  police.stars = function () {
    return Math.min(5, Math.ceil(police.heat / 100));
  };

  police.addHeat = function (amount) {
    police.heat = U.clamp(police.heat + amount, 0, 500);
  };

  police.setHeat = function (v) {
    police.heat = U.clamp(v, 0, 500);
    if (police.heat <= 0) police.standDown();
  };

  police.removeFromForce = function (car) {
    var i = police.force.indexOf(car);
    if (i >= 0) police.force.splice(i, 1);
  };

  // Find a spawn point 52–85 m from the player on a road. Sampling
  // first; the constructive fallback (nearest avenue, ~62 m along it)
  // guarantees a point, so a cruiser always answers.
  police.findSpawnPoint = function (px, pz) {
    var world = CVH.world;
    for (var i = 0; i < 40; i++) {
      var p = world.randomRoadPoint(Math.random);
      var d = U.dist(p.x, p.z, px, pz);
      if (d >= 52 && d <= 85 && world.isLand(p.x, p.z)) return p;
    }
    // fallback: nearest avenue to the player, ~62 m east or west along it
    var bestZ = world.avenues[0], bestD = 1e9;
    for (var j = 0; j < world.avenues.length; j++) {
      var dd = Math.abs(world.avenues[j] - pz);
      if (dd < bestD) { bestD = dd; bestZ = world.avenues[j]; }
    }
    var dir = px < 0 ? 1 : -1;
    var fx = U.clamp(px + dir * 62, -238, 238);
    return { x: fx, z: bestZ, avenue: true };
  };

  police.spawnCruiser = function (px, pz) {
    var p = police.findSpawnPoint(px, pz);
    var yaw = U.headingOf(px - p.x, pz - p.z);
    var car = CVH.vehicles.spawn('sedan', p.x, p.z, yaw, 'police', 0xf2f4f6);
    police.force.push(car);
    return car;
  };

  // Heat hit zero: cruisers stand down. Wrecks stay wrecks; intact
  // cruisers peel off and join traffic.
  police.standDown = function () {
    for (var i = police.force.length - 1; i >= 0; i--) {
      var car = police.force[i];
      police.force.splice(i, 1);
      if (car.driver !== 'police') continue;
      if (car.dead) {
        car.driver = 'wreck';
      } else {
        car.driver = 'traffic';
        CVH.vehicles.traffic.push(car);
      }
    }
    police.bust = 0;
  };

  police.clearAll = function () {
    police.heat = 0;
    police.standDown();
  };

  police.update = function (dt, player) {
    var playerPos = player.pos();
    var stars = police.stars();
    police.spawnCooldown -= dt;
    police.flashPhase += dt * 9;

    // Desired force size follows the stars.
    var live = 0;
    for (var i = 0; i < police.force.length; i++) if (!police.force[i].dead) live++;
    if (stars > 0 && live < stars && police.spawnCooldown <= 0) {
      police.spawnCruiser(playerPos.x, playerPos.z);
      police.spawnCooldown = 2.2;
    }

    // Contact check: any live cruiser within 115 m?
    var contact = false;
    for (i = 0; i < police.force.length; i++) {
      var c = police.force[i];
      if (!c.dead && U.dist(c.x, c.z, playerPos.x, playerPos.z) < 115) { contact = true; break; }
    }
    if (police.heat > 0 && !contact) {
      police.heat = Math.max(0, police.heat - 5 * dt);
      if (police.heat <= 0) police.standDown();
    }

    // Pursuit steering — only genuine on-duty cruisers.
    var bustPressure = 0;
    for (i = 0; i < police.force.length; i++) {
      var car = police.force[i];
      if (car.driver !== 'police' || car.dead) continue;
      var dx = playerPos.x - car.x, dz = playerPos.z - car.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var want = U.headingOf(dx, dz);
      var diff = U.angDiff(want, car.yaw);
      var steer = U.clamp(diff * 1.8, -1, 1);
      var throttle = d > 10 ? 1.0 : 0.45;
      if (Math.abs(diff) > 2.4) throttle = -0.5; // badly angled: back up
      CVH.vehicles.driveStep(car, dt, throttle, steer);
      // flashing light bar
      var lm = car.mesh.userData.lightMats;
      if (lm) {
        var on = Math.sin(police.flashPhase) > 0;
        lm.red.color.setHex(on ? 0xff2a2a : 0x571010);
        lm.blue.color.setHex(on ? 0x101a57 : 0x2a5cff);
      }
      // bust pressure: close + player slow
      var playerSpeed = Math.abs(player.speedScalar());
      if (d < 8 && playerSpeed < 2.2) bustPressure = 1;
      // ram damage
      if (d < 3.4 && Math.abs(car.speed) > 6 && player.driving) {
        CVH.vehicles.damage(player.car, 4);
        car.speed *= 0.5;
      }
    }
    if (bustPressure) police.bust = Math.min(1, police.bust + dt / 2.6);
    else police.bust = Math.max(0, police.bust - dt / 1.8);

    if (CVH.audio) CVH.audio.siren(stars > 0 && live > 0);
  };

  CVH.police = police;
})();
