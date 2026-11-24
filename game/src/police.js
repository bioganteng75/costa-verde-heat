// police.js — wanted heat, pursuit AI, bust meter, reliable cruiser spawns,
// and stand-down rules: wrecked cruisers stay wrecks, intact ones peel off
// into traffic. A stolen cruiser is removed from the force the moment the
// player gets in, and pursuit only ever steers cars with driver 'police'.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;
  var rng = U.makeRng(777);

  var heat = 0;               // 0..250
  var force = [];             // cruisers currently hunting (driver === 'police')
  var spawnTimer = 0;
  var bust = 0;               // 0..100

  function stars() { return Math.min(5, Math.ceil(heat / 50)); }
  function addHeat(n) {
    heat = U.clamp(heat + n, 0, 250);
  }

  function removeFromForce(car) {
    var i = force.indexOf(car);
    if (i >= 0) force.splice(i, 1);
  }

  function roadPointNear(x, z, minD, maxD) {
    // sample up to 40 road points in the annulus; return the best found
    var best = null, bestScore = -1;
    for (var i = 0; i < 40; i++) {
      var onAvenue = rng() < 0.5;
      var line = onAvenue ? W.VX[Math.floor(rng() * W.VX.length)] : W.HZ[Math.floor(rng() * W.HZ.length)];
      var along = (onAvenue ? z : x) + (rng() < 0.5 ? -1 : 1) * (minD + rng() * (maxD - minD + 30));
      along = U.clamp(along, -250, 250);
      var px = onAvenue ? line : along;
      var pz = onAvenue ? along : line;
      var d = U.dist(px, pz, x, z);
      if (d >= minD && d <= maxD) return { x: px, z: pz };
      var score = -Math.abs(d - (minD + maxD) / 2);
      if (score > bestScore) { bestScore = score; best = { x: px, z: pz }; }
    }
    return best;
  }

  function spawnCruiser(px, pz) {
    var spot = roadPointNear(px, pz, 52, 85);
    if (!spot) {
      // constructive fallback: nearest avenue, ~62 m along it from the player
      var nearest = W.VX[0], nd = 1e9;
      W.VX.forEach(function (x) { var d = Math.abs(x - px); if (d < nd) { nd = d; nearest = x; } });
      spot = { x: nearest, z: U.clamp(pz + (pz >= 0 ? -62 : 62), -250, 250) };
    }
    var heading = Math.atan2(px - spot.x, pz - spot.z);
    var car = CVH.vehicles.spawnCar('police', spot.x, spot.z, heading, 'police', 0xf0f0f0);
    force.push(car);
    return car;
  }

  function standDown() {
    // heat gone: dead cruisers become wrecks where they sit; intact cruisers
    // peel off and join traffic. A wreck is NEVER revived as traffic.
    force.slice().forEach(function (car) {
      removeFromForce(car);
      if (car.dead || car.hp <= 0) {
        car.driver = 'wreck';
        car.speed = 0;
      } else {
        car.driver = 'traffic';
        // peel off: join the nearest road's traffic in place — the traffic
        // update eases the car onto the lane line from where it sits.
        var nav = W.VX[0], ndv = 1e9;
        W.VX.forEach(function (x) { var d = Math.abs(x - car.x); if (d < ndv) { ndv = d; nav = x; } });
        var nah = W.HZ[0], ndh = 1e9;
        W.HZ.forEach(function (z) { var d = Math.abs(z - car.z); if (d < ndh) { ndh = d; nah = z; } });
        var f = U.fwd(car.heading);
        if (ndv <= ndh) car.lane = { axis: 'V', line: nav, dir: f.z >= 0 ? 1 : -1 };
        else car.lane = { axis: 'H', line: nah, dir: f.x >= 0 ? 1 : -1 };
        car.speed = 6;
      }
      CVH.vehicles.syncMesh(car);
    });
    bust = 0;
  }

  function update(dt, P) {
    var st = stars();
    // heat decay is gated on contact: only when no live cruiser within 115 m
    var contact = false;
    force.forEach(function (c) {
      if (!c.dead && U.dist(c.x, c.z, P.x, P.z) < 115) contact = true;
    });
    if (!contact && heat > 0) {
      heat = Math.max(0, heat - dt * 4.5);
      if (heat === 0) standDown();
    }

    // spawns: desired force size follows the stars
    spawnTimer -= dt;
    var desired = st;
    if (st > 0 && force.length < desired && spawnTimer <= 0) {
      spawnCruiser(P.x, P.z);
      spawnTimer = 1.6;
    }
    // prune: cruisers stolen/dead/far away leave the force list
    for (var i = force.length - 1; i >= 0; i--) {
      var c = force[i];
      if (c.driver !== 'police') { force.splice(i, 1); continue; }
      if (c.dead) { force.splice(i, 1); CVH.vehicles.damage(c, 0); continue; }
      if (U.dist(c.x, c.z, P.x, P.z) > 300) {
        force.splice(i, 1);
        CVH.vehicles.removeCar(c);
      }
    }

    // pursuit: ONLY cars whose driver is 'police' are steered
    force.forEach(function (car) {
      if (car.driver !== 'police' || car.dead) return;
      var dx = P.x - car.x, dz = P.z - car.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var targetHeading = Math.atan2(dx, dz);
      var dh = U.wrapAngle(targetHeading - car.heading);
      var steer = U.clamp(dh * 1.6, -1, 1);
      var throttle = d > 7 ? 1 : 0.35;
      if (Math.abs(dh) > 2.4 && d < 12) throttle = -0.6; // reverse out of a jam
      CVH.vehicles.driveStep(car, throttle, steer, dt);
    });

    // bust meter: a live cruiser close while the player is slow / on foot
    var busting = false;
    if (st > 0 && !P.dead) {
      force.forEach(function (car) {
        if (car.dead) return;
        var d = U.dist(car.x, car.z, P.x, P.z);
        if (d < 7.5 && P.speedNow < 2.2) busting = true;
      });
    }
    if (busting) {
      bust += dt * 26;
      if (bust >= 100) {
        bust = 0;
        if (CVH.onBusted) CVH.onBusted();
      }
    } else {
      bust = Math.max(0, bust - dt * 18);
    }

    CVH.audio.updateSiren(dt, st > 0 && contact);
  }

  function setHeat(v) {
    heat = U.clamp(v, 0, 250);
    if (heat === 0) standDown();
  }

  CVH.police = {
    get heat() { return heat; },
    get stars() { return stars(); },
    get bust() { return bust; },
    force: force,
    addHeat: addHeat,
    setHeat: setHeat,
    removeFromForce: removeFromForce,
    spawnCruiser: spawnCruiser,
    standDown: standDown,
    update: update
  };
})();
