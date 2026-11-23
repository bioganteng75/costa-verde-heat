// missions.js — Marisol Vega's story chain, taxi fares, and the glowing
// objective markers. A job is a list of steps; each step is one objective
// (go somewhere, steal a car, escape through gates, shake the heat).
window.CVH = window.CVH || {};

CVH.missions = {
  jobIndex: 0,          // next story job to offer
  active: null,         // {job, stepIdx, stepT, timer}
  taxi: null,           // {stage:'pickup'|'dropoff', ped, dest, t}
  _marker: null, _ring: null,
  storyDone: false,

  JOBS: [
    {
      name: 'First Run', pay: 220,
      intro: 'Marisol: "Simple, chico. Pick up the package at the marina pier and drop it at Hotel Sol. Do not dent the day."',
      steps: (L) => [
        { type: 'goto', x: L.marina.x, z: L.marina.z, label: 'Pick up the package at the marina' },
        { type: 'goto', x: L.hotel.x, z: L.hotel.z, label: 'Deliver to Hotel Sol' },
      ],
    },
    {
      name: 'Hot Lunch', pay: 340,
      intro: 'Marisol: "A very impatient man wants his lunch across town. Ninety-five seconds. The clock is already rude."',
      steps: (L) => [
        { type: 'goto', x: L.foodStands[0].x, z: L.foodStands[0].z, label: 'Pick up the lunch order' },
        { type: 'goto', x: -114, z: 118, label: 'Deliver the lunch — fast!', time: 95 },
      ],
    },
    {
      name: 'Three Drops', pay: 520,
      intro: 'Marisol: "Three drops, three corners of my city. Quiet driving, clean hands."',
      steps: (L) => [
        { type: 'goto', x: 10, z: -176, label: 'Drop one: south market corner' },
        { type: 'goto', x: -176, z: -52, label: 'Drop two: west docks road' },
        { type: 'goto', x: 118, z: 176, label: 'Drop three: palmera heights' },
      ],
    },
    {
      name: 'Coupe de Ville', pay: 700,
      intro: 'Marisol: "A red coupe near Banco Verde belongs to a man who owes me. Take it. Bring it to my garage unbroken."',
      steps: (L) => [
        { type: 'steal', x: 58, z: 58, label: 'Steal the red coupe by Banco Verde' },
        { type: 'goto', x: L.garageDrop.x, z: L.garageDrop.z, label: 'Deliver the coupe to the garage', needCar: 'stealTarget' },
      ],
    },
    {
      name: 'Marina Heat', pay: 950,
      intro: 'Marisol: "The marina pickup will trip an alarm. You will be hot. Lose them or outrun them — just bring it home."',
      steps: (L) => [
        { type: 'goto', x: L.marina.x, z: L.marina.z, label: 'Grab the marina package', alarm: true },
        { type: 'goto', x: L.safehouse.x, z: L.safehouse.z, label: 'Bring it to the safehouse' },
      ],
    },
    {
      name: 'Verde Sunset', pay: 1600,
      intro: 'Marisol: "One last drive, chico. Through every gate I lit for you, then disappear, then home. We retire loud."',
      steps: (L) => [
        { type: 'goto', x: 186, z: -124, label: 'Gate one: north-east crossing' },
        { type: 'goto', x: -62, z: -186, label: 'Gate two: south causeway' },
        { type: 'goto', x: -186, z: 62, label: 'Gate three: west palms' },
        { type: 'goto', x: 62, z: 186, label: 'Gate four: marina road south' },
        { type: 'shake', label: 'Shake the heat — get unseen and cool off' },
        { type: 'goto', x: L.safehouse.x, z: L.safehouse.z, label: 'Home. Bring it home.' },
      ],
    },
  ],

  init(scene) {
    // Objective marker: a tall light pillar + ground ring, visible city-wide.
    const geo = new THREE.CylinderGeometry(1.6, 2.6, 42, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc93f, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this._marker = new THREE.Mesh(geo, mat);
    this._marker.position.y = 21;
    this._marker.visible = false;
    scene.add(this._marker);
    this._ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffc93f, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = 0.07;
    this._ring.visible = false;
    scene.add(this._ring);
  },

  // The point the HUD, minimap and marker should all point at right now.
  objective() {
    const G = CVH.G, L = CVH.world.landmarks;
    if (this.active) {
      const s = this.active.steps[this.active.stepIdx];
      if (s.type === 'shake') return { x: null, z: null, label: s.label, shake: true };
      return { x: s.x, z: s.z, label: s.label, timer: s.time ? this.active.timer : null };
    }
    if (this.taxi) {
      if (this.taxi.stage === 'pickup') return { x: this.taxi.ped.pos.x, z: this.taxi.ped.pos.z, label: 'Pick up your fare', taxi: true };
      return { x: this.taxi.dest.x, z: this.taxi.dest.z, label: 'Drop off your fare', taxi: true, timer: this.taxi.t };
    }
    if (this.jobIndex < this.JOBS.length) {
      return { x: L.safehouse.x, z: L.safehouse.z, label: 'Meet Marisol at the safehouse', marisol: true };
    }
    return null;
  },

  startJob(idx) {
    const G = CVH.G, L = CVH.world.landmarks;
    const job = this.JOBS[idx];
    this.active = { job, steps: job.steps(L), stepIdx: 0, timer: 0 };
    const s = this.active.steps[0];
    if (s.time) this.active.timer = s.time;
    if (s.type === 'steal') this._spawnStealCar(s);
    CVH.hud.toast(job.name, job.intro, 5200);
    CVH.audio.ui();
  },

  _spawnStealCar(step) {
    const G = CVH.G;
    const car = CVH.vehicles.create('sport', { color: 0xd92323, driver: 'parked', special: 'stealTarget', x: step.x, z: step.z, heading: 0.6 });
    G.scene.add(car.group);
    G.cars.push(car);
    this.active.stealCar = car;
  },

  _failJob(reason) {
    CVH.hud.toast('Job failed', reason + ' Head back to Marisol to try again.', 4200);
    CVH.audio.jobFail();
    if (this.active && this.active.stealCar && this.active.stealCar.driver === 'parked') {
      const i = CVH.G.cars.indexOf(this.active.stealCar);
      if (i >= 0) { CVH.G.scene.remove(this.active.stealCar.group); CVH.G.cars.splice(i, 1); }
    }
    this.active = null;
  },

  _completeStep() {
    const G = CVH.G;
    const a = this.active;
    a.stepIdx++;
    if (a.stepIdx >= a.steps.length) {
      G.addCash(a.job.pay);
      CVH.hud.toast(a.job.name + ' complete', '+$' + a.job.pay + ' — Marisol sends her love.', 4200);
      CVH.audio.jobDone();
      this.jobIndex++;
      this.active = null;
      G.saveGame();
      return;
    }
    const s = a.steps[a.stepIdx];
    a.timer = s.time || 0;
    if (s.type === 'steal') this._spawnStealCar(s);
    if (s.alarm) { /* alarm handled when the previous step completed */ }
    CVH.audio.pickup();
  },

  update(dt) {
    const G = CVH.G, L = CVH.world.landmarks;
    const P = CVH.playerCtl;
    const focus = G.focusPos();
    // Marker follows the objective
    const obj = this.objective();
    if (obj && obj.x !== null && obj.x !== undefined) {
      this._marker.visible = true; this._ring.visible = true;
      this._marker.position.x = obj.x; this._marker.position.z = obj.z;
      this._marker.material.color.setHex(obj.taxi ? 0x59d6ff : 0xffc93f);
      this._ring.position.x = obj.x; this._ring.position.z = obj.z;
      this._ring.material.color.setHex(obj.taxi ? 0x59d6ff : 0xffc93f);
    } else { this._marker.visible = false; this._ring.visible = false; }

    // Taxi lifecycle ------------------------------------------------------------
    this._updateTaxi(dt);

    // Story jobs ------------------------------------------------------------------
    if (!this.active) {
      // Standing in Marisol's ring starts the next job.
      if (this.jobIndex < this.JOBS.length &&
          CVH.util.dist2D(focus.x, focus.z, L.safehouse.x, L.safehouse.z) < 5 && G.focusSpeed() < 2) {
        this.startJob(this.jobIndex);
      }
      return;
    }
    const a = this.active;
    const s = a.steps[a.stepIdx];
    if (s.time) {
      a.timer -= dt;
      if (a.timer <= 0) { this._failJob('Out of time.'); return; }
    }
    if (s.type === 'shake') {
      if (CVH.police.stars === 0) this._completeStep();
      return;
    }
    if (s.type === 'steal') {
      if (G.playerCar && G.playerCar.special === 'stealTarget') {
        CVH.hud.toast('Got it', 'Now deliver it — gently. She said unbroken.', 2600);
        this._completeStep();
      } else if (a.stealCar && a.stealCar.dead) {
        this._failJob('The coupe is wrecked.');
      }
      return;
    }
    // goto steps
    if (s.needCar === 'stealTarget' && !(G.playerCar && G.playerCar.special === 'stealTarget')) {
      if (a.stealCar && a.stealCar.dead) this._failJob('The coupe is wrecked.');
      return;
    }
    if (CVH.util.dist2D(focus.x, focus.z, s.x, s.z) < 6) {
      if (s.alarm) {
        CVH.police.setHeat(Math.max(CVH.police.heat, CVH.police.THRESH[3] + 4));
        CVH.hud.toast('Alarm!', 'The marina screams. Drive, chico, drive!', 3000);
      }
      this._completeStep();
    }
  },

  _updateTaxi(dt) {
    const G = CVH.G;
    if (this.taxi) {
      const t = this.taxi;
      if (t.stage === 'pickup') {
        // Cancel if the fare got knocked down or the player wanders off.
        if (t.ped.state === 'down') { this.taxi = null; CVH.hud.toast('Fare lost', 'Your passenger is on the pavement. Classy.', 2600); return; }
        if (G.playerCar && CVH.util.dist2D(G.playerCar.group.position.x, G.playerCar.group.position.z, t.ped.pos.x, t.ped.pos.z) < 5 && G.playerCar.speed2D() < 2) {
          t.stage = 'dropoff';
          t.t = 75;
          t.ped.h.group.visible = false;             // seated in the car
          const W = CVH.world;
          const ix = W.roadXs[1 + Math.floor(Math.random() * (W.roadXs.length - 2))];
          const iz = W.roadZs[1 + Math.floor(Math.random() * (W.roadZs.length - 2))];
          t.dest = { x: ix, z: iz };
          CVH.hud.toast('Taxi', 'Your fare wants the corner of ' + Math.round(ix) + ' / ' + Math.round(iz) + '. Tip grows with speed.', 3400);
          CVH.audio.pickup();
        }
      } else {
        t.t -= dt;
        if (!G.playerCar) { /* passenger waits in the car; timer keeps ticking */ }
        if (G.playerCar && CVH.util.dist2D(G.playerCar.group.position.x, G.playerCar.group.position.z, t.dest.x, t.dest.z) < 7 && G.playerCar.speed2D() < 3) {
          const fare = 60 + Math.max(0, Math.round(t.t)) * 2;
          G.addCash(fare);
          CVH.hud.toast('Fare paid', '+$' + fare + (t.t > 25 ? ' — generous tip for the hurry.' : '.'), 3000);
          CVH.audio.cash();
          t.ped.h.group.visible = true;
          t.ped.pos.set(t.dest.x + 3, 0, t.dest.z + 3);
          t.ped.state = 'walk'; t.ped.target = null;
          this.taxi = null;
          G.saveGame();
        } else if (t.t <= 0) {
          CVH.hud.toast('Fare walked', 'Too slow — they got out at a light.', 2600);
          t.ped.h.group.visible = true;
          if (G.playerCar) t.ped.pos.set(G.playerCar.group.position.x + 3, 0, G.playerCar.group.position.z + 3);
          t.ped.state = 'walk'; t.ped.target = null;
          this.taxi = null;
        }
      }
      return;
    }
    // Offer a fare every so often: flag a nearby pedestrian with a marker.
    if (this._taxiCd > 0) { this._taxiCd -= dt; return; }
    if (CVH.G.playerCar || Math.random() > dt * 0.1) return;
    for (const ped of CVH.G.peds.list) {
      if (ped.state === 'walk' && CVH.util.dist2D(ped.pos.x, ped.pos.z, CVH.playerCtl.pos.x, CVH.playerCtl.pos.z) < 30) {
        this.taxi = { stage: 'pickup', ped, dest: null, t: 0 };
        this._taxiCd = 45;
        CVH.hud.toast('Taxi fare', 'A pedestrian is waving you down — stop your car beside them.', 3400);
        break;
      }
    }
  },
  _taxiCd: 20,
};
