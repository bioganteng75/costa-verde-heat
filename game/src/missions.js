// Costa Verde Heat — Marisol Vega's 6 story jobs, taxi work, cash packages,
// weapon pickups, food stands, Pay 'n Spray, and the ONE cleanup path
// (missions.cancel) that new game / restart / busted / wasted all share.
CVH.missions = (function () {
  const W = CVH.world;
  const REWARDS = [300, 400, 550, 500, 650, 900];

  const api = {
    jobIndex: 0,          // next job to offer (6 = story complete)
    active: null,         // { job, stageIdx, timer, carRef }
    taxi: null,           // { phase, pickup, dropoff }
    packagesFound: {},    // idx -> true
    onEnding: null,       // installed by main.js
    onProgress: null,     // called whenever cash/jobs change (autosave hook)
    marker: null,
    pnsInside: false,
    ePrev: false
  };

  let markerMesh = null, markerRing = null;
  let packageMeshes = [], weaponMeshes = [];

  function buildMarker(scene) {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, 30, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
    );
    cyl.position.y = 15;
    g.add(cyl);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 3.3, 28),
      new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
    g.add(ring);
    g.visible = false;
    scene.add(g);
    markerMesh = g; markerRing = ring;
  }

  function setMarker(p) {
    api.marker = p;
    if (!markerMesh) return;
    if (p) { markerMesh.position.set(p.x, 0, p.z); markerMesh.visible = true; }
    else markerMesh.visible = false;
  }

  function build(scene) {
    buildMarker(scene);
    // cash packages: spinning gold boxes
    W.points.packages.forEach(function (pt, i) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.55, 0.85),
        new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x664d00 })
      );
      m.position.set(pt.x, 1.1, pt.z);
      m.userData.idx = i;
      scene.add(m);
      packageMeshes.push(m);
    });
    // weapon pickups
    W.points.weapons.forEach(function (wp) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(wp.kind === 'smg' ? 1.15 : 0.7, 0.22, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x22242a, emissive: 0x11131a })
      );
      m.position.set(wp.x, 1.0, wp.z);
      m.userData.kind = wp.kind;
      scene.add(m);
      weaponMeshes.push(m);
    });
  }

  function stagePoint() {
    if (api.active) return api.active.job.stages[api.active.stageIdx];
    if (api.taxi) return api.taxi.phase === 'pickup' ? api.taxi.pickup : api.taxi.dropoff;
    return null;
  }

  function startJob(i) {
    const job = W.points.jobs[i];
    api.active = { job: job, stageIdx: 0, timer: null, carRef: null };
    if (job.carJob) {
      const s = job.stages[0];
      api.active.carRef = CVH.vehicles.makeCar('coupe', s.x + 3, s.z + 2, Math.PI, { driver: null, color: 0xd8a022 });
    }
    const s0 = job.stages[0];
    api.active.timer = s0.time || null;
    setMarker(s0);
    CVH.hud.banner('JOB ' + (i + 1) + ' — ' + job.name, s0.label);
    CVH.audio.blip();
  }

  function completeJob() {
    const idx = api.jobIndex;
    const reward = REWARDS[idx];
    CVH.player.cash += reward;
    CVH.audio.jobDone();
    CVH.hud.banner('JOB COMPLETE', '+' + '$' + reward + ' — Marisol is pleased.');
    api.active = null;
    setMarker(null);
    api.jobIndex++;
    if (api.jobIndex >= 6 && api.onEnding) api.onEnding();
    if (api.onProgress) api.onProgress();
  }

  function advanceStage() {
    const a = api.active;
    a.stageIdx++;
    if (a.stageIdx >= a.job.stages.length) { completeJob(); return; }
    const s = a.job.stages[a.stageIdx];
    a.timer = s.time || null;
    setMarker(s);
    CVH.hud.banner(a.job.name, s.label + (s.time ? ' — ' + s.time + 's on the clock' : ''));
    CVH.audio.blip();
    if (api.onProgress) api.onProgress();
  }

  function failJob(reason) {
    CVH.hud.banner('JOB FAILED', reason);
    CVH.audio.bustedJingle();
    api.cancel();
  }

  // THE cleanup path. Removes a parked mission car, restores the taxi
  // passenger, clears job/taxi state and the marker.
  api.cancel = function () {
    if (api.active && api.active.carRef) {
      const ref = api.active.carRef;
      if (CVH.player.car === ref) CVH.player.exitCar();
      if (ref.driver !== 'player') CVH.vehicles.removeCar(ref);
    }
    api.active = null;
    if (api.taxi) {
      const passenger = CVH.peds.getPassenger();
      if (passenger && passenger.state === 'riding') {
        passenger.state = 'waiting';
        passenger.mesh.visible = true;
        passenger.mesh.position.set(CVH.player.pos.x + 2, 0, CVH.player.pos.z + 1);
      }
      api.taxi = null;
    }
    setMarker(null);
  };

  api.startTaxi = function () {
    if (api.active || api.taxi) return false;
    const p = CVH.player.pos;
    // nearest pickup point, then a dropoff that is never the pickup itself
    let pickup = null, bd = Infinity;
    W.points.taxiPickups.forEach(function (pt) {
      const d = CVH.dist2d(pt.x, pt.z, p.x, p.z);
      if (d < bd) { bd = d; pickup = pt; }
    });
    const options = W.points.taxiDropoffs.filter(function (pt) {
      return !(pt.x === pickup.x && pt.z === pickup.z) && CVH.dist2d(pt.x, pt.z, pickup.x, pickup.z) > 60;
    });
    if (!options.length) return false;
    const dropoff = CVH.pick(options);
    api.taxi = { phase: 'pickup', pickup: pickup, dropoff: dropoff };
    const passenger = CVH.peds.getPassenger();
    if (passenger) {
      passenger.state = 'waiting';
      passenger.mesh.visible = true;
      passenger.mesh.position.set(pickup.x + 2, 0, pickup.z + 2);
    }
    setMarker(pickup);
    CVH.hud.banner('TAXI', 'Pick up the passenger');
    CVH.audio.blip();
    return true;
  };

  function completeTaxi() {
    const t = api.taxi;
    const fare = Math.round(55 + CVH.dist2d(t.pickup.x, t.pickup.z, t.dropoff.x, t.dropoff.z) * 0.45);
    CVH.player.cash += fare;
    CVH.audio.cash();
    CVH.hud.banner('FARE PAID', '+$' + fare);
    const passenger = CVH.peds.getPassenger();
    if (passenger) {
      passenger.state = 'delivered';
      passenger.mesh.visible = true;
      passenger.mesh.position.set(t.dropoff.x + 2, 0, t.dropoff.z + 1);
    }
    api.taxi = null;
    setMarker(null);
    if (api.onProgress) api.onProgress();
  }

  api.objectivePoint = stagePoint;
  api.markerPoint = function () { return api.marker; };

  api.resetStory = function () {
    api.cancel();
    api.jobIndex = 0;
    api.packagesFound = {};
    packageMeshes.forEach(function (m) { m.visible = true; });
    weaponMeshes.forEach(function (m) { m.visible = true; });
  };

  api.applySave = function (data) {
    api.jobIndex = data.jobIndex || 0;
    api.packagesFound = data.packages || {};
    packageMeshes.forEach(function (m) { m.visible = !api.packagesFound[m.userData.idx]; });
  };

  api.update = function (dt) {
    const player = CVH.player;
    // marker pulse
    if (markerMesh && markerMesh.visible) {
      const s = 1 + Math.sin(performance.now() * 0.005) * 0.12;
      markerRing.scale.set(s, s, 1);
    }
    // packages spin + collect
    for (let i = 0; i < packageMeshes.length; i++) {
      const m = packageMeshes[i];
      if (!m.visible) continue;
      m.rotation.y += dt * 2.4;
      m.position.y = 1.1 + Math.sin(performance.now() * 0.003 + i) * 0.15;
      if (CVH.dist2d(player.pos.x, player.pos.z, m.position.x, m.position.z) < 2.6) {
        m.visible = false;
        api.packagesFound[m.userData.idx] = true;
        player.cash += 250;
        CVH.audio.cash();
        const n = Object.keys(api.packagesFound).length;
        CVH.hud.toast('Cash package ' + n + '/14  +$250');
        if (api.onProgress) api.onProgress();
      }
    }
    // weapon pickups
    for (let i = 0; i < weaponMeshes.length; i++) {
      const m = weaponMeshes[i];
      if (!m.visible) continue;
      m.rotation.y += dt * 1.8;
      if (player.state === 'foot' && CVH.dist2d(player.pos.x, player.pos.z, m.position.x, m.position.z) < 2.2) {
        const kind = m.userData.kind;
        player.weapon = kind;
        player.ammo[kind] += kind === 'smg' ? 90 : 48;
        m.visible = false;
        CVH.audio.pickup();
        CVH.hud.toast((kind === 'smg' ? 'SMG' : 'Pistol') + ' acquired');
        if (api.onProgress) api.onProgress();
      }
    }

    // ---- story job stage progression
    if (api.active) {
      const a = api.active;
      const s = a.job.stages[a.stageIdx];
      if (a.timer !== null && a.timer !== undefined) {
        a.timer -= dt;
        CVH.hud.setObjective(s.label + ' — ' + Math.max(0, Math.ceil(a.timer)) + 's');
        if (a.timer <= 0) { failJob('Out of time. Marisol shrugs — try again at the porch.'); return; }
      } else {
        CVH.hud.setObjective(s.label);
      }
      let done = false;
      if (a.job.carJob && a.stageIdx === 0) {
        done = player.car === a.carRef;
      } else {
        done = CVH.dist2d(player.pos.x, player.pos.z, s.x, s.z) < 6.5;
      }
      if (done) advanceStage();
    } else if (api.taxi) {
      const t = api.taxi;
      const target = t.phase === 'pickup' ? t.pickup : t.dropoff;
      CVH.hud.setObjective(t.phase === 'pickup' ? 'Taxi: reach the passenger' : 'Taxi: drop off your passenger');
      if (CVH.dist2d(player.pos.x, player.pos.z, target.x, target.z) < 6.5) {
        if (t.phase === 'pickup') {
          if (player.state === 'car') {
            t.phase = 'dropoff';
            const passenger = CVH.peds.getPassenger();
            if (passenger) { passenger.state = 'riding'; passenger.mesh.visible = false; }
            setMarker(t.dropoff);
            CVH.hud.banner('TAXI', 'Passenger aboard — drive!');
            CVH.audio.blip();
          }
        } else {
          completeTaxi();
        }
      }
    } else {
      CVH.hud.setObjective(api.jobIndex < 6 ? 'See Marisol at the porch — or press T for taxi work' : 'Free roam — the city is yours');
    }

    // ---- Pay 'n Spray (automatic, in car)
    const pad = W.points.pnsPad;
    const nearPad = player.state === 'car' && CVH.dist2d(player.pos.x, player.pos.z, pad.x, pad.z) < 5.5;
    if (nearPad && !api.pnsInside) {
      api.pnsInside = true;
      const car = player.car;
      if (car && (car.health < 100 || CVH.police.heat > 0)) {
        const cost = player.cash >= 80 ? 80 : 0;
        player.cash -= cost;
        CVH.vehicles.repair(car);
        car.bodyMat.color.setHex(CVH.pick(CVH.vehicles.TYPES[car.type].colors));
        CVH.police.heat = Math.max(0, CVH.police.heat - 40);
        CVH.audio.pickup();
        CVH.hud.toast('Pay \'n Spray: fresh paint, cooler trail' + (cost ? '  -$' + cost : ''));
        if (api.onProgress) api.onProgress();
      }
    } else if (!nearPad) api.pnsInside = false;

    // ---- E-key interactions: porch (jobs) and food stands (heal)
    const eDown = CVH.input.isDown('KeyE');
    const eEdge = eDown && !api.ePrev;
    api.ePrev = eDown;
    let prompt = null;
    const porch = W.points.porch;
    if (player.state === 'foot' && CVH.dist2d(player.pos.x, player.pos.z, porch.x, porch.z) < 4.2) {
      if (!api.active && api.jobIndex < 6) {
        prompt = 'E — Talk to Marisol (Job ' + (api.jobIndex + 1) + ': ' + W.points.jobs[api.jobIndex].name + ')';
        if (eEdge) startJob(api.jobIndex);
      } else if (api.jobIndex >= 6) {
        prompt = 'Marisol: "You did it all, kid. The city is yours."';
      }
    }
    if (!prompt && player.state === 'foot') {
      for (let i = 0; i < W.points.stands.length; i++) {
        const st = W.points.stands[i];
        if (CVH.dist2d(player.pos.x, player.pos.z, st.x, st.z) < 3.2) {
          prompt = 'E — Eat at the stand ($15, +40 HP)';
          if (eEdge) {
            if (player.cash >= 15 && player.health < 100) {
              player.cash -= 15;
              player.health = Math.min(100, player.health + 40);
              CVH.audio.pickup();
              CVH.hud.toast('You feel human again.  +40 HP');
              if (api.onProgress) api.onProgress();
            } else if (player.health >= 100) CVH.hud.toast('You are stuffed already.');
            else CVH.hud.toast('Not enough cash.');
          }
          break;
        }
      }
    }
    CVH.hud.setPrompt(prompt);
  };

  api.build = build;
  return api;
})();
