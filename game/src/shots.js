// shots.js — deterministic screenshot scenes, selected with ?shot=<name>.
// Each scene arranges REAL game state (the actual player, cars, police and
// mission objects), freezes the action, aims the gameplay camera, renders a
// warm-up of frames and then sets window.__shotReady for the capture tool.
window.CVH = window.CVH || {};

CVH.shots = {
  name: null,

  detect() {
    const q = new URLSearchParams(location.search);
    this.name = q.get('shot');
    return this.name;
  },

  // Called by main once the world exists and state is 'playing'.
  setup(G) {
    const W = CVH.world, L = W.landmarks, P = CVH.playerCtl;
    const cam = CVH.camera;
    G.frozen = true;
    const place = (car, x, z, heading) => {
      car.group.position.set(x, 0, z);
      car.heading = heading; car.group.rotation.y = heading;
      car.vel.set(0, 0, 0);
      return car;
    };
    const trafficAt = (type, x, z, heading, color) => {
      const car = CVH.vehicles.create(type, { driver: 'traffic', x, z, heading, color });
      G.scene.add(car.group); G.cars.push(car);
      return car;
    };

    if (this.name === 'cover') {
      // Street level downtown: hero on foot in the foreground, avenue of
      // towers ahead, traffic rolling past, Marisol's marker across town.
      P.pos.set(0, 0, 40);
      P.heading = Math.PI;
      P.weapon = 'pistol';
      P.h.group.rotation.y = P.heading;
      P.h.rArm.rotation.x = -1.45;         // gun arm up, mid-patrol pose
      trafficAt('sedan', 3.4, 18, Math.PI, 0x3d7bd9);
      trafficAt('taxi', -3.4, 64, 0, undefined);
      trafficAt('sport', 3.4, -20, Math.PI, 0xd94f3d);
      CVH.missions.jobIndex = 0;
      cam.yaw = Math.PI; cam.pitch = 0.3; cam.dist = 8.5;
      cam.snap(P.pos);
      G.cash = 350;
    } else if (this.name === 'drive') {
      // Behind a sport coupe at speed on the coastal avenue at golden light.
      const car = trafficAt('sport', 251.4, 120, Math.PI, 0x8e5bd6);
      car.driver = 'player';
      G.playerCar = car;
      P.h.group.visible = false;
      car.vel.set(0, 0, -24);
      trafficAt('sedan', 251.4, 55, Math.PI, 0xf2f0e6);
      trafficAt('moto', 244.6, 48, 0, 0x3fae6a);
      G.dayT = 0.385;                      // late golden afternoon, sun low
      cam.yaw = Math.PI; cam.pitch = 0.3;
      cam.snap(car.group.position);
      G.cash = 780;
    } else if (this.name === 'chase') {
      // Four stars: pursuit cars with flashing bars boxing the player in.
      const car = trafficAt('sport', 62, 3.4, Math.PI / 2, 0xd92323);
      car.driver = 'player';
      G.playerCar = car;
      P.h.group.visible = false;
      car.vel.set(20, 0, 0);
      // Roadblock ahead with light bars facing the camera, one car alongside.
      const cop1 = CVH.vehicles.create('police', { driver: 'police', x: 82, z: 0.2, heading: -Math.PI / 2 + 0.25 });
      const cop2 = CVH.vehicles.create('police', { driver: 'police', x: 84, z: 7.6, heading: -Math.PI / 2 - 0.3 });
      const cop3 = CVH.vehicles.create('police', { driver: 'police', x: 63, z: 9.6, heading: Math.PI / 2 });
      for (const c of [cop1, cop2, cop3]) { G.scene.add(c.group); G.cars.push(c); CVH.police.cars.push(c); }
      CVH.police.setHeat(CVH.police.THRESH[4] + 6);
      // The finale's "shake the heat" step gives the banner its chase text.
      CVH.missions.jobIndex = 5;
      CVH.missions.active = { job: CVH.missions.JOBS[5], steps: CVH.missions.JOBS[5].steps(L), stepIdx: 4, timer: 0 };
      CVH.fx.burst(72, 0.6, 6, { count: 8, color: 0xffb347, spread: 2, up: 2, life: 3 });
      cam.yaw = Math.PI / 2; cam.pitch = 0.34; cam.dist = 12.5;
      cam.snap(car.group.position);
      G.cash = 1130;
    } else if (this.name === 'mission') {
      // Timed job: taxi flying toward the gold pillar, timer on the banner.
      // Westbound on the z=124 avenue: the gold pillar stands dead ahead.
      const car = trafficAt('taxi', -30, 120.6, -1.6, undefined);
      car.driver = 'player';
      G.playerCar = car;
      P.h.group.visible = false;
      car.vel.set(-17, 0, -0.5);
      CVH.missions.jobIndex = 1;
      CVH.missions.active = {
        job: CVH.missions.JOBS[1],
        steps: CVH.missions.JOBS[1].steps(L),
        stepIdx: 1, timer: 54,
      };
      cam.yaw = -1.6; cam.pitch = 0.3;
      cam.snap(car.group.position);
      G.cash = 560;
    }
    // A few skid marks under fast cars sell the speed in stills.
    if (this.name === 'drive' || this.name === 'chase') CVH.fx.addShake(0.12);
  },
};
