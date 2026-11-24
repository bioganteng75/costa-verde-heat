// missions.js — Marisol Vega's six-job story chain, taxi fares, and the
// E-key interactions (food stands, Pay 'n Spray). Owns CVH.missions, the
// gold objective pillar, and the single cleanup path of QA item 5:
// missions.cancel() is called by every reset (new game, restart story,
// busted, wasted) and removes a still-parked mission target car, restores
// a taxi passenger's visibility and clears job/taxi state. Every job
// coordinate sits on a road, sidewalk, apron, sand or the pier — the
// playtest audits all of them (owner fix 5).
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};
  var THREE = window.THREE;
  var P = null; // CVH.points, set in build()

  var JOBS = [
    {
      title: 'JOB 1 — FIRST RUN',
      intro: 'Marisol: "A package waits by my porch, mijo. Take it to the beach drop, east shore. No questions, no dents in my reputation."',
      reward: 150,
      stages: [
        { kind: 'goto', x: -150, z: 104, r: 4.5, label: 'Pick up the package at the safehouse' },
        { kind: 'goto', x: 228, z: 40, r: 5.5, label: 'Deliver to the beach drop' }
      ]
    },
    {
      title: 'JOB 2 — NINETY-FIVE',
      intro: 'Marisol: "An envelope on the north side, and it cannot be late. Ninety-five seconds once it is in your hands. Drive like the tide is chasing you."',
      reward: 220,
      stages: [
        { kind: 'goto', x: 128, z: -140, r: 5, label: 'Pick up the envelope' },
        { kind: 'goto', x: 10, z: 26, r: 5, label: 'Deliver downtown — fast!', time: 95 }
      ]
    },
    {
      title: 'JOB 3 — THREE DOORS',
      intro: 'Marisol: "Three friends, three doors, one afternoon. Make the rounds and keep it friendly."',
      reward: 300,
      stages: [
        { kind: 'goto', x: -66, z: 56, r: 5, label: 'First door — west side' },
        { kind: 'goto', x: 114, z: 52, r: 5, label: 'Second door — east side' },
        { kind: 'goto', x: -114, z: 20, r: 5, label: 'Third door — old town' }
      ]
    },
    {
      title: 'JOB 4 — THE RED COUPE',
      intro: 'Marisol: "A red coupe sleeps by the north crossing. Bring it to the Pay \'n Spray — gently, mijo. Every scratch comes out of your cut."',
      reward: 380,
      stages: [
        { kind: 'gotoCar', x: 8, z: -96, r: 6, label: 'Find the red coupe' },
        { kind: 'enterCar', label: 'Get in the coupe' },
        { kind: 'deliverCar', x: 90, z: 100, r: 6.5, label: 'Deliver the coupe to the Pay \'n Spray' }
      ]
    },
    {
      title: 'JOB 5 — SALT AIR',
      intro: 'Marisol: "A case waits at the end of the pier. If the alarm sings — and it will — you run, and you do not stop."',
      reward: 450,
      stages: [
        { kind: 'goto', x: 264, z: -20, r: 5, label: 'Take the case at the pier end', alarm: true },
        { kind: 'goto', x: -150, z: 104, r: 5.5, label: 'Lose the heat and reach the safehouse' }
      ]
    },
    {
      title: 'JOB 6 — HEAT LINE',
      intro: 'Marisol: "One last line to cross, and every star in the sky will be watching. Cross it, vanish, and come home."',
      reward: 600,
      stages: [
        { kind: 'goto', x: 186, z: 84, r: 6, label: 'Cross the checkpoint line', alarmHeat: 420 },
        { kind: 'escape', label: 'Shake the heat' },
        { kind: 'goto', x: -150, z: 104, r: 5.5, label: 'Reach the safehouse' }
      ]
    }
  ];

  var missions = CVH.missions = {
    nextJob: 0,
    active: null,   // {job, stage, timeLeft, targetCar}
    taxi: null,     // {phase, passenger, x, z, t, fareBase}
    jobsDone: 0
  };

  var pillar = null, pillarRing = null;

  missions.build = function (scene) {
    P = CVH.points;
    var geo = new THREE.CylinderGeometry(2.1, 2.1, 46, 14, 1, true);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffc93c, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    pillar = new THREE.Mesh(geo, mat);
    pillar.position.y = 23;
    pillar.visible = false;
    pillar.renderOrder = 3;
    scene.add(pillar);
    var rgeo = new THREE.RingGeometry(2.5, 3.4, 28);
    var rmat = new THREE.MeshBasicMaterial({ color: 0xffc93c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false });
    pillarRing = new THREE.Mesh(rgeo, rmat);
    pillarRing.rotation.x = -Math.PI / 2;
    pillarRing.position.y = 0.12;
    pillarRing.visible = false;
    pillarRing.renderOrder = 3;
    scene.add(pillarRing);
  };

  // ------------------------------------------------------------ cleanup
  // QA item 5: THE cleanup path. Every reset in main.js funnels through
  // here so a restarted story can never stack duplicate target cars or
  // strand an invisible taxi passenger.
  missions.cancel = function () {
    if (missions.active) {
      var tc = missions.active.targetCar;
      if (tc && tc.driver === 'parked' && !tc.dead) CVH.vehicles.removeCar(tc);
      missions.active = null;
    }
    if (missions.taxi) {
      var t = missions.taxi;
      if (t.passenger) {
        t.passenger.mesh.visible = true;
        t.passenger.x = CVH.player.x + 2;
        t.passenger.z = CVH.player.z + 1;
        t.passenger.state = 'walk';
        if (t.passenger.retarget) t.passenger.retarget();
      }
      missions.taxi = null;
    }
    if (pillar) { pillar.visible = false; pillarRing.visible = false; }
  };

  missions.resetStory = function () {
    missions.cancel();
    missions.nextJob = 0;
    missions.jobsDone = 0;
  };

  // -------------------------------------------------------------- jobs
  function startJob(idx) {
    var def = JOBS[idx];
    missions.active = { job: idx, stage: 0, timeLeft: null, targetCar: null };
    if (def.stages[0].kind === 'gotoCar' || def.stages.some(function (s) { return s.kind === 'enterCar'; })) {
      // the red coupe is placed when its job starts
      var car = CVH.vehicles.makeCar('sport', def.stages[0].x, def.stages[0].z, Math.PI / 2, { driver: 'parked', color: 0xd92323, mission: true });
      missions.active.targetCar = car;
    }
    var st = def.stages[0];
    if (st.time) missions.active.timeLeft = st.time;
    CVH.hud.showIntro(def.title, def.intro);
    CVH.audio.mission();
  }
  missions.startJob = startJob;

  function failJob(reason) {
    CVH.hud.toast(reason + ' — job failed. See Marisol to retry.', 3);
    CVH.audio.busted();
    missions.cancel();
  }

  function completeJob() {
    var a = missions.active;
    var def = JOBS[a.job];
    var reward = def.reward;
    if (a.job === 3 && a.targetCar) {
      // the coupe job pays for gentle driving
      var hp = a.targetCar.hp;
      reward = Math.round(reward * (hp > 70 ? 1 : (hp > 35 ? 0.7 : 0.45)));
    }
    CVH.player.cash += reward;
    CVH.stats.earned += reward;
    CVH.stats.jobs++;
    missions.jobsDone++;
    missions.nextJob = a.job + 1;
    missions.active = null;
    CVH.audio.cash();
    CVH.hud.toast(def.title + ' complete — ' + CVH.fmtCash(reward), 3);
    if (a.job === JOBS.length - 1 && CVH.onStoryComplete) CVH.onStoryComplete();
  }

  function advanceStage() {
    var a = missions.active;
    var def = JOBS[a.job];
    var doneStage = def.stages[a.stage];
    if (doneStage.alarm) {
      CVH.police.setHeat(300);
      CVH.hud.toast('ALARM! The pier case was wired — RUN!', 2.6);
      CVH.audio.busted();
    }
    if (doneStage.alarmHeat) {
      CVH.police.setHeat(doneStage.alarmHeat);
      CVH.hud.toast('Checkpoint tripped — every unit in the city is awake!', 2.6);
    }
    a.stage++;
    if (a.stage >= def.stages.length) { completeJob(); return; }
    var st = def.stages[a.stage];
    a.timeLeft = st.time || null;
    CVH.audio.mission();
  }

  function stageTarget(a) {
    var st = JOBS[a.job].stages[a.stage];
    if ((st.kind === 'gotoCar' || st.kind === 'enterCar') && a.targetCar) {
      return { x: a.targetCar.pos.x, z: a.targetCar.pos.z, label: st.label, r: st.r };
    }
    return { x: st.x, z: st.z, label: st.label, r: st.r };
  }

  missions.currentObjective = function () {
    var player = CVH.player;
    if (missions.active) {
      var a = missions.active;
      var st = JOBS[a.job].stages[a.stage];
      if (st.kind === 'escape') {
        return { label: st.label + ' — stars: ' + CVH.police.stars, x: null, z: null, dist: null, timeLeft: null };
      }
      var t = stageTarget(a);
      return {
        label: t.label, x: t.x, z: t.z,
        dist: CVH.dist(player.x, player.z, t.x, t.z),
        timeLeft: a.timeLeft
      };
    }
    if (missions.taxi) {
      var tx = missions.taxi;
      var px = tx.phase === 'pickup' ? tx.passenger.x : tx.x;
      var pz = tx.phase === 'pickup' ? tx.passenger.z : tx.z;
      return {
        label: tx.phase === 'pickup' ? 'Taxi: pick up your passenger' : 'Taxi: drop off your passenger',
        x: px, z: pz, dist: CVH.dist(player.x, player.z, px, pz), timeLeft: null
      };
    }
    if (missions.nextJob < JOBS.length && CVH.state === 'playing') {
      return {
        label: 'See Marisol at the safehouse', x: P.porch.x, z: P.porch.z,
        dist: CVH.dist(player.x, player.z, P.porch.x, P.porch.z), timeLeft: null, soft: true
      };
    }
    return null;
  };

  // ---------------------------------------------------------------- taxi
  function tryStartFare() {
    var player = CVH.player;
    if (!player.car || player.car.type !== 'taxi' || missions.taxi) return;
    var best = null, bd = 34 * 34;
    for (var i = 0; i < CVH.peds.length; i++) {
      var p = CVH.peds[i];
      if (p.state !== 'walk') continue;
      var d = CVH.dist2(p.x, p.z, player.x, player.z);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) return;
    best.state = 'wait';
    missions.taxi = { phase: 'pickup', passenger: best, x: 0, z: 0, t: 0, fareBase: 0 };
    CVH.hud.toast('A passenger is hailing you — pick them up', 2.2);
    CVH.audio.ui();
  }

  function updateTaxi(dt) {
    var t = missions.taxi;
    if (!t) { tryStartFare(); return; }
    var player = CVH.player;
    if (!player.car || player.car.type !== 'taxi') { missions.cancel(); return; }
    if (t.phase === 'pickup') {
      if (CVH.dist(player.x, player.z, t.passenger.x, t.passenger.z) < 5) {
        t.passenger.mesh.visible = false;
        t.passenger.state = 'ride';
        // destination: a taxi spot at least 55 m away
        var spots = P.taxiSpots;
        var dest = spots[(Math.random() * spots.length) | 0];
        var guard = 0;
        while (CVH.dist(player.x, player.z, dest.x, dest.z) < 55 && guard++ < 12) dest = spots[(Math.random() * spots.length) | 0];
        t.x = dest.x; t.z = dest.z;
        t.phase = 'dropoff';
        t.t = 0;
        t.tripDist = CVH.dist(player.x, player.z, dest.x, dest.z);
        t.fareBase = 24 + t.tripDist * 0.16;
        CVH.hud.toast('Passenger aboard — take them across town', 2.2);
        CVH.audio.ui();
      }
    } else {
      t.t += dt;
      if (CVH.dist(player.x, player.z, t.x, t.z) < 5.5) {
        var tip = t.t < t.tripDist / 10.5 ? 14 : 0; // beat the par time, earn a tip
        var fare = Math.round(t.fareBase) + tip;
        CVH.player.cash += fare;
        CVH.stats.earned += fare;
        t.passenger.mesh.visible = true;
        t.passenger.x = t.x + 2; t.passenger.z = t.z + 1;
        t.passenger.state = 'walk';
        if (t.passenger.retarget) t.passenger.retarget();
        missions.taxi = null;
        CVH.audio.cash();
        CVH.hud.toast('Fare paid ' + CVH.fmtCash(fare) + (tip ? ' (incl. $14 tip)' : ''), 2.4);
      }
    }
  }

  // --------------------------------------------------------- interactions
  function updateInteractions() {
    var player = CVH.player;
    var input = CVH.input;
    var prompt = null;

    // Marisol's porch: start the next job
    if (!missions.active && missions.nextJob < JOBS.length && !player.car &&
        CVH.dist(player.x, player.z, P.porch.x, P.porch.z) < 3.4) {
      prompt = 'Press E — ' + JOBS[missions.nextJob].title;
      if (input.hit('KeyE')) startJob(missions.nextJob);
    }

    // food stands: E to eat
    if (!prompt && !player.car) {
      var stands = CVH.world.stands;
      for (var i = 0; i < stands.length; i++) {
        if (CVH.dist(player.x, player.z, stands[i].fx, stands[i].fz) < 2.8) {
          prompt = 'Press E — eat at ' + stands[i].name + ' ($12, +35 HP)';
          if (input.hit('KeyE')) {
            if (player.cash >= 12 && player.hp < player.maxHp) {
              player.cash -= 12;
              player.hp = Math.min(player.maxHp, player.hp + 35);
              CVH.audio.pickup();
              CVH.hud.toast('Good food. Health restored.', 1.8);
            } else if (player.hp >= player.maxHp) {
              CVH.hud.toast('You are full already.', 1.4);
            } else {
              CVH.hud.toast('Not enough cash.', 1.4);
            }
          }
          break;
        }
      }
    }

    // Pay 'n Spray: E while parked on the pad, in a car
    if (!prompt && player.car && CVH.dist(player.car.pos.x, player.car.pos.z, P.pnsPad.x, P.pnsPad.z) < 5.5) {
      prompt = "Press E — Pay 'n Spray ($100: repairs + clears heat)";
      if (input.hit('KeyE')) {
        if (player.cash >= 100) {
          player.cash -= 100;
          player.car.hp = 100;
          player.car.dead = false;
          CVH.police.clearHeat();
          CVH.audio.cash();
          CVH.hud.toast('Fresh paint, clean record.', 2);
        } else {
          CVH.hud.toast('Not enough cash.', 1.4);
        }
      }
    }
    CVH.hud.setPrompt(prompt);
  }

  // -------------------------------------------------------------- update
  missions.update = function (dt) {
    var player = CVH.player;
    var a = missions.active;
    if (a) {
      var def = JOBS[a.job];
      var st = def.stages[a.stage];
      // timed stage countdown
      if (a.timeLeft !== null && a.timeLeft !== undefined) {
        a.timeLeft -= dt;
        if (a.timeLeft <= 0) { failJob('Out of time'); a = null; }
      }
      if (a) {
        // the coupe job dies with its car
        if (a.targetCar && a.targetCar.dead && st.kind !== 'gotoCar') {
          failJob('The coupe is wrecked');
          a = null;
        } else {
          var t = stageTarget(a);
          var done = false;
          if (st.kind === 'goto' || st.kind === 'gotoCar') {
            done = CVH.dist(player.x, player.z, t.x, t.z) < (st.r || 5);
          } else if (st.kind === 'enterCar') {
            done = player.car === a.targetCar;
          } else if (st.kind === 'deliverCar') {
            done = player.car === a.targetCar && CVH.dist(player.x, player.z, st.x, st.z) < (st.r || 6);
          } else if (st.kind === 'escape') {
            done = CVH.police.heat <= 0 && CVH.police.stars === 0;
          }
          if (done) advanceStage();
        }
      }
    }
    updateTaxi(dt);
    updateInteractions();

    // objective pillar follows the current target
    var obj = missions.currentObjective();
    if (obj && obj.x !== null && obj.x !== undefined && pillar) {
      pillar.visible = true;
      pillarRing.visible = true;
      pillar.position.x = obj.x;
      pillar.position.z = obj.z;
      pillarRing.position.x = obj.x;
      pillarRing.position.z = obj.z;
      var s = 1 + Math.sin(CVH.time * 3) * 0.08;
      pillarRing.scale.set(s, s, s);
    } else if (pillar) {
      pillar.visible = false;
      pillarRing.visible = false;
    }
  };

  // ------------------------------------------------------------ test hooks
  missions.debugObjectives = function () {
    var out = [];
    for (var j = 0; j < JOBS.length; j++) {
      for (var s = 0; s < JOBS[j].stages.length; s++) {
        var st = JOBS[j].stages[s];
        if (st.x !== undefined) out.push({ job: j + 1, stage: s + 1, kind: st.kind, x: st.x, z: st.z });
      }
    }
    return out;
  };
  missions.debugJobs = function () { return JOBS.length; };
})();
