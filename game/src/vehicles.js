// vehicles.js — low-poly cars built from boxes and cylinders, an arcade
// driving model with drift, and traffic AI that follows the road grid from
// intersection to intersection on the correct side of the road.
window.CVH = window.CVH || {};

CVH.vehicles = {
  TYPES: {
    sedan:  { w: 1.9, l: 4.3, bodyH: 0.62, cabH: 0.55, accel: 15, maxF: 27, maxR: 9,  grip: 9,  turn: 2.0, hp: 100, r: 2.3 },
    sport:  { w: 1.95, l: 4.4, bodyH: 0.55, cabH: 0.45, accel: 22, maxF: 39, maxR: 9,  grip: 10, turn: 2.3, hp: 90,  r: 2.3 },
    taxi:   { w: 1.9, l: 4.3, bodyH: 0.62, cabH: 0.55, accel: 15, maxF: 27, maxR: 9,  grip: 9,  turn: 2.0, hp: 100, r: 2.3 },
    moto:   { w: 0.7, l: 2.3, bodyH: 0.5,  cabH: 0,    accel: 21, maxF: 35, maxR: 6,  grip: 11, turn: 2.7, hp: 45,  r: 1.15 },
    truck:  { w: 2.3, l: 6.6, bodyH: 1.1,  cabH: 0.9,  accel: 9,  maxF: 21, maxR: 7,  grip: 8,  turn: 1.35, hp: 230, r: 3.0 },
    police: { w: 1.9, l: 4.4, bodyH: 0.62, cabH: 0.55, accel: 19, maxF: 33, maxR: 10, grip: 10, turn: 2.2, hp: 140, r: 2.3 },
  },
  COLORS: [0xd94f3d, 0x3d7bd9, 0xf2f0e6, 0x3fae6a, 0xf2b33d, 0x8e5bd6, 0x2b2f36, 0xe67fb8, 0x59c2d6],

  _boxGeo: null, _wheelGeo: null,

  create(type, opts) {
    const o = opts || {};
    const cfg = this.TYPES[type];
    const color = o.color !== undefined ? o.color : (type === 'taxi' ? 0xf7c948 : type === 'police' ? 0xf2f2f2 : this.COLORS[Math.floor(Math.random() * this.COLORS.length)]);
    if (!this._boxGeo) { this._boxGeo = new THREE.BoxGeometry(1, 1, 1); this._wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10); }
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1d2c3a });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x17181c });
    const refs = { wheels: [], steerWheels: [] };

    if (type === 'moto') {
      const frame = new THREE.Mesh(this._boxGeo, bodyMat);
      frame.scale.set(0.34, 0.4, 1.9); frame.position.y = 0.62; frame.castShadow = true; grp.add(frame);
      const tank = new THREE.Mesh(this._boxGeo, bodyMat);
      tank.scale.set(0.4, 0.3, 0.7); tank.position.set(0, 0.88, 0.15); grp.add(tank);
      const bar = new THREE.Mesh(this._boxGeo, darkMat);
      bar.scale.set(0.62, 0.08, 0.08); bar.position.set(0, 1.02, 0.95); grp.add(bar);
      for (const s of [0.95, -0.95]) {
        const w = new THREE.Mesh(this._wheelGeo, darkMat);
        w.rotation.z = Math.PI / 2; w.scale.set(1, 0.4, 1);
        w.position.set(0, 0.38, s); grp.add(w); refs.wheels.push(w);
      }
      if (o.rider !== false && window.CVH.player) {
        const rider = CVH.player.makeHumanoid({ shirt: color, pants: 0x2b2f36, skin: 0xc98d64 });
        rider.group.scale.setScalar(0.92);
        rider.group.position.set(0, 0.72, -0.25);
        rider.lLeg.rotation.x = -1.25; rider.rLeg.rotation.x = -1.25;
        rider.lArm.rotation.x = -0.9; rider.rArm.rotation.x = -0.9;
        grp.add(rider.group);
      }
    } else if (type === 'truck') {
      const cab = new THREE.Mesh(this._boxGeo, bodyMat);
      cab.scale.set(cfg.w, 1.5, 1.7); cab.position.set(0, 1.05, cfg.l / 2 - 0.85); cab.castShadow = true; grp.add(cab);
      const shield = new THREE.Mesh(this._boxGeo, glassMat);
      shield.scale.set(cfg.w * 0.86, 0.6, 0.1); shield.position.set(0, 1.45, cfg.l / 2 + 0.02); grp.add(shield);
      const cargo = new THREE.Mesh(this._boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8e6df }));
      cargo.scale.set(cfg.w + 0.15, 2.1, cfg.l - 2); cargo.position.set(0, 1.45, -0.9); cargo.castShadow = true; grp.add(cargo);
      for (const sx of [-1, 1]) for (const sz of [1, -1]) {
        const w = new THREE.Mesh(this._wheelGeo, darkMat);
        w.rotation.z = Math.PI / 2; w.position.set(sx * cfg.w / 2, 0.42, sz * (cfg.l / 2 - 1.1));
        grp.add(w); refs.wheels.push(w); if (sz > 0) refs.steerWheels.push(w);
      }
    } else {
      const body = new THREE.Mesh(this._boxGeo, bodyMat);
      body.scale.set(cfg.w, cfg.bodyH, cfg.l); body.position.y = 0.32 + cfg.bodyH / 2; body.castShadow = true; grp.add(body);
      const cabin = new THREE.Mesh(this._boxGeo, glassMat);
      cabin.scale.set(cfg.w * 0.84, cfg.cabH, cfg.l * 0.44); cabin.position.set(0, 0.32 + cfg.bodyH + cfg.cabH / 2, -cfg.l * 0.04);
      cabin.castShadow = true; grp.add(cabin);
      const bumper = new THREE.Mesh(this._boxGeo, darkMat);
      bumper.scale.set(cfg.w + 0.06, 0.22, 0.3); bumper.position.set(0, 0.34, cfg.l / 2); grp.add(bumper);
      const bumper2 = bumper.clone(); bumper2.position.z = -cfg.l / 2; grp.add(bumper2);
      for (const sx of [-1, 1]) for (const sz of [1, -1]) {
        const w = new THREE.Mesh(this._wheelGeo, darkMat);
        w.rotation.z = Math.PI / 2; w.position.set(sx * (cfg.w / 2 + 0.02), 0.38, sz * cfg.l * 0.31);
        grp.add(w); refs.wheels.push(w); if (sz > 0) refs.steerWheels.push(w);
      }
      if (type === 'taxi') {
        const sign = new THREE.Mesh(this._boxGeo, new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
        sign.scale.set(0.7, 0.22, 0.34); sign.position.set(0, 0.32 + cfg.bodyH + cfg.cabH + 0.12, -cfg.l * 0.04); grp.add(sign);
      }
      if (type === 'police') {
        const barBase = new THREE.Mesh(this._boxGeo, darkMat);
        barBase.scale.set(1.1, 0.12, 0.4); barBase.position.set(0, 0.32 + cfg.bodyH + cfg.cabH + 0.06, -cfg.l * 0.04); grp.add(barBase);
        refs.lightL = new THREE.Mesh(this._boxGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
        refs.lightL.scale.set(0.5, 0.16, 0.36); refs.lightL.position.set(-0.3, 0.32 + cfg.bodyH + cfg.cabH + 0.2, -cfg.l * 0.04); grp.add(refs.lightL);
        refs.lightR = new THREE.Mesh(this._boxGeo, new THREE.MeshBasicMaterial({ color: 0x2a5bff }));
        refs.lightR.scale.set(0.5, 0.16, 0.36); refs.lightR.position.set(0.3, 0.32 + cfg.bodyH + cfg.cabH + 0.2, -cfg.l * 0.04); grp.add(refs.lightR);
        const stripe = new THREE.Mesh(this._boxGeo, new THREE.MeshLambertMaterial({ color: 0x22406e }));
        stripe.scale.set(cfg.w + 0.03, 0.3, cfg.l * 0.9); stripe.position.y = 0.55; grp.add(stripe);
      }
    }

    // Headlights and brake lights (materials brighten at dusk / braking)
    refs.headMat = new THREE.MeshBasicMaterial({ color: 0x8a8a72 });
    refs.brakeMat = new THREE.MeshBasicMaterial({ color: 0x5c1414 });
    const hw = type === 'moto' ? 0.2 : cfg.w * 0.32;
    for (const s of [-1, 1]) {
      if (type === 'moto' && s > 0) continue;
      const h = new THREE.Mesh(this._boxGeo, refs.headMat);
      h.scale.set(0.34, 0.16, 0.06); h.position.set(s * hw, 0.72, cfg.l / 2 + 0.03); grp.add(h);
      const b = new THREE.Mesh(this._boxGeo, refs.brakeMat);
      b.scale.set(0.34, 0.14, 0.06); b.position.set(s * hw, 0.74, -cfg.l / 2 - 0.03); grp.add(b);
    }
    // Headlight beams for the player's car at dusk: two additive cones.
    refs.beams = [];
    if (type !== 'moto') {
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 11, 10, 1, true), beamMat);
        cone.rotation.x = Math.PI / 2 + 0.06;
        cone.position.set(s * hw, 0.7, cfg.l / 2 + 5.4);
        grp.add(cone); refs.beams.push(cone);
      }
      refs.beamMat = beamMat;
    }

    grp.position.set(o.x || 0, 0, o.z || 0);
    const car = {
      type, cfg, group: grp, refs,
      heading: o.heading || 0,
      vel: new THREE.Vector3(),
      hp: cfg.hp, maxHp: cfg.hp,
      driver: o.driver || 'parked',     // parked | traffic | police | player
      dead: false, smokeT: 0, honkT: 0,
      ai: null,                          // traffic waypoint state
      special: o.special || null,        // mission tag, e.g. 'stealTarget'
      speed2D() { return Math.hypot(this.vel.x, this.vel.z); },
    };
    grp.rotation.y = car.heading;
    return car;
  },

  // Shared arcade physics. ctrl = {throttle -1..1, steer -1..1 (+ = left),
  // brake bool, handbrake bool}. Returns the forward speed.
  updateFree(car, dt, ctrl) {
    const cfg = car.cfg;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const rx = -fz, rz = fx;                       // right vector
    let vF = car.vel.x * fx + car.vel.z * fz;
    let vR = car.vel.x * rx + car.vel.z * rz;
    const grip = ctrl.handbrake ? cfg.grip * 0.22 : cfg.grip;
    vR *= Math.exp(-grip * dt);
    if (ctrl.throttle > 0) vF += cfg.accel * ctrl.throttle * dt * (vF < 0 ? 2.2 : 1);
    if (ctrl.throttle < 0) vF += cfg.accel * 0.7 * ctrl.throttle * dt * (vF > 0 ? 2.4 : 1);
    if (ctrl.brake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 26 * dt);
    vF *= Math.exp(-0.35 * dt);
    if (vF > cfg.maxF) vF = Math.max(cfg.maxF, vF - 20 * dt);
    if (vF < -cfg.maxR) vF = -cfg.maxR;
    const steerAuthority = CVH.util.clamp(vF / 7, -1, 1);
    car.heading += ctrl.steer * cfg.turn * steerAuthority * dt * (ctrl.handbrake ? 1.3 : 1);
    const nfx = Math.sin(car.heading), nfz = Math.cos(car.heading);
    const nrx = -nfz, nrz = nfx;
    car.vel.set(nfx * vF + nrx * vR, 0, nfz * vF + nrz * vR);
    car.group.position.x += car.vel.x * dt;
    car.group.position.z += car.vel.z * dt;
    car.group.rotation.y = car.heading;
    // Wheel visuals
    const spin = vF * dt / 0.38;
    for (const w of car.refs.wheels) w.rotation.x += spin;
    for (const w of car.refs.steerWheels) w.rotation.y = -ctrl.steer * 0.42;
    car.refs.brakeMat.color.setHex(ctrl.brake || ctrl.throttle < 0 ? 0xff2a2a : 0x5c1414);
    return vF;
  },

  // Player driving straight from the keyboard.
  updatePlayerCar(car, dt) {
    const I = CVH.input;
    const ctrl = {
      throttle: (I.down('KeyW') || I.down('ArrowUp') ? 1 : 0) + (I.down('KeyS') || I.down('ArrowDown') ? -1 : 0),
      steer: (I.down('KeyA') || I.down('ArrowLeft') ? 1 : 0) + (I.down('KeyD') || I.down('ArrowRight') ? -1 : 0),
      brake: I.down('Space'),
      handbrake: I.down('Space'),
    };
    return this.updateFree(car, dt, ctrl);
  },

  // Compute pursuit controls toward a target point (used by police and by
  // traffic waypoint following). desiredSpeed caps the forward speed.
  controlsToward(car, tx, tz, dt, desiredSpeed) {
    const p = car.group.position;
    const dx = tx - p.x, dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    const diff = CVH.util.angleDiff(car.heading, targetHeading);
    const steer = CVH.util.clamp(-diff * 1.6, -1, 1); // + steer turns left; diff>0 means target is left
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const vF = car.vel.x * fx + car.vel.z * fz;
    let throttle = 0;
    if (Math.abs(diff) < 1.9) throttle = vF < desiredSpeed ? 1 : 0;
    else throttle = vF > 2 ? -0.6 : 0.4;               // swing around when target is behind
    return { throttle, steer: -steer, brake: false, handbrake: Math.abs(diff) > 1.1 && vF > 9 };
  },

  // Traffic: waypoint-to-waypoint driving on the intersection grid.
  initTraffic(car, world) {
    const xs = world.roadXs, zs = world.roadZs;
    const ix = xs[Math.floor(Math.random() * xs.length)];
    const iz = zs[Math.floor(Math.random() * zs.length)];
    car.ai = { cx: ix, cz: iz, nx: ix, nz: iz, cruise: 8.5 + Math.random() * 4 };
    this._pickNext(car, world, true);
    const p = this._lanePoint(car.ai.cx, car.ai.cz, car.ai.nx, car.ai.nz);
    car.group.position.set(p.x, 0, p.z);
    car.heading = Math.atan2(car.ai.nx - car.ai.cx, car.ai.nz - car.ai.cz);
    car.group.rotation.y = car.heading;
  },

  _lanePoint(cx, cz, nx, nz) {
    // Point on the correct (right-hand) lane heading from (cx,cz) to (nx,nz).
    const dx = Math.sign(nx - cx), dz = Math.sign(nz - cz);
    const rx = -dz, rz = dx;
    return { x: nx + rx * 3.4 - dx * 3, z: nz + rz * 3.4 - dz * 3 };
  },

  _pickNext(car, world, first) {
    const ai = car.ai;
    ai.cx = ai.nx; ai.cz = ai.nz;
    const opts = [];
    for (const nx of world.roadXs) if (Math.abs(Math.abs(nx - ai.cx) - world.PITCH) < 1) opts.push([nx, ai.cz]);
    for (const nz of world.roadZs) if (Math.abs(Math.abs(nz - ai.cz) - world.PITCH) < 1) opts.push([ai.cx, nz]);
    let pick = opts[Math.floor(Math.random() * opts.length)];
    if (!first && opts.length > 1) {
      const straight = opts.find(([x, z]) => Math.sign(x - ai.cx) === Math.sign(ai.nx - ai.cx) || Math.sign(z - ai.cz) === Math.sign(ai.nz - ai.cz));
      if (straight && Math.random() < 0.55) pick = straight;
    }
    ai.px = ai.cx; ai.pz = ai.cz;
    ai.nx = pick[0]; ai.nz = pick[1];
  },

  updateTraffic(car, dt, world, blockers) {
    const ai = car.ai;
    if (!ai) return 0;
    const target = this._lanePoint(ai.cx, ai.cz, ai.nx, ai.nz);
    const p = car.group.position;
    if (CVH.util.dist2D(p.x, p.z, target.x, target.z) < 6) this._pickNext(car, world, false);
    // Brake for anything solid ahead
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let desired = ai.cruise;
    for (const b of blockers) {
      if (b === car) continue;
      const bp = b.group ? b.group.position : (b.pos ? b.pos : b);
      const dx = bp.x - p.x, dz = bp.z - p.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && ahead < 9 && side < 2.4) { desired = Math.min(desired, Math.max(0, (ahead - 5) * 1.6)); break; }
    }
    const ctrl = this.controlsToward(car, target.x, target.z, dt, desired);
    if (desired <= 0.1) { ctrl.throttle = 0; ctrl.brake = true; }
    return this.updateFree(car, dt, ctrl);
  },

  damage(car, amount) {
    if (car.dead) return;
    car.hp -= amount;
    if (car.hp <= 0) {
      car.hp = 0; car.dead = true;
      car.vel.multiplyScalar(0.2);
    }
  },
};
