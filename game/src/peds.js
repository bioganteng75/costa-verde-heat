// Costa Verde Heat — pedestrians: 40 citizens who wander the sidewalks,
// flee danger, get recycled near the player, plus the reusable taxi passenger.
CVH.peds = (function () {
  const list = [];
  let sceneRef = null;
  const SHIRTS = [0xc4553b, 0x3b6ec4, 0x53a05a, 0xd8b13c, 0x8a5fb0, 0xd8d3c8, 0x3fa8a0, 0xc47ba0];
  const SKIN = [0xe8b98d, 0xc98a5a, 0x8a5a34, 0xf0c8a0, 0x6e4226];

  function buildMesh(shirt, skin) {
    const g = new THREE.Group();
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), legMat);
    legL.position.set(-0.11, 0.39, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.11; g.add(legR);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.24), new THREE.MeshLambertMaterial({ color: shirt }));
    torso.position.y = 1.09; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.58; g.add(head);
    const armMat = new THREE.MeshLambertMaterial({ color: shirt });
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.13), armMat);
    armL.position.set(-0.3, 1.08, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.3; g.add(armR);
    g.userData.legL = legL; g.userData.legR = legR;
    g.userData.armL = armL; g.userData.armR = armR;
    return g;
  }

  function sidewalkPointNear(x, z, minD, maxD) {
    const W = CVH.world;
    for (let tries = 0; tries < 12; tries++) {
      let px, pz;
      if (Math.random() < 0.5) {
        px = CVH.pick(W.AVENUES_X) + (Math.random() < 0.5 ? -8.6 : 8.6);
        pz = CVH.rand(-258, 258);
      } else {
        pz = CVH.pick(W.STREETS_Z) + (Math.random() < 0.5 ? -8.6 : 8.6);
        px = CVH.rand(-258, 205);
      }
      const d = CVH.dist2d(px, pz, x, z);
      if (d >= minD && d <= maxD) return { x: px, z: pz };
    }
    return { x: x + 30, z: z + 20 };
  }

  function makePed(x, z) {
    const mesh = buildMesh(CVH.pick(SHIRTS), CVH.pick(SKIN));
    mesh.position.set(x, 0, z);
    sceneRef.add(mesh);
    const ped = {
      mesh: mesh, heading: CVH.rand(0, Math.PI * 2),
      state: 'wander', target: sidewalkPointNear(x, z, 10, 90),
      fleeFrom: null, fleeT: 0, downT: 0, phase: Math.random() * 6,
      hitCounted: false
    };
    list.push(ped);
    return ped;
  }

  let passenger = null;

  function spawnInitial(scene) {
    sceneRef = scene;
    const spawn = CVH.world.points.spawn;
    for (let i = 0; i < 40; i++) {
      const p = sidewalkPointNear(spawn.x, spawn.z, 15, 190);
      makePed(p.x, p.z);
    }
    // the taxi passenger: one reusable citizen, starts life as a bystander
    const pm = buildMesh(0xe3b23c, CVH.pick(SKIN));
    pm.position.set(CVH.world.points.taxiPickups[0].x + 2, 0, CVH.world.points.taxiPickups[0].z + 2);
    scene.add(pm);
    passenger = { mesh: pm, state: 'waiting' }; // waiting | riding | delivered
  }

  function scare(x, z, radius) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.downT > 0) continue;
      if (CVH.dist2d(p.mesh.position.x, p.mesh.position.z, x, z) < radius) {
        p.state = 'flee'; p.fleeFrom = { x: x, z: z }; p.fleeT = 3.5;
      }
    }
  }

  function update(dt) {
    const player = CVH.player;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const pos = p.mesh.position;
      if (p.downT > 0) {
        p.downT -= dt;
        if (p.downT <= 0) { p.mesh.rotation.x = 0; p.state = 'flee'; p.fleeFrom = { x: player.pos.x, z: player.pos.z }; p.fleeT = 3; }
        continue;
      }
      // run over by the player's car?
      if (player && player.car && Math.abs(player.car.speed) > 6) {
        const cp = player.car.mesh.position;
        if (CVH.dist2d(pos.x, pos.z, cp.x, cp.z) < 1.7) {
          p.downT = 5; p.mesh.rotation.x = Math.PI / 2;
          if (!p.hitCounted) { p.hitCounted = true; CVH.police.addHeat(30); CVH.audio.hurt(); }
          continue;
        }
      }
      let speed = 1.25;
      let tx, tz;
      if (p.state === 'flee' && p.fleeFrom) {
        p.fleeT -= dt;
        if (p.fleeT <= 0) { p.state = 'wander'; p.target = sidewalkPointNear(pos.x, pos.z, 10, 80); }
        const dx = pos.x - p.fleeFrom.x, dz = pos.z - p.fleeFrom.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        tx = pos.x + (dx / d) * 20; tz = pos.z + (dz / d) * 20;
        speed = 3.6;
      } else {
        tx = p.target.x; tz = p.target.z;
        if (CVH.dist2d(pos.x, pos.z, tx, tz) < 1.6) {
          p.target = sidewalkPointNear(pos.x, pos.z, 15, 110);
        }
      }
      const want = CVH.headingOf(tx - pos.x, tz - pos.z);
      p.heading = CVH.turnToward(p.heading, want, 5.5 * dt);
      const f = CVH.forwardOf(p.heading);
      pos.x += f.x * speed * dt;
      pos.z += f.z * speed * dt;
      const fixed = CVH.world.collide(pos.x, pos.z, 0.45);
      pos.x = fixed.x; pos.z = fixed.z;
      pos.x = CVH.clamp(pos.x, -268, 248); pos.z = CVH.clamp(pos.z, -268, 268);
      p.mesh.rotation.y = p.heading;
      p.phase += dt * speed * 3.4;
      const sw = Math.sin(p.phase) * 0.5;
      p.mesh.userData.legL.rotation.x = sw;
      p.mesh.userData.legR.rotation.x = -sw;
      p.mesh.userData.armL.rotation.x = -sw * 0.7;
      p.mesh.userData.armR.rotation.x = sw * 0.7;
      // recycle far-away peds back into the player's neighbourhood
      if (player && CVH.dist2d(pos.x, pos.z, player.pos.x, player.pos.z) > 175) {
        const np = sidewalkPointNear(player.pos.x, player.pos.z, 55, 105);
        pos.x = np.x; pos.z = np.z;
        p.target = sidewalkPointNear(pos.x, pos.z, 10, 80);
        p.hitCounted = false;
      }
    }
  }

  return {
    list: list,
    spawnInitial: spawnInitial,
    update: update,
    scare: scare,
    getPassenger: function () { return passenger; }
  };
})();
