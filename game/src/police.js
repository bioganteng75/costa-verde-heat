// police.js — the wanted system. Crimes are only heat if somebody sees them:
// a pedestrian within earshot or a cruiser nearby. Heat decays while the
// player stays unseen. Cruisers spawn at the city edge, steer for where the
// player is heading, and fill the bust meter when they pin a slow player.
CVH.police = {
  heat: 0,          // 0..500; stars = ceil(heat/100)
  stars: 0,
  cars: [],         // cruisers currently in the force (driver === 'police')
  unseenT: 0,
  bust: 0,          // 0..1
  _spawnT: 0,
  HEAT: { theft: 55, assault: 70, shots: 45, hitAndRun: 110, policeHit: 120, reckless: 22 },

  reportCrime(kind, pos) {
    let witnessed = false;
    for (const ped of CVH.peds.list) {
      const pp = ped.h.group.position;
      if (CVH.u.dist2(pos.x, pos.z, pp.x, pp.z) < 26) { witnessed = true; break; }
    }
    if (!witnessed) {
      for (const c of this.cars) {
        const cp = c.group.position;
        if (CVH.u.dist2(pos.x, pos.z, cp.x, cp.z) < 38) { witnessed = true; break; }
      }
    }
    if (!witnessed) return false;
    this.heat = Math.min(500, this.heat + (this.HEAT[kind] || 30));
    this._recalc();
    return true;
  },

  _recalc() { this.stars = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 100)); },

  playerSeen() {
    const P = CVH.player.pos;
    for (const c of this.cars) {
      if (c.dead || c.driver !== 'police') continue;
      const cp = c.group.position;
      if (CVH.u.dist2(P.x, P.z, cp.x, cp.z) < 46) return true;
    }
    return false;
  },

  // QA fix: a cruiser the player steals leaves the force at once, so the
  // pursuit below can never steer a car the player is driving.
  removeFromForce(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  },

  reset(scene) {
    // Turn every cruiser back into a parked car and clear all heat.
    for (const c of this.cars) {
      if (c.driver === 'police') c.driver = 'parked';
      c.ai = null;
    }
    this.cars = [];
    this.heat = 0;
    this.stars = 0;
    this.bust = 0;
    this.unseenT = 0;
  },

  update(dt, scene) {
    const M = CVH.main;
    const W = CVH.world;
    const P = CVH.player.pos;
    const playerCar = M.playerCar;
    const focus = playerCar ? playerCar.group.position : P;
    const playerSpeed = playerCar ? Math.abs(playerCar.speed) : CVH.player.speedNow;

    // Heat decay while unseen.
    if (this.playerSeen()) this.unseenT = 0; else this.unseenT += dt;
    if (this.unseenT > 4 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * (this.stars >= 3 ? 5 : 9));
      this._recalc();
    }

    // QA fix: when the heat dies, the force stands down — but a wrecked
    // cruiser stays a wreck. Only intact cars peel off and become traffic.
    if (this.stars === 0 && this.cars.length) {
      for (const c of this.cars) {
        if (c.driver !== 'police') continue;
        if (c.dead) {
          c.driver = 'parked';
        } else {
          CVH.vehicles.initTraffic(c, W);
        }
      }
      this.cars = [];
      this.bust = 0;
    }

    // Spawn cruisers at edge intersections until the force matches the stars.
    const desired = this.stars === 0 ? 0 : Math.min(2 + this.stars, 6);
    this._spawnT -= dt;
    const active = this.cars.filter((c) => !c.dead).length;
    if (active < desired && this._spawnT <= 0) {
      this._spawnT = 2.4;
      const edges = [
        { x: W.roadX(0), z: W.roadZ(Math.floor(Math.random() * (W.ROWS + 1))) },
        { x: W.roadX(W.COLS), z: W.roadZ(Math.floor(Math.random() * (W.ROWS + 1))) },
        { x: W.roadX(Math.floor(Math.random() * (W.COLS + 1))), z: W.roadZ(0) },
        { x: W.roadX(Math.floor(Math.random() * (W.COLS + 1))), z: W.roadZ(W.ROWS) },
      ];
      let spot = edges[Math.floor(Math.random() * edges.length)];
      if (CVH.u.dist2(spot.x, spot.z, focus.x, focus.z) < 55) spot = edges[(edges.indexOf(spot) + 2) % edges.length];
      const cruiser = CVH.vehicles.create(scene, 'police', spot.x, spot.z, Math.random() * Math.PI * 2, 0);
      cruiser.driver = 'police';
      M.cars.push(cruiser);
      this.cars.push(cruiser);
    }

    // Pursuit: steer for the player's predicted position.
    let anyNear = false;
    for (const car of this.cars) {
      if (car.dead || car.driver !== 'police') continue; // never steer a stolen car
      const cp = car.group.position;
      const d = CVH.u.dist2(cp.x, cp.z, focus.x, focus.z);
      if (d < 60) CVH.vehicles.flashPolice(car, M.time);
      if (d < 9) anyNear = true;
      const lead = playerCar ? Math.min(1.1, d / 26) : 0.4;
      const tx = focus.x + Math.sin(playerCar ? playerCar.heading : CVH.player.heading) * (playerCar ? Math.abs(playerCar.speed) : 2) * lead;
      const tz = focus.z + Math.cos(playerCar ? playerCar.heading : CVH.player.heading) * (playerCar ? Math.abs(playerCar.speed) : 2) * lead;
      const desired = Math.atan2(tx - cp.x, tz - cp.z);
      const diff = CVH.u.angleDiff(car.heading, desired);
      const ctl = {
        throttle: d > 7 ? 1 : 0.25,
        steer: CVH.u.clamp(diff * 1.7, -1, 1),
        brake: Math.abs(diff) > 2.4 && d < 12,
        handbrake: false,
      };
      CVH.vehicles.step(car, ctl, dt);
      W.collideCircle(cp, car.radius + 0.4);
    }
    CVH.audio.siren(this.stars > 0 && this.cars.some((c) => !c.dead && c.driver === 'police'));

    // Bust meter: police close + player slow = trouble.
    if (this.stars > 0 && anyNear && playerSpeed < 2.2) {
      this.bust += dt / 2.3;
      if (this.bust >= 1) { this.bust = 0; M.onBusted(); }
    } else {
      this.bust = Math.max(0, this.bust - dt * 0.55);
    }
  },
};
