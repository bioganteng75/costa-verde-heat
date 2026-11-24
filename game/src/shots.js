// shots.js — staged screenshot scenes, selected with ?shot=<name>&seed=1.
// After staging, a few simulation steps run and window.__shotReady is set so
// the capture harness knows the frame is composed.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;

  function params() {
    try { return new URLSearchParams(window.location.search); } catch (e) { return null; }
  }

  function stage(name) {
    var P = CVH.player.data;
    CVH.debug.newGame();
    window.__manualStep = true;
    var i;
    var holdSpeed = null;
    if (name === 'cover') {
      W.setDayT(0.55);
      CVH.debug.teleport(193, 30);
      CVH.debug.setHeading(-0.6);
      CVH.debug.setCamYaw(-0.6 + Math.PI);
      // a little life around the hero
      var c1 = CVH.vehicles.spawnCar('sedan', 188, 6, Math.PI, 'parked', 0x2e6db8);
      var c2 = CVH.vehicles.spawnCar('taxi', 203, 58, 0, 'parked', 0xf2b21b);
      CVH.vehicles.syncMesh(c1); CVH.vehicles.syncMesh(c2);
    } else if (name === 'drive') {
      W.setDayT(0.96); // true dusk: lit windows, glowing signs, headlights
      var sport = CVH.vehicles.spawnCar('coupe', 196.5, 70, Math.PI, 'parked', 0xd23b3b);
      CVH.vehicles.syncMesh(sport);
      CVH.player.enterCar(sport);
      sport.speed = 23.6; holdSpeed = 23.6; // ~85 km/h on the HUD
      CVH.debug.setCamYaw(Math.PI);
      // keep the dusk from advancing away during the staged steps
      CVH.debug.holdDay = true;
    } else if (name === 'chase') {
      W.setDayT(0.7);
      var ride = CVH.vehicles.spawnCar('sedan', 46.5, 30, 0, 'parked', 0xb8452e);
      CVH.vehicles.syncMesh(ride);
      CVH.player.enterCar(ride);
      ride.speed = 12.8; holdSpeed = 12.8; // ~46 km/h
      CVH.police.setHeat(200); // 4 stars
      for (i = 0; i < 4; i++) CVH.police.spawnCruiser(ride.x, ride.z);
      // pull the pack into a readable formation behind/around the player
      var offs = [[-7, -9], [6, -11], [-2, -17], [11, -4]];
      CVH.police.force.forEach(function (c, j) {
        if (offs[j]) { c.x = ride.x + offs[j][0]; c.z = ride.z + offs[j][1]; c.heading = 0; CVH.vehicles.syncMesh(c); }
      });
      CVH.debug.setCamYaw(0);
    } else if (name === 'mission') {
      W.setDayT(0.6);
      CVH.missions.startJob(2); // Downtown Dash (timed)
      var car = CVH.vehicles.spawnCar('coupe', 12, -128, 0.7, 'parked', 0xe0a52e);
      CVH.vehicles.syncMesh(car);
      CVH.player.enterCar(car);
      car.speed = 10.8; holdSpeed = 10.8; // ~39 km/h
      // stage 0 completes en route staging: nudge into its radius, then back out
      CVH.debug.teleport(0, -150);
      CVH.debug.step(0.05); // stage 0 -> stage 1 (deliver downtown)
      CVH.debug.teleport(14, -116);
      car.heading = Math.atan2(50 - 14, -8 + 116);
      CVH.debug.setCamYaw(car.heading);
    }
    for (i = 0; i < 4; i++) CVH.debug.step(0.05);
    if (holdSpeed !== null && P.driving) P.driving.speed = holdSpeed;
    CVH.hud.update();
    window.__shotReady = true;
  }

  CVH.shots = {
    init: function () {
      var p = params();
      if (!p) return;
      var name = p.get('shot');
      if (!name) return;
      try { stage(name); } catch (e) {
        window.__shotError = String(e && e.stack || e);
      }
    }
  };
})();
