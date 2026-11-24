'use strict';
// Costa Verde Heat 3D — cars: low-poly builds (sedan, sport, taxi, motorcycle,
// truck, police cruiser with a flashing light bar), arcade driving physics
// with drift, lane-following traffic AI, and the shared steering used by
// police pursuit. A car's `driver` is null (parked), 'traffic', 'police' or
// 'player'. Wrecked cars (health <= 0) smoke, stop, and stay wrecked.

CVH.vehicles = {
  all: [],
  TYPES: {
    sedan:  { w: 1.85, l: 4.3, bodyH: 0.62, cabH: 0.55, accel: 15, maxF: 31, maxR: 9,  grip: 9,  radius: 1.9 },
    sport:  { w: 1.9,  l: 4.4, bodyH: 0.55, cabH: 0.45, accel: 21, maxF: 41, maxR: 10, grip: 10, radius: 1.9 },
    taxi:   { w: 1.85, l: 4.3, bodyH: 0.62, cabH: 0.55, accel: 15, maxF: 31, maxR: 9,  grip: 9,  radius: 1.9 },
    moto:   { w: 0.7,  l: 2.3, bodyH: 0.5,  cabH: 0,    accel: 23, maxF: 39, maxR: 6,  grip: 11, radius: 1.0 },
    truck:  { w: 2.2,  l: 6.6, bodyH: 1.5,  cabH: 0.8,  accel: 11, maxF: 24, maxR: 7,  grip: 8,  radius: 2.6 },
    police: { w: 1.85, l: 4.4, bodyH: 0.62, cabH: 0.55, accel: 18, maxF: 35, maxR: 9,  grip: 9.5, radius: 1.9 }
  },
  COLORS: [0xd8574a, 0x4a7fd8, 0xe8e4da, 0x3a3f45, 0x57b06a, 0xe8a13a, 0x8a5fb0, 0xcfd4d8, 0x7a4a35],

  _headlightTex: null,

  headlightTexture: function () {
    if (this._headlightTex) return this._headlightTex;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,240,190,0.85)');
    grad.addColorStop(0.4, 'rgba(255,230,160,0.35)');
    grad.addColorStop(1, 'rgba(255,220,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    this._headlightTex = new THREE.CanvasTexture(c);
    return this._headlightTex;
  },

  makeCar: function (scene, type, color) {
    const cfg = this.TYPES[type];
    const grp = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color: color });
    const glass = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x22262b });
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));

    const body = new THREE.Mesh(geo, paint);
    body.scale.set(cfg.w, cfg.bodyH, cfg.l);
    body.position.y = 0.38 + cfg.bodyH / 2;
    body.castShadow = true;
    grp.add(body);

    let wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(type === 'moto' ? 0.31 : 0.34, type === 'moto' ? 0.31 : 0.34, 0.24, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const addWheel = (x, z) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.34, z);
      const w = new THREE.Mesh(wheelGeo, dark);
      w.castShadow = true;
      pivot.add(w);
      grp.add(pivot);
      wheels.push({ pivot: pivot, mesh: w });
      return pivot;
    };

    let brakeMat = null, lightMats = null, cones = [];

    if (type === 'moto') {
      const tank = new THREE.Mesh(geo, paint);
      tank.scale.set(0.42, 0.3, 1.1);
      tank.position.set(0, 0.78, 0.1);
      grp.add(tank);
      const seat = new THREE.Mesh(geo, dark);
      seat.scale.set(0.4, 0.14, 0.8);
      seat.position.set(0, 0.82, -0.55);
      grp.add(seat);
      addWheel(0, 0.95); addWheel(0, -0.95);
    } else {
      const cab = new THREE.Mesh(geo, type === 'truck' ? paint : glass);
      cab.scale.set(cfg.w * 0.84, cfg.cabH, type === 'truck' ? 1.6 : cfg.l * 0.46);
      cab.position.set(0, 0.38 + cfg.bodyH + cfg.cabH / 2, type === 'truck' ? cfg.l / 2 - 1.1 : -cfg.l * 0.04);
      cab.castShadow = true;
      grp.add(cab);
      if (type === 'truck') {
        const cabGlass = new THREE.Mesh(geo, glass);
        cabGlass.scale.set(cfg.w * 0.86, 0.5, 0.9);
        cabGlass.position.set(0, 0.38 + cfg.bodyH + 0.42, cfg.l / 2 - 0.75);
        grp.add(cabGlass);
      }
      const wx = cfg.w / 2 - 0.08, wz = cfg.l / 2 - 0.85;
      addWheel(-wx, wz); addWheel(wx, wz); addWheel(-wx, -wz); addWheel(wx, -wz);
      // Brake lights.
      brakeMat = new THREE.MeshLambertMaterial({ color: 0x571b14, emissive: 0xff2a1a, emissiveIntensity: 0.25 });
      for (const sx of [-1, 1]) {
        const bl = new THREE.Mesh(geo, brakeMat);
        bl.scale.set(0.42, 0.14, 0.06);
        bl.position.set(sx * cfg.w * 0.32, 0.72, -cfg.l / 2 - 0.02);
        grp.add(bl);
      }
      // Headlight beams: cone geometry pre-rotated so the apex sits at the
      // lamp and the beam widens forward (+Z), gradient fading with length.
      const coneGeo = new THREE.ConeGeometry(1.45, 7, 12, 1, true);
      coneGeo.translate(0, -3.5, 0);
      coneGeo.rotateX(-Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        map: this.headlightTexture(), transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
      });
      for (const sx of [-1, 1]) {
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(sx * cfg.w * 0.32, 0.62, cfg.l / 2);
        cone.visible = false;
        grp.add(cone);
        cones.push(cone);
      }
    }

    if (type === 'taxi') {
      const signMat = new THREE.MeshLambertMaterial({ color: 0xffe9a3, emissive: 0xffc93c, emissiveIntensity: 0.7 });
      const sign = new THREE.Mesh(geo, signMat);
      sign.scale.set(0.8, 0.22, 0.4);
      sign.position.set(0, 0.38 + cfg.bodyH + cfg.cabH + 0.12, -cfg.l * 0.04);
      grp.add(sign);
    }
    if (type === 'police') {
      const barMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
      const bar = new THREE.Mesh(geo, barMat);
      bar.scale.set(1.25, 0.15, 0.46);
      bar.position.set(0, 0.38 + cfg.bodyH + cfg.cabH + 0.09, -cfg.l * 0.04);
      grp.add(bar);
      const red = new THREE.MeshLambertMaterial({ color: 0x550000, emissive: 0xff2211, emissiveIntensity: 0.2 });
      const blue = new THREE.MeshLambertMaterial({ color: 0x000055, emissive: 0x2266ff, emissiveIntensity: 0.2 });
      const rl = new THREE.Mesh(geo, red); rl.scale.set(0.5, 0.17, 0.4); rl.position.set(-0.32, bar.position.y + 0.02, bar.position.z); grp.add(rl);
      const bl2 = new THREE.Mesh(geo, blue); bl2.scale.set(0.5, 0.17, 0.4); bl2.position.set(0.32, bar.position.y + 0.02, bar.position.z); grp.add(bl2);
      lightMats = { red: red, blue: blue };
      // Black hood + trunk over the white paint.
      const hood = new THREE.Mesh(geo, dark);
      hood.scale.set(cfg.w * 0.96, 0.1, 1.0);
      hood.position.set(0, 0.38 + cfg.bodyH + 0.03, cfg.l / 2 - 0.55);
      grp.add(hood);
    }

    scene.add(grp);
    const car = {
      type: type, cfg: cfg, mesh: grp, color: color,
      heading: 0, vel: new THREE.Vector3(), speed: 0,
      health: 100, dead: false, driver: null,
      wheels: wheels, brakeMat: brakeMat, lightMats: lightMats, cones: cones,
      braking: false, steerVis: 0, smokeT: 0, blockedT: 0, hitPlayerCd: 0,
      road: null, aiTarget: null, aiSpeed: 0, decideCd: 0
    };
    grp.userData.car = car;
    this.all.push(car);
    return car;
  },

  placeCar: function (car, x, z, heading) {
    car.mesh.position.set(x, 0, z);
    car.heading = heading;
    car.mesh.rotation.y = heading;
    car.vel.set(0, 0, 0);
    car.speed = 0;
  },

  removeCar: function (car) {
    const i = this.all.indexOf(car);
    if (i >= 0) this.all.splice(i, 1);
    if (car.mesh.parent) car.mesh.parent.remove(car.mesh);
  },

  fwdOf: function (car) { return { x: Math.sin(car.heading), z: Math.cos(car.heading) }; },

  // Pick a lane state on the road network nearest to a point.
  laneAt: function (x, z, preferDir) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < 8; i++) { const d = Math.abs(x - CVH.world.roadX(i)); if (d < bd) { bd = d; bi = i; } }
    let bj = 0, bd2 = 1e9;
    for (let j = 0; j < 6; j++) { const d = Math.abs(z - CVH.world.roadZ(j)); if (d < bd2) { bd2 = d; bj = j; } }
    if (bd <= bd2) return { axis: 'z', index: bi, dir: preferDir || (CVH.rng() < 0.5 ? 1 : -1) };
    return { axis: 'x', index: bj, dir: preferDir || (CVH.rng() < 0.5 ? 1 : -1) };
  },

  lanePoint: function (road, along) {
    // Centre of the correct (right-hand) lane for a car travelling `dir`.
    if (road.axis === 'z') {
      return { x: CVH.world.roadX(road.index) - road.dir * 3.2, z: along };
    }
    return { x: along, z: CVH.world.roadZ(road.index) + road.dir * 3.2 };
  },

  adoptAsTraffic: function (car) {
    const f = this.fwdOf(car);
    const pref = car.road && car.road.axis === 'z' ? Math.sign(f.z) || 1 : Math.sign(f.x) || 1;
    car.road = this.laneAt(car.mesh.position.x, car.mesh.position.z, pref);
    car.driver = 'traffic';
    car.aiTarget = null;
  },

  spawnTraffic: function (scene, count) {
    for (let n = 0; n < count; n++) {
      const type = CVH.pick(['sedan', 'sedan', 'sedan', 'sport', 'taxi', 'moto', 'truck']);
      const car = this.makeCar(scene, type, type === 'taxi' ? 0xf2c230 : CVH.pick(this.COLORS));
      const axis = CVH.rng() < 0.5 ? 'z' : 'x';
      const road = {
        axis: axis,
        index: axis === 'z' ? CVH.randInt(0, 7) : CVH.randInt(0, 5),
        dir: CVH.rng() < 0.5 ? 1 : -1
      };
      const along = CVH.rand(-150, 150);
      const p = this.lanePoint(road, along);
      const heading = road.axis === 'z' ? (road.dir > 0 ? 0 : Math.PI) : (road.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.placeCar(car, p.x, p.z, heading);
      car.road = road;
      car.driver = 'traffic';
    }
  },

  spawnParked: function (scene, count) {
    const lots = [[-52, -52], [104, 52], [0, -104], [-52, 52], [104, -52]];
    for (let n = 0; n < count; n++) {
      const type = CVH.pick(['sedan', 'sedan', 'sport', 'moto', 'truck']);
      const car = this.makeCar(scene, type, CVH.pick(this.COLORS));
      if (n % 3 === 2) {
        // Curb parking along a random avenue.
        const i = CVH.randInt(0, 7);
        const x = CVH.world.roadX(i) + (CVH.rng() < 0.5 ? -5.4 : 5.4);
        const z = CVH.rand(-160, 160);
        this.placeCar(car, x, z, CVH.rng() < 0.5 ? 0 : Math.PI);
      } else {
        const lot = lots[n % lots.length];
        const x = lot[0] + CVH.rand(-13, 13), z = lot[1] + (n % 2 === 0 ? -10 : 10);
        this.placeCar(car, x, z, CVH.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      }
      car.driver = null;
    }
  },

  // ---- driving -------------------------------------------------------------------
  // Shared arcade step for the player's car. Reads CVH.input directly.
  drivePlayer: function (car, dt) {
    const cfg = car.cfg;
    const f = this.fwdOf(car);
    const rx = -f.z, rz = f.x; // right = cross(forward, up)
    let vf = car.vel.x * f.x + car.vel.z * f.z;
    let vl = car.vel.x * rx + car.vel.z * rz;
    const up = CVH.input.down('KeyW') || CVH.input.down('ArrowUp');
    const dn = CVH.input.down('KeyS') || CVH.input.down('ArrowDown');
    const hand = CVH.input.down('Space');
    car.braking = false;
    if (up) vf += cfg.accel * dt;
    if (dn) {
      if (vf > 0.6) { vf -= 30 * dt; car.braking = true; }
      else vf -= cfg.accel * 0.7 * dt;
    }
    if (!up && !dn) vf -= vf * 0.55 * dt;              // engine braking / drag
    vf -= vf * Math.abs(vf) * 0.006 * dt;              // aero drag
    vf = CVH.clamp(vf, -cfg.maxR, cfg.maxF);
    const steerIn = (CVH.input.down('KeyA') || CVH.input.down('ArrowLeft') ? 1 : 0)
                  - (CVH.input.down('KeyD') || CVH.input.down('ArrowRight') ? 1 : 0);
    const grip = hand ? 2.1 : cfg.grip;
    vl *= Math.exp(-grip * dt);
    // A steers left, D right; the turn flips naturally when reversing.
    const speedFac = CVH.clamp(Math.abs(vf) / 7, 0, 1);
    car.heading += steerIn * (hand ? 2.5 : 1.9) * speedFac * (vf < 0 ? -1 : 1) * dt;
    if (hand && Math.abs(vf) > 6 && CVH.chance(0.3)) CVH.audio.skid();
    car.steerVis = CVH.lerp(car.steerVis, steerIn * 0.45, 1 - Math.exp(-10 * dt));
    const nf = this.fwdOf(car);
    const nrx = -nf.z, nrz = nf.x;
    car.vel.set(nf.x * vf + nrx * vl, 0, nf.z * vf + nrz * vl);
    this._integrate(car, dt);
  },

  // AI steering toward car.aiTarget at up to car.aiSpeed.
  driveAI: function (car, dt, aggressive) {
    if (!car.aiTarget) { this._coast(car, dt); return; }
    const p = car.mesh.position;
    const dx = car.aiTarget.x - p.x, dz = car.aiTarget.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const want = Math.atan2(dx, dz);
    const turnRate = aggressive ? 2.6 : 1.9;
    car.heading = CVH.angleTurn(car.heading, want, turnRate * dt);
    const f = this.fwdOf(car);
    let target = car.aiSpeed;
    // Slow for the turn ahead and for anything close in front.
    const align = Math.cos(CVH.angleWrap(want - car.heading));
    if (align < 0.4) target = Math.min(target, 5);
    const ahead = this._obstacleAhead(car, 8);
    if (ahead) target = Math.min(target, ahead.speed * 0.9);
    if (dist < 3) target = Math.min(target, 3);
    const accel = aggressive ? 16 : 11;
    if (car.speed < target) car.speed = Math.min(target, car.speed + accel * dt);
    else car.speed = Math.max(target, car.speed - 22 * dt);
    car.braking = car.speed > target + 1;
    car.vel.set(f.x * car.speed, 0, f.z * car.speed);
    this._integrate(car, dt);
  },

  _coast: function (car, dt) {
    car.speed = Math.max(0, car.speed - 8 * dt);
    const f = this.fwdOf(car);
    car.vel.set(f.x * car.speed, 0, f.z * car.speed);
    this._integrate(car, dt);
  },

  _integrate: function (car, dt) {
    const p = car.mesh.position;
    const beforeX = p.x, beforeZ = p.z;
    p.x += car.vel.x * dt;
    p.z += car.vel.z * dt;
    CVH.world.collide(p, car.cfg.radius * 0.82);
    // Hitting a building hard hurts.
    const stopped = CVH.dist2d(p.x, p.z, beforeX + car.vel.x * dt, beforeZ + car.vel.z * dt);
    const spd = Math.sqrt(car.vel.x * car.vel.x + car.vel.z * car.vel.z);
    if (stopped > 0.4 && spd > 6) {
      this.damage(car, (spd - 5) * 1.6, p);
      car.vel.multiplyScalar(-0.22);
      car.speed *= -0.22;
    }
    car.speed = Math.sqrt(car.vel.x * car.vel.x + car.vel.z * car.vel.z);
    car.mesh.rotation.y = car.heading;
    if (car.type === 'moto') {
      car.mesh.rotation.z = CVH.clamp(-car.steerVis * 0.7, -0.5, 0.5);
    }
    // Wheels.
    const spin = car.speed * dt / 0.34;
    for (let i = 0; i < car.wheels.length; i++) {
      const w = car.wheels[i];
      w.mesh.rotation.x += spin;
      if (i < 2) w.pivot.rotation.y = car.steerVis;
    }
  },

  _obstacleAhead: function (car, range) {
    const p = car.mesh.position;
    const f = this.fwdOf(car);
    let best = null, bestD = range;
    const check = (other, ox, oz, ospeed) => {
      const dx = ox - p.x, dz = oz - p.z;
      const ahead = dx * f.x + dz * f.z;
      if (ahead < 0.5 || ahead > bestD) return;
      const side = Math.abs(dx * -f.z + dz * f.x);
      if (side > 2.1) return;
      bestD = ahead;
      best = { speed: ospeed };
    };
    for (let i = 0; i < this.all.length; i++) {
      const o = this.all[i];
      if (o === car) continue;
      check(o, o.mesh.position.x, o.mesh.position.z, o.speed);
    }
    const pl = CVH.player;
    if (pl && !pl.inCar) check(null, pl.mesh.position.x, pl.mesh.position.z, 0);
    return best;
  },

  // Traffic brain: follow the lane, brake for obstacles, turn at junctions.
  _traffic: function (car, dt) {
    if (!car.road) this.adoptAsTraffic(car);
    const p = car.mesh.position;
    const road = car.road;
    const along = road.axis === 'z' ? p.z : p.x;
    const lp = this.lanePoint(road, along + road.dir * 14);
    car.aiTarget = lp;
    car.aiSpeed = 9.5;
    const ahead = this._obstacleAhead(car, 9);
    if (ahead) car.aiSpeed = Math.min(car.aiSpeed, ahead.speed * 0.92);
    this.driveAI(car, dt, false);
    // Junction decision.
    car.decideCd -= dt;
    const cross = road.axis === 'z'
      ? Math.abs(p.z - CVH.world.roadZ(Math.round((p.z + 130) / 52))) < 2.2
      : Math.abs(p.x - CVH.world.roadX(Math.round((p.x + 182) / 52))) < 2.2;
    if (cross && car.decideCd <= 0) {
      car.decideCd = 3;
      if (CVH.rng() < 0.38) {
        if (road.axis === 'z') {
          const j = CVH.clamp(Math.round((p.z + 130) / 52), 0, 5);
          car.road = { axis: 'x', index: j, dir: CVH.rng() < 0.5 ? 1 : -1 };
        } else {
          const i = CVH.clamp(Math.round((p.x + 182) / 52), 0, 7);
          car.road = { axis: 'z', index: i, dir: CVH.rng() < 0.5 ? 1 : -1 };
        }
      }
    }
    // Gridlock breaker: a car stuck for five seconds re-enters elsewhere.
    if (car.speed < 0.4) {
      car.blockedT += dt;
      if (car.blockedT > 5) {
        car.blockedT = 0;
        const pl = CVH.player;
        for (let tries = 0; tries < 8; tries++) {
          const r2 = { axis: CVH.rng() < 0.5 ? 'z' : 'x', index: 0, dir: CVH.rng() < 0.5 ? 1 : -1 };
          r2.index = r2.axis === 'z' ? CVH.randInt(0, 7) : CVH.randInt(0, 5);
          const pt = this.lanePoint(r2, CVH.rand(-150, 150));
          if (pl && CVH.dist2d(pt.x, pt.z, pl.mesh.position.x, pl.mesh.position.z) < 80) continue;
          const heading = r2.axis === 'z' ? (r2.dir > 0 ? 0 : Math.PI) : (r2.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          this.placeCar(car, pt.x, pt.z, heading);
          car.road = r2;
          break;
        }
      }
    } else car.blockedT = 0;
  },

  damage: function (car, amount, atPos) {
    if (car.dead) return;
    car.health -= amount;
    if (atPos) CVH.fx.sparks(atPos, amount > 8 ? 14 : 6);
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.speed = 0;
      CVH.fx.smoke(car.mesh.position);
    }
  },

  update: function (dt) {
    const pl = CVH.player;
    for (let i = 0; i < this.all.length; i++) {
      const car = this.all[i];
      if (car.dead) {
        car.smokeT -= dt;
        if (car.smokeT <= 0) { car.smokeT = 0.14; CVH.fx.smoke(car.mesh.position); }
        car.vel.multiplyScalar(Math.max(0, 1 - 3 * dt));
        car.mesh.position.x += car.vel.x * dt;
        car.mesh.position.z += car.vel.z * dt;
        continue;
      }
      if (car.driver === 'traffic') this._traffic(car, dt);
      else if (car.driver === 'police') this.driveAI(car, dt, true);
      else if (car.driver === 'player') this.drivePlayer(car, dt);
      // A parked car that was shunted rolls to a stop.
      if (car.driver === null && car.speed > 0.05) this._coast(car, dt);
      if (car.hitPlayerCd > 0) car.hitPlayerCd -= dt;
      // Running the player down (AI cars only; the player's own car is
      // handled against pedestrians in player.js).
      if (pl && !pl.inCar && car.driver !== 'player' && car.speed > 4 && car.hitPlayerCd <= 0) {
        const d = CVH.dist2d(car.mesh.position.x, car.mesh.position.z, pl.mesh.position.x, pl.mesh.position.z);
        if (d < car.cfg.radius + 0.5) {
          car.hitPlayerCd = 1.2;
          pl.takeDamage(16, car.mesh.position);
          CVH.audio.crash(0.25);
        }
      }
    }
    this._carCollisions();
    this.updateVisuals(0);
  },

  _carCollisions: function () {
    const pl = CVH.player;
    for (let i = 0; i < this.all.length; i++) {
      for (let j = i + 1; j < this.all.length; j++) {
        const a = this.all[i], b = this.all[j];
        const pa = a.mesh.position, pb = b.mesh.position;
        const rr = a.cfg.radius + b.cfg.radius;
        const dx = pb.x - pa.x, dz = pb.z - pa.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const push = (rr - d) / 2;
        if (!a.dead) { pa.x -= nx * push; pa.z -= nz * push; }
        if (!b.dead) { pb.x += nx * push; pb.z += nz * push; }
        const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
        const closing = -(rvx * nx + rvz * nz);
        if (closing > 2.5) {
          const dmg = (closing - 2) * 2.0;
          this.damage(a, dmg, pa);
          this.damage(b, dmg, pb);
          const mid = { x: (pa.x + pb.x) / 2, y: 0.6, z: (pa.z + pb.z) / 2 };
          CVH.fx.sparks(mid, 12);
          const impulse = closing * 0.42;
          a.vel.x -= nx * impulse; a.vel.z -= nz * impulse;
          b.vel.x += nx * impulse; b.vel.z += nz * impulse;
          if (pl && (pl.inCar === a || pl.inCar === b)) {
            CVH.fx.shake(CVH.clamp(closing * 0.03, 0.08, 0.4));
            CVH.audio.crash(CVH.clamp(closing * 0.05, 0.1, 0.55));
          } else if (pl && CVH.dist2d(mid.x, mid.z, pl.mesh.position.x, pl.mesh.position.z) < 26) {
            CVH.audio.crash(CVH.clamp(closing * 0.03, 0.05, 0.3));
          }
          if ((a.driver === 'player' || b.driver === 'player')) {
            const other = a.driver === 'player' ? b : a;
            if (other.type === 'police') CVH.police.reportCrime('hitpolice', other.mesh.position, true);
          }
        }
      }
    }
  },

  // Light bars, brake lights, headlight cones. Safe to run while frozen.
  updateVisuals: function () {
    const t = performance.now() / 1000;
    const dusk = CVH.world.dusk > 0.35;
    for (let i = 0; i < this.all.length; i++) {
      const car = this.all[i];
      if (car.lightMats) {
        const active = !car.dead && (car.driver === 'police' || car.driver === 'player');
        const ph = Math.floor(t * 2.6) % 2;
        car.lightMats.red.emissiveIntensity = active ? (ph === 0 ? 2.6 : 0.15) : 0.15;
        car.lightMats.blue.emissiveIntensity = active ? (ph === 1 ? 2.6 : 0.15) : 0.15;
      }
      if (car.brakeMat) car.brakeMat.emissiveIntensity = car.braking ? 2.2 : 0.25;
      for (let k = 0; k < car.cones.length; k++) car.cones[k].visible = dusk && !car.dead && car.driver !== null;
    }
  }
};
