// shots.js — deterministic screenshot scenes for ?shot=<name>&seed=1.
// Each setup poses REAL game state (the actual player, cars, police and
// mission objects), then main.js freezes the simulation, renders warm-up
// frames and sets window.__shotReady. Nothing here draws anything fake:
// the HUD, minimap, pillar and banners are the game's own.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};

  function poseCar(type, x, z, yaw, driver, speed) {
    var car = CVH.vehicles.makeCar(type, x, z, yaw, { driver: driver || 'parked' });
    car.speed = speed || 0;
    return car;
  }
  function putPlayerIn(car) {
    car.driver = 'player';
    CVH.player.car = car;
    CVH.player.mesh.visible = false;
    CVH.player.x = car.pos.x;
    CVH.player.z = car.pos.z;
    CVH.player.heading = car.yaw;
  }

  var shots = CVH.shots = {};

  shots.setup = function (name) {
    var player = CVH.player;
    player.cash = 1240;
    if (name === 'cover') {
      CVH.dayT = 0.4;
      player.reset(5, 40, -0.3);
      player.hasPistol = true;
      player.weapon = 'pistol';
      poseCar('sedan', -3.6, 22, Math.PI, 'parked');
      poseCar('sport', 3.6, 58, 0, 'parked');
      poseCar('taxi', -3.6, 68, Math.PI, 'parked');
      // close over-the-shoulder: hero large in frame, avenue of
      // towers running away ahead of him, traffic on both lanes
      return { cam: [8.4, 2.7, 32.2], look: [3.6, 1.5, 45] };
    }
    if (name === 'drive') {
      CVH.dayT = 0.96; // sun on the horizon: dusk factor ~0.76, lit windows
      var sport = poseCar('sport', 183.6, 62, Math.PI, 'parked', 26);
      putPlayerIn(sport);
      poseCar('taxi', 183.6, 18, Math.PI, 'parked', 9);
      poseCar('sedan', 176.4, 4, 0, 'parked', 11);
      return { cam: [183.6, 3.6, 72.5], look: [183.6, 1.2, 40] };
    }
    if (name === 'chase') {
      CVH.dayT = 0.8;
      var hero = poseCar('sport', 40, -26.4, Math.PI / 2, 'parked', 24);
      putPlayerIn(hero);
      var c1 = poseCar('police', 27, -26.4, Math.PI / 2, 'police', 22);
      var c2 = poseCar('police', 55, -34.5, 2.25, 'police', 0);
      var c3 = poseCar('police', 57, -22.5, -2.5, 'police', 0);
      CVH.police.force.push(c1, c2, c3);
      CVH.police.setHeat(400); // four stars
      // the escape-stage banner, exactly as job 6 shows it mid-flight
      CVH.missions.active = { job: 5, stage: 1, timeLeft: null, targetCar: null };
      [c1, c2, c3].forEach(function (c, i) {
        if (c.barMats) {
          c.barMats[0].emissiveIntensity = i % 2 ? 0.15 : 3.2;
          c.barMats[1].emissiveIntensity = i % 2 ? 3.2 : 0.15;
        }
      });
      return { cam: [29, 3.4, -19.5], look: [48, 1.2, -28] };
    }
    // mission: job 2's timed delivery, gold pillar ahead, timer running
    CVH.dayT = 0.52;
    player.reset(16, 6, -0.32);
    player.hasPistol = true;
    player.weapon = 'pistol';
    CVH.missions.active = { job: 1, stage: 1, timeLeft: 72, targetCar: null };
    poseCar('sedan', 3.6, 34, 0, 'parked');
    return { cam: [19.5, 3.1, -2.5], look: [11, 2.2, 22] };
  };
})();
