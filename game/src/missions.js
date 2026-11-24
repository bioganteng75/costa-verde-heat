// missions.js — Marisol Vega's six-job story chain, taxi fares, and the gold
// objective pillar. One cancel() routine (QA fix) is the single cleanup path
// every reset flows through, so a job can never leak a target car or leave a
// taxi passenger invisible.
CVH.missions = {
  jobIndex: 0,
  active: null,       // { def, stepIdx, timeLeft, targetCar, cpIdx }
  taxi: null,         // { ped, phase: 'board'|'ride', dest:{x,z}, timeLeft, fareBase }
  storyDone: false,
  stats: { earned: 0, jobsDone: 0 },
  _pillar: null,
  _flagT: 6,

  JOBS: [
    {
      title: 'First Run',
      intro: 'Marisol: "A package is waiting at the marina pier. Bring it to Cafe Marina — and smile for the cameras."',
      reward: 150,
      steps: () => [
        { kind: 'goto', label: 'Pick up the package at the marina', x: CVH.world.WATER_X + 8, z: 78 },
        { kind: 'goto', label: 'Deliver to Cafe Marina', x: CVH.world.roadX(5), z: CVH.world.roadZ(0) + 10 },
      ],
    },
    {
      title: 'Hot Lunch',
      intro: 'Marisol: "The hotel kitchen ordered lunch across town. It is in the taxi-rank cooler. Ninety-five seconds — go!"',
      reward: 220,
      time: 95,
      steps: () => [
        { kind: 'goto', label: 'Collect the lunch at Cafe Marina', x: CVH.world.roadX(5), z: CVH.world.roadZ(0) + 10 },
        { kind: 'goto', label: 'Deliver to HOTEL SOL — fast!', x: CVH.world.roadX(3), z: CVH.world.roadZ(2) + 12 },
      ],
    },
    {
      title: 'Triple Drop',
      intro: 'Marisol: "Three envelopes, three corners of Costa Verde. No questions, no stops."',
      reward: 300,
      steps: () => [
        { kind: 'goto', label: 'Drop 1: the hospital steps', x: CVH.world.hospital.x, z: CVH.world.hospital.z },
        { kind: 'goto', label: 'Drop 2: the north promenade', x: 226, z: CVH.world.roadZ(0) },
        { kind: 'goto', label: 'Drop 3: BANCO VERDE', x: CVH.world.roadX(4), z: CVH.world.roadZ(2) + 12 },
      ],
    },
    {
      title: 'Coupe de Ville',
      intro: 'Marisol: "A red coupe is parked by the north-east lot. Its owner owes me. Bring it home — gently."',
      reward: 380,
      steps: () => [
        { kind: 'steal', label: 'Steal the red coupe', x: CVH.world.roadX(7) - 4, z: CVH.world.roadZ(0) + 4 },
        { kind: 'deliverCar', label: 'Bring the coupe to the safehouse', x: CVH.world.safehouse.x, z: CVH.world.safehouse.z },
      ],
    },
    {
      title: 'Marina Alarm',
      intro: 'Marisol: "The marina safe is rigged. The second you grab the case, every badge in town wakes up. Lose them AFTER the drop."',
      reward: 460,
      steps: () => [
        { kind: 'goto', label: 'Grab the case at the marina', x: CVH.world.WATER_X + 8, z: 78, alarm: true },
        { kind: 'goto', label: 'Drop the case at BANCO VERDE', x: CVH.world.roadX(4), z: CVH.world.roadZ(2) + 12 },
      ],
    },
    {
      title: 'Verde Sunset',
      intro: 'Marisol: "One last run, kid. The vault money moves tonight — hit every checkpoint, shake the heat, and come home rich."',
      reward: 800,
      steps: () => [
        { kind: 'checkpoints', label: 'Hit every checkpoint!', points: null },
        { kind: 'shake', label: 'Shake the heat' },
        { kind: 'goto', label: 'Come home to the safehouse', x: CVH.world.safehouse.x, z: CVH.world.safehouse.z },
      ],
    },
  ],

  init(scene) {
    const geo = new THREE.CylinderGeometry(1.6, 2.1, 30, 14, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc93e, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this._pillar = new THREE.Mesh(geo, mat);
    this._pillar.position.y = 15;
    scene.add(this._pillar);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.y = 0;
    this._pillar.add(core);
  },

  startJob() {
    const def = this.JOBS[this.jobIndex];
    if (!def) return;
    const steps = def.steps();
    this.active = { def, steps, stepIdx: 0, timeLeft: def.time || 0, targetCar: null, cpIdx: 0 };
    // The finale's checkpoints are laid across the whole city.
    const last = steps[0];
    if (last.kind === 'checkpoints') {
      const W = CVH.world;
      last.points = [
        { x: W.roadX(7), z: W.roadZ(0) }, { x: W.roadX(1), z: W.roadZ(5) },
        { x: 224, z: W.roadZ(3) }, { x: W.roadX(4), z: W.roadZ(1) },
      ];
      CVH.police.heat = Math.max(CVH.police.heat, 380);
      CVH.police._recalc();
    }
    // The steal job parks its coupe at the step location.
    const steal = steps.find((s) => s.kind === 'steal');
    if (steal) {
      const car = CVH.vehicles.create(CVH.main.scene, 'sport', steal.x, steal.z, Math.PI / 2, 0);
      car.driver = 'parked';
      CVH.main.cars.push(car);
      this.active.targetCar = car;
    }
    CVH.hud.toast(def.title, def.intro, 5200);
    CVH.audio.click();
  },

  // QA fix: THE cleanup path. Every reset (new game, restart story, busted,
  // wasted) calls this and only this, so nothing a job spawned can leak:
  // a still-parked target car is removed from the world (re-starting the
  // steal job can never stack duplicate coupes) and a taxi passenger who
  // was hidden inside the player's car becomes visible again.
  cancel() {
    if (this.active && this.active.targetCar) {
      const car = this.active.targetCar;
      if (car.driver === 'parked') {
        const i = CVH.main.cars.indexOf(car);
        if (i >= 0) CVH.main.cars.splice(i, 1);
        CVH.main.scene.remove(car.group);
      }
    }
    this.active = null;
    if (this.taxi) {
      const ped = this.taxi.ped;
      if (ped.state === 'riding') {
        ped.state = 'walk';
        ped.h.group.visible = true;
        const p = CVH.player.pos;
        ped.h.group.position.set(p.x + 1.5, 0, p.z + 1.5);
        ped.h.group.rotation.x = 0;
      }
      this.taxi = null;
    }
  },

  _failJob(reason) {
    CVH.hud.toast('Job failed', reason + ' Head back to Marisol to try again.', 4200);
    CVH.audio.jobFail();
    this.cancel();
  },

  _completeJob() {
    const a = this.active;
    let reward = a.def.reward;
    let note = '';
    if (a.targetCar) {
      if (a.targetCar.health >= 55) { reward += 120; note = ' Gentle driving bonus +$120.'; }
      a.targetCar = null; // the coupe is Marisol's now; it stays in the world as a normal car
    }
    this.active = null;
    this.jobIndex++;
    this.stats.jobsDone++;
    this.stats.earned += reward;
    CVH.main.addCash(reward);
    CVH.audio.jobDone();
    if (this.jobIndex >= this.JOBS.length) {
      this.storyDone = true;
      CVH.hud.toast('Story complete', a.def.title + ' paid ' + CVH.u.fmtMoney(reward) + '.' + note, 4200);
      CVH.main.onStoryComplete();
    } else {
      CVH.hud.toast(a.def.title + ' — done', 'Paid ' + CVH.u.fmtMoney(reward) + '.' + note + ' See Marisol for the next job.', 4200);
    }
    CVH.main.saveGame();
  },

  objective() {
    if (this.taxi) {
      if (this.taxi.phase === 'board') {
        const pp = this.taxi.ped.h.group.position;
        return { x: pp.x, z: pp.z, label: 'Pick up your fare', timer: 0 };
      }
      return { x: this.taxi.dest.x, z: this.taxi.dest.z, label: 'Drop off your fare', timer: this.taxi.timeLeft };
    }
    if (this.active) {
      const s = this.active.steps[this.active.stepIdx];
      if (s.kind === 'checkpoints') {
        const p = s.points[this.active.cpIdx];
        return { x: p.x, z: p.z, label: s.label + ' (' + (this.active.cpIdx + 1) + '/' + s.points.length + ')', timer: this.active.timeLeft };
      }
      if (s.kind === 'shake') return { x: null, z: null, label: 'Shake the heat — break their line of sight!', timer: 0 };
      return { x: s.x, z: s.z, label: s.label, timer: this.active.timeLeft };
    }
    if (!this.storyDone && this.jobIndex < this.JOBS.length) {
      return { x: CVH.world.safehouse.x, z: CVH.world.safehouse.z, label: 'See Marisol — job ' + (this.jobIndex + 1) + ': ' + this.JOBS[this.jobIndex].title, timer: 0 };
    }
    return null;
  },

  update(dt) {
    const M = CVH.main;
    const P = CVH.player.pos;
    const focus = M.playerCar ? M.playerCar.group.position : P;
    // Objective pillar follows the current objective.
    const obj = this.objective();
    if (obj && obj.x !== null) {
      this._pillar.visible = true;
      this._pillar.position.x = obj.x;
      this._pillar.position.z = obj.z;
    } else {
      this._pillar.visible = false;
    }

    // Marisol starts the next job when the player visits the safehouse.
    if (!this.active && !this.storyDone && this.jobIndex < this.JOBS.length) {
      const s = CVH.world.safehouse;
      if (CVH.u.dist2(focus.x, focus.z, s.x, s.z) < 4.2 && !M.playerCar) this.startJob();
    }

    if (this.active) {
      const a = this.active;
      const s = a.steps[a.stepIdx];
      if (a.def.time) {
        a.timeLeft -= dt;
        if (a.timeLeft <= 0) { this._failJob('Out of time.'); return; }
      }
      const arrive = (x, z, rad) => CVH.u.dist2(focus.x, focus.z, x, z) < rad;
      let advance = false;
      if (s.kind === 'goto') {
        if (arrive(s.x, s.z, 4.6)) {
          advance = true;
          if (s.alarm) {
            CVH.police.heat = Math.max(CVH.police.heat, 300);
            CVH.police._recalc();
            CVH.hud.toast('ALARM!', 'The marina safe just woke up every badge in Costa Verde.', 3200);
          }
          CVH.audio.pickup();
        }
      } else if (s.kind === 'steal') {
        if (M.playerCar && M.playerCar === a.targetCar) advance = true;
      } else if (s.kind === 'deliverCar') {
        if (M.playerCar && M.playerCar === a.targetCar && arrive(s.x, s.z, 6)) advance = true;
      } else if (s.kind === 'checkpoints') {
        const p = s.points[a.cpIdx];
        if (arrive(p.x, p.z, 8)) {
          a.cpIdx++;
          CVH.audio.cash();
          CVH.fx.confetti(focus);
          if (a.cpIdx >= s.points.length) advance = true;
          else CVH.hud.toast('Checkpoint', (a.cpIdx) + ' down, ' + (s.points.length - a.cpIdx) + ' to go.', 1600);
        }
      } else if (s.kind === 'shake') {
        if (CVH.police.stars === 0) advance = true;
      }
      if (advance) {
        a.stepIdx++;
        if (a.stepIdx >= a.steps.length) this._completeJob();
      }
    }

    this._updateTaxi(dt);
  },

  _updateTaxi(dt) {
    const M = CVH.main;
    // Occasionally flag a pedestrian as a fare while the player is driving.
    this._flagT -= dt;
    if (!this.taxi && this._flagT <= 0) {
      this._flagT = 7;
      if (M.playerCar && !this.active) {
        const near = CVH.peds.list.find((p) => p.state === 'walk' &&
          CVH.u.dist2(p.h.group.position.x, p.h.group.position.z, M.playerCar.group.position.x, M.playerCar.group.position.z) < 30);
        if (near) {
          near.state = 'flagged';
          this.taxi = { ped: near, phase: 'wait', dest: null, timeLeft: 0, fareBase: 0 };
          CVH.hud.toast('Taxi fare', 'A pedestrian is hailing you — pull up next to them.', 2600);
        }
      }
    }
    if (!this.taxi) return;
    const t = this.taxi;
    const ped = t.ped;
    const pp = ped.h.group.position;
    if (t.phase === 'wait') {
      if (!M.playerCar) { /* keep waiting */ }
      else {
        const cp = M.playerCar.group.position;
        if (CVH.u.dist2(pp.x, pp.z, cp.x, cp.z) < 4 && Math.abs(M.playerCar.speed) < 1.5) t.phase = 'board';
      }
      if (ped.state !== 'flagged') this.taxi = null; // fare got knocked down etc.
    } else if (t.phase === 'board') {
      if (!M.playerCar) { t.phase = 'wait'; return; }
      const cp = M.playerCar.group.position;
      const d = CVH.u.dist2(pp.x, pp.z, cp.x, cp.z);
      const desired = Math.atan2(cp.x - pp.x, cp.z - pp.z);
      ped.heading = CVH.u.angleLerp(ped.heading, desired, Math.min(1, dt * 8));
      pp.x += Math.sin(ped.heading) * 3.2 * dt;
      pp.z += Math.cos(ped.heading) * 3.2 * dt;
      ped.h.group.rotation.y = ped.heading;
      CVH.animateHumanoid(ped.h, dt, 0.8, 'walk');
      if (d < 1.6) {
        ped.state = 'riding';
        ped.h.group.visible = false;
        t.phase = 'ride';
        const W = CVH.world;
        const dest = W.randomRoadPoint(Math.random);
        t.dest = dest;
        const dist = CVH.u.dist2(cp.x, cp.z, dest.x, dest.z);
        t.fareBase = 34 + dist * 0.5;
        t.timeLeft = dist / 7 + 45;
        CVH.hud.toast('Fare aboard', 'They want the far side of town. Fast trip, fat tip.', 2600);
        CVH.audio.click();
      }
    } else if (t.phase === 'ride') {
      t.timeLeft -= dt;
      if (!M.playerCar) {
        // Player bailed mid-fare: passenger gets out here (visible again).
        ped.state = 'walk';
        ped.h.group.visible = true;
        ped.h.group.position.set(CVH.player.pos.x + 1.5, 0, CVH.player.pos.z + 1.5);
        this.taxi = null;
        CVH.hud.toast('Fare lost', 'You left your passenger standing in the street.', 2200);
        return;
      }
      const cp = M.playerCar.group.position;
      if (CVH.u.dist2(cp.x, cp.z, t.dest.x, t.dest.z) < 6 && Math.abs(M.playerCar.speed) < 2) {
        let fare = t.fareBase;
        let tip = 0;
        if (t.timeLeft > 12) tip = Math.round(t.fareBase * 0.45);
        fare = Math.round(fare + tip);
        ped.state = 'walk';
        ped.h.group.visible = true;
        ped.h.group.position.set(cp.x + 2, 0, cp.z + 2);
        this.taxi = null;
        M.addCash(fare);
        this.stats.earned += fare;
        CVH.audio.cash();
        CVH.hud.toast('Fare paid', CVH.u.fmtMoney(fare) + (tip ? ' (tip ' + CVH.u.fmtMoney(tip) + ' for speed)' : '') + '.', 2600);
      } else if (t.timeLeft <= -25) {
        // Very late: passenger gives up at the next stop.
        ped.state = 'walk';
        ped.h.group.visible = true;
        ped.h.group.position.set(cp.x + 2, 0, cp.z + 2);
        this.taxi = null;
        CVH.hud.toast('Fare walked', 'Too slow — they got out and walked.', 2200);
      }
    }
  },
};
