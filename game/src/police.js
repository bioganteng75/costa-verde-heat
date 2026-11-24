'use strict';
// Costa Verde Heat 3D — the Costa Verde PD. Heat runs 0..500 and shows as
// 0..5 stars. Crimes only count when witnessed (a pedestrian or a cruiser
// close enough to see/hear). Pursuit cars steer through vehicles.driveAI
// with a lead on the player's position. When heat dies, intact cruisers
// peel off into traffic and wrecks stay wrecks — they are never revived.

CVH.police = {
  heat: 0,
  stars: 0,
  cars: [],
  bust: 0,
  unseenT: 0,
  spawnT: 0,
  CRIMES: {
    shots:     { heat: 70,  range: 30 },
    assault:   { heat: 45,  range: 17 },
    theft:     { heat: 60,  range: 16 },
    hitrun:    { heat: 85,  range: 20 },
    hitpolice: { heat: 110, range: 26 },
    murder:    { heat: 120, range: 24 }
  },

  init: function () {
    this.heat = 0;
    this.stars = 0;
    this.cars = [];
    this.bust = 0;
    this.unseenT = 0;
  },

  reportCrime: function (type, pos, isPlayer) {
    if (!isPlayer) return;
    const c = this.CRIMES[type];
    if (!c) return;
    let witnessed = false;
    for (let i = 0; i < CVH.peds.length && !witnessed; i++) {
      const ped = CVH.peds[i];
      if (ped.dead) continue;
      const pp = ped.parts.group.position;
      if (CVH.dist2d(pp.x, pp.z, pos.x, pos.z) < c.range) witnessed = true;
    }
    for (let i = 0; i < this.cars.length && !witnessed; i++) {
      const cp = this.cars[i].mesh.position;
      if (CVH.dist2d(cp.x, cp.z, pos.x, pos.z) < c.range + 12) witnessed = true;
    }
    if (!witnessed) return;
    this.heat = Math.min(500, this.heat + c.heat);
    this.unseenT = 0;
  },

  // Remove a cruiser from the force (it was stolen). The car object keeps
  // existing in the world; the force simply no longer owns or steers it.
  removeFromForce: function (car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  },

  // Heat is gone: cruisers stand down. Intact ones become traffic; wrecked
  // ones are left exactly where they died, as parked wrecks.
  standDown: function () {
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.dead) {
        car.driver = null;
        car.aiTarget = null;
      } else {
        CVH.vehicles.adoptAsTraffic(car);
      }
    }
    this.cars = [];
    this.bust = 0;
  },

  forceReset: function () {
    this.heat = 0;
    this.stars = 0;
    this.standDown();
    this.unseenT = 0;
  },

  _spawnCruiser: function (scene) {
    const pl = CVH.player.mesh.position;
    for (let tries = 0; tries < 10; tries++) {
      const i = CVH.randInt(0, 7), j = CVH.randInt(0, 5);
      const x = CVH.world.roadX(i), z = CVH.world.roadZ(j);
      const d = CVH.dist2d(x, z, pl.x, pl.z);
      if (d < 52 || d > 95) continue;
      const car = CVH.vehicles.makeCar(scene, 'police', 0xf0f0ee);
      const road = CVH.vehicles.laneAt(x, z, 1);
      const lp = CVH.vehicles.lanePoint(road, road.axis === 'z' ? z : x);
      const heading = road.axis === 'z' ? (road.dir > 0 ? 0 : Math.PI) : (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      CVH.vehicles.placeCar(car, lp.x, lp.z, heading);
      car.driver = 'police';
      this.cars.push(car);
      return true;
    }
    return false;
  },

  update: function (dt, scene) {
    const pl = CVH.player;
    const ppos = pl.mesh.position;
    this.stars = this.heat <= 0 ? 0 : Math.ceil(this.heat / 100);

    // Line of sight, arcade style: any cruiser within 45 m sees the player.
    let seen = false, nearest = 1e9;
    for (let i = 0; i < this.cars.length; i++) {
      const cp = this.cars[i].mesh.position;
      const d = CVH.dist2d(cp.x, cp.z, ppos.x, ppos.z);
      if (d < nearest) nearest = d;
      if (d < 45) seen = true;
    }
    if (seen) this.unseenT = 0;
    else this.unseenT += dt;
    if (this.heat > 0 && this.unseenT > 4) {
      this.heat = Math.max(0, this.heat - 11 * dt);
      if (this.heat <= 0) this.standDown();
    }

    // Keep the force at strength for the current star level.
    if (this.stars > 0) {
      this.spawnT -= dt;
      if (this.cars.length < this.stars && this.spawnT <= 0) {
        this.spawnT = 1.1;
        this._spawnCruiser(scene);
      }
    }
    // Far-away spare cruisers quietly leave when the heat is low.
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const d = CVH.dist2d(car.mesh.position.x, car.mesh.position.z, ppos.x, ppos.z);
      if (d > 150 && this.stars <= 1) {
        this.cars.splice(i, 1);
        if (car.dead) car.driver = null; else CVH.vehicles.removeCar(car);
      }
    }

    // Pursuit steering: lead the target so cruisers cut corners on runners.
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.dead || car.driver !== 'police') continue;
      const cp = car.mesh.position;
      const dist = CVH.dist2d(cp.x, cp.z, ppos.x, ppos.z);
      const lead = CVH.clamp(dist / 26, 0, 1.1);
      car.aiTarget = {
        x: ppos.x + pl.vel.x * lead,
        z: ppos.z + pl.vel.z * lead
      };
      if (dist > 26) car.aiSpeed = car.cfg.maxF;
      else if (dist > 9) car.aiSpeed = CVH.clamp(dist * 1.5, 10, car.cfg.maxF);
      else car.aiSpeed = pl.inCar ? Math.max(4, pl.inCar.speed * 0.92) : 3.5;
    }

    // Bust meter: close police + a slow or on-foot player.
    if (this.stars >= 1 && nearest < 1e8) {
      const slow = !pl.inCar || pl.inCar.speed < 1.5;
      const range = pl.inCar ? 9.5 : 8.5;
      if (slow && nearest < range) this.bust = Math.min(1, this.bust + dt / 2.8);
      else this.bust = Math.max(0, this.bust - dt / 2);
    } else {
      this.bust = Math.max(0, this.bust - dt / 2);
    }

    // Siren audio follows the nearest cruiser.
    if (this.cars.length) CVH.audio.siren(true, CVH.clamp(nearest / 60, 0, 1));
    else CVH.audio.siren(false, 0);
  }
};
