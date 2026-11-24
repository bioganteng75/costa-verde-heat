// missions.js — Marisol Vega's six story jobs, taxi work, cash packages,
// weapon pickups, and the ONE cleanup path: missions.cancel().
// cancel() removes the parked mission car, makes the taxi passenger
// visible again and clears all job/taxi state. New game, restart,
// BUSTED and WASTED all funnel through it.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var JOBS = [
    {
      title: 'Job 1 — First Run', reward: 300,
      stages: [
        { type: 'pickup', x: 196, z: 47, label: 'Pick up the package at the beachfront kiosk' },
        { type: 'deliver', x: 228, z: 40, label: 'Deliver it to the beach, by the pier' }
      ]
    },
    {
      title: 'Job 2 — Hot Wheels', reward: 450,
      stages: [
        { type: 'steal', x: 120, z: 47, label: 'Steal the coupe on the east avenue', carType: 'coupe' },
        { type: 'deliverCar', x: -120, z: -33, label: 'Deliver the coupe to the chop shop' }
      ]
    },
    {
      title: 'Job 3 — Beach Money', reward: 500,
      stages: [
        { type: 'pickup', x: 232, z: -80, label: 'Collect the cash at the marina' },
        { type: 'deliver', x: 12, z: 47, label: 'Bring it back to Marisol\'s porch' }
      ]
    },
    {
      title: 'Job 4 — Downtown Dash', reward: 650,
      stages: [
        { type: 'pickup', x: -200, z: 120, label: 'Pick up the briefcase uptown' },
        { type: 'deliver', x: 40, z: -40, label: 'Deliver downtown — fast!', time: 75 }
      ]
    },
    {
      title: 'Job 5 — Heat Run', reward: 800,
      stages: [
        { type: 'pickup', x: 200, z: 200, label: 'Grab the stash in the south-east', heat: 200 },
        { type: 'deliver', x: 228, z: -160, label: 'Lose the heat and reach the south beach', time: 95 }
      ]
    },
    {
      title: 'Job 6 — Final Score', reward: 1200,
      stages: [
        { type: 'pickup', x: -40, z: -200, label: 'Pick up the last package up north' },
        { type: 'deliver', x: 262, z: 40, label: 'Take it to the end of the pier', time: 100 }
      ]
    }
  ];

  var TAXI_PICKUPS = [[0, 40], [120, -40], [-120, 120], [200, 40], [-200, -120], [40, 200]];
  var TAXI_DROPOFFS = [[40, -120], [-40, 40], [160, 120], [-160, -40], [228, 80], [0, -200]];
  var PACKAGES = [
    [0, 40], [-120, -40], [200, -120], [228, 120], [262, 40], [-200, 200], [120, 120],
    [40, -200], [-40, 200], [228, -200], [60, 47], [-160, -33], [180, 33], [90, -113]
  ];

  var missions = {
    jobsDone: 0,
    active: null,       // job index or null
    stage: 0,
    timer: 0,
    missionCar: null,
    taxi: null,         // {stage:'pickup'|'dropoff', x, z, passenger}
    packagesFound: {},
    packagesTaken: 0
  };

  var marker = null;       // gold pillar mesh
  var packageMeshes = [];
  var pickupMeshes = [];
  var passengerMesh = null;

  missions.JOBS = JOBS;

  missions.init = function (scene) {
    // register every objective point for the audit
    JOBS.forEach(function (job, ji) {
      job.stages.forEach(function (st, si) {
        CVH.world.addObjective('job' + (ji + 1) + '-stage' + (si + 1), st.x, st.z);
      });
    });
    TAXI_PICKUPS.forEach(function (p, i) { CVH.world.addObjective('taxi-pickup-' + (i + 1), p[0], p[1]); });
    TAXI_DROPOFFS.forEach(function (p, i) { CVH.world.addObjective('taxi-dropoff-' + (i + 1), p[0], p[1]); });
    PACKAGES.forEach(function (p, i) { CVH.world.addObjective('package-' + (i + 1), p[0], p[1]); });
    CVH.world.addObjective('pickup-pistol', 20, 47);
    CVH.world.addObjective('pickup-smg', -200, -47);

    // reusable gold marker pillar
    var geo = new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true);
    var mat = new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    marker = new THREE.Mesh(geo, mat);
    marker.visible = false;
    scene.add(marker);

    // cash packages: spinning gold boxes
    PACKAGES.forEach(function (p, i) {
      var m = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshLambertMaterial({ color: 0xffd34f, emissive: 0x8a6a10 })
      );
      m.position.set(p[0], 1.1, p[1]);
      scene.add(m);
      packageMeshes.push(m);
    });

    // weapon pickups
    function weaponMesh(kind, x, z, color) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4), new THREE.MeshLambertMaterial({ color: color, emissive: 0x222222 }));
      m.position.set(x, 0.8, z);
      scene.add(m);
      pickupMeshes.push({ mesh: m, kind: kind, x: x, z: z });
    }
    weaponMesh('pistol', 20, 47, 0x3a3f46);
    weaponMesh('smg', -200, -47, 0x22242c);

    // taxi passenger figure (hidden until a fare is offered)
    passengerMesh = CVH.world.makeHumanoid(0xf2c14e, 0x2c3e50, 0xf2c79b);
    passengerMesh.visible = false;
    scene.add(passengerMesh);
  };

  missions.currentStage = function () {
    if (missions.active === null) return null;
    return JOBS[missions.active].stages[missions.stage];
  };

  missions.startJob = function (idx) {
    missions.active = idx;
    missions.stage = 0;
    missions.setupStage();
    if (CVH.hud) CVH.hud.toast(JOBS[idx].title + ' — check the gold marker');
    if (CVH.audio) CVH.audio.pickup();
  };

  missions.setupStage = function () {
    var st = missions.currentStage();
    missions.timer = st && st.time ? st.time : 0;
    if (st && st.type === 'steal') {
      missions.missionCar = CVH.vehicles.spawn(st.carType || 'coupe', st.x, st.z, -Math.PI / 2, 'mission', 0xe0a52c);
    }
    if (st && st.heat) CVH.police.addHeat(st.heat);
  };

  missions.completeJob = function () {
    var job = JOBS[missions.active];
    CVH.player.cash += job.reward;
    missions.jobsDone = missions.active + 1;
    missions.active = null;
    missions.stage = 0;
    missions.missionCar = null;
    if (CVH.audio) CVH.audio.jobDone();
    if (CVH.hud) CVH.hud.toast(job.title + ' complete  +$' + job.reward);
    if (missions.jobsDone >= JOBS.length && CVH.onEnding) CVH.onEnding();
  };

  // THE cleanup path.
  missions.cancel = function () {
    if (missions.missionCar) {
      CVH.vehicles.remove(missions.missionCar);
      missions.missionCar = null;
    }
    if (missions.taxi && missions.taxi.passenger) {
      missions.taxi.passenger.visible = true;
    }
    if (passengerMesh) passengerMesh.visible = false;
    missions.taxi = null;
    missions.active = null;
    missions.stage = 0;
    missions.timer = 0;
    if (marker) marker.visible = false;
  };

  missions.resetProgress = function () {
    missions.cancel();
    missions.jobsDone = 0;
    missions.packagesFound = {};
    missions.packagesTaken = 0;
    packageMeshes.forEach(function (m) { m.visible = true; });
  };

  // ---------------------------------------------------------------
  // Taxi
  // ---------------------------------------------------------------
  function offerTaxi() {
    var p = TAXI_PICKUPS[(Math.random() * TAXI_PICKUPS.length) | 0];
    missions.taxi = { stage: 'pickup', x: p[0], z: p[1], passenger: null };
    passengerMesh.visible = true;
    passengerMesh.position.set(p[0], CVH.world.groundY(p[0], p[1]), p[1]);
    if (CVH.hud) CVH.hud.toast('Taxi fare waiting — follow the blue marker');
  }

  function updateTaxi(dt) {
    var player = CVH.player;
    if (missions.taxiEnabled === false) return;
    if (!missions.taxi) {
      if (player.driving && missions.active === null && Math.random() < dt * 0.05) offerTaxi();
      return;
    }
    var t = missions.taxi;
    var pos = player.pos();
    if (t.stage === 'pickup') {
      passengerMesh.position.set(t.x, CVH.world.groundY(t.x, t.z), t.z);
      if (player.driving && U.dist(pos.x, pos.z, t.x, t.z) < 5 && Math.abs(player.car.speed) < 1.5) {
        t.stage = 'dropoff';
        t.passenger = passengerMesh;
        passengerMesh.visible = false; // passenger climbs in
        var d = TAXI_DROPOFFS[(Math.random() * TAXI_DROPOFFS.length) | 0];
        t.x = d[0]; t.z = d[1];
        if (CVH.audio) CVH.audio.door();
        if (CVH.hud) CVH.hud.toast('Passenger aboard — drive to the blue marker');
      }
    } else {
      if (player.driving && U.dist(pos.x, pos.z, t.x, t.z) < 6 && Math.abs(player.car.speed) < 1.5) {
        var fare = 40 + ((Math.random() * 60) | 0);
        player.cash += fare;
        if (CVH.audio) CVH.audio.cash();
        if (CVH.hud) CVH.hud.toast('Taxi fare paid  +$' + fare);
        passengerMesh.visible = true;
        passengerMesh.position.set(t.x, CVH.world.groundY(t.x, t.z), t.z);
        missions.taxi = null;
      }
    }
  }

  // ---------------------------------------------------------------
  // Per-frame
  // ---------------------------------------------------------------
  missions.targetPoint = function () {
    var st = missions.currentStage();
    if (st) return { x: st.x, z: st.z, kind: 'job', label: st.label, timer: missions.timer };
    if (missions.taxi) return { x: missions.taxi.x, z: missions.taxi.z, kind: 'taxi', label: missions.taxi.stage === 'pickup' ? 'Pick up the taxi fare' : 'Drop off your passenger', timer: 0 };
    if (missions.jobsDone < JOBS.length) return { x: CVH.world.porch.x, z: CVH.world.porch.z, kind: 'porch', label: 'See Marisol Vega for work', timer: 0 };
    return null;
  };

  missions.update = function (dt) {
    var player = CVH.player;
    var pos = player.pos();
    var t = missions.targetPoint();

    // marker pillar follows the current target
    if (t && marker) {
      marker.visible = true;
      marker.position.set(t.x, 13, t.z);
      marker.rotation.y += dt * 0.8;
      marker.material.color.setHex(t.kind === 'taxi' ? 0x4fc3ff : 0xffd34f);
    } else if (marker) {
      marker.visible = false;
    }

    // porch: start the next job on foot
    if (missions.active === null && missions.jobsDone < JOBS.length && !player.driving) {
      if (U.dist(player.x, player.z, CVH.world.porch.x, CVH.world.porch.z) < 3.6) {
        missions.startJob(missions.jobsDone);
      }
    }

    // job stages
    var st = missions.currentStage();
    if (st) {
      if (st.time) {
        missions.timer -= dt;
        if (missions.timer <= 0) {
          missions.timer = st.time;
          if (CVH.audio) CVH.audio.fail();
          if (CVH.hud) CVH.hud.toast('Too slow — the clock restarts. Move!');
        }
      }
      var done = false;
      if (st.type === 'pickup' || st.type === 'deliver') {
        done = U.dist(pos.x, pos.z, st.x, st.z) < 4.5;
        if (done && st.type === 'pickup' && CVH.fx) CVH.fx.sparkle(st.x, 1.2, st.z);
      } else if (st.type === 'steal') {
        done = !!(missions.missionCar && player.driving && player.car === missions.missionCar);
      } else if (st.type === 'deliverCar') {
        done = !!(missions.missionCar && player.driving && player.car === missions.missionCar &&
          U.dist(pos.x, pos.z, st.x, st.z) < 6);
        if (done) {
          // hand the car over: it stays at the chop shop as a parked car
          player.exitCar(true);
          missions.missionCar.driver = 'parked';
          missions.missionCar = null;
        }
      }
      if (done) {
        missions.stage++;
        if (missions.stage >= JOBS[missions.active].stages.length) missions.completeJob();
        else {
          missions.setupStage();
          if (CVH.audio) CVH.audio.pickup();
          if (CVH.hud) CVH.hud.toast(missions.currentStage().label);
        }
      }
    }

    updateTaxi(dt);

    // packages
    for (var i = 0; i < packageMeshes.length; i++) {
      var m = packageMeshes[i];
      if (!m.visible) continue;
      m.rotation.y += dt * 2.2;
      m.position.y = 1.1 + Math.sin(performance.now() * 0.003 + i) * 0.15;
      if (missions.packagesFound[i]) { m.visible = false; continue; }
      var pp = PACKAGES[i];
      if (U.dist(pos.x, pos.z, pp[0], pp[1]) < 2.8) {
        missions.packagesFound[i] = true;
        missions.packagesTaken++;
        m.visible = false;
        player.cash += 250;
        if (CVH.audio) CVH.audio.cash();
        if (CVH.fx) CVH.fx.sparkle(pp[0], 1.2, pp[1]);
        if (CVH.hud) CVH.hud.toast('Hidden cash  +$250  (' + missions.packagesTaken + '/14)');
      }
    }

    // weapon pickups
    for (i = 0; i < pickupMeshes.length; i++) {
      var pk = pickupMeshes[i];
      pk.mesh.rotation.y += dt * 1.6;
      if (!player.driving && U.dist(player.x, player.z, pk.x, pk.z) < 2.0) {
        player.giveWeapon(pk.kind);
        if (CVH.audio) CVH.audio.pickup();
        if (CVH.hud) CVH.hud.toast(pk.kind === 'pistol' ? 'Pistol acquired — click / Space to fire' : 'SMG acquired — hold to spray');
        pk.mesh.position.y = -5; // sink until respawn
        pk.x = -9999; // one-shot per run location; keep simple
      }
    }
  };

  // Save/load support
  missions.saveData = function () {
    return { jobsDone: missions.jobsDone, packagesFound: missions.packagesFound, packagesTaken: missions.packagesTaken };
  };
  missions.loadData = function (d) {
    if (!d) return;
    missions.jobsDone = d.jobsDone || 0;
    missions.packagesFound = d.packagesFound || {};
    missions.packagesTaken = d.packagesTaken || 0;
    packageMeshes.forEach(function (m, i) { m.visible = !missions.packagesFound[i]; });
  };

  CVH.missions = missions;
})();
