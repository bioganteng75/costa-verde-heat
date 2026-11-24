'use strict';
// Costa Verde Heat 3D — the player character and the crowd.
//
// Movement is CAMERA-RELATIVE and the basis is rebuilt from the real camera
// every frame, so it can never drift from what the player sees:
//   forward = camera direction projected onto the ground plane
//   right   = cross(forward, up)        (facing -Z  =>  right is +X)
//   move    = forward*(W - S) + right*(D - A)
// W runs away from the camera, S toward it, A strafes to the camera's LEFT
// and D to the camera's RIGHT. The same cross product gives the right vector
// used for car exits and knockback, so the whole game agrees on "right".
//
// Pedestrians: 40 low-poly walkers on the sidewalk rings, recycled around
// the player, with panic/flee behaviour and car-collision consequences.

CVH.peds = [];

CVH.player = {
  parts: null,
  mesh: null,
  heading: Math.PI,
  health: 100,
  maxHealth: 100,
  weapon: 'fist',
  inCar: null,
  vel: null,
  walkPhase: 0,
  punchT: 0,
  fireCd: 0,
  aimT: 0,
  camYaw: Math.PI,
  camPitch: 0.32,
  camDist: 6.2,
  _fwd: null,
  _right: null,
  _mouseIdle: 0,

  buildHumanoid: function (palette) {
    const geo = CVH.world._unitBox || (CVH.world._unitBox = new THREE.BoxGeometry(1, 1, 1));
    const skin = new THREE.MeshLambertMaterial({ color: palette.skin });
    const shirt = new THREE.MeshLambertMaterial({ color: palette.shirt });
    const pants = new THREE.MeshLambertMaterial({ color: palette.pants });
    const hairM = new THREE.MeshLambertMaterial({ color: palette.hair });
    const grp = new THREE.Group();

    const limb = (mat, w, len, d) => {
      const pivot = new THREE.Group();
      const g2 = new THREE.BoxGeometry(w, len, d);
      g2.translate(0, -len / 2, 0);
      const m = new THREE.Mesh(g2, mat);
      m.castShadow = true;
      pivot.add(m);
      return pivot;
    };
    const legL = limb(pants, 0.24, 0.82, 0.26); legL.position.set(-0.15, 0.86, 0); grp.add(legL);
    const legR = limb(pants, 0.24, 0.82, 0.26); legR.position.set(0.15, 0.86, 0); grp.add(legR);
    const armL = limb(shirt, 0.2, 0.72, 0.22); armL.position.set(-0.42, 1.44, 0); grp.add(armL);
    const armR = limb(shirt, 0.2, 0.72, 0.22); armR.position.set(0.42, 1.44, 0); grp.add(armR);
    const torso = new THREE.Mesh(geo, shirt);
    torso.scale.set(0.62, 0.74, 0.34);
    torso.position.y = 1.22;
    torso.castShadow = true;
    grp.add(torso);
    const head = new THREE.Mesh(geo, skin);
    head.scale.set(0.34, 0.36, 0.34);
    head.position.y = 1.79;
    head.castShadow = true;
    grp.add(head);
    const hair = new THREE.Mesh(geo, hairM);
    hair.scale.set(0.37, 0.12, 0.37);
    hair.position.y = 1.99;
    grp.add(hair);
    return { group: grp, legL: legL, legR: legR, armL: armL, armR: armR, torso: torso, head: head };
  },

  init: function (scene) {
    this.vel = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this.parts = this.buildHumanoid({ skin: 0xc98a5e, shirt: 0x1f8a8a, pants: 0x2c3242, hair: 0x241a12 });
    this.mesh = this.parts.group;
    scene.add(this.mesh);
    this.spawnPeds(scene);
  },

  reset: function (x, z, heading) {
    if (this.inCar) {
      this.inCar.driver = null;
      this.inCar = null;
    }
    this.mesh.visible = true;
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.mesh.rotation.y = heading;
    this.camYaw = heading;
    this.health = this.maxHealth;
    this.vel.set(0, 0, 0);
  },

  // The camera's ground-projected forward and its right-hand vector.
  cameraBasis: function (camera) {
    camera.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-6) this._fwd.set(0, 0, -1);
    this._fwd.normalize();
    this._right.crossVectors(this._fwd, CVH.UP);
    return { fwd: this._fwd, right: this._right };
  },

  update: function (dt, camera) {
    const pos = this.mesh.position;
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.punchT = Math.max(0, this.punchT - dt);
    this.aimT = Math.max(0, this.aimT - dt);

    if (this.inCar) {
      const car = this.inCar;
      this.vel.copy(car.vel);
      // The logical player position rides with the car even though the body
      // is hidden inside it: missions, police targeting, the bust meter,
      // the minimap and pickups all read this position.
      pos.copy(car.mesh.position);
      if (car.type === 'moto') {
        this.mesh.rotation.y = car.heading;
        this.heading = car.heading;
        this.parts.legL.rotation.x = -1.15;
        this.parts.legR.rotation.x = -1.15;
        this.parts.armL.rotation.x = -0.85;
        this.parts.armR.rotation.x = -0.85;
      }
      if (car.dead) this.exitCar();
      this.updateCamera(dt, camera);
      return;
    }

    // --- camera-relative movement (the basis is the contract; see header) ---
    const basis = this.cameraBasis(camera);
    const f = basis.fwd, r = basis.right;
    const inF = (CVH.input.down('KeyW') || CVH.input.down('ArrowUp') ? 1 : 0)
              - (CVH.input.down('KeyS') || CVH.input.down('ArrowDown') ? 1 : 0);
    const inR = (CVH.input.down('KeyD') || CVH.input.down('ArrowRight') ? 1 : 0)
              - (CVH.input.down('KeyA') || CVH.input.down('ArrowLeft') ? 1 : 0);
    let mx = f.x * inF + r.x * inR;
    let mz = f.z * inF + r.z * inR;
    const mlen = Math.sqrt(mx * mx + mz * mz);
    const sprint = CVH.input.down('ShiftLeft') || CVH.input.down('ShiftRight');
    const speed = sprint ? 7.4 : 4.3;
    if (mlen > 0.01) {
      mx /= mlen; mz /= mlen;
      const want = Math.atan2(mx, mz);
      this.heading = CVH.angleTurn(this.heading, want, 11 * dt);
      pos.x += mx * speed * dt;
      pos.z += mz * speed * dt;
      this.vel.set(mx * speed, 0, mz * speed);
      this.walkPhase += dt * speed * 2.1;
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - 10 * dt));
    }
    CVH.world.collide(pos, 0.45);
    // Shove out of cars (you cannot stand inside a bonnet).
    const cars = CVH.vehicles.all;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], cp = c.mesh.position;
      const dx = pos.x - cp.x, dz = pos.z - cp.z;
      const rr = c.cfg.radius + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = cp.x + (dx / d) * rr;
        pos.z = cp.z + (dz / d) * rr;
      }
    }
    this.mesh.rotation.y = this.heading;

    // Combat input.
    if (CVH.input.clickHit()) this.tryFire(camera);
    else if (this.weapon === 'smg' && CVH.input.mouseHeld) this.tryFire(camera);

    this._animate(dt, mlen > 0.01 ? speed : 0);
    this.updateCamera(dt, camera);
  },

  _animate: function (dt, speedNow) {
    const P = this.parts;
    const sw = Math.sin(this.walkPhase) * CVH.clamp(speedNow / 4.3, 0, 1.4) * 0.62;
    P.legL.rotation.x = sw;
    P.legR.rotation.x = -sw;
    if (this.punchT > 0) {
      const p = 1 - this.punchT / 0.28;
      P.armR.rotation.x = -2.1 * Math.sin(p * Math.PI);
      P.armL.rotation.x = -sw * 0.7;
    } else if (this.weapon !== 'fist' && (this.aimT > 0 || CVH.input.mouseHeld)) {
      P.armR.rotation.x = -1.5;
      P.armL.rotation.x = -1.1;
    } else {
      P.armR.rotation.x = -sw * 0.8;
      P.armL.rotation.x = sw * 0.8;
    }
    P.armL.rotation.z = 0; P.armR.rotation.z = 0;
  },

  tryFire: function (camera) {
    if (this.fireCd > 0 || this.inCar) return;
    const pos = this.mesh.position;
    const fwd = { x: Math.sin(this.heading), z: Math.cos(this.heading) };

    if (this.weapon === 'fist') {
      this.fireCd = 0.34;
      this.punchT = 0.28;
      let hitAny = false;
      for (let i = 0; i < CVH.peds.length; i++) {
        const ped = CVH.peds[i];
        if (ped.dead) continue;
        const pp = ped.parts.group.position;
        const dx = pp.x - pos.x, dz = pp.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1.9 && (dx * fwd.x + dz * fwd.z) / (d || 1) > 0.35) {
          this.damagePed(ped, 45, true);
          hitAny = true;
        }
      }
      const cars = CVH.vehicles.all;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i], cp = c.mesh.position;
        if (CVH.dist2d(pos.x, pos.z, cp.x, cp.z) < c.cfg.radius + 1.1) {
          CVH.vehicles.damage(c, 3, { x: cp.x, y: 0.7, z: cp.z });
          CVH.audio.crash(0.07);
          hitAny = true;
        }
      }
      if (hitAny) CVH.audio.punch();
      return;
    }

    // Hitscan from the camera's centre, so shots go where the player looks.
    const kind = this.weapon;
    this.fireCd = kind === 'smg' ? 0.095 : 0.27;
    this.aimT = 0.3;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    if (kind === 'smg') {
      dir.x += CVH.rand(-0.03, 0.03);
      dir.y += CVH.rand(-0.02, 0.02);
      dir.z += CVH.rand(-0.03, 0.03);
      dir.normalize();
    }
    const origin = camera.position.clone();
    let bestT = 80, hitPed = null, hitCar = null;
    const raySphere = (cx, cy, cz, rad) => {
      const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0.5) return -1;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 > rad * rad) return -1;
      return t - Math.sqrt(rad * rad - d2);
    };
    for (let i = 0; i < CVH.peds.length; i++) {
      const ped = CVH.peds[i];
      if (ped.dead) continue;
      const pp = ped.parts.group.position;
      const t = raySphere(pp.x, 1.15, pp.z, 0.8);
      if (t > 0 && t < bestT) { bestT = t; hitPed = ped; hitCar = null; }
    }
    const cars = CVH.vehicles.all;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], cp = c.mesh.position;
      const t = raySphere(cp.x, 0.75, cp.z, c.cfg.radius + 0.3);
      if (t > 0 && t < bestT) { bestT = t; hitCar = c; hitPed = null; }
    }
    if (dir.y < -0.02) {
      const tg = -origin.y / dir.y;
      if (tg > 0 && tg < bestT) { bestT = tg; hitPed = null; hitCar = null; }
    }
    const hitPoint = origin.clone().add(dir.clone().multiplyScalar(bestT));
    const muzzle = new THREE.Vector3(pos.x + fwd.x * 0.5, 1.38, pos.z + fwd.z * 0.5);
    CVH.fx.tracer(muzzle, hitPoint);
    CVH.fx.muzzle(muzzle, { x: fwd.x, y: 0, z: fwd.z });
    CVH.audio.shot(kind);
    if (hitPed) this.damagePed(hitPed, kind === 'smg' ? 34 : 60, true);
    else if (hitCar) CVH.vehicles.damage(hitCar, kind === 'smg' ? 4 : 6, hitPoint);
    CVH.police.reportCrime('shots', pos, true);
  },

  damagePed: function (ped, dmg, isPlayer) {
    if (ped.dead) return;
    ped.health -= dmg;
    ped.panicFrom = { x: this.mesh.position.x, z: this.mesh.position.z };
    ped.panicT = 3;
    CVH.fx.bloodless_puff(ped.parts.group.position);
    if (ped.health <= 0) {
      ped.dead = true;
      ped.deadT = 0;
      if (isPlayer) CVH.police.reportCrime('murder', ped.parts.group.position, true);
    } else if (isPlayer) {
      CVH.police.reportCrime('assault', ped.parts.group.position, true);
    }
  },

  takeDamage: function (n, fromPos) {
    this.health -= n;
    CVH.fx.shake(0.12);
    if (fromPos) {
      const pos = this.mesh.position;
      const dx = pos.x - fromPos.x, dz = pos.z - fromPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      pos.x += (dx / d) * 1.1;
      pos.z += (dz / d) * 1.1;
      CVH.world.collide(pos, 0.45);
    }
  },

  // ---- cars ----------------------------------------------------------------------
  nearestCar: function (maxDist) {
    const pos = this.mesh.position;
    let best = null, bd = maxDist;
    for (let i = 0; i < CVH.vehicles.all.length; i++) {
      const c = CVH.vehicles.all[i];
      if (c.dead) continue;
      const d = CVH.dist2d(pos.x, pos.z, c.mesh.position.x, c.mesh.position.z) - c.cfg.radius;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  },

  forceEnter: function (car) {
    if (!car || car.dead) return false;
    if (car.driver === 'police') {
      // A stolen cruiser leaves the force the moment the player gets in, so
      // the pursuit brain can never steer the car the player is driving.
      CVH.police.removeFromForce(car);
      CVH.police.reportCrime('theft', car.mesh.position, true);
    } else if (car.driver === 'traffic') {
      // The driver bails out and runs.
      const ped = this._sparePed();
      if (ped) {
        const cp = car.mesh.position;
        ped.parts.group.position.set(cp.x + 2, 0, cp.z);
        ped.dead = false; ped.health = 100;
        ped.parts.group.rotation.x = 0;
        ped.panicFrom = { x: cp.x, z: cp.z };
        ped.panicT = 3.5;
      }
      car.road = null;
      CVH.police.reportCrime('theft', car.mesh.position, true);
    }
    car.driver = 'player';
    car.aiTarget = null;
    this.inCar = car;
    this.mesh.visible = car.type === 'moto';
    if (car.type === 'moto') this.mesh.position.copy(car.mesh.position);
    CVH.audio.ui();
    return true;
  },

  exitCar: function () {
    const car = this.inCar;
    if (!car) return;
    const cp = car.mesh.position;
    const f = CVH.vehicles.fwdOf(car);
    const rx = -f.z, rz = f.x; // the car's right, same cross-product rule
    const pos = this.mesh.position;
    pos.set(cp.x + rx * (car.cfg.radius + 1.2), 0, cp.z + rz * (car.cfg.radius + 1.2));
    CVH.world.collide(pos, 0.45);
    car.driver = null;
    car.braking = false;
    this.inCar = null;
    this.mesh.visible = true;
    this.parts.legL.rotation.x = 0;
    this.parts.legR.rotation.x = 0;
    this.heading = car.heading;
    if (CVH.missions) CVH.missions.onPlayerExitCar(car);
  },

  tryEnterExit: function () {
    if (this.inCar) { this.exitCar(); return; }
    const car = this.nearestCar(2.2);
    if (car) this.forceEnter(car);
  },

  _sparePed: function () {
    // Find a far-away pedestrian to recycle as a bailing driver.
    let best = null, bd = 30;
    for (let i = 0; i < CVH.peds.length; i++) {
      const ped = CVH.peds[i];
      const pp = ped.parts.group.position;
      const d = CVH.dist2d(pp.x, pp.z, this.mesh.position.x, this.mesh.position.z);
      if (d > bd) { bd = d; best = ped; }
    }
    return best;
  },

  // ---- camera ----------------------------------------------------------------------
  updateCamera: function (dt, camera) {
    const sens = CVH.input.locked ? 0.0026 : 0.005;
    const dx = CVH.input.mouseDX, dy = CVH.input.mouseDY;
    if (dx !== 0 || dy !== 0) {
      this.camYaw -= dx * sens;
      this.camPitch = CVH.clamp(this.camPitch + dy * sens * 0.8, 0.03, 1.15);
      this._mouseIdle = 0;
    } else {
      this._mouseIdle += dt;
    }
    let focus, distWant = 6.2, pitchWant = null;
    if (this.inCar) {
      focus = this.inCar.mesh.position;
      distWant = this.inCar.type === 'moto' ? 6.4 : 8.6;
      pitchWant = 0.3;
      // Drift back behind the car when the mouse is idle and it is moving.
      if (this._mouseIdle > 2.2 && this.inCar.speed > 2) {
        this.camYaw = CVH.angleTurn(this.camYaw, this.inCar.heading, 1.7 * dt);
      }
    } else {
      focus = this.mesh.position;
    }
    if (pitchWant !== null) this.camPitch = CVH.lerp(this.camPitch, pitchWant, 1 - Math.exp(-2 * dt));
    this.camDist = CVH.lerp(this.camDist, distWant, 1 - Math.exp(-4 * dt));
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const hback = Math.cos(this.camPitch) * this.camDist;
    const height = Math.sin(this.camPitch) * this.camDist;
    camera.position.set(
      focus.x - fx * hback,
      focus.y + 1.5 + height,
      focus.z - fz * hback
    );
    if (camera.position.y < 0.7) camera.position.y = 0.7;
    const sh = CVH.fx.shakeOffset();
    if (sh) { camera.position.x += sh.x; camera.position.y += sh.y; }
    camera.lookAt(focus.x, focus.y + 1.5, focus.z);
  },

  // ---- pedestrians -------------------------------------------------------------------
  SKINS: [0xc98a5e, 0x8a5a34, 0xe8b088, 0x6e4526],
  SHIRTS: [0xd8574a, 0x4a7fd8, 0xf0ead8, 0x57b06a, 0xe8a13a, 0x8a5fb0, 0x3ec6c6, 0xe87ab0],
  PANTS: [0x2c3242, 0x5a4632, 0x3a4a5a, 0x707880, 0x243028],
  HAIRS: [0x241a12, 0x4a3220, 0x888888, 0xd8c9a8, 0x101010],

  sidewalkPoint: function () {
    const i = CVH.randInt(0, 6), j = CVH.randInt(0, 4);
    const cx = CVH.world.cellCX(i), cz = CVH.world.cellCZ(j);
    const side = CVH.randInt(0, 3), t = CVH.rand(-17, 17);
    if (side === 0) return { x: cx + t, z: cz - 18.2 };
    if (side === 1) return { x: cx + t, z: cz + 18.2 };
    if (side === 2) return { x: cx - 18.2, z: cz + t };
    return { x: cx + 18.2, z: cz + t };
  },

  spawnPeds: function (scene) {
    CVH.peds = [];
    for (let n = 0; n < 40; n++) {
      const parts = this.buildHumanoid({
        skin: CVH.pick(this.SKINS), shirt: CVH.pick(this.SHIRTS),
        pants: CVH.pick(this.PANTS), hair: CVH.pick(this.HAIRS)
      });
      const p = this.sidewalkPoint();
      parts.group.position.set(p.x, 0, p.z);
      scene.add(parts.group);
      CVH.peds.push({
        parts: parts, heading: CVH.rand(0, CVH.TAU),
        target: this.sidewalkPoint(), speed: CVH.rand(1.1, 1.7),
        health: 100, dead: false, deadT: 0, idleT: CVH.rand(0, 2),
        panicT: 0, panicFrom: null, walkPhase: CVH.rand(0, 6)
      });
    }
  },

  updatePeds: function (dt) {
    const ppos = this.mesh.position;
    for (let i = 0; i < CVH.peds.length; i++) {
      const ped = CVH.peds[i];
      const grp = ped.parts.group;
      const pos = grp.position;
      if (ped.dead) {
        ped.deadT += dt;
        grp.rotation.x = CVH.lerp(grp.rotation.x, -Math.PI / 2, 1 - Math.exp(-6 * dt));
        if (ped.deadT > 7 && CVH.dist2d(pos.x, pos.z, ppos.x, ppos.z) > 35) {
          const p = this.sidewalkPoint();
          pos.set(p.x, 0, p.z);
          grp.rotation.x = 0;
          ped.dead = false; ped.health = 100; ped.deadT = 0;
          ped.target = this.sidewalkPoint();
        }
        continue;
      }
      // Recycle walkers who drifted too far from the action.
      const dPlayer = CVH.dist2d(pos.x, pos.z, ppos.x, ppos.z);
      if (dPlayer > 105) {
        for (let tries = 0; tries < 6; tries++) {
          const p = this.sidewalkPoint();
          const d = CVH.dist2d(p.x, p.z, ppos.x, ppos.z);
          if (d > 42 && d < 72) { pos.set(p.x, 0, p.z); ped.target = this.sidewalkPoint(); break; }
        }
      }
      // Cars are scary; fast cars are lethal.
      let threat = null;
      const cars = CVH.vehicles.all;
      for (let ci = 0; ci < cars.length; ci++) {
        const c = cars[ci], cp = c.mesh.position;
        const d = CVH.dist2d(pos.x, pos.z, cp.x, cp.z);
        if (c.speed > 3.5 && d < c.cfg.radius + 0.45) {
          this._pedHitByCar(ped, c);
          threat = cp;
          break;
        }
        if (c.speed > 4 && d < 4.4) threat = cp;
      }
      if (threat) { ped.panicFrom = { x: threat.x, z: threat.z }; ped.panicT = Math.max(ped.panicT, 1.6); }

      let moveX = 0, moveZ = 0, spd = 0;
      if (ped.panicT > 0) {
        ped.panicT -= dt;
        const away = ped.panicFrom || pos;
        let dx = pos.x - away.x, dz = pos.z - away.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        moveX = dx / d; moveZ = dz / d; spd = 4.6;
      } else if (ped.idleT > 0) {
        ped.idleT -= dt;
      } else {
        const dx = ped.target.x - pos.x, dz = ped.target.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < 1.3) {
          if (CVH.chance(0.3)) ped.idleT = CVH.rand(0.8, 3);
          ped.target = this.sidewalkPoint();
        } else {
          moveX = dx / d; moveZ = dz / d; spd = ped.speed;
        }
      }
      if (spd > 0) {
        ped.heading = CVH.angleTurn(ped.heading, Math.atan2(moveX, moveZ), 6 * dt);
        pos.x += Math.sin(ped.heading) * spd * dt;
        pos.z += Math.cos(ped.heading) * spd * dt;
        CVH.world.collide(pos, 0.4);
        ped.walkPhase += dt * spd * 2.2;
      }
      grp.rotation.y = ped.heading;
      const sw = Math.sin(ped.walkPhase) * (spd > 2 ? 0.7 : 0.45) * (spd > 0 ? 1 : 0);
      ped.parts.legL.rotation.x = sw;
      ped.parts.legR.rotation.x = -sw;
      if (ped.panicT > 0) {
        ped.parts.armL.rotation.z = 2.5;
        ped.parts.armR.rotation.z = -2.5;
        ped.parts.armL.rotation.x = 0;
        ped.parts.armR.rotation.x = 0;
      } else {
        ped.parts.armL.rotation.z = 0;
        ped.parts.armR.rotation.z = 0;
        ped.parts.armL.rotation.x = -sw * 0.8;
        ped.parts.armR.rotation.x = sw * 0.8;
      }
    }
  },

  _pedHitByCar: function (ped, car) {
    const pos = ped.parts.group.position;
    const dmg = car.speed * 7;
    ped.health -= dmg;
    const cp = car.mesh.position;
    const dx = pos.x - cp.x, dz = pos.z - cp.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    pos.x += (dx / d) * 2.2;
    pos.z += (dz / d) * 2.2;
    CVH.world.collide(pos, 0.4);
    CVH.fx.bloodless_puff(pos);
    CVH.audio.crash(0.18);
    ped.panicFrom = { x: cp.x, z: cp.z };
    ped.panicT = 3;
    if (ped.health <= 0 && !ped.dead) {
      ped.dead = true;
      ped.deadT = 0;
      if (car.driver === 'player') CVH.police.reportCrime('murder', pos, true);
    } else if (car.driver === 'player') {
      CVH.police.reportCrime('hitrun', pos, true);
    }
  }
};
