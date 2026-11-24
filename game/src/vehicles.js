// vehicles.js — the car factory and driving model. Every car in Costa Verde
// (traffic, parked, police, the player's) is the same object shape, stepped
// by the same arcade physics; only the control inputs differ. Traffic drives
// intersection-to-intersection on the road grid with obstacle braking.
CVH.vehicles = {
  TYPES: {
    sedan: { len: 4.3, wid: 1.9, hgt: 0.62, cabin: 0.55, maxSpeed: 26, accel: 13, base: 52, colors: [0xc0c6cc, 0x7a8a99, 0x44586e, 0x8e3b2f, 0x2f5d50, 0xd8d3c3] },
    sport: { len: 4.1, wid: 1.85, hgt: 0.5, cabin: 0.42, maxSpeed: 37, accel: 21, base: 68, colors: [0xd92632, 0xf2a007, 0x7a2ea0, 0x147d8a, 0xe8e8ec] },
    taxi: { len: 4.3, wid: 1.9, hgt: 0.62, cabin: 0.55, maxSpeed: 25, accel: 12.5, base: 52, colors: [0xf7b500] },
    moto: { len: 2.2, wid: 0.7, hgt: 0.55, cabin: 0, maxSpeed: 34, accel: 20, base: 96, colors: [0x22262b, 0x8e2f2f, 0x2f4d8e] },
    truck: { len: 6.4, wid: 2.3, hgt: 1.1, cabin: 0.9, maxSpeed: 20, accel: 9, base: 40, colors: [0xb8bcc0, 0x707880, 0x96742f] },
    police: { len: 4.4, wid: 1.95, hgt: 0.62, cabin: 0.55, maxSpeed: 31, accel: 17, base: 58, colors: [0xf0f2f4] },
  },
  _glassMat: null,
  _tyreMat: null,

  // Shared falloff texture for headlight cones: bright at the apex (v=1,
  // the lamp end), fading to black at the base so the beam's far rim
  // dissolves instead of ending in a hard translucent disc.
  _beamTexture() {
    if (this._beamTex) return this._beamTex;
    const cv = document.createElement('canvas');
    cv.width = 2; cv.height = 64;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#595959');
    grad.addColorStop(1, '#000000');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 64);
    this._beamTex = new THREE.CanvasTexture(cv);
    return this._beamTex;
  },

  create(scene, type, x, z, heading, colorIdx) {
    const def = this.TYPES[type];
    if (!this._glassMat) {
      this._glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
      this._tyreMat = new THREE.MeshLambertMaterial({ color: 0x17181a });
    }
    const r = Math.random;
    const color = def.colors[(colorIdx !== undefined ? colorIdx : Math.floor(r() * def.colors.length)) % def.colors.length];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const car = {
      group: g, type, def, heading: heading || 0, speed: 0, steerVis: 0,
      health: 100, dead: false, driver: 'parked', ai: null,
      wheelsF: [], wheelsAll: [], smokeT: Math.random() * 0.3,
      radius: Math.max(def.wid, def.len) * 0.36, braking: false,
    };

    if (type === 'moto') {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, def.len), bodyMat);
      frame.position.y = 0.62; frame.castShadow = true;
      g.add(frame);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.9), this._tyreMat);
      seat.position.set(0, 0.92, -0.25);
      g.add(seat);
      // Rider: simple seated figure (torso, head, arms to the bars).
      const riderMat = new THREE.MeshLambertMaterial({ color: 0x35424e });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), riderMat);
      torso.position.set(0, 1.42, -0.28); torso.rotation.x = 0.25;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
      head.position.set(0, 1.95, -0.18);
      g.add(head);
      car.riderParts = { torso };
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(def.wid, def.hgt, def.len), bodyMat);
      body.position.y = 0.32 + def.hgt / 2;
      body.castShadow = true;
      g.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(def.wid * 0.82, def.cabin, def.len * 0.48), this._glassMat);
      cabin.position.set(0, 0.32 + def.hgt + def.cabin / 2 - 0.04, -def.len * 0.06);
      cabin.castShadow = true;
      g.add(cabin);
      if (type === 'taxi') {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.34),
          new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8800, emissiveIntensity: 0.4 }));
        sign.position.set(0, 0.32 + def.hgt + def.cabin + 0.08, -def.len * 0.06);
        g.add(sign);
      }
      if (type === 'truck') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(def.wid, 1.5, def.len * 0.55),
          new THREE.MeshLambertMaterial({ color: 0xe4e1d8 }));
        box.position.set(0, 1.45, -def.len * 0.2);
        box.castShadow = true;
        g.add(box);
      }
      if (type === 'police') {
        // Black doors band + light bar with independently flashable halves.
        const band = new THREE.Mesh(new THREE.BoxGeometry(def.wid + 0.03, 0.3, def.len * 0.5),
          new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
        band.position.set(0, 0.62, -def.len * 0.02);
        g.add(band);
        const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.4), this._tyreMat);
        barBase.position.set(0, 0.32 + def.hgt + def.cabin + 0.03, -def.len * 0.06);
        g.add(barBase);
        const redMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xff2222, emissiveIntensity: 0 });
        const blueMat = new THREE.MeshLambertMaterial({ color: 0x111188, emissive: 0x2255ff, emissiveIntensity: 0 });
        const red = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.36), redMat);
        red.position.set(-0.3, 0.32 + def.hgt + def.cabin + 0.15, -def.len * 0.06);
        const blue = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.36), blueMat);
        blue.position.set(0.3, 0.32 + def.hgt + def.cabin + 0.15, -def.len * 0.06);
        g.add(red); g.add(blue);
        car.lightBar = { redMat, blueMat };
      }
    }

    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
    const wheelPos = type === 'moto'
      ? [[0, def.len / 2 - 0.25], [0, -def.len / 2 + 0.25]]
      : [[-def.wid / 2, def.len / 2 - 0.75], [def.wid / 2, def.len / 2 - 0.75], [-def.wid / 2, -def.len / 2 + 0.75], [def.wid / 2, -def.len / 2 + 0.75]];
    wheelPos.forEach(([wx, wz], idx) => {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.36, wz);
      const wheel = new THREE.Mesh(wheelGeo, this._tyreMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      g.add(pivot);
      car.wheelsAll.push(wheel);
      if (wz > 0) car.wheelsF.push(pivot);
    });

    // Brake lights + headlight cones (cones shown at dusk).
    car.brakeMat = new THREE.MeshLambertMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.15 });
    const bl = new THREE.Mesh(new THREE.BoxGeometry(def.wid * 0.7, 0.14, 0.06), car.brakeMat);
    bl.position.set(0, 0.62, -def.len / 2 - 0.02);
    g.add(bl);
    car.cones = [];
    if (type !== 'moto') {
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, map: CVH.vehicles._beamTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const sx of [-0.6, 0.6]) {
        // Apex at the headlight, base flaring forward and dipping to the
        // road: the cone's +Y apex points back toward the car, and the
        // mesh centre sits half a beam-length ahead of the lamp.
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 8, 10, 1, true), coneMat);
        cone.rotation.x = -Math.PI / 2 + 0.05;
        cone.position.set(sx * def.wid * 0.5, 0.2, def.len / 2 + 4.0);
        g.add(cone);
        car.cones.push(cone);
      }
      car._coneMat = coneMat;
    }

    g.position.set(x, 0, z);
    g.rotation.y = car.heading;
    scene.add(g);
    return car;
  },

  // Arcade driving step. ctl: { throttle:-1..1, steer:-1..1, brake, handbrake }
  step(car, ctl, dt) {
    if (car.dead) { car.speed = 0; return; }
    const def = car.def;
    const maxRev = 8;
    if (ctl.brake) {
      if (car.speed > 0.5) car.speed -= 26 * dt;
      else car.speed = Math.max(car.speed - def.accel * 0.6 * dt, -maxRev);
    } else if (ctl.throttle > 0) {
      car.speed += def.accel * ctl.throttle * dt * (car.speed < 0 ? 2.2 : 1);
    } else if (ctl.throttle < 0) {
      car.speed += def.accel * 0.55 * ctl.throttle * dt;
    }
    // Drag + rolling resistance.
    car.speed -= car.speed * 0.55 * dt;
    if (!ctl.throttle && !ctl.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 1.6 * dt);
    car.speed = CVH.u.clamp(car.speed, -maxRev, def.maxSpeed);
    if (ctl.handbrake) car.speed -= car.speed * 1.7 * dt;

    // Steering: authority peaks at city speeds, fades at top speed.
    const sf = CVH.u.clamp(Math.abs(car.speed) / 6, 0, 1) * (1 - CVH.u.clamp(Math.abs(car.speed) / def.maxSpeed, 0, 1) * 0.45);
    const steerRate = (car.type === 'moto' ? 2.5 : 1.85) * (ctl.handbrake ? 1.5 : 1);
    car.heading += ctl.steer * steerRate * sf * dt * (car.speed < 0 ? -1 : 1);
    car.steerVis = CVH.u.lerp(car.steerVis, ctl.steer, Math.min(1, dt * 10));

    const p = car.group.position;
    p.x += Math.sin(car.heading) * car.speed * dt;
    p.z += Math.cos(car.heading) * car.speed * dt;
    car.group.rotation.y = car.heading;

    for (const w of car.wheelsAll) w.rotation.x += (car.speed * dt) / 0.36;
    for (const f of car.wheelsF) f.rotation.y = car.steerVis * 0.42;
    car.braking = !!ctl.brake || (ctl.throttle < 0 && car.speed > 1);
    car.brakeMat.emissiveIntensity = car.braking ? 1.6 : 0.15;
    // Smoke puffs from a dying engine.
    if (car.health < 45 && !car.dead) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) {
        car.smokeT = car.health < 20 ? 0.12 : 0.3;
        CVH.fx.smoke(p, car.health < 20);
      }
    }
  },

  setDusk(car, duskF) {
    if (car._coneMat) car._coneMat.opacity = duskF * 0.16;
  },

  flashPolice(car, t) {
    if (!car.lightBar) return;
    const phase = Math.floor(t * 5) % 2;
    car.lightBar.redMat.emissiveIntensity = phase === 0 ? 2.6 : 0.05;
    car.lightBar.blueMat.emissiveIntensity = phase === 1 ? 2.6 : 0.05;
  },

  // ---- traffic AI -------------------------------------------------------------
  initTraffic(car, world) {
    car.driver = 'traffic';
    const near = world.nearestIntersection(car.group.position.x, car.group.position.z);
    car.ai = {
      nodeI: this._nearestIndexX(world, near.x), nodeJ: this._nearestIndexZ(world, near.z),
      tx: near.x, tz: near.z, blockedT: 0, waitT: 0,
    };
  },
  _nearestIndexX(world, x) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i <= world.COLS; i++) { const d = Math.abs(x - world.roadX(i)); if (d < bd) { bd = d; bi = i; } }
    return bi;
  },
  _nearestIndexZ(world, z) {
    let bj = 0, bd = Infinity;
    for (let j = 0; j <= world.ROWS; j++) { const d = Math.abs(z - world.roadZ(j)); if (d < bd) { bd = d; bj = j; } }
    return bj;
  },

  trafficCtl(car, world, obstacles) {
    const ai = car.ai;
    const p = car.group.position;
    const ctl = { throttle: 0, steer: 0, brake: false, handbrake: false };
    if (!ai) return ctl;
    const dx = ai.tx - p.x, dz = ai.tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 7) {
      // Arrived at an intersection: choose the next one (straight preferred).
      const dirs = [];
      const curDirI = Math.sign(ai.tx - p.x), curDirJ = Math.sign(ai.tz - p.z);
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [di, dj] of options) {
        const ni = ai.nodeI + di, nj = ai.nodeJ + dj;
        if (ni < 0 || ni > world.COLS || nj < 0 || nj > world.ROWS) continue;
        let wgt = 1;
        if (di === curDirI && dj === curDirJ) wgt = 3;         // keep going straight
        if (di === -curDirI && dj === -curDirJ) wgt = 0.15;    // rarely U-turn
        dirs.push({ ni, nj, wgt });
      }
      if (dirs.length) {
        let sum = 0; for (const d of dirs) sum += d.wgt;
        let roll = Math.random() * sum, chosen = dirs[0];
        for (const d of dirs) { roll -= d.wgt; if (roll <= 0) { chosen = d; break; } }
        ai.nodeI = chosen.ni; ai.nodeJ = chosen.nj;
        ai.tx = world.roadX(chosen.ni); ai.tz = world.roadZ(chosen.nj);
      }
    }
    // Right-hand lane offset: shift the target to our right.
    const tdx = ai.tx - p.x, tdz = ai.tz - p.z;
    const tLen = Math.hypot(tdx, tdz) || 1;
    const ox = (tdz / tLen) * 2.1, oz = (-tdx / tLen) * 2.1;
    const desired = Math.atan2(tdx + ox, tdz + oz);
    const diff = CVH.u.angleDiff(car.heading, desired);
    ctl.steer = CVH.u.clamp(diff * 1.6, -1, 1);
    ctl.throttle = 0.72;

    // Obstacle braking: anything slow/stopped in the lane ahead.
    let blocked = false;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const o of obstacles) {
      if (o === car) continue;
      const op = o.group ? o.group.position : o;
      const rx = op.x - p.x, rz = op.z - p.z;
      const ahead = rx * fx + rz * fz;
      if (ahead < 1 || ahead > 8.5) continue;
      const side = Math.abs(rx * fz - rz * fx);
      if (side < 1.9) { blocked = true; break; }
    }
    if (blocked) {
      ctl.throttle = 0;
      ctl.brake = car.speed > 0.6;
      ai.blockedT += 1 / 60;
    } else {
      ai.blockedT = Math.max(0, ai.blockedT - 1 / 30);
    }
    // Gridlock breaker: after ~3.5 s stuck, forget the route and pick a
    // different neighbouring intersection — the jam usually clears itself.
    if (Math.abs(car.speed) < 0.5 && ai.blockedT > 3.5) {
      ai.blockedT = 0;
      const options = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [di, dj] = options[Math.floor(Math.random() * options.length)];
      const ni = CVH.u.clamp(ai.nodeI + di, 0, world.COLS);
      const nj = CVH.u.clamp(ai.nodeJ + dj, 0, world.ROWS);
      ai.nodeI = ni; ai.nodeJ = nj;
      ai.tx = world.roadX(ni); ai.tz = world.roadZ(nj);
      ctl.throttle = -0.7; // a little reverse shrug to break the deadlock
    }
    return ctl;
  },

  damage(car, amt) {
    if (car.dead) return;
    car.health -= amt;
    if (car.health <= 0) {
      car.health = 0;
      car.dead = true;
      car.speed = 0;
    }
  },
};
