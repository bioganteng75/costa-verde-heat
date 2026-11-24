// shots.js — deterministic screenshot scenes for the entry's screenshots.
// Each scene arranges REAL game state (the actual player, cars, police force,
// mission state and HUD), freezes it, and lets main's shot branch render it.
// Nothing here is a mock-up: it is the game, posed.
CVH.shots = {
  duskF: 0.1,

  _cam(focus, yaw, pitch, dist) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = Math.sin(yaw) * cp, fz = Math.cos(yaw) * cp;
    CVH.main.camera.position.set(focus.x - fx * dist, focus.y + 1.7 + sp * dist, focus.z - fz * dist);
    CVH.main.camera.lookAt(focus.x, focus.y + 1.55, focus.z);
    CVH.camera.yaw = yaw;
    CVH.camera.pitch = pitch;
  },

  _light(kind, focus) {
    const M = CVH.main;
    if (kind === 'dusk') {
      M._sun.position.set(focus.x - 90, 30, focus.z + 46);
      M._sun.intensity = 0.8;
      M._sun.color.setHex(0xff9a4d);
      M._hemi.intensity = 0.55;
      M.scene.background.setHex(0xf2a56b);
      M.scene.fog.color.setHex(0xf2a56b);
      this.duskF = 0.85;
    } else {
      M._sun.position.set(focus.x + 55, 115, focus.z + 35);
      M._sun.intensity = 1.18;
      M._sun.color.setHex(0xfff2d8);
      M._hemi.intensity = 0.78;
      M.scene.background.setHex(0x8fd4f2);
      M.scene.fog.color.setHex(0x8fd4f2);
      this.duskF = 0.05;
    }
    M._sun.target.position.copy(focus);
  },

  _parkTraffic(x, z, heading, type, colorIdx) {
    const car = CVH.vehicles.create(CVH.main.scene, type, x, z, heading, colorIdx);
    car.driver = 'traffic';
    CVH.main.cars.push(car);
    return car;
  },

  setup(name) {
    const M = CVH.main;
    const W = CVH.world;
    const P = CVH.player;
    M.cash = 860;
    if (name === 'cover') {
      // Street level on the hotel avenue: hero with pistol drawn, traffic
      // rolling past, towers all around, minimap alive.
      const x = W.roadX(3), z = W.roadZ(3) + 2;
      P.pos.set(x, 0, z);
      P.heading = 0.5;
      P.weapon = 'pistol';
      P.gunMesh.visible = true;
      P.h.armR.rotation.x = -1.45;
      P.h.group.rotation.y = P.heading;
      this._parkTraffic(x - 3.2, z - 16, 0, 'sedan', 1);
      this._parkTraffic(x + 3.2, z + 13, Math.PI, 'taxi', 0);
      this._parkTraffic(x - 3.2, z + 26, 0, 'sport', 2);
      this._light('morning', P.pos);
      this._cam(P.pos, P.heading, 0.15, 5.0);
    } else if (name === 'drive') {
      // Flat out up the coastal avenue at dusk, sea on the left shoulder.
      const car = CVH.vehicles.create(M.scene, 'sport', W.roadX(8) - 2, W.roadZ(3), 0, 2);
      car.driver = 'player';
      car.speed = 26;
      M.cars.push(car);
      M.playerCar = car;
      P.h.group.visible = false;
      this._parkTraffic(W.roadX(8) + 3.4, W.roadZ(3) + 24, Math.PI, 'taxi', 0);
      this._light('dusk', car.group.position);
      this._cam(car.group.position, 0, 0.3, 10.5);
    } else if (name === 'chase') {
      // Four stars, finale job at the "shake the heat" step: two cruisers on
      // the tail, two more angled across the road ahead as a roadblock.
      const car = CVH.vehicles.create(M.scene, 'sedan', W.roadX(4), W.roadZ(2), 0, 3);
      car.driver = 'player';
      car.speed = 21;
      M.cars.push(car);
      M.playerCar = car;
      P.h.group.visible = false;
      const spots = [
        { x: W.roadX(4) - 2.5, z: W.roadZ(2) - 10, h: 0.15 },
        { x: W.roadX(4) + 3, z: W.roadZ(2) - 17, h: -0.1 },
        { x: W.roadX(4) - 3.4, z: W.roadZ(2) + 27, h: 1.15 },
        { x: W.roadX(4) + 3.4, z: W.roadZ(2) + 27, h: -1.15 },
      ];
      for (const s of spots) {
        const cop = CVH.vehicles.create(M.scene, 'police', s.x, s.z, s.h, 0);
        cop.driver = 'police';
        cop.lightBar.redMat.emissiveIntensity = 2.4;
        cop.lightBar.blueMat.emissiveIntensity = 2.4;
        M.cars.push(cop);
        CVH.police.cars.push(cop);
      }
      CVH.police.heat = 360;
      CVH.police._recalc();
      const def = CVH.missions.JOBS[5];
      CVH.missions.jobIndex = 5;
      CVH.missions.active = { def, steps: def.steps(), stepIdx: 1, timeLeft: 0, targetCar: null, cpIdx: 4 };
      this._light('morning', car.group.position);
      this._cam(car.group.position, 0, 0.32, 10.5);
    } else if (name === 'mission') {
      // Hot Lunch, second leg: taxi homing in on the HOTEL SOL pillar with
      // the clock running down on the banner.
      const def = CVH.missions.JOBS[1];
      CVH.missions.jobIndex = 1;
      CVH.missions.active = { def, steps: def.steps(), stepIdx: 1, timeLeft: 72, targetCar: null, cpIdx: 0 };
      const car = CVH.vehicles.create(M.scene, 'taxi', W.roadX(3) - 2, W.roadZ(3) + 16, Math.PI, 0);
      car.driver = 'player';
      car.speed = 17;
      M.cars.push(car);
      M.playerCar = car;
      P.h.group.visible = false;
      this._light('morning', car.group.position);
      this._cam(car.group.position, Math.PI, 0.3, 10.5);
    }
    // Position the objective pillar for the posed mission state.
    CVH.missions.update(0);
    CVH.hud.frame();
  },
};
