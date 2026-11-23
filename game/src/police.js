// police.js — the wanted system. Crimes add heat when witnessed; heat cools
// when nobody watches. Patrol cars spawn at the city edge, chase with
// target-leading steering, and fill the bust meter when they pin you down.
window.CVH = window.CVH || {};

CVH.police = {
  heat: 0, stars: 0, unseenT: 99, bust: 0,
  cars: [], _spawnT: 0, _flashT: 0,
  CRIMES: { theft: 26, assault: 30, shot: 18, hitrun: 46, policeHit: 38, property: 12, reckless: 8 },
  THRESH: [0, 12, 32, 58, 88, 122],

  reset() { this.heat = 0; this.stars = 0; this.bust = 0; this.unseenT = 99; },

  setHeat(h) {
    this.heat = CVH.util.clamp(h, 0, 130);
    this._recalc();
  },
  _recalc() {
    let s = 0;
    for (let i = 0; i < this.THRESH.length; i++) if (this.heat >= this.THRESH[i]) s = i;
    this.stars = s;
  },

  // A crime at a position: full heat if a cop or a pedestrian can see it,
  // partial heat (word gets around) otherwise.
  reportCrime(kind, pos) {
    const G = CVH.G;
    if (!G || G.state !== 'playing') return;
    let seen = false;
    for (const c of this.cars) {
      if (!c.dead && CVH.util.dist2D(pos.x, pos.z, c.group.position.x, c.group.position.z) < 55) { seen = true; break; }
    }
    if (!seen) for (const ped of G.peds.list) {
      if (ped.state !== 'down' && CVH.util.dist2D(pos.x, pos.z, ped.pos.x, ped.pos.z) < 26) { seen = true; break; }
    }
    if (seen) this.unseenT = 0;
    const base = this.CRIMES[kind] || 10;
    this.setHeat(this.heat + (seen ? base : base * 0.45));
    if (kind === 'hitrun' || kind === 'assault') G.peds.scare(pos, 22);
  },

  // Is any officer currently looking at the player?
  playerSeen() {
    const G = CVH.G;
    const f = G.focusPos();
    for (const c of this.cars) {
      if (!c.dead && CVH.util.dist2D(f.x, f.z, c.group.position.x, c.group.position.z) < 55) return true;
    }
    return false;
  },

  update(dt) {
    const G = CVH.G, W = CVH.world;
    // Cooling off
    if (this.playerSeen()) this.unseenT = 0; else this.unseenT += dt;
    if (this.unseenT > 5 && this.heat > 0) {
      this.setHeat(this.heat - dt * (this.stars >= 3 ? 2.1 : 3.4));
      if (this.heat <= 0.01) { this.heat = 0; this._recalc(); }
    }
    // Despawn the force when the heat is gone: they peel off as traffic.
    if (this.stars === 0 && this.cars.length) {
      for (const c of this.cars) { c.driver = 'traffic'; CVH.vehicles.initTraffic(c, W); }
      this.cars = [];
      this.bust = 0;
    }
    // Spawning
    const desired = this.stars === 0 ? 0 : Math.min(1 + this.stars, 6);
    this._spawnT -= dt;
    if (this.cars.filter((c) => !c.dead).length < desired && this._spawnT <= 0) {
      this._spawnT = 2.2;
      this._spawnOne();
    }
    // Pursuit
    const focus = G.focusPos();
    const fvel = G.focusVel();
    let anyNear = false;
    this._flashT += dt;
    for (const car of this.cars) {
      if (car.dead) continue;
      const p = car.group.position;
      const d = CVH.util.dist2D(p.x, p.z, focus.x, focus.z);
      if (d < 65) anyNear = true;
      // Flash the light bar
      const phase = (this._flashT * 2.4 + (car.special || 0)) % 1;
      car.refs.lightL.material.color.setHex(phase < 0.5 ? 0xff3535 : 0x571010);
      car.refs.lightR.material.color.setHex(phase < 0.5 ? 0x102a57 : 0x3f7dff);
      if (d > 190) { // hopelessly far: teleport-respawn nearer the action
        this._placeNear(car);
        continue;
      }
      const tx = focus.x + fvel.x * 0.55, tz = focus.z + fvel.z * 0.55;
      const ctrl = CVH.vehicles.controlsToward(car, tx, tz, dt, 26 + this.stars * 2.2);
      CVH.vehicles.updateFree(car, dt, ctrl);
    }
    CVH.audio.siren(anyNear && this.stars > 0);
    // Bust meter
    const focusSpeed = G.focusSpeed();
    let pinning = false;
    for (const car of this.cars) {
      if (car.dead) continue;
      const d = CVH.util.dist2D(car.group.position.x, car.group.position.z, focus.x, focus.z);
      if (d < 8.5 && focusSpeed < 3) { pinning = true; break; }
    }
    if (pinning && this.stars > 0) this.bust = Math.min(1, this.bust + dt * 0.45);
    else this.bust = Math.max(0, this.bust - dt * 0.55);
    if (this.bust >= 1) G.busted();
  },

  _spawnOne() {
    const G = CVH.G, W = CVH.world;
    const car = CVH.vehicles.create('police', { driver: 'police', special: Math.random() });
    this._placeNear(car);
    G.scene.add(car.group);
    G.cars.push(car);
    this.cars.push(car);
  },

  _placeNear(car) {
    const G = CVH.G, W = CVH.world;
    const f = G.focusPos();
    let best = null, bestScore = -1;
    for (let tries = 0; tries < 12; tries++) {
      const ix = W.roadXs[Math.floor(Math.random() * W.roadXs.length)];
      const iz = W.roadZs[Math.floor(Math.random() * W.roadZs.length)];
      const d = CVH.util.dist2D(ix, iz, f.x, f.z);
      const score = d > 65 && d < 130 ? 100 - Math.abs(d - 90) : d;
      if (score > bestScore) { bestScore = score; best = { x: ix, z: iz }; }
    }
    car.group.position.set(best.x, 0, best.z);
    car.vel.set(0, 0, 0);
    car.heading = Math.atan2(f.x - best.x, f.z - best.z);
    car.group.rotation.y = car.heading;
  },
};
