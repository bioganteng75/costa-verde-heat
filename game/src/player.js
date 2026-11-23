// player.js — the low-poly humanoid (player and pedestrians share the
// factory), the third-person camera, on-foot movement and hitscan combat.
window.CVH = window.CVH || {};

CVH.player = {
  _boxGeo: null,

  // A person from boxes: legs and arms pivot at hip/shoulder so a walk
  // swing is just two rotations. Returns refs for animation.
  makeHumanoid(opts) {
    const o = opts || {};
    if (!this._boxGeo) this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const skin = new THREE.MeshLambertMaterial({ color: o.skin || 0xc98d64 });
    const shirt = new THREE.MeshLambertMaterial({ color: o.shirt || 0x3d7bd9 });
    const pants = new THREE.MeshLambertMaterial({ color: o.pants || 0x2e3440 });
    const hairM = new THREE.MeshLambertMaterial({ color: o.hair || 0x2a2019 });
    const grp = new THREE.Group();
    const mk = (mat, sx, sy, sz, x, y, z, parent) => {
      const m = new THREE.Mesh(this._boxGeo, mat);
      m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true;
      (parent || grp).add(m); return m;
    };
    const torso = mk(shirt, 0.62, 0.72, 0.34, 0, 1.06, 0);
    const head = mk(skin, 0.4, 0.44, 0.4, 0, 1.66, 0);
    mk(hairM, 0.44, 0.14, 0.44, 0, 1.93, 0);
    // Arms: pivot groups at the shoulders, box hangs below the pivot.
    const arm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 1.38, 0);
      const m = new THREE.Mesh(this._boxGeo, shirt);
      m.scale.set(0.2, 0.66, 0.22); m.position.y = -0.3; m.castShadow = true;
      const hand = new THREE.Mesh(this._boxGeo, skin);
      hand.scale.set(0.18, 0.16, 0.2); hand.position.y = -0.68;
      pivot.add(m); pivot.add(hand); grp.add(pivot);
      return pivot;
    };
    const leg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.17, 0.72, 0);
      const m = new THREE.Mesh(this._boxGeo, pants);
      m.scale.set(0.24, 0.7, 0.26); m.position.y = -0.36; m.castShadow = true;
      pivot.add(m); grp.add(pivot);
      return pivot;
    };
    return { group: grp, torso, head, lArm: arm(-1), rArm: arm(1), lLeg: leg(-1), rLeg: leg(1) };
  },

  // Procedural walk/run cycle + aim and punch poses.
  animate(h, phase, amount, opts) {
    const o = opts || {};
    const swing = Math.sin(phase) * 0.65 * amount;
    h.lLeg.rotation.x = swing;
    h.rLeg.rotation.x = -swing;
    if (o.aim) {
      h.rArm.rotation.x = -1.45;               // arm straight out, gun level
      h.lArm.rotation.x = -0.35;
    } else if (o.punchT > 0) {
      h.rArm.rotation.x = -1.9 + Math.sin(o.punchT * 22) * 0.5;
      h.lArm.rotation.x = swing * 0.7;
    } else {
      h.lArm.rotation.x = -swing * 0.8;
      h.rArm.rotation.x = swing * 0.8;
    }
    h.group.position.y = o.baseY !== undefined ? o.baseY : Math.abs(Math.sin(phase)) * 0.06 * amount;
  },
};

// --- Third-person camera ------------------------------------------------------
CVH.camera = {
  yaw: Math.PI, pitch: 0.34, dist: 8.5,
  _offsetYaw: 0,
  pos: new THREE.Vector3(0, 6, -14),

  update(dt, focus, mode, followHeading) {
    const I = CVH.input;
    const sens = 0.0046;
    if (mode === 'drive') {
      this._offsetYaw -= I.mouseDX * sens;
      this._offsetYaw *= Math.exp(-1.6 * dt);
      const target = followHeading + this._offsetYaw;
      this.yaw = CVH.util.lerpAngle(this.yaw, target, 1 - Math.exp(-4.2 * dt));
      this.pitch = CVH.util.lerp(this.pitch, 0.3, 1 - Math.exp(-3 * dt));
      this.dist = CVH.util.lerp(this.dist, 11, 1 - Math.exp(-3 * dt));
    } else {
      this.yaw -= I.mouseDX * sens;
      this.pitch = CVH.util.clamp(this.pitch + I.mouseDY * 0.0032, 0.06, 1.15);
      this.dist = CVH.util.lerp(this.dist, 8.5, 1 - Math.exp(-4 * dt));
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const hd = this.dist * Math.cos(this.pitch);
    const tx = focus.x - fx * hd;
    const tz = focus.z - fz * hd;
    const ty = focus.y + 1.7 + this.dist * Math.sin(this.pitch);
    const k = 1 - Math.exp(-14 * dt);
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.y += (ty - this.pos.y) * k;
    this.pos.z += (tz - this.pos.z) * k;
    if (this.pos.y < 0.7) this.pos.y = 0.7;
  },

  apply(camera, focus) {
    const shake = CVH.fx.shakeOffset(new THREE.Vector3());
    camera.position.set(this.pos.x + shake.x, this.pos.y + shake.y, this.pos.z + shake.z);
    camera.lookAt(focus.x + shake.x, focus.y + 1.7 + shake.y, focus.z + shake.z);
  },

  snap(focus) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.pos.set(focus.x - fx * this.dist * Math.cos(this.pitch), focus.y + 1.7 + this.dist * Math.sin(this.pitch), focus.z - fz * this.dist * Math.cos(this.pitch));
  },
};

// --- The player ---------------------------------------------------------------
CVH.playerCtl = {
  h: null, pos: null, heading: Math.PI, hp: 100, maxHp: 100,
  weapon: 'fist', fireT: 0, punchT: 0, phase: 0, hurtT: -9, speedNow: 0,

  create(scene, x, z) {
    this.h = CVH.player.makeHumanoid({ shirt: 0xe2543e, pants: 0x27303e, skin: 0xc98d64, hair: 0x1d1712 });
    this.h.group.position.set(x, 0, z);
    this.pos = this.h.group.position;
    scene.add(this.h.group);
    return this;
  },

  hurt(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.hurtT = CVH.G.time;
  },

  update(dt) {
    const G = CVH.G, I = CVH.input;
    const ax = I.moveAxis();
    const camYaw = CVH.camera.yaw;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let mx = fx * ax.z + rx * ax.x;
    let mz = fz * ax.z + rz * ax.x;
    const len = Math.hypot(mx, mz);
    const sprint = I.down('ShiftLeft') || I.down('ShiftRight');
    const speed = sprint ? 8.4 : 5.2;
    this.speedNow = 0;
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      this.heading = CVH.util.lerpAngle(this.heading, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
      this.phase += dt * (sprint ? 12.5 : 9);
      this.speedNow = speed;
      if (sprint && Math.random() < dt * 6) CVH.fx.dust(this.pos.x, 0.3, this.pos.z);
    } else {
      this.phase += dt * 1.6;                 // idle sway keeps the cycle alive
    }
    // Facing: while firing, face the camera's aim; otherwise movement dir.
    const aiming = this.weapon !== 'fist' && (I.firing || I.mouseDown);
    if (aiming) this.heading = CVH.util.lerpAngle(this.heading, camYaw, 1 - Math.exp(-18 * dt));
    this.h.group.rotation.y = this.heading;
    CVH.world.collideCircle(this.pos, 0.55);

    // Combat -----------------------------------------------------------------
    this.fireT -= dt;
    if (this.punchT > 0) this.punchT -= dt;
    if (I.clicked || (this.weapon === 'smg' && I.firing)) {
      if (this.weapon === 'fist' && I.clicked) this._punch();
      else if (this.weapon !== 'fist' && this.fireT <= 0) this._shoot();
    }
    CVH.player.animate(this.h, this.phase, len > 0.01 ? 1 : 0.12, {
      aim: aiming, punchT: Math.max(0, this.punchT),
    });
    // Slow health regen after 9 quiet seconds
    if (G.time - this.hurtT > 9 && this.hp > 0) this.hp = Math.min(this.maxHp, this.hp + dt * 2.2);
  },

  _punch() {
    const G = CVH.G;
    this.punchT = 0.28;
    CVH.audio.punch();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const ped of G.peds.list) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - this.pos.x, dz = ped.pos.z - this.pos.z;
      if (dx * fx + dz * fz > 0.2 && Math.hypot(dx, dz) < 1.9) {
        G.peds.knockDown(ped);
        CVH.police.reportCrime('assault', this.pos);
        CVH.fx.bloodlessPuff(ped.pos.x, 1.2, ped.pos.z);
        break;
      }
    }
  },

  _shoot() {
    const G = CVH.G;
    const isSmg = this.weapon === 'smg';
    this.fireT = isSmg ? 0.095 : 0.34;
    CVH.audio.shot(this.weapon);
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    const origin = new THREE.Vector3(this.pos.x, 1.45, this.pos.z);
    const gun = origin.clone().addScaledVector(dir, 0.7);
    CVH.fx.muzzle(gun.x, gun.y, gun.z, G.camera.position);
    CVH.police.reportCrime('shot', this.pos);
    G.peds.scare(this.pos, 30);
    // Nearest target along the ray: pedestrians, then cars.
    let bestT = 45, bestPed = null, bestCar = null;
    const test = (p, radius) => {
      const vx = p.x - origin.x, vy = (p.y || 1) - origin.y, vz = p.z - origin.z;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t < 0.5 || t > bestT) return -1;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const d = Math.hypot(p.x - px, (p.y || 1) - py, p.z - pz);
      return d < radius ? t : -1;
    };
    for (const ped of G.peds.list) {
      if (ped.state === 'down') continue;
      const t = test({ x: ped.pos.x, y: 1.1, z: ped.pos.z }, 0.85);
      if (t > 0) { bestT = t; bestPed = ped; bestCar = null; }
    }
    for (const car of G.cars) {
      if (car.dead) continue;
      const t = test({ x: car.group.position.x, y: 0.9, z: car.group.position.z }, 2.1);
      if (t > 0) { bestT = t; bestCar = car; bestPed = null; }
    }
    const hitP = origin.clone().addScaledVector(dir, bestT);
    if (bestPed) {
      G.peds.knockDown(bestPed);
      CVH.police.reportCrime('assault', this.pos);
      CVH.fx.bloodlessPuff(hitP.x, hitP.y, hitP.z);
    } else if (bestCar) {
      CVH.vehicles.damage(bestCar, isSmg ? 7 : 10);
      CVH.fx.sparks(hitP.x, hitP.y, hitP.z);
      if (bestCar.driver === 'police') CVH.police.reportCrime('policeHit', this.pos);
      if (bestCar === G.playerCar) CVH.fx.addShake(0.1);
    } else {
      // Whiffed shot into the city: spark off a building face if close.
      for (const b of CVH.world.buildings) {
        if (hitP.x > b.minX - 0.5 && hitP.x < b.maxX + 0.5 && hitP.z > b.minZ - 0.5 && hitP.z < b.maxZ + 0.5 && hitP.y < b.h) {
          CVH.fx.sparks(hitP.x, Math.min(hitP.y, b.h), hitP.z);
          break;
        }
      }
    }
  },
};

// --- Pedestrians ---------------------------------------------------------------
CVH.peds = {
  list: [],
  SHIRTS: [0x59c2d6, 0xf2e38d, 0x8fd94f, 0xd9d94f, 0xb48fd9, 0xf2f0e6, 0x4fd9b0, 0xd97fb8],

  spawn(scene, world, count) {
    for (let i = 0; i < count; i++) {
      const h = CVH.player.makeHumanoid({
        shirt: this.SHIRTS[i % this.SHIRTS.length],
        pants: [0x2e3440, 0x54443a, 0x3a4a5c][i % 3],
        skin: [0xc98d64, 0x8a5a3a, 0xe8b48c][i % 3],
      });
      const ix = world.roadXs[Math.floor(Math.random() * world.roadXs.length)];
      const iz = world.roadZs[Math.floor(Math.random() * world.roadZs.length)];
      h.group.position.set(ix + (Math.random() < 0.5 ? -10.5 : 10.5), 0, iz + (Math.random() - 0.5) * 40);
      scene.add(h.group);
      this.list.push({
        h, pos: h.group.position, heading: Math.random() * 6.28,
        state: 'walk', target: null, phase: Math.random() * 6, downT: 0, fleeT: 0, speed: 1.4 + Math.random() * 0.5,
      });
    }
  },

  _newTarget(ped, world) {
    const ix = world.roadXs[Math.floor(Math.random() * world.roadXs.length)];
    const iz = world.roadZs[Math.floor(Math.random() * world.roadZs.length)];
    ped.target = { x: ix + (Math.random() < 0.5 ? -10.5 : 10.5), z: iz + (Math.random() - 0.5) * 90 };
  },

  scare(pos, radius) {
    for (const ped of this.list) {
      if (ped.state === 'down') continue;
      if (CVH.util.dist2D(ped.pos.x, ped.pos.z, pos.x, pos.z) < radius) {
        ped.state = 'flee'; ped.fleeT = 2.5 + Math.random() * 1.5;
        ped.heading = Math.atan2(ped.pos.x - pos.x, ped.pos.z - pos.z);
      }
    }
  },

  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down'; ped.downT = 7 + Math.random() * 4;
    ped.h.group.rotation.x = -Math.PI / 2;
    ped.h.group.position.y = 0.35;
  },

  update(dt, world) {
    const G = CVH.G;
    for (const ped of this.list) {
      if (ped.state === 'down') {
        ped.downT -= dt;
        if (ped.downT <= 0) {
          ped.state = 'flee'; ped.fleeT = 2;
          ped.h.group.rotation.x = 0; ped.h.group.position.y = 0;
        }
        continue;
      }
      let speed = ped.speed, moving = true;
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        speed = 4.4;
        ped.pos.x += Math.sin(ped.heading) * speed * dt;
        ped.pos.z += Math.cos(ped.heading) * speed * dt;
        if (ped.fleeT <= 0) { ped.state = 'walk'; ped.target = null; }
      } else {
        if (!ped.target || CVH.util.dist2D(ped.pos.x, ped.pos.z, ped.target.x, ped.target.z) < 1.6) this._newTarget(ped, world);
        const dx = ped.target.x - ped.pos.x, dz = ped.target.z - ped.pos.z;
        const want = Math.atan2(dx, dz);
        ped.heading = CVH.util.lerpAngle(ped.heading, want, 1 - Math.exp(-6 * dt));
        ped.pos.x += Math.sin(ped.heading) * speed * dt;
        ped.pos.z += Math.cos(ped.heading) * speed * dt;
        // A fast car nearby makes them dive out of the way.
        const pc = G.playerCar;
        if (pc && pc.speed2D() > 9 && CVH.util.dist2D(ped.pos.x, ped.pos.z, pc.group.position.x, pc.group.position.z) < 8) {
          ped.state = 'flee'; ped.fleeT = 1.6;
          ped.heading = Math.atan2(ped.pos.x - pc.group.position.x, ped.pos.z - pc.group.position.z);
        }
      }
      if (moving) ped.phase += dt * (ped.state === 'flee' ? 13 : 7.5);
      world.collideCircle(ped.pos, 0.5);
      ped.h.group.rotation.y = ped.heading;
      CVH.player.animate(ped.h, ped.phase, ped.state === 'flee' ? 1 : 0.75, {});
    }
  },
};
