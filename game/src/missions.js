'use strict';
// Costa Verde Heat 3D — Marisol Vega's six-job story chain, taxi fares, and
// the gold objective pillar.
//
// EVERY objective coordinate in this file was audited against the world
// build: each sits inside the world bounds, on land the player can stand or
// drive on (road, sidewalk ring, parking lot, park, beach sand or the pier
// deck), clear of every building footprint. Job 1's beach delivery is on
// the sand strip at (222, 40): 30 m short of the waterline (x = 252) and
// 24 m inside the world bound (x = 246), so its whole completion circle is
// reachable — an earlier build stranded it past the shoreline.
//
// One cleanup path — cancel() — serves new game, restart story, busted and
// wasted alike: it removes a still-parked mission target car, puts a taxi
// passenger back on the pavement, and clears all job/taxi state.

CVH.missions = {
  jobIndex: 0,       // next story job to offer, 0..5; 6 = story complete
  active: null,      // { def, stageIdx, stage, timer, targetCar }
  taxi: null,        // { phase, point, dest, fare, tipT, ped }
  taxiCd: 4,
  marker: null,
  markerCore: null,
  _passenger: null,
  _fakeObjective: null,

  PORCH: { x: -144, z: 116 }, // Marisol's safehouse porch: jobs start here

  // Audited taxi pickup/dropoff points: roads, landmark fronts, lots, parks,
  // the beach promenade. All reachable, all on land.
  TAXI_POINTS: [
    { x: -156, z: 130 }, { x: -104, z: 20 }, { x: -104, z: -84 },
    { x: 0, z: 19 }, { x: 156, z: 66 }, { x: 222, z: 40 },
    { x: 104, z: -52 }, { x: -52, z: -52 }, { x: 52, z: 78 },
    { x: 182, z: -26 }, { x: -52, z: 52 }, { x: 104, z: 52 }
  ],

  JOBS: [
    {
      name: 'First Run',
      intro: 'Marisol: "A package is waiting behind Hotel Sol. Bring it to my friend on the beach — and smile for the cameras."',
      reward: 300,
      stages: [
        { k: 'goto', x: 137, z: -52, r: 3.6, label: 'Pick up the package behind Hotel Sol' },
        { k: 'goto', x: 222, z: 40, r: 3.6, label: 'Deliver the package to the beach' }
      ]
    },
    {
      name: 'Ninety-Five Seconds',
      intro: 'Marisol: "Cafe Marina has something perishable. The bank manager hates waiting. Ninety-five seconds, no excuses."',
      reward: 450,
      stages: [
        { k: 'goto', x: 156, z: 66, r: 3.6, label: 'Pick up at Cafe Marina' },
        { k: 'goto', x: 0, z: 19, r: 3.6, label: 'Deliver to Banco Verde', timer: 95 }
      ]
    },
    {
      name: 'Three Drops',
      intro: 'Marisol: "Three envelopes, three friends: the park, the east lot, then the station steps. Quiet and quick."',
      reward: 600,
      stages: [
        { k: 'goto', x: -52, z: 52, r: 3.6, label: 'Drop 1 of 3 — the park' },
        { k: 'goto', x: 104, z: 52, r: 3.6, label: 'Drop 2 of 3 — the east lot' },
        { k: 'goto', x: -104, z: 20, r: 3.6, label: 'Drop 3 of 3 — the station steps' }
      ]
    },
    {
      name: 'The Magenta Coupe',
      intro: 'Marisol: "A magenta coupe is parked in the north lot. It belongs to a man who owes me. Bring it to Pay \'n Spray — gently."',
      reward: 700,
      stages: [
        { k: 'gotoCar', x: 0, z: -104, r: 4.2, label: 'Find the magenta coupe in the north lot', carX: 0, carZ: -104 },
        { k: 'enterCar', label: 'Get in the coupe' },
        { k: 'deliverCar', x: 52, z: 104, r: 5.5, label: 'Deliver the coupe to Pay \'n Spray' }
      ]
    },
    {
      name: 'Marina Alarm',
      intro: 'Marisol: "Pick up the case at the end of the pier. Fair warning — the marina alarm is... sensitive."',
      reward: 1000,
      stages: [
        { k: 'goto', x: 246, z: -26, r: 3.6, label: 'Pick up the case on the pier', alarm: true },
        { k: 'goto', x: -156, z: 122, r: 4, label: 'Bring it back to the safehouse' }
      ]
    },
    {
      name: 'King of Costa Verde',
      intro: 'Marisol: "Last one, and it is not quiet. Hit the checkpoint on the coast road, lose the heat, then come home."',
      reward: 1500,
      stages: [
        { k: 'goto', x: 182, z: 78, r: 4.5, label: 'Hit the checkpoint on the coast road', heat: 420 },
        { k: 'escape', label: 'Lose the heat' },
        { k: 'goto', x: -156, z: 122, r: 4, label: 'Get back to the safehouse' }
      ]
    }
  ],

  init: function (scene) {
    const geo = new THREE.CylinderGeometry(1.15, 1.15, 34, 14, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc93c, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = 17;
    const coreGeo = new THREE.CylinderGeometry(0.4, 0.4, 34, 8, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a3, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    this.markerCore = new THREE.Mesh(coreGeo, coreMat);
    this.markerCore.position.y = 17;
    this.marker.add(this.markerCore);
    scene.add(this.marker);
    this._passenger = CVH.player.buildHumanoid({ skin: 0xe8b088, shirt: 0xf0ead8, pants: 0x3a4a5a, hair: 0xd8c9a8 });
    this._passenger.group.visible = false;
    scene.add(this._passenger.group);
  },

  // ---- the one cleanup path -----------------------------------------------------
  cancel: function () {
    if (this.active && this.active.targetCar) {
      const car = this.active.targetCar;
      const playerInIt = CVH.player.inCar === car;
      if (!playerInIt) CVH.vehicles.removeCar(car);
      this.active.targetCar = null;
    }
    this.active = null;
    if (this.taxi && this._passenger) {
      if (this.taxi.phase === 'ride') {
        // The passenger climbs back out wherever the car stopped — never
        // leave them invisible inside a car that no longer has a fare.
        const cp = CVH.player.inCar ? CVH.player.inCar.mesh.position : CVH.player.mesh.position;
        this._passenger.group.position.set(cp.x + 2, 0, cp.z);
        this._passenger.group.visible = true;
      } else {
        // Still waiting at the kerb: the fare is gone, so are they.
        this._passenger.group.visible = false;
      }
      this.taxi = null;
    }
    this.taxiCd = 4;
  },

  onPlayerExitCar: function (car) {
    if (this.taxi && this.taxi.phase === 'ride') {
      const cp = car.mesh.position;
      this._passenger.group.position.set(cp.x + 2.2, 0, cp.z);
      this._passenger.group.visible = true;
      this.taxi = null;
      this.taxiCd = 6;
      CVH.hud.toast('Fare cancelled — the passenger got out.');
    }
  },

  startJob: function (idx, scene) {
    const def = this.JOBS[idx];
    if (!def) return;
    this.active = {
      def: def, jobIdx: idx, stageIdx: 0,
      stage: def.stages[0], timer: null, targetCar: null
    };
    this._enterStage(scene);
    CVH.hud.toast(def.intro, 5200);
    CVH.audio.ui();
  },

  _enterStage: function (scene) {
    const a = this.active;
    if (!a) return;
    const st = a.stage;
    a.timer = (typeof st.timer === 'number') ? st.timer : null;
    if (st.k === 'gotoCar' && scene) {
      const car = CVH.vehicles.makeCar(scene, 'sport', 0xd83ad8);
      CVH.vehicles.placeCar(car, st.carX, st.carZ, -Math.PI / 2);
      car.driver = null;
      a.targetCar = car;
    }
    // Stage `heat` and `alarm` flags fire when the stage is COMPLETED
    // (see _completeStage): the checkpoint trips its alarm as you cross it,
    // not when Marisol first mentions it.
  },

  _completeStage: function (scene) {
    const a = this.active;
    const st = a.stage;
    if (st.heat) {
      CVH.police.heat = Math.max(CVH.police.heat, st.heat);
      CVH.hud.toast('The checkpoint trips every alarm in the city!');
    }
    if (st.alarm) {
      CVH.police.heat = Math.max(CVH.police.heat, 300);
      CVH.audio.alarm();
      CVH.hud.toast('MARINA ALARM — the whole pier just lit up. MOVE!');
    }
    a.stageIdx++;
    if (a.stageIdx >= a.def.stages.length) {
      this._completeJob();
      return;
    }
    a.stage = a.def.stages[a.stageIdx];
    this._enterStage(scene);
    CVH.audio.pickup();
  },

  _completeJob: function () {
    const a = this.active;
    let reward = a.def.reward;
    if (a.targetCar) {
      // The coupe job pays a care bonus for an undamaged delivery.
      reward += Math.round(300 * CVH.clamp(a.targetCar.health, 0, 100) / 100);
    }
    CVH.game.cash += reward;
    CVH.game.earned += reward;
    this.jobIndex = a.jobIdx + 1;
    const wasFinale = a.jobIdx >= this.JOBS.length - 1;
    this.active = null;
    CVH.audio.cash();
    CVH.hud.toast('Job done — ' + CVH.fmtCash(reward) + ' from Marisol.', 4200);
    CVH.main.saveGame();
    if (wasFinale) CVH.main.onStoryComplete();
  },

  _failJob: function (scene) {
    const idx = this.active.jobIdx;
    CVH.hud.toast('Too slow. Marisol reschedules the job.', 3600);
    if (this.active.targetCar && CVH.player.inCar !== this.active.targetCar) {
      CVH.vehicles.removeCar(this.active.targetCar);
    }
    this.active = null;
    this.startJob(idx, scene);
  },

  tryInteract: function (scene) {
    if (this.active) return false;
    if (this.jobIndex >= this.JOBS.length) return false;
    const p = CVH.player.mesh.position;
    if (CVH.dist2d(p.x, p.z, this.PORCH.x, this.PORCH.z) < 4) {
      this.startJob(this.jobIndex, scene);
      return true;
    }
    return false;
  },

  // What the HUD banner should show right now, or null.
  currentObjective: function () {
    if (this._fakeObjective) return this._fakeObjective;
    if (this.taxi) {
      if (this.taxi.phase === 'pickup') {
        return { label: 'Pick up the fare', x: this.taxi.point.x, z: this.taxi.point.z, timer: null };
      }
      return { label: 'Drop off the fare', x: this.taxi.dest.x, z: this.taxi.dest.z, timer: this.taxi.tipT };
    }
    if (this.active) {
      const st = this.active.stage;
      if (st.k === 'escape') return { label: st.label + ' — break line of sight', x: null, z: null, timer: null, heat: CVH.police.heat };
      if (st.k === 'enterCar') {
        const cp = this.active.targetCar ? this.active.targetCar.mesh.position : null;
        return { label: st.label, x: cp ? cp.x : null, z: cp ? cp.z : null, timer: null };
      }
      return { label: st.label, x: st.x, z: st.z, timer: this.active.timer };
    }
    if (this.jobIndex < this.JOBS.length) {
      return { label: 'See Marisol at the safehouse — job: ' + this.JOBS[this.jobIndex].name, x: this.PORCH.x, z: this.PORCH.z, timer: null, hint: true };
    }
    return null;
  },

  // Screenshot staging: pin a fake objective (banner + pillar) in place.
  debugSetObjective: function (label, x, z, timer) {
    this._fakeObjective = { label: label, x: x, z: z, timer: timer };
  },

  // Every positional story objective, for reachability audits.
  debugObjectives: function () {
    const out = [];
    for (let j = 0; j < this.JOBS.length; j++) {
      const def = this.JOBS[j];
      for (let s = 0; s < def.stages.length; s++) {
        const st = def.stages[s];
        if (typeof st.x === 'number') {
          out.push({ job: j + 1, stage: s, kind: st.k, x: st.x, z: st.z, label: st.label });
        }
      }
    }
    return out;
  },

  update: function (dt, scene) {
    const pl = CVH.player;
    const ppos = pl.mesh.position;

    // ---- story job ----
    if (this.active) {
      const a = this.active;
      const st = a.stage;
      if (a.timer !== null) {
        a.timer -= dt;
        if (a.timer <= 0) { this._failJob(scene); }
      }
      if (this.active) { // _failJob may have restarted it; re-read
        const cur = this.active.stage;
        if (cur.k === 'goto' || cur.k === 'gotoCar') {
          if (CVH.dist2d(ppos.x, ppos.z, cur.x, cur.z) < cur.r) this._completeStage(scene);
        } else if (cur.k === 'enterCar') {
          if (pl.inCar && pl.inCar === this.active.targetCar) this._completeStage(scene);
        } else if (cur.k === 'deliverCar') {
          if (pl.inCar && pl.inCar === this.active.targetCar &&
              CVH.dist2d(ppos.x, ppos.z, cur.x, cur.z) < cur.r) {
            this._completeStage(scene);
          }
        } else if (cur.k === 'escape') {
          if (CVH.police.heat <= 0) this._completeStage(scene);
        }
      }
    }

    // ---- taxi fares ----
    this._updateTaxi(dt);

    // ---- marker pillar follows the current objective ----
    const obj = this.currentObjective();
    if (obj && typeof obj.x === 'number') {
      this.marker.visible = true;
      this.marker.position.x = obj.x;
      this.marker.position.z = obj.z;
      const pulse = 0.26 + 0.1 * Math.sin(performance.now() / 280);
      this.marker.material.opacity = pulse;
    } else {
      this.marker.visible = false;
    }
  },

  _updateTaxi: function (dt) {
    const pl = CVH.player;
    if (this.active) return; // no fares during a story job
    if (!this.taxi) {
      this.taxiCd -= dt;
      if (this.taxiCd <= 0 && pl.inCar && pl.inCar.type === 'taxi' && !pl.inCar.dead) {
        const ppos = pl.inCar.mesh.position;
        const options = this.TAXI_POINTS.filter((pt) => {
          const d = CVH.dist2d(pt.x, pt.z, ppos.x, ppos.z);
          return d > 45 && d < 150;
        });
        if (options.length) {
          const point = CVH.pick(options);
          let dest = CVH.pick(this.TAXI_POINTS);
          let guard = 0;
          while (dest === point && guard++ < 6) dest = CVH.pick(this.TAXI_POINTS);
          this.taxi = { phase: 'pickup', point: point, dest: dest, fare: 0, tipT: 0 };
          this._passenger.group.position.set(point.x, 0, point.z);
          this._passenger.group.visible = true;
          CVH.hud.toast('A fare is waiting — check your map.');
          CVH.audio.ui();
        } else {
          this.taxiCd = 5;
        }
      }
      return;
    }
    const t = this.taxi;
    const carPos = pl.inCar ? pl.inCar.mesh.position : pl.mesh.position;
    if (t.phase === 'pickup') {
      if (!pl.inCar || pl.inCar.type !== 'taxi') { this.cancel(); return; }
      const d = CVH.dist2d(carPos.x, carPos.z, t.point.x, t.point.z);
      if (d < 5 && pl.inCar.speed < 1) {
        // Passenger walks the last steps and gets in.
        const pg = this._passenger.group;
        const dx = carPos.x - pg.position.x, dz = carPos.z - pg.position.z;
        const dd = Math.sqrt(dx * dx + dz * dz);
        if (dd < 1.6) {
          pg.visible = false;
          t.phase = 'ride';
          const trip = CVH.dist2d(t.point.x, t.point.z, t.dest.x, t.dest.z);
          t.fare = Math.round(30 + trip * 0.55);
          t.tipT = trip / 7 + 25;
          CVH.hud.toast('Fare aboard — ' + CVH.fmtCash(t.fare) + ' to the marker. Fast = tip.');
          CVH.audio.pickup();
        } else {
          pg.position.x += (dx / dd) * 2.6 * dt;
          pg.position.z += (dz / dd) * 2.6 * dt;
          pg.rotation.y = Math.atan2(dx, dz);
        }
      }
    } else if (t.phase === 'ride') {
      t.tipT -= dt;
      if (!pl.inCar) { this.onPlayerExitCar({ mesh: { position: carPos } }); return; }
      const d = CVH.dist2d(carPos.x, carPos.z, t.dest.x, t.dest.z);
      if (d < 5.5 && pl.inCar.speed < 1) {
        const tip = Math.round(CVH.clamp(t.tipT, 0, 40));
        CVH.game.cash += t.fare + tip;
        CVH.game.earned += t.fare + tip;
        const pg = this._passenger.group;
        pg.position.set(carPos.x + 2.2, 0, carPos.z);
        pg.visible = true;
        CVH.hud.toast('Fare paid ' + CVH.fmtCash(t.fare + tip) + (tip > 0 ? ' (tip ' + CVH.fmtCash(tip) + ')' : '') + '.');
        CVH.audio.cash();
        this.taxi = null;
        this.taxiCd = 9;
      }
    }
  },

  // Pillar + passenger visuals while the game is frozen for a screenshot.
  updateVisuals: function () {
    const obj = this.currentObjective();
    if (obj && typeof obj.x === 'number') {
      this.marker.visible = true;
      this.marker.position.x = obj.x;
      this.marker.position.z = obj.z;
    } else {
      this.marker.visible = false;
    }
  }
};
