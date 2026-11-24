// police.js — the Costa Verde PD: witness-based crime reporting, a
// 0–5 star heat system that decays when the player stays unseen, cruisers
// that spawn at the city edge and pursue with target leading, and the
// bust meter. Owns CVH.police and the force list — QA item 2 lives here:
// a cruiser the player steals leaves the force at once and the pursuit
// loop only ever steers cars whose driver is still 'police'. QA item 4
// lives here too: on stand-down, wrecked cruisers stay wrecked.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};

  var police = CVH.police = {
    heat: 0,
    stars: 0,
    bust: 0,
    force: [],       // cruisers currently owned by the PD
    unseenT: 0,
    spawnCd: 0
  };
  var DESIRED = [0, 2, 3, 4, 5, 6];

  function starsFor(heat) {
    if (heat <= 0) return 0;
    return Math.min(5, Math.ceil(heat / 100));
  }

  function anyWitness(x, z, radius, skipPeds) {
    var i;
    for (i = 0; i < police.force.length; i++) {
      var c = police.force[i];
      if (c.driver === 'police' && CVH.dist2(x, z, c.pos.x, c.pos.z) < radius * radius) return true;
    }
    if (!skipPeds && CVH.peds) {
      for (i = 0; i < CVH.peds.length; i++) {
        var p = CVH.peds[i];
        if (p.state !== 'down' && CVH.dist2(x, z, p.x, p.z) < 26 * 26) return true;
      }
    }
    return false;
  }

  // Crimes only raise heat when somebody sees them: a cruiser nearby, or
  // a pedestrian close enough to call it in (with a beat of delay built
  // into the smaller severities the peds report).
  police.reportCrime = function (x, z, severity, seenByPolice) {
    var seen = seenByPolice || anyWitness(x, z, 48, false);
    if (!seen) return;
    police.heat = Math.min(500, police.heat + severity);
    police.unseenT = 0;
    police.stars = starsFor(police.heat);
  };

  police.setHeat = function (v) {
    police.heat = CVH.clamp(v, 0, 500);
    police.stars = starsFor(police.heat);
    if (v > 0) police.unseenT = 0;
    if (v <= 0) standDown();
  };

  // QA item 2: the moment the player climbs into a cruiser it is struck
  // from the force list, and pursuit (below) double-checks the driver.
  police.removeFromForce = function (car) {
    var i = police.force.indexOf(car);
    if (i >= 0) police.force.splice(i, 1);
  };

  function standDown() {
    for (var i = 0; i < police.force.length; i++) {
      var car = police.force[i];
      if (car.driver !== 'police') continue;
      if (car.dead) {
        car.driver = 'wreck';              // QA item 4: wrecks stay wrecks
      } else {
        CVH.vehicles.adoptAsTraffic(car);  // intact cruisers peel off
      }
      car.input.throttle = 0;
      car.input.steer = 0;
    }
    police.force.length = 0;
    police.bust = 0;
  }

  police.clearHeat = function () {
    police.heat = 0;
    police.stars = 0;
    police.unseenT = 0;
    standDown();
  };

  function spawnCruiser(player) {
    var W = CVH.WORLD;
    var rng = Math.random;
    var t, useAvenue, road, along, x = 0, z = 0, d;
    // sample road points until one lands in the spawn annulus
    for (t = 0; t < 40; t++) {
      useAvenue = rng() < 0.5;
      road = useAvenue ? W.ROAD_XS[(rng() * W.ROAD_XS.length) | 0] : W.ROAD_ZS[(rng() * W.ROAD_ZS.length) | 0];
      along = CVH.randRange(rng, -195, 195);
      x = useAvenue ? road : along;
      z = useAvenue ? along : road;
      d = CVH.dist(x, z, player.x, player.z);
      if (d >= 52 && d <= 85) break;
    }
    if (t >= 40) {
      // constructive fallback: the avenue nearest the player, ~62 m
      // along it — a cruiser always answers a call eventually
      var bx = W.ROAD_XS[0], bd = Infinity, i;
      for (i = 0; i < W.ROAD_XS.length; i++) {
        var dd = Math.abs(player.x - W.ROAD_XS[i]);
        if (dd < bd) { bd = dd; bx = W.ROAD_XS[i]; }
      }
      x = bx;
      z = CVH.clamp(player.z + (rng() < 0.5 ? -62 : 62), -195, 195);
      if (CVH.dist(x, z, player.x, player.z) < 40) z = CVH.clamp(player.z - 70, -195, 195);
    }
    var yaw = Math.atan2(player.x - x, player.z - z);
    var car = CVH.vehicles.makeCar('police', x, z, yaw, { driver: 'police' });
    police.force.push(car);
  }

  function pursuit(car, dt, player) {
    var inp = car.input;
    if (car.dead) { inp.throttle = 0; inp.brake = true; inp.steer = 0; return; }
    // target leading: aim where the player will be, not where they are
    var pvx = 0, pvz = 0;
    if (player.car) {
      pvx = Math.sin(player.car.yaw) * player.car.speed;
      pvz = Math.cos(player.car.yaw) * player.car.speed;
    } else {
      pvx = Math.sin(player.heading) * player.speedMag;
      pvz = Math.cos(player.heading) * player.speedMag;
    }
    var d = CVH.dist(car.pos.x, car.pos.z, player.x, player.z);
    var lead = CVH.clamp(d / 22, 0, 1.4);
    var tx = player.x + pvx * lead;
    var tz = player.z + pvz * lead;
    var wantYaw = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    var delta = CVH.angleDelta(car.yaw, wantYaw);
    inp.steer = CVH.clamp(delta * 1.9, -1, 1);
    if (delta > 2.35 || delta < -2.35) {
      inp.throttle = -0.65;  // target is behind: back up and swing round
      inp.brake = false;
    } else if (d < 7 && !player.car && player.speedMag < 1.2) {
      inp.throttle = 0.22;   // creep in for the bust
      inp.brake = car.speed > 3;
    } else {
      inp.throttle = 1;
      inp.brake = false;
    }
    // stuck against a building? reverse briefly to break loose
    if (Math.abs(car.speed) < 0.5 && inp.throttle > 0) {
      car.stuckT = (car.stuckT || 0) + dt;
      if (car.stuckT > 1.1) {
        inp.throttle = -0.8;
        inp.steer = -inp.steer;
        if (car.stuckT > 1.9) car.stuckT = 0;
      }
    } else car.stuckT = 0;
  }

  police.update = function (dt) {
    var player = CVH.player;
    police.stars = starsFor(police.heat);
    police.spawnCd -= dt;

    // prune: cruisers stolen by the player or long-dead leave the force
    for (var i = police.force.length - 1; i >= 0; i--) {
      var c = police.force[i];
      if (c.driver !== 'police') { police.force.splice(i, 1); continue; }
      if (c.dead) {
        c.deadT = (c.deadT || 0) + dt;
        if (c.deadT > 5) {
          c.driver = 'wreck';
          police.force.splice(i, 1);
        }
      }
    }

    // spawn up to the wanted level's strength, at the city's edge
    var active = 0;
    for (i = 0; i < police.force.length; i++) if (!police.force[i].dead) active++;
    if (police.stars > 0 && active < DESIRED[police.stars] && police.spawnCd <= 0) {
      police.spawnCd = 2.2;
      spawnCruiser(player);
    }

    // sight & decay: unseen long enough and the heat bleeds away
    // "seen" (< 62 m) drives the bust meter; "contact" (< 115 m) is a
    // cruiser close enough to still be hunting — heat only bleeds off
    // once every cruiser has genuinely lost the player.
    var seen = false, contact = false;
    for (i = 0; i < police.force.length; i++) {
      c = police.force[i];
      if (c.driver !== 'police' || c.dead) continue;
      var dc = Math.sqrt(CVH.dist2(c.pos.x, c.pos.z, player.x, player.z));
      if (dc < 62) seen = true;
      if (dc < 115) contact = true;
    }
    if (contact) police.unseenT = 0;
    else police.unseenT += dt;
    if (police.heat > 0 && police.unseenT > 4) {
      police.heat = Math.max(0, police.heat - 8.5 * dt);
      if (police.heat <= 0) { police.stars = 0; standDown(); }
    }

    // pursuit — only cars still driven by the police (QA item 2)
    var nearest = Infinity;
    for (i = 0; i < police.force.length; i++) {
      c = police.force[i];
      if (c.driver !== 'police') continue;
      pursuit(c, dt, player);
      var dd = CVH.dist(c.pos.x, c.pos.z, player.x, player.z);
      if (dd < nearest) nearest = dd;
    }

    // bust meter: close cruisers + a slow / on-foot player
    var vulnerable = !player.car || Math.abs(player.car.speed) < 2.2;
    if (police.stars > 0 && vulnerable && nearest < 10.5) {
      police.bust = Math.min(1, police.bust + dt / 2.4);
      if (police.bust >= 1 && CVH.onPlayerDown) {
        police.bust = 0;
        CVH.onPlayerDown('busted');
      }
    } else {
      police.bust = Math.max(0, police.bust - dt * (vulnerable ? 0.5 : 1.4));
    }

    CVH.audio.siren(police.stars > 0 && nearest < 62, dt);
  };

  police.debugForceCount = function () {
    var n = 0;
    for (var i = 0; i < police.force.length; i++) if (police.force[i].driver === 'police') n++;
    return n;
  };
})();
