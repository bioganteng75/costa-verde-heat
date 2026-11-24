// player.js — the human side of the game: a low-poly box humanoid with
// procedural walk/run/punch/aim animation, the pedestrian crowd that uses
// the same body, the third-person camera rig, and the player's on-foot
// movement and hitscan combat.
CVH.makeHumanoid = function (shirt, pants, skin) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.34), mat(shirt));
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), mat(skin));
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.38), mat(pants));
  cap.position.y = 1.9;
  g.add(cap);
  function limb(x, y, w, h, d, c) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }
  const armL = limb(-0.42, 1.38, 0.2, 0.72, 0.22, shirt);
  const armR = limb(0.42, 1.38, 0.2, 0.72, 0.22, shirt);
  const legL = limb(-0.17, 0.72, 0.24, 0.72, 0.26, pants);
  const legR = limb(0.17, 0.72, 0.24, 0.72, 0.26, pants);
  return { group: g, torso, head, armL, armR, legL, legR, phase: 0 };
};

// mode: 'idle' | 'walk' | 'aim' | 'punch' — punchT/aim handled by caller pose.
CVH.animateHumanoid = function (h, dt, speedNorm, mode, punchT) {
  h.phase += dt * (4 + speedNorm * 7);
  const swing = Math.sin(h.phase) * 0.62 * Math.min(1, speedNorm + 0.15);
  if (mode === 'aim') {
    h.armR.rotation.x = -1.45;
    h.armL.rotation.x = -1.25;
    h.legL.rotation.x = swing * 0.4;
    h.legR.rotation.x = -swing * 0.4;
  } else if (mode === 'punch') {
    const k = punchT > 0.5 ? (1 - punchT) * 2 : punchT * 2; // out-and-back
    h.armR.rotation.x = -1.9 * k;
    h.armL.rotation.x = swing * 0.3;
    h.legL.rotation.x = swing * 0.3;
    h.legR.rotation.x = -swing * 0.3;
  } else {
    h.armL.rotation.x = swing;
    h.armR.rotation.x = -swing;
    h.legL.rotation.x = -swing;
    h.legR.rotation.x = swing;
  }
  h.torso.position.y = 1.06 + Math.abs(Math.sin(h.phase)) * 0.045 * Math.min(1, speedNorm + 0.1);
};

// --- pedestrians ---------------------------------------------------------------
CVH.peds = {
  list: [],
  panicPos: null,
  panicT: 0,

  spawn(scene, world, count) {
    const r = CVH.u.rng(20240);
    const shirts = [0xd96f4e, 0x7fb5b0, 0xe9b44c, 0xe8e0ea, 0x8fae62, 0xc96f8e, 0x4e6ed9, 0xf0ead6];
    const pants = [0x2e3a46, 0x5c564c, 0x704214, 0x24303e];
    const skins = [0xd9a066, 0xa0663a, 0xf0c8a0, 0x7a4a26];
    for (let i = 0; i < count; i++) {
      const h = CVH.makeHumanoid(CVH.u.pick(r, shirts), CVH.u.pick(r, pants), CVH.u.pick(r, skins));
      const p = world.randomRoadPoint(r);
      const x = p.x + (r() < 0.5 ? -1 : 1) * (world.ROAD / 2 + 1.8);
      const z = p.z + (r() < 0.5 ? -1 : 1) * (world.ROAD / 2 + 1.8);
      h.group.position.set(x, 0, z);
      scene.add(h.group);
      this.list.push({
        h, heading: r() * Math.PI * 2, state: 'walk', tx: x, tz: z,
        speed: CVH.u.range(r, 1.1, 1.7), health: 30, downT: 0, retargetT: r() * 4,
      });
    }
  },

  panic(x, z) { this.panicPos = { x, z }; this.panicT = 2.6; },

  update(dt, world) {
    if (this.panicT > 0) this.panicT -= dt;
    for (const ped of this.list) {
      const pos = ped.h.group.position;
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          // Quietly recycle far away, good as new.
          const p = world.randomRoadPoint(Math.random);
          pos.set(p.x + 8, 0, p.z + 8);
          ped.h.group.rotation.x = 0;
          ped.health = 30;
          ped.state = 'walk';
        }
        continue;
      }
      if (ped.state === 'riding' || ped.state === 'flagged') {
        if (ped.state === 'flagged') CVH.animateHumanoid(ped.h, dt, 0, 'idle');
        continue; // missions drive these states
      }
      let tx = ped.tx, tz = ped.tz, speed = ped.speed;
      if (this.panicT > 0 && this.panicPos && CVH.u.dist2(pos.x, pos.z, this.panicPos.x, this.panicPos.z) < 17) {
        tx = pos.x + (pos.x - this.panicPos.x) * 2;
        tz = pos.z + (pos.z - this.panicPos.z) * 2;
        speed = 3.6;
        ped.state = 'flee';
      } else if (ped.state === 'flee') ped.state = 'walk';
      const d = CVH.u.dist2(pos.x, pos.z, tx, tz);
      ped.retargetT -= dt;
      if (d < 1.2 || ped.retargetT <= 0) {
        ped.retargetT = 4 + Math.random() * 5;
        const p = world.randomRoadPoint(Math.random);
        ped.tx = pos.x + CVH.u.clamp(p.x - pos.x, -46, 46) + (Math.random() < 0.5 ? -1 : 1) * (world.ROAD / 2 + 1.8) * 0.4;
        ped.tz = pos.z + CVH.u.clamp(p.z - pos.z, -46, 46);
      }
      const desired = Math.atan2(tx - pos.x, tz - pos.z);
      ped.heading = CVH.u.angleLerp(ped.heading, desired, Math.min(1, dt * 6));
      pos.x += Math.sin(ped.heading) * speed * dt;
      pos.z += Math.cos(ped.heading) * speed * dt;
      world.collideCircle(pos, 0.45);
      ped.h.group.rotation.y = ped.heading;
      CVH.animateHumanoid(ped.h, dt, speed / 3.4, 'walk');
    }
  },

  hurt(ped, amt, crimePos) {
    ped.health -= amt;
    CVH.fx.bloodlessPuff(ped.h.group.position);
    if (ped.health <= 0 && ped.state !== 'down') {
      ped.state = 'down';
      ped.downT = 20;
      ped.h.group.rotation.x = -Math.PI / 2;
      ped.h.group.position.y = 0.25;
      return true; // knocked down
    }
    return false;
  },
};

// --- camera rig ------------------------------------------------------------------
CVH.camera = {
  yaw: 0,
  pitch: 0.34,
  dist: 8,
  pos: new THREE.Vector3(0, 4, -10),
  snapTo: null,

  snap(pos, heading) { this.yaw = heading || 0; this.snapTo = pos; },

  update(dt, cam, focus, mode) {
    const I = CVH.input;
    this.yaw -= I.mouseDX * 0.0032;
    this.pitch = CVH.u.clamp(this.pitch + I.mouseDY * 0.0026, 0.06, 1.15);
    const dist = mode === 'car' ? 10.5 : 7.6;
    this.dist = CVH.u.lerp(this.dist, dist, Math.min(1, dt * 4));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw) * cp, fz = Math.cos(this.yaw) * cp;
    const target = new THREE.Vector3(
      focus.x - fx * this.dist,
      focus.y + 1.7 + sp * this.dist,
      focus.z - fz * this.dist
    );
    if (target.y < 0.8) target.y = 0.8;
    if (this.snapTo) {
      this.pos.copy(target);
      this.snapTo = null;
    } else {
      const k = 1 - Math.exp(-dt * (mode === 'car' ? 7 : 10));
      this.pos.lerp(target, k);
    }
    cam.position.copy(this.pos);
    cam.lookAt(focus.x, focus.y + 1.55, focus.z);
  },
  forward() {
    const cp = Math.cos(this.pitch);
    return { x: Math.sin(this.yaw) * cp, y: -Math.sin(this.pitch) + 0.35, z: Math.cos(this.yaw) * cp };
  },
};

// --- the player -------------------------------------------------------------------
CVH.player = {
  h: null,
  heading: 0,
  health: 100,
  weapon: 'fists',   // 'fists' | 'pistol' | 'smg'
  fireT: 0,
  punchT: 0,
  speedNow: 0,

  create(scene, x, z) {
    this.h = CVH.makeHumanoid(0x147d8a, 0x2e3a46, 0xd9a066);
    this.h.group.position.set(x, 0, z);
    scene.add(this.h.group);
    // A little gun prop in the right hand, shown when armed.
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x22262b }));
    gun.position.set(0, -0.78, 0.2);
    this.h.armR.add(gun);
    this.gunMesh = gun;
    this.gunMesh.visible = false;
    this.heading = Math.PI * 0.75;
    return this;
  },

  get pos() { return this.h.group.position; },

  // On-foot movement; returns true if the player moved meaningfully.
  update(dt, world) {
    const I = CVH.input;
    const axes = I.moveAxes();
    const sprint = I.down('ShiftLeft') || I.down('ShiftRight');
    const speed = sprint ? 6.4 : 3.9;
    let moving = false;
    if (axes.x !== 0 || axes.z !== 0) {
      moving = true;
      const cy = CVH.camera.yaw;
      const mx = (Math.sin(cy) * axes.z) + (Math.cos(cy) * axes.x);
      const mz = (Math.cos(cy) * axes.z) - (Math.sin(cy) * axes.x);
      const len = Math.hypot(mx, mz) || 1;
      this.pos.x += (mx / len) * speed * dt;
      this.pos.z += (mz / len) * speed * dt;
      const desired = Math.atan2(mx, mz);
      this.heading = CVH.u.angleLerp(this.heading, desired, Math.min(1, dt * 11));
      this.speedNow = speed;
    } else {
      this.speedNow = 0;
    }
    world.collideCircle(this.pos, 0.5);
    this.h.group.rotation.y = this.heading;
    this.fireT -= dt;
    if (this.punchT > 0) this.punchT -= dt * 3.2;
    const mode = this.punchT > 0 ? 'punch' : (this.weapon !== 'fists' && I.mouseDown ? 'aim' : 'walk');
    CVH.animateHumanoid(this.h, dt, this.speedNow / 6, mode, Math.max(0, this.punchT));
    this.gunMesh.visible = this.weapon !== 'fists';
    if (this.gunMesh.visible) this.h.armR.rotation.x = I.mouseDown ? -1.45 : -0.25;
    return moving;
  },

  // Attack toward the camera's aim. Returns true if an attack happened.
  tryAttack() {
    const I = CVH.input;
    const M = CVH.main;
    if (this.weapon === 'fists') {
      if (!I.mouseClicked) return false;
      this.punchT = 1;
      CVH.audio.punch();
      // Melee reach: 1.6 m in the facing direction.
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      for (const ped of CVH.peds.list) {
        if (ped.state === 'down' || ped.state === 'riding') continue;
        const pp = ped.h.group.position;
        const d = CVH.u.dist2(this.pos.x, this.pos.z, pp.x, pp.z);
        const dot = ((pp.x - this.pos.x) * fx + (pp.z - this.pos.z) * fz) / (d || 1);
        if (d < 1.7 && dot > 0.4) {
          const downed = CVH.peds.hurt(ped, 16, this.pos);
          CVH.police.reportCrime(downed ? 'assault' : 'assault', this.pos);
          CVH.peds.panic(this.pos.x, this.pos.z);
          return true;
        }
      }
      for (const car of M.cars) {
        const cp = car.group.position;
        if (CVH.u.dist2(this.pos.x, this.pos.z, cp.x, cp.z) < car.radius + 1.3) {
          CVH.vehicles.damage(car, 4);
          CVH.fx.sparks(cp);
          CVH.audio.crash(false);
          return true;
        }
      }
      return true;
    }
    // Firearms: pistol on click, SMG while held.
    const wantFire = this.weapon === 'pistol' ? I.mouseClicked : I.mouseDown;
    if (!wantFire) return false;
    const rate = this.weapon === 'pistol' ? 0.34 : 0.115;
    if (this.fireT > 0) return false;
    this.fireT = rate;
    const fwd = CVH.camera.forward();
    if (this.weapon === 'smg') { fwd.x += (Math.random() - 0.5) * 0.05; fwd.z += (Math.random() - 0.5) * 0.05; }
    const origin = { x: this.pos.x, y: 1.45, z: this.pos.z };
    CVH.audio.shot();
    CVH.fx.muzzle({ x: origin.x + fwd.x * 0.7, y: 1.35, z: origin.z + fwd.z * 0.7 });
    CVH.police.reportCrime('shots', this.pos);
    CVH.peds.panic(this.pos.x, this.pos.z);
    // March the ray; first thing hit wins.
    let hit = null;
    for (let s = 1; s < 60; s += 0.6) {
      const x = origin.x + fwd.x * s, y = origin.y + fwd.y * s, z = origin.z + fwd.z * s;
      if (y < 0) { hit = { x, y: 0.1, z }; break; }
      if (CVH.world.pointInBuilding(x, z, 0)) { hit = { x, y, z }; break; }
      let done = false;
      for (const ped of CVH.peds.list) {
        if (ped.state === 'down' || ped.state === 'riding') continue;
        const pp = ped.h.group.position;
        if (CVH.u.dist2(x, z, pp.x, pp.z) < 0.75 && y < 2) {
          const downed = CVH.peds.hurt(ped, this.weapon === 'smg' ? 22 : 30, this.pos);
          if (downed) CVH.police.reportCrime('assault', this.pos);
          hit = { x: pp.x, y: 1.1, z: pp.z }; done = true; break;
        }
      }
      if (done) break;
      for (const car of M.cars) {
        const cp = car.group.position;
        if (CVH.u.dist2(x, z, cp.x, cp.z) < car.radius + 0.4 && y < 2.2) {
          CVH.vehicles.damage(car, this.weapon === 'smg' ? 7 : 10);
          CVH.fx.sparks({ x, y, z });
          if (car.driver === 'police') CVH.police.reportCrime('policeHit', this.pos);
          hit = { x, y, z }; done = true; break;
        }
      }
      if (done) break;
    }
    if (!hit) hit = { x: origin.x + fwd.x * 60, y: Math.max(0.2, origin.y + fwd.y * 60), z: origin.z + fwd.z * 60 };
    CVH.fx.tracer({ x: origin.x + fwd.x, y: 1.35, z: origin.z + fwd.z }, hit);
    return true;
  },

  hurt(amt) {
    this.health -= amt;
    if (this.health < 0) this.health = 0;
  },
};
