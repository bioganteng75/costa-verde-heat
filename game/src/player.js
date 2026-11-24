// Costa Verde Heat — the player: on-foot movement (camera-relative, right
// vector = cross(forward, up) from the real camera), driving, car entry,
// hitscan combat, health. The logical position rides with the car while
// driving (vehicles.driveUpdate mirrors it) so missions/police/minimap all
// read the car's position.
CVH.player = (function () {
  const WALK = 4.7, RUN = 7.4;

  const api = {
    pos: { x: 24, z: 44 },
    heading: 0,
    camYaw: 0,
    camPitch: 0.32,
    health: 100,
    cash: 120,
    car: null,
    state: 'foot',           // 'foot' | 'car'
    weapon: null,            // null | 'pistol' | 'smg'
    ammo: { pistol: 0, smg: 0 },
    mesh: null,
    walkPhase: 0,
    shootCd: 0,
    onWasted: null,          // installed by main.js

    build: function (scene) {
      const g = new THREE.Group();
      const denim = new THREE.MeshLambertMaterial({ color: 0x2c3e57 });
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.82, 0.21), denim);
      legL.geometry.translate(0, -0.41, 0); legL.position.set(-0.12, 0.82, 0); g.add(legL);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.82, 0.21), denim);
      legR.geometry.translate(0, -0.41, 0); legR.position.set(0.12, 0.82, 0); g.add(legR);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.27), new THREE.MeshLambertMaterial({ color: 0xb03a2e }));
      torso.position.y = 1.16; g.add(torso);
      const armMat = new THREE.MeshLambertMaterial({ color: 0xa03428 });
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.15), armMat);
      armL.geometry.translate(0, -0.31, 0); armL.position.set(-0.34, 1.44, 0); g.add(armL);
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.15), armMat);
      armR.geometry.translate(0, -0.31, 0); armR.position.set(0.34, 1.44, 0); g.add(armR);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
      head.position.y = 1.68; g.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, 1.4), new THREE.MeshLambertMaterial({ color: 0x241a12 }));
      hair.position.y = 1.7; g.add(hair);
      g.userData = { legL: legL, legR: legR, armL: armL, armR: armR };
      g.position.set(api.pos.x, 0, api.pos.z);
      scene.add(g);
      api.mesh = g;
    },

    reset: function (toSpawn) {
      const s = toSpawn || CVH.world.points.spawn;
      api.pos.x = s.x; api.pos.z = s.z;
      api.heading = 0; api.camYaw = 0;
      api.health = 100;
      if (api.car) { api.car.driver = null; api.car = null; }
      api.state = 'foot';
      if (api.mesh) { api.mesh.visible = true; api.mesh.position.set(s.x, 0, s.z); api.mesh.rotation.y = 0; }
    },

    damage: function (n) {
      if (api.health <= 0) return;
      api.health -= n;
      CVH.audio.hurt();
      if (api.health <= 0) {
        api.health = 0;
        if (api.onWasted) api.onWasted();
      }
    },

    nearestCar: function (maxD) {
      let best = null, bd = maxD;
      for (let i = 0; i < CVH.vehicles.list.length; i++) {
        const c = CVH.vehicles.list[i];
        const d = CVH.dist2d(api.pos.x, api.pos.z, c.mesh.position.x, c.mesh.position.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },

    enterCar: function (car) {
      if (!car || car.dead) { if (car && car.dead) CVH.hud.toast('That wreck is going nowhere.'); return false; }
      if (car.isPolice) CVH.police.stealCar(car);
      if (car.driver === 'traffic') { car.driver = null; car.t = null; CVH.police.addHeat(6); }
      car.driver = 'player';
      api.car = car;
      api.state = 'car';
      api.pos.x = car.mesh.position.x; api.pos.z = car.mesh.position.z;
      api.heading = car.heading;
      api.mesh.visible = car.type === 'moto';
      CVH.audio.blip();
      return true;
    },

    exitCar: function () {
      const car = api.car;
      if (!car) return;
      car.driver = null;
      const r = CVH.rightOf(car.heading);
      api.pos.x = CVH.clamp(car.mesh.position.x + r.x * 2.4, -268, 248);
      api.pos.z = CVH.clamp(car.mesh.position.z + r.z * 2.4, -268, 268);
      const fixed = CVH.world.collide(api.pos.x, api.pos.z, 0.55);
      api.pos.x = fixed.x; api.pos.z = fixed.z;
      api.car = null;
      api.state = 'foot';
      api.mesh.visible = true;
      api.mesh.position.set(api.pos.x, 0, api.pos.z);
    },

    toggleCar: function () {
      if (api.state === 'car') { api.exitCar(); return; }
      const car = api.nearestCar(3.6);
      if (car) api.enterCar(car);
    },

    shoot: function () {
      if (!api.weapon || api.shootCd > 0 || api.state !== 'foot') return;
      if (api.ammo[api.weapon] <= 0) { CVH.hud.toast('Out of ammo — find another pickup.'); return; }
      api.ammo[api.weapon]--;
      api.shootCd = api.weapon === 'smg' ? 0.11 : 0.34;
      CVH.audio.shot();
      CVH.police.addHeat(14);
      const aim = CVH.forwardOf(api.camYaw);
      CVH.peds.scare(api.pos.x, api.pos.z, 26);
      // nearest ped or car inside a cone around the aim direction
      let bestT = null, bestD = 36;
      for (let i = 0; i < CVH.peds.list.length; i++) {
        const p = CVH.peds.list[i];
        if (p.downT > 0) continue;
        const dx = p.mesh.position.x - api.pos.x, dz = p.mesh.position.z - api.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 36) continue;
        const dot = (dx / (d || 1)) * aim.x + (dz / (d || 1)) * aim.z;
        if (dot > 0.965 && d < bestD) { bestD = d; bestT = { ped: p }; }
      }
      for (let i = 0; i < CVH.vehicles.list.length; i++) {
        const c = CVH.vehicles.list[i];
        const dx = c.mesh.position.x - api.pos.x, dz = c.mesh.position.z - api.pos.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > 38) continue;
        const dot = (dx / (d || 1)) * aim.x + (dz / (d || 1)) * aim.z;
        if (dot > 0.94 && d < bestD) { bestD = d; bestT = { car: c }; }
      }
      if (bestT) {
        if (bestT.ped) {
          bestT.ped.downT = 6; bestT.ped.mesh.rotation.x = Math.PI / 2;
          CVH.police.addHeat(16);
        } else {
          CVH.vehicles.damage(bestT.car, api.weapon === 'smg' ? 9 : 14, false);
          if (bestT.car.isPolice) CVH.police.addHeat(10);
        }
      }
    },

    update: function (dt) {
      api.shootCd = Math.max(0, api.shootCd - dt);
      const input = CVH.input;
      // mouse look
      const md = input.consumeMouse();
      if (input.isLocked()) {
        api.camYaw -= md.dx * 0.0026;
        api.camYaw = CVH.wrapAngle(api.camYaw);
        api.camPitch = CVH.clamp(api.camPitch + md.dy * 0.0022, -0.15, 1.1);
      }

      if (api.state === 'car' && api.car) {
        const car = api.car;
        const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) + (input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0);
        const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) + (input.isDown('KeyD') || input.isDown('ArrowRight') ? -1 : 0);
        CVH.vehicles.driveUpdate(car, dt, throttle, steer);
        api.mesh.position.set(car.mesh.position.x, 0.55, car.mesh.position.z);
        api.mesh.rotation.y = car.heading;
        return;
      }

      // on foot: camera-relative movement; right = cross(forward, up)
      const f = CVH.forwardOf(api.camYaw);
      const r = CVH.rightOf(api.camYaw);
      let ix = 0, iz = 0;
      if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz += 1;
      if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz -= 1;
      if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
      if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
      let mx = f.x * iz + r.x * ix;
      let mz = f.z * iz + r.z * ix;
      const len = Math.sqrt(mx * mx + mz * mz);
      const moving = len > 0.01;
      if (moving) {
        mx /= len; mz /= len;
        const speed = (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) ? RUN : WALK;
        api.pos.x += mx * speed * dt;
        api.pos.z += mz * speed * dt;
        const want = CVH.headingOf(mx, mz);
        api.heading = CVH.turnToward(api.heading, want, 14 * dt);
        api.walkPhase += dt * speed * 2.1;
      } else if (input.isLocked()) {
        api.heading = CVH.turnToward(api.heading, api.camYaw, 10 * dt);
      }
      const fixed = CVH.world.collide(api.pos.x, api.pos.z, 0.55);
      api.pos.x = CVH.clamp(fixed.x, -268, 249);
      api.pos.z = CVH.clamp(fixed.z, -268, 268);
      if (api.mesh) {
        api.mesh.position.set(api.pos.x, 0, api.pos.z);
        api.mesh.rotation.y = api.heading;
        const sw = moving ? Math.sin(api.walkPhase) * 0.62 : 0;
        api.mesh.userData.legL.rotation.x = sw;
        api.mesh.userData.legR.rotation.x = -sw;
        api.mesh.userData.armL.rotation.x = -sw * 0.75;
        api.mesh.userData.armR.rotation.x = sw * 0.75;
      }
    }
  };

  CVH.debug.teleport = function (x, z) {
    if (api.car) {
      api.car.mesh.position.set(x, 0, z);
      api.car.speed = 0;
    }
    api.pos.x = x; api.pos.z = z;
    if (api.mesh && api.state === 'foot') api.mesh.position.set(x, 0, z);
  };

  return api;
})();
