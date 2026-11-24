// missions.js — Marisol Vega's 6 story jobs, taxi work, world pickups.
// ONE cleanup path: missions.cancel() is called by new game, restart,
// busted and wasted. It removes any parked mission car, restores the taxi
// passenger's visibility, and clears all job/taxi state.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;

  var JOBS = [
    {
      name: 'Beach Run', payout: 150,
      stages: [
        { type: 'go', x: 8, z: 214, r: 6, label: 'Pick up the package at Marisol’s porch' },
        { type: 'go', x: 228, z: 40, r: 7, label: 'Deliver the package to the beach' }
      ]
    },
    {
      name: 'Hot Coupe', payout: 220, carAt: { x: -150, z: -58 },
      stages: [
        { type: 'steal', x: -150, z: -58, r: 6, label: 'Steal the coupe on the west avenue' },
        { type: 'go', x: 150, z: 108, r: 8, label: 'Deliver the coupe across town' }
      ]
    },
    {
      name: 'Downtown Dash', payout: 260, timed: 80,
      stages: [
        { type: 'go', x: 0, z: -150, r: 7, label: 'Grab the briefcase uptown' },
        { type: 'go', x: 50, z: -8, r: 7, label: 'Deliver downtown — fast!' }
      ]
    },
    {
      name: 'Marina Deal', payout: 320,
      stages: [
        { type: 'go', x: 238, z: -60, r: 7, label: 'Meet the boat crew at the marina' },
        { type: 'go', x: -200, z: 150, r: 8, label: 'Lose the heat and reach the safe corner', heat: 100 }
      ]
    },
    {
      name: 'Mercy Run', payout: 380,
      stages: [
        { type: 'go', x: 110, z: -90, r: 7, label: 'Pick up the medic bag at the hospital' },
        { type: 'go', x: -90, z: 60, r: 7, label: 'Drop it near the police station' },
        { type: 'go', x: 8, z: 214, r: 7, label: 'Report back to Marisol' }
      ]
    },
    {
      name: 'The Final Score', payout: 500,
      stages: [
        { type: 'go', x: 200, z: -200, r: 8, label: 'Take the score at the north-east corner' },
        { type: 'go', x: 266, z: 44, r: 6, label: 'Bring it to the end of the pier' }
      ]
    }
  ];

  var jobIndex = 0;          // next job to offer
  var active = null;         // { def, stage, timer }
  var missionCar = null;
  var taxi = null;           // { ped, phase:'pickup'|'deliver', dest }
  var packagesTaken = {};
  var weaponsTaken = {};
  var standCd = {};
  var pillar = null;

  function auditPoints() {
    var pts = [];
    JOBS.forEach(function (j, ji) {
      j.stages.forEach(function (s, si) { pts.push({ x: s.x, z: s.z, name: 'job' + (ji + 1) + 'stage' + si }); });
    });
    return pts;
  }

  function ensurePillar() {
    if (pillar) return pillar;
    var geo = new THREE.CylinderGeometry(1.3, 1.3, 34, 12, 1, true);
    var mt = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
    pillar = new THREE.Mesh(geo, mt);
    pillar.position.y = 17;
    pillar.visible = false;
    W.scene.add(pillar);
    return pillar;
  }
  function setMarker(x, z, color) {
    var p = ensurePillar();
    p.visible = true;
    p.position.x = x; p.position.z = z;
    if (color) p.material.color.setHex(color);
  }
  function hideMarker() { if (pillar) pillar.visible = false; }

  function startJob(i) {
    if (active || i >= JOBS.length) return false;
    var def = JOBS[i];
    active = { def: def, stage: 0, timer: def.timed || 0 };
    if (def.carAt) {
      missionCar = CVH.vehicles.spawnCar('coupe', def.carAt.x, def.carAt.z, Math.PI, 'parked', 0xe0a52e);
      missionCar.isMissionCar = true;
      CVH.vehicles.syncMesh(missionCar);
    }
    if (CVH.hud) CVH.hud.toast('Job started: ' + def.name);
    CVH.audio.click();
    return true;
  }

  function completeJob() {
    var P = CVH.player.data;
    P.cash += active.def.payout;
    CVH.audio.success();
    if (CVH.hud) CVH.hud.toast(active.def.name + ' complete! +$' + active.def.payout);
    if (CVH.fx) CVH.fx.burst(P.x, 2, P.z, 0xffc93c, 18);
    active = null;
    missionCar = null;
    jobIndex++;
    hideMarker();
    if (jobIndex >= JOBS.length && CVH.onEnding) CVH.onEnding();
  }

  function failJob(reason) {
    if (CVH.hud) CVH.hud.toast('Job failed: ' + reason);
    CVH.audio.fail();
    cancel();
  }

  // THE single cleanup path.
  function cancel() {
    if (missionCar) {
      if (missionCar.driver !== 'player') CVH.vehicles.removeCar(missionCar);
      missionCar = null;
    }
    if (taxi && taxi.ped) {
      taxi.ped.visible = true;
      taxi.ped.mesh.visible = true;
      taxi.ped.isPassenger = false;
    }
    taxi = null;
    active = null;
    hideMarker();
  }

  function onSteal(car) {
    if (active && active.def.carAt && car === missionCar && active.stage === 0) {
      active.stage = 1;
      if (CVH.police) CVH.police.addHeat(30);
      if (CVH.hud) CVH.hud.toast('Coupe taken! The heat noticed.');
    }
  }

  function startTaxi() {
    if (taxi || active) return false;
    var P = CVH.player.data;
    var pt = null, bd = 1e9;
    W.TAXI_POINTS.forEach(function (t) {
      var d = U.dist(t.x, t.z, P.x, P.z);
      if (d < bd) { bd = d; pt = t; }
    });
    var ped = null;
    CVH.peds.list.forEach(function (p) {
      if (!ped && p.visible && U.dist(p.x, p.z, pt.x, pt.z) < 26) ped = p;
    });
    if (!ped) return false;
    ped.x = pt.x; ped.z = pt.z; ped.tx = pt.x; ped.tz = pt.z; ped.isPassenger = true;
    taxi = { ped: ped, phase: 'pickup', dest: null, px: pt.x, pz: pt.z };
    if (CVH.hud) CVH.hud.toast('Taxi fare waiting — pick them up in any car');
    return true;
  }

  function update(dt) {
    var P = CVH.player.data;
    ensurePillar();

    // ---- story jobs ----
    if (!active && jobIndex < JOBS.length) {
      var porch = W.PLACES.porch;
      if (U.dist(P.x, P.z, porch.x, porch.z) < 5 && !P.driving) startJob(jobIndex);
    }
    if (active) {
      var s = active.def.stages[active.stage];
      setMarker(s.x, s.z, 0xffc93c);
      if (active.def.timed) {
        active.timer -= dt;
        if (active.timer <= 0) { failJob('out of time'); return; }
      }
      if (s.type === 'go' && U.dist(P.x, P.z, s.x, s.z) < s.r) {
        active.stage++;
        if (active.stage >= active.def.stages.length) { completeJob(); }
        else {
          var ns = active.def.stages[active.stage];
          if (ns.heat && CVH.police) CVH.police.setHeat(ns.heat);
          CVH.audio.pickup();
        }
      }
    } else if (taxi) {
      // marker handled below
    } else {
      hideMarker();
    }

    // ---- taxi ----
    if (!active && !taxi && P.driving && jobIndex >= 0) {
      // a fare appears shortly after you get behind the wheel
      if (!update._taxiCd || update._taxiCd <= 0) { if (startTaxi()) update._taxiCd = 20; }
    }
    if (update._taxiCd) update._taxiCd -= dt;
    if (taxi) {
      if (taxi.phase === 'pickup') {
        setMarker(taxi.px, taxi.pz, 0xffe14d);
        if (P.driving && U.dist(P.x, P.z, taxi.px, taxi.pz) < 6) {
          taxi.ped.visible = false;
          taxi.ped.mesh.visible = false;
          var dest = W.TAXI_POINTS[Math.floor(Math.random() * W.TAXI_POINTS.length)];
          var guard = 0;
          while (dest.x === taxi.px && dest.z === taxi.pz && guard++ < 12) {
            dest = W.TAXI_POINTS[Math.floor(Math.random() * W.TAXI_POINTS.length)];
          }
          taxi.dest = dest; taxi.phase = 'deliver';
          if (CVH.hud) CVH.hud.toast('Fare aboard! Take them across town');
          CVH.audio.pickup();
        } else if (!P.driving && U.dist(P.x, P.z, taxi.px, taxi.pz) > 90) {
          cancel(); // wandered off; fare gives up (also restores the ped)
        }
      } else if (taxi.phase === 'deliver') {
        setMarker(taxi.dest.x, taxi.dest.z, 0xffe14d);
        if (U.dist(P.x, P.z, taxi.dest.x, taxi.dest.z) < 7) {
          var pay = 45 + Math.floor(Math.random() * 45);
          P.cash += pay;
          taxi.ped.x = taxi.dest.x; taxi.ped.z = taxi.dest.z;
          taxi.ped.tx = taxi.dest.x; taxi.ped.tz = taxi.dest.z;
          taxi.ped.visible = true; taxi.ped.mesh.visible = true; taxi.ped.isPassenger = false;
          taxi = null;
          hideMarker();
          CVH.audio.cash();
          if (CVH.hud) CVH.hud.toast('Fare delivered! +$' + pay);
          update._taxiCd = 14;
        }
      }
    }

    updatePickups(dt, P);
  }

  var packageMeshes = [];
  var weaponMeshes = [];
  function buildPickups() {
    W.PACKAGES.forEach(function (pk, i) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8),
        new THREE.MeshBasicMaterial({ color: 0x51e06a }));
      m.position.set(pk.x, 1.1, pk.z);
      W.scene.add(m);
      packageMeshes.push(m);
    });
    W.WEAPONS.forEach(function (wp) {
      var g = new THREE.Group();
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, wp.kind === 'smg' ? 0.95 : 0.55),
        new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
      body.position.y = 1.1; g.add(body);
      g.position.set(wp.x, 0, wp.z);
      W.scene.add(g);
      weaponMeshes.push(g);
    });
  }

  function updatePickups(dt, P) {
    var t = performance.now() / 1000;
    W.PACKAGES.forEach(function (pk, i) {
      var m = packageMeshes[i];
      if (!m) return;
      if (packagesTaken[i]) { m.visible = false; return; }
      m.rotation.y = t * 2 + i;
      m.position.y = 1.1 + Math.sin(t * 2.4 + i) * 0.18;
      if (U.dist(P.x, P.z, pk.x, pk.z) < 2.1) {
        packagesTaken[i] = true;
        P.cash += 60;
        CVH.audio.cash();
        if (CVH.fx) CVH.fx.burst(pk.x, 1.4, pk.z, 0x51e06a, 10);
        if (CVH.hud) CVH.hud.toast('Hidden cash package! +$60');
      }
    });
    W.WEAPONS.forEach(function (wp, i) {
      var m = weaponMeshes[i];
      if (!m) return;
      if (weaponsTaken[i]) { m.visible = false; return; }
      m.rotation.y = t * 1.6;
      if (U.dist(P.x, P.z, wp.x, wp.z) < 2.1) {
        weaponsTaken[i] = true;
        P.weapon = wp.kind;
        CVH.audio.pickup();
        if (CVH.hud) CVH.hud.toast('Picked up: ' + (wp.kind === 'smg' ? 'SMG' : 'Pistol') + ' — F to fire');
      }
    });
    // food stands heal
    W.STANDS.forEach(function (s, i) {
      if (standCd[i] > 0) standCd[i] -= dt;
      if (standCd[i] <= 0 && P.hp < P.maxHp && P.cash >= 10 && U.dist(P.x, P.z, s.x, s.z) < 3.2) {
        P.cash -= 10;
        CVH.player.heal(40);
        standCd[i] = 8;
        CVH.audio.cash();
        if (CVH.hud) CVH.hud.toast('Street food: +40 HP, −$10');
      }
    });
    // Pay 'n Spray
    var ps = W.PLACES.paynspray;
    if (P.driving && CVH.police.heat > 0 && P.cash >= 100 && U.dist(P.x, P.z, ps.x, ps.z) < 7) {
      P.cash -= 100;
      CVH.police.setHeat(0);
      P.driving.hp = 100; P.driving.dead = false;
      CVH.audio.success();
      if (CVH.hud) CVH.hud.toast('Pay ’n Spray: heat gone, car fixed, −$100');
    }
  }

  function currentObjective() {
    if (active) {
      var s = active.def.stages[active.stage];
      return { label: s.label, x: s.x, z: s.z, timer: active.def.timed ? active.timer : null, job: active.def.name };
    }
    if (taxi) {
      return taxi.phase === 'pickup'
        ? { label: 'Pick up the taxi fare', x: taxi.px, z: taxi.pz, timer: null, job: 'Taxi' }
        : { label: 'Drop off the fare', x: taxi.dest.x, z: taxi.dest.z, timer: null, job: 'Taxi' };
    }
    if (jobIndex < JOBS.length) {
      return { label: 'See Marisol at her porch for work', x: W.PLACES.porch.x, z: W.PLACES.porch.z, timer: null, job: null };
    }
    return { label: 'Free roam — Costa Verde is yours', x: null, z: null, timer: null, job: null };
  }

  function reset() {
    cancel();
    jobIndex = 0;
    packagesTaken = {};
    weaponsTaken = {};
    packageMeshes.forEach(function (m) { m.visible = true; });
    weaponMeshes.forEach(function (m) { m.visible = true; });
  }

  CVH.missions = {
    JOBS: JOBS,
    auditPoints: auditPoints,
    startJob: startJob,
    cancel: cancel,
    onSteal: onSteal,
    update: update,
    buildPickups: buildPickups,
    currentObjective: currentObjective,
    reset: reset,
    get jobIndex() { return jobIndex; },
    setJobIndex: function (i) { jobIndex = Math.max(0, Math.min(JOBS.length, i | 0)); },
    get active() { return active; },
    get taxi() { return taxi; },
    get missionCar() { return missionCar; },
    packagesTakenCount: function () { return Object.keys(packagesTaken).length; }
  };
})();
