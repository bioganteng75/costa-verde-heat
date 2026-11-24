// shots.js — deterministic screenshot scenes (?shot=start|drive|chase|mission).
// main.js calls shots.setup() after boot when the query asks for it, and
// shots.update() every frame; after the scene has rendered a while it
// raises window.__shotReady so the capture harness can shoot.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var frames = 0;
  var active = false;

  var shots = {
    name: null,

    setup: function () {
      var params = new URLSearchParams(window.location.search);
      var name = params.get('shot');
      if (!name) return false;
      shots.name = name;
      active = true;
      CVH.missions.taxiEnabled = false; // no random taxi offers inside a staged shot
      var player = CVH.player;
      var menu = document.getElementById('menu');
      if (menu) menu.style.display = 'none';
      CVH.world.holdDay = false;

      if (name === 'start') {
        CVH.state = 'playing';
        CVH.world.setDayT(0.42);
        player.x = 150; player.z = 49;
        player.heading = -Math.PI / 2; player.camYaw = -Math.PI / 2; player.camPitch = 0.3;
        // keep pedestrians out of the camera's face for a clean hero shot
        CVH.world.peds.forEach(function (p) {
          if (U.dist(p.x, p.z, player.x, player.z) < 42) { p.visible = false; p.mesh.visible = false; }
        });
        // a couple of cars cruising the avenue in frame
        var c1 = CVH.vehicles.spawn('sedan', 172, 43, -Math.PI / 2, 'traffic', 0x3e6fb0);
        c1.speed = 7;
        var c2 = CVH.vehicles.spawn('coupe', 116, 37, Math.PI / 2, 'traffic', 0xe0a52c);
        c2.speed = 7;
      } else if (name === 'drive') {
        CVH.state = 'playing';
        CVH.world.setDayT(0.96); // true dusk: lit windows, headlights, signs
        var car = CVH.vehicles.spawn('sport', 120, 43, -Math.PI / 2, 'parked', 0xd93425);
        player.x = car.x; player.z = car.z;
        player.enterCar(car);
        car.speed = 24.4; // ~88 km/h on the speedo
        // snap the chase camera behind the car
        CVH.camera.position.set(car.x - 9.5, 3.4, car.z);
      } else if (name === 'chase') {
        CVH.state = 'playing';
        CVH.world.setDayT(0.55);
        var ride = CVH.vehicles.spawn('coupe', 0, 43, -Math.PI / 2, 'parked', 0xe0a52c);
        player.x = ride.x; player.z = ride.z;
        player.enterCar(ride);
        ride.speed = 13;
        CVH.police.setHeat(380); // 4 stars
        var p1 = CVH.police.spawnCruiser(0, 40);
        p1.x = -13; p1.z = 36; p1.yaw = -Math.PI / 2; p1.speed = 12;
        var p2 = CVH.police.spawnCruiser(0, 40);
        p2.x = 10; p2.z = 55; p2.yaw = -Math.PI / 1.4; p2.speed = 10;
        var p3 = CVH.police.spawnCruiser(0, 40);
        p3.x = -4; p3.z = 24; p3.yaw = -Math.PI / 2.4; p3.speed = 11;
        [p1, p2, p3].forEach(function (c) { CVH.vehicles.syncMesh(c); });
        CVH.camera.position.set(ride.x - 10, 3.6, ride.z + 2);
      } else if (name === 'mission') {
        CVH.state = 'playing';
        CVH.world.setDayT(0.35);
        // on the z=-40 avenue itself, marker straight ahead down the road
        var mcar = CVH.vehicles.spawn('coupe', 96, -43, Math.PI / 2, 'parked', 0x2c6eb0);
        player.x = mcar.x; player.z = mcar.z;
        player.enterCar(mcar);
        mcar.speed = 11;
        // jump straight to the timed deliver stage of Job 4
        CVH.missions.active = 3;
        CVH.missions.stage = 1;
        CVH.missions.timer = 71;
        CVH.camera.position.set(mcar.x - 8, 3.4, mcar.z + 6);
      }
      if (player.mesh && !player.driving) {
        player.mesh.position.set(player.x, 0, player.z);
        player.mesh.rotation.y = player.heading;
      }
      return true;
    },

    update: function () {
      if (!active) return;
      frames++;
      // Hold the staged cruising speeds (no throttle input in a shot,
      // and plain drag would bleed the speed off before the capture).
      var p = CVH.player;
      if (p.driving && p.car) {
        if (shots.name === 'drive') {
          p.car.speed = 24.4;
          CVH.police.heat = 0; // a clean cruise: no stars in this shot
          CVH.police.bust = 0;
          if (CVH.police.force.length) CVH.police.setHeat(0);
        } else if (shots.name === 'chase') {
          p.car.speed = 13;
          CVH.police.heat = 380; // hold exactly 4 stars
          CVH.police.bust = 0;
          // Hold the pursuit in a composed formation around the player:
          // two cruisers astern, one cutting in ahead, the rest trailing.
          var car = p.car;
          var f = U.facing(car.yaw);
          var r = U.rightOf(car.yaw);
          var slots = [
            { back: 5.5, lat: -5.8, dyaw: 0.1 },
            { back: 6.5, lat: 5.8, dyaw: -0.1 },
            { back: -11, lat: 4.8, dyaw: -0.35 },
            { back: -16, lat: -5.5, dyaw: 0.25 }
          ];
          CVH.police.force.forEach(function (c, i) {
            if (c.dead) return;
            var s = slots[i % slots.length];
            c.x = car.x - f.x * s.back + r.x * s.lat;
            c.z = car.z - f.z * s.back + r.z * s.lat;
            c.yaw = car.yaw + s.dyaw;
            c.speed = 13;
            CVH.vehicles.syncMesh(c);
          });
        } else if (shots.name === 'mission') {
          p.car.speed = 11;
        }
      }
      if (frames === 50) window.__shotReady = true;
    }
  };

  CVH.shots = shots;
})();
