'use strict';
// Costa Verde Heat 3D — deterministic screenshot scenes for ?shot=<name>.
// Each scene arranges REAL game state (the actual player, cars, police force
// and HUD), freezes the simulation, and lets the renderer settle; main.js
// counts frames and then sets window.__shotReady.

CVH.shots = {
  name: null,

  setup: function (name, scene) {
    this.name = name;
    const pl = CVH.player;
    const W = CVH.world;
    CVH.game.cash = 1250;

    if (name === 'cover') {
      W.phase = 0.2;
      W.applyTimeOfDay(scene);
      pl.reset(130, 14, 2.55);
      pl.weapon = 'pistol';
      pl.camYaw = -0.59;
      pl.camPitch = 0.15;
      pl.camDist = 5.0;
      // Traffic on the tower avenue, both directions.
      const c1 = CVH.vehicles.makeCar(scene, 'sedan', 0x4a7fd8);
      CVH.vehicles.placeCar(c1, 133.2, -18, Math.PI);
      c1.driver = 'traffic';
      const c2 = CVH.vehicles.makeCar(scene, 'sport', 0xd8574a);
      CVH.vehicles.placeCar(c2, 126.8, 34, 0);
      c2.driver = 'traffic';
      const c3 = CVH.vehicles.makeCar(scene, 'taxi', 0xf2c230);
      CVH.vehicles.placeCar(c3, 133.2, 44, Math.PI);
      c3.driver = 'traffic';
      // Pedestrians on the sidewalks either side of the avenue.
      const spots = [[122.2, -40], [137.8, -60], [137.8, -28], [122.2, 6], [137.8, 24]];
      for (let i = 0; i < spots.length && i < CVH.peds.length; i++) {
        CVH.peds[i].parts.group.position.set(spots[i][0], 0, spots[i][1]);
      }
    } else if (name === 'drive') {
      W.phase = 0.88; // dusk: lit windows, headlight beams
      W.applyTimeOfDay(scene);
      const car = CVH.vehicles.makeCar(scene, 'sport', 0xd8574a);
      CVH.vehicles.placeCar(car, 185.2, 66, Math.PI);
      car.vel.set(0, 0, -26);
      car.speed = 26;
      pl.forceEnter(car);
      const taxi = CVH.vehicles.makeCar(scene, 'taxi', 0xf2c230);
      CVH.vehicles.placeCar(taxi, 185.2, 38, Math.PI);
      taxi.vel.set(0, 0, -17);
      taxi.speed = 17;
      taxi.driver = 'traffic';
      const sedan = CVH.vehicles.makeCar(scene, 'sedan', 0xe8e4da);
      CVH.vehicles.placeCar(sedan, 178.8, -6, 0);
      sedan.driver = 'traffic';
      pl.camYaw = Math.PI;
      pl.camPitch = 0.26;
      pl.camDist = 7.4;
    } else if (name === 'chase') {
      W.phase = 0.3;
      W.applyTimeOfDay(scene);
      const car = CVH.vehicles.makeCar(scene, 'sedan', 0x3a3f45);
      CVH.vehicles.placeCar(car, 78, -10, 0);
      car.vel.set(0, 0, 15);
      car.speed = 15;
      pl.forceEnter(car);
      CVH.police.heat = 380; // four stars
      CVH.police.stars = 4;
      const mk = (x, z, h) => {
        const c = CVH.vehicles.makeCar(scene, 'police', 0xf0f0ee);
        CVH.vehicles.placeCar(c, x, z, h);
        c.driver = 'police';
        CVH.police.cars.push(c);
        return c;
      };
      mk(73.5, -25, 0.15);   // pursuers behind
      mk(84, -32, -0.1);
      mk(74.3, 23, 0.85);    // roadblock ahead, angled across the avenue
      mk(82.8, 26, -0.8);
      CVH.missions.debugSetObjective('SHAKE THE HEAT', null, null, null);
      pl.camYaw = 0;
      pl.camPitch = 0.3;
      pl.camDist = 8.6;
    } else if (name === 'mission') {
      W.phase = 0.24;
      W.applyTimeOfDay(scene);
      pl.reset(114, 4, 2.28);
      // The timed job's banner: gold pillar at the Hotel Sol entrance,
      // 55 m away, 1:12 on the clock.
      CVH.missions.debugSetObjective('Deliver the package to Hotel Sol', 156, -32, 72);
      const c1 = CVH.vehicles.makeCar(scene, 'sedan', 0x57b06a);
      CVH.vehicles.placeCar(c1, 133.2, -44, Math.PI);
      c1.driver = 'traffic';
      pl.camYaw = 2.28;
      pl.camPitch = 0.3;
      pl.camDist = 6.2;
    }
    W.sunFollow(CVH.player.mesh.position);
  }
};
