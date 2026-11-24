// main.js — boot and the frame loop for Costa Verde Heat 3D. Owns the game
// state machine (menu / playing / paused / busted / wasted / ending / shot),
// driving and collision resolution, interactions (stealing, spraying,
// eating), the day cycle, and saving — which always goes through the safe
// storage wrapper in util.js (QA fix: storage can throw in sandboxed
// iframes and must never break NEW GAME, saving or loading).
CVH.main = {
  SAVE_KEY: 'costaVerdeHeat3DSaveV1',
  state: 'boot',
  cash: 0,
  cars: [],
  playerCar: null,
  time: 0,
  dayT: 0.3,               // 0..1 around the ~7 minute day
  storyDoneCache: false,
  packagesFound: 0,
  _sprayArmed: true,
  _hitCooldown: 0,
  _shotFrames: 0,
  _sun: null,
  _hemi: null,

  init() {
    const params = new URLSearchParams(window.location.search);
    this.shotName = params.get('shot');
    const seed = parseInt(params.get('seed') || '1', 10) || 1;

    const canvas = document.getElementById('game');
    // QA fix: if WebGL is unavailable, say so on a full-screen message
    // instead of dying silently on a blank page.
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      document.body.innerHTML = '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'padding:28px;text-align:center;color:#f5efdd;background:#10151c;font:17px/1.55 system-ui,sans-serif;">' +
        '<div><h1 style="font-size:26px;margin:0 0 10px;">Costa Verde Heat 3D needs WebGL</h1>' +
        '<p style="margin:0;">Your browser could not create a WebGL context, so the city cannot open.<br>' +
        'Try desktop Chrome with hardware acceleration enabled.</p></div></div>';
      this.state = 'nogl';
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fd4f2);
    this.scene.fog = new THREE.Fog(0x8fd4f2, 120, 340);
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);

    this._hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.75);
    this.scene.add(this._hemi);
    this._sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.set(2048, 2048);
    this._sun.shadow.camera.left = -90; this._sun.shadow.camera.right = 90;
    this._sun.shadow.camera.top = 90; this._sun.shadow.camera.bottom = -90;
    this._sun.shadow.camera.near = 10; this._sun.shadow.camera.far = 340;
    this._sun.shadow.bias = -0.0006;
    this.scene.add(this._sun);
    this.scene.add(this._sun.target);

    CVH.world.build(this.scene, 1000 + seed);
    CVH.fx.init(this.scene);
    CVH.missions.init(this.scene);
    this._spawnTrafficAndParked(seed);
    CVH.peds.spawn(this.scene, CVH.world, 22);

    const sh = CVH.world.safehouse;
    CVH.player.create(this.scene, sh.x - 6, sh.z + 6);
    CVH.camera.snap(CVH.player.pos, CVH.player.heading);

    CVH.hud.init();
    CVH.input.init(canvas);
    // QA fix: pointer lock dropping mid-play (the Esc case) pauses the game.
    CVH.input.onLockLost = () => { if (this.state === 'playing') this.pause(); };
    canvas.addEventListener('click', () => {
      if (this.state === 'playing') CVH.input.lockPointer(canvas);
    });

    if (this.shotName) {
      this.state = 'shot';
      CVH.shots.setup(this.shotName);
      CVH.hud.frame();
    } else {
      this.state = 'menu';
      CVH.hud.showMenu(!!CVH.store.getJSON(this.SAVE_KEY));
    }
    this._last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      this._frame(now);
    };
    requestAnimationFrame(loop);
  },

  _spawnTrafficAndParked(seed) {
    const r = CVH.u.rng(5000 + seed);
    const W = CVH.world;
    const types = ['sedan', 'sedan', 'sport', 'taxi', 'moto', 'truck'];
    for (let i = 0; i < 10; i++) {
      const p = W.randomRoadPoint(r);
      const car = CVH.vehicles.create(this.scene, CVH.u.pick(r, types), p.x, p.z, Math.floor(r() * 4) * Math.PI / 2);
      CVH.vehicles.initTraffic(car, W);
      this.cars.push(car);
    }
    for (let i = 0; i < 15; i++) {
      const p = W.randomRoadPoint(r);
      const vertical = r() < 0.5;
      const x = p.x + (vertical ? (r() < 0.5 ? -1 : 1) * (W.ROAD / 2 - 1.7) : 0);
      const z = p.z + (vertical ? 0 : (r() < 0.5 ? -1 : 1) * (W.ROAD / 2 - 1.7));
      if (W.pointInBuilding(x, z, 2)) continue;
      const car = CVH.vehicles.create(this.scene, CVH.u.pick(r, types), x, z, vertical ? (r() < 0.5 ? 0 : Math.PI) : (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
      car.driver = 'parked';
      this.cars.push(car);
    }
  },

  // ---- state changes ---------------------------------------------------------
  newGame() {
    CVH.store.del(this.SAVE_KEY); // through the safe wrapper, always
    CVH.missions.cancel();
    this._exitCarSilent();
    CVH.police.reset();
    CVH.missions.jobIndex = 0;
    CVH.missions.storyDone = false;
    this.storyDoneCache = false;
    CVH.missions.stats = { earned: 0, jobsDone: 0 };
    this.cash = 120;
    this.packagesFound = 0;
    for (const p of CVH.world.pickups.packages) { p.taken = false; p.mesh.visible = true; }
    for (const w of CVH.world.pickups.weapons) { w.taken = false; w.mesh.visible = true; w.ring.visible = true; }
    CVH.player.weapon = 'fists';
    CVH.player.health = 100;
    this._teleportToSafehouse();
    CVH.hud.hideMenu();
    CVH.hud.hideEnding();
    CVH.hud.hideEnd();
    this.state = 'playing';
    this.saveGame();
    CVH.hud.toast('Costa Verde', 'Marisol Vega is waiting at the safehouse. Try not to keep her waiting.', 3600);
  },

  continueGame() {
    const s = CVH.store.getJSON(this.SAVE_KEY);
    CVH.missions.cancel();
    this._exitCarSilent();
    CVH.police.reset();
    if (s) {
      this.cash = s.cash || 0;
      CVH.missions.jobIndex = s.jobIndex || 0;
      CVH.missions.storyDone = !!s.storyDone;
      this.storyDoneCache = CVH.missions.storyDone;
      CVH.player.weapon = s.weapon || 'fists';
      this.packagesFound = 0;
      for (const p of CVH.world.pickups.packages) {
        p.taken = (s.packages || []).includes(p.id);
        p.mesh.visible = !p.taken;
        if (p.taken) this.packagesFound++;
      }
    }
    CVH.player.health = 100;
    this._teleportToSafehouse();
    CVH.hud.hideMenu();
    this.state = 'playing';
    CVH.hud.toast('Welcome back', 'Your run continues from the safehouse.', 2400);
  },

  restartStory() {
    CVH.missions.cancel(); // single cleanup path (QA fix)
    CVH.missions.jobIndex = 0;
    CVH.missions.storyDone = false;
    this.storyDoneCache = false;
    CVH.missions.stats.jobsDone = 0;
    CVH.police.reset();
    this._teleportToSafehouse();
    CVH.hud.hidePause();
    this.state = 'playing';
    CVH.hud.toast('Story restarted', 'Marisol is ready to run it all again from job one.', 2600);
  },

  _teleportToSafehouse() {
    const sh = CVH.world.safehouse;
    CVH.player.pos.set(sh.x - 6, 0, sh.z + 6);
    CVH.player.h.group.rotation.x = 0;
    CVH.camera.snap(CVH.player.pos, CVH.player.heading);
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    CVH.audio.engine(false, 0);
    CVH.audio.siren(false);
    CVH.hud.showPause();
  },
  resume() {
    if (this.state !== 'paused') return;
    CVH.hud.hidePause();
    this.state = 'playing';
  },

  // QA fix: one mute path — the pause-menu label is re-synced from the audio
  // module's real state here, so the M key and the menu button never disagree.
  toggleMute() {
    const muted = CVH.audio.toggleMute();
    CVH.hud.syncMuteLabel();
    CVH.hud.toast('Sound', muted ? 'Muted.' : 'Sound on.', 1100);
  },

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    CVH.missions.cancel(); // single cleanup path (QA fix)
    const fine = Math.min(this.cash, 120);
    this.cash -= fine;
    CVH.audio.busted();
    CVH.audio.engine(false, 0);
    CVH.audio.siren(false);
    CVH.hud.showEnd('busted', 'The Verde PD impounded your ride and fined you ' + CVH.u.fmtMoney(fine) + '. Your weapon stays in evidence.');
  },

  onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    CVH.missions.cancel(); // single cleanup path (QA fix)
    const fee = Math.min(this.cash, 90);
    this.cash -= fee;
    CVH.audio.engine(false, 0);
    CVH.audio.siren(false);
    CVH.hud.showEnd('wasted', 'You wake up outside the hospital, ' + CVH.u.fmtMoney(fee) + ' lighter and smelling of antiseptic.');
  },

  respawn() {
    const spot = this.state === 'busted' ? CVH.world.station : CVH.world.hospital;
    this._exitCarSilent();
    CVH.police.reset();
    CVH.missions.cancel();
    if (this.state === 'busted') CVH.player.weapon = 'fists';
    CVH.player.health = 100;
    CVH.player.pos.set(spot.x, 0, spot.z);
    CVH.player.h.group.rotation.x = 0;
    CVH.camera.snap(CVH.player.pos, CVH.player.heading);
    CVH.hud.hideEnd();
    this.state = 'playing';
    this.saveGame();
  },

  onStoryComplete() {
    this.storyDoneCache = true;
    this.state = 'ending';
    CVH.audio.engine(false, 0);
    CVH.audio.siren(false);
    CVH.fx.confetti(CVH.player.pos);
    CVH.hud.showEnding({
      earned: CVH.missions.stats.earned,
      cash: this.cash,
      packages: this.packagesFound,
      packagesTotal: CVH.world.pickups.packages.length,
    });
  },
  closeEnding() {
    CVH.hud.hideEnding();
    this.state = 'playing';
    CVH.hud.toast('Free roam', 'Costa Verde is yours. Marisol left the porch light on.', 2800);
  },

  saveGame() {
    CVH.store.setJSON(this.SAVE_KEY, {
      cash: Math.floor(this.cash),
      jobIndex: CVH.missions.jobIndex,
      storyDone: CVH.missions.storyDone,
      weapon: CVH.player.weapon,
      packages: CVH.world.pickups.packages.filter((p) => p.taken).map((p) => p.id),
    });
  },

  addCash(n) { this.cash += n; },

  // ---- cars ---------------------------------------------------------------------
  _exitCarSilent() {
    if (!this.playerCar) return;
    this.playerCar.driver = 'parked';
    this.playerCar.ai = null;
    this.playerCar = null;
    CVH.player.h.group.visible = true;
    CVH.audio.engine(false, 0);
  },

  enterCar(car) {
    const P = CVH.player;
    const wasParked = car.driver === 'parked';
    if (car.driver === 'police') {
      // QA fix: the stolen cruiser leaves the force immediately, and the
      // pursuit only ever steers cars whose driver is still 'police'.
      CVH.police.removeFromForce(car);
      CVH.police.reportCrime('theft', car.group.position);
    } else if (car.driver === 'traffic') {
      car.ai = null;
      CVH.police.reportCrime('theft', car.group.position);
    } else if (wasParked) {
      CVH.police.reportCrime('theft', car.group.position);
    }
    car.driver = 'player';
    this.playerCar = car;
    P.h.group.visible = false;
    CVH.camera.yaw = car.heading;
    CVH.camera.snap(car.group.position, car.heading);
    if (wasParked) CVH.hud.toast('Stolen', 'That ' + car.type + ' is yours now. Probably.', 1700);
    CVH.audio.click();
  },

  exitCar() {
    const car = this.playerCar;
    if (!car) return;
    const cp = car.group.position;
    const side = car.heading + Math.PI / 2;
    CVH.player.pos.set(cp.x + Math.sin(side) * 2.2, 0, cp.z + Math.cos(side) * 2.2);
    CVH.world.collideCircle(CVH.player.pos, 0.5);
    CVH.player.h.group.visible = true;
    car.driver = 'parked';
    car.ai = null;
    this.playerCar = null;
    CVH.camera.snap(CVH.player.pos, CVH.player.heading);
    CVH.audio.engine(false, 0);
  },

  _nearestCar(maxD) {
    let best = null, bd = maxD;
    for (const car of this.cars) {
      if (car.dead) continue;
      const cp = car.group.position;
      const d = CVH.u.dist2(CVH.player.pos.x, CVH.player.pos.z, cp.x, cp.z);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  },

  // ---- frame ---------------------------------------------------------------------
  _frame(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000 || 0.016);
    this._last = now;
    this.time += dt;
    if (this.state === 'nogl') return;

    if (this.state === 'playing') this._updatePlaying(dt);
    else if (this.state === 'shot') {
      this._shotFrames++;
      CVH.world.update(dt, this.time, CVH.shots.duskF || 0.1);
      for (const car of this.cars) CVH.vehicles.setDusk(car, CVH.shots.duskF || 0.1);
      if (this._shotFrames === 45) window.__shotReady = true;
    } else if (this.state === 'menu' || this.state === 'ending') {
      // Slow cinematic orbit behind the menu / ending.
      const t = this.time * 0.05;
      const cx = Math.sin(t) * 60, cz = Math.cos(t) * 60;
      this.camera.position.set(cx, 26, cz);
      this.camera.lookAt(0, 4, 0);
      CVH.world.update(dt, this.time, 0.15);
    }
    if (this.state !== 'menu' && this.state !== 'ending' && this.state !== 'shot') {
      this._applyDay();
    }
    if (this.state === 'playing' || this.state === 'paused') CVH.hud.frame();
    CVH.fx.update(dt);
    this.renderer.render(this.scene, this.camera);
    CVH.input.postUpdate();
  },

  _applyDay() {
    this.dayT = (0.3 + this.time / 420) % 1;
    const t = this.dayT;
    // Dusk factor: peaks in the warm band of the cycle.
    const duskF = CVH.u.clamp(Math.sin((t - 0.45) / 0.5 * Math.PI), 0, 1) * (t > 0.45 && t < 0.95 ? 1 : 0);
    const sunAng = t * Math.PI * 2 - Math.PI * 0.35;
    const focus = this.playerCar ? this.playerCar.group.position : CVH.player.pos;
    this._sun.position.set(focus.x + Math.cos(sunAng) * 130, 60 + Math.sin(sunAng) * 90, focus.z + Math.sin(sunAng) * 60);
    this._sun.target.position.copy(focus);
    const day = new THREE.Color(0x8fd4f2), dusk = new THREE.Color(0xf7a56b);
    const sky = day.clone().lerp(dusk, duskF * 0.85);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this._sun.intensity = 1.15 - duskF * 0.4;
    this._sun.color.setHex(0xfff2d8).lerp(new THREE.Color(0xff9a4d), duskF);
    this._hemi.intensity = 0.75 - duskF * 0.22;
    this._duskF = duskF;
  },

  _updatePlaying(dt) {
    const I = CVH.input;
    const W = CVH.world;
    const P = CVH.player;

    if (I.hit('KeyM')) this.toggleMute();
    if (I.hit('KeyP') || I.hit('Escape')) { this.pause(); return; }

    this._hitCooldown -= dt;

    if (this.playerCar) {
      const car = this.playerCar;
      const ctl = { throttle: 0, steer: 0, brake: false, handbrake: I.down('Space') };
      if (I.down('KeyW') || I.down('ArrowUp')) ctl.throttle = 1;
      if (I.down('KeyS') || I.down('ArrowDown')) {
        if (car.speed > 0.6) ctl.brake = true; else ctl.throttle = -1;
      }
      if (I.down('KeyA') || I.down('ArrowLeft')) ctl.steer += 1;
      if (I.down('KeyD') || I.down('ArrowRight')) ctl.steer -= 1;
      CVH.vehicles.step(car, ctl, dt);
      W.collideCircle(car.group.position, car.radius + 0.35);
      if (Math.abs(car.speed) > 2) {
        CVH.camera.yaw = CVH.u.angleLerp(CVH.camera.yaw, car.heading, Math.min(1, dt * 2.6));
      }
      CVH.audio.engine(true, Math.abs(car.speed) / car.def.maxSpeed, car.def.base);
      if (I.hit('KeyF')) { this.exitCar(); }
      this._payNSprayCheck();
    } else {
      P.update(dt, W);
      P.tryAttack();
      CVH.audio.engine(false, 0);
      if (I.hit('KeyF')) {
        const car = this._nearestCar(3.4);
        if (car) this.enterCar(car);
      }
      if (I.hit('KeyE')) this._foodCheck();
    }

    // Traffic.
    const obstacles = this.cars.concat([{ group: P.h.group }]);
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue;
      const ctl = CVH.vehicles.trafficCtl(car, W, obstacles);
      CVH.vehicles.step(car, ctl, dt);
      W.collideCircle(car.group.position, car.radius + 0.35);
    }

    CVH.police.update(dt, this.scene);
    CVH.peds.update(dt, W);
    this._carCarCollisions(dt);
    this._carPeopleCollisions(dt);
    CVH.missions.update(dt);
    this._pickupCheck();
    for (const car of this.cars) CVH.vehicles.setDusk(car, this._duskF || 0);
    W.update(dt, this.time, this._duskF || 0);

    if (P.health <= 0 && !this.playerCar) this.onWasted();

    const focus = this.playerCar ? this.playerCar.group.position : P.pos;
    CVH.camera.update(dt, this.camera, focus, this.playerCar ? 'car' : 'foot');
  },

  _carCarCollisions(dt) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const pa = a.group.position, pb = b.group.position;
        const rr = a.radius + b.radius;
        const d = CVH.u.dist2(pa.x, pa.z, pb.x, pb.z);
        if (d >= rr || d === 0) continue;
        const rel = Math.abs(a.speed - b.speed) + Math.min(Math.abs(a.speed), Math.abs(b.speed)) * 0.4;
        const nx = (pb.x - pa.x) / d, nz = (pb.z - pa.z) / d;
        const push = (rr - d) / 2;
        pa.x -= nx * push; pa.z -= nz * push;
        pb.x += nx * push; pb.z += nz * push;
        if (rel > 3) {
          CVH.vehicles.damage(a, rel * 0.8);
          CVH.vehicles.damage(b, rel * 0.8);
          CVH.fx.sparks({ x: (pa.x + pb.x) / 2, y: 0.7, z: (pa.z + pb.z) / 2 });
          const involvesPlayer = a === this.playerCar || b === this.playerCar;
          if (involvesPlayer) {
            CVH.audio.crash(rel > 8);
            if ((a === this.playerCar && b.driver === 'police') || (b === this.playerCar && a.driver === 'police')) {
              if (this._hitCooldown <= 0) { CVH.police.reportCrime('policeHit', pa); this._hitCooldown = 1.5; }
            }
          }
        }
        a.speed *= 0.55; b.speed *= 0.55;
      }
    }
  },

  _carPeopleCollisions(dt) {
    const P = CVH.player;
    for (const car of this.cars) {
      if (Math.abs(car.speed) < 2.5) continue;
      const cp = car.group.position;
      // Pedestrians.
      for (const ped of CVH.peds.list) {
        if (ped.state === 'down' || ped.state === 'riding') continue;
        const pp = ped.h.group.position;
        if (CVH.u.dist2(cp.x, cp.z, pp.x, pp.z) < car.radius + 0.5) {
          const downed = CVH.peds.hurt(ped, 40, cp);
          CVH.fx.sparks(pp);
          if (car === this.playerCar) {
            CVH.audio.crash(false);
            if (downed && this._hitCooldown <= 0) {
              CVH.police.reportCrime('hitAndRun', cp);
              this._hitCooldown = 1.2;
            }
            CVH.peds.panic(cp.x, cp.z);
          }
        }
      }
      // The player, on foot.
      if (!this.playerCar && car.driver !== 'player') {
        if (CVH.u.dist2(cp.x, cp.z, P.pos.x, P.pos.z) < car.radius + 0.55) {
          P.hurt(Math.abs(car.speed) * 1.5);
          CVH.hud.flashDamage();
          CVH.audio.crash(false);
          const away = Math.atan2(P.pos.x - cp.x, P.pos.z - cp.z);
          P.pos.x += Math.sin(away) * 2;
          P.pos.z += Math.cos(away) * 2;
        }
      }
    }
  },

  _pickupCheck() {
    const P = CVH.player;
    const focus = this.playerCar ? this.playerCar.group.position : P.pos;
    for (const p of CVH.world.pickups.packages) {
      if (p.taken) continue;
      if (CVH.u.dist2(focus.x, focus.z, p.x, p.z) < 1.9) {
        p.taken = true;
        p.mesh.visible = false;
        this.packagesFound++;
        this.addCash(25);
        CVH.audio.cash();
        CVH.fx.confetti({ x: p.x, z: p.z });
        CVH.hud.toast('Cash package', '+$25 — ' + this.packagesFound + ' of ' + CVH.world.pickups.packages.length + ' found.', 1800);
        this.saveGame();
      }
    }
    if (!this.playerCar) {
      for (const w of CVH.world.pickups.weapons) {
        if (w.taken) continue;
        if (CVH.u.dist2(P.pos.x, P.pos.z, w.x, w.z) < 1.7) {
          w.taken = true;
          w.mesh.visible = false;
          w.ring.visible = false;
          P.weapon = w.kind;
          CVH.audio.pickup();
          CVH.hud.toast(w.kind === 'smg' ? 'SMG acquired' : 'Pistol acquired', w.kind === 'smg' ? 'Hold click to spray. Mind the witnesses.' : 'Click to fire. Mind the witnesses.', 2400);
          this.saveGame();
        }
      }
    }
  },

  _payNSprayCheck() {
    const car = this.playerCar;
    if (!car) return;
    const s = CVH.world.spray;
    const cp = car.group.position;
    const inside = CVH.u.dist2(cp.x, cp.z, s.x, s.z) < s.r && Math.abs(car.speed) < 1.2;
    if (!inside) { this._sprayArmed = true; return; }
    if (!this._sprayArmed) return;
    if (CVH.police.stars === 0 && car.health > 92) return;
    if (this.cash < 150) {
      CVH.hud.toast("Pay 'n Spray", 'A respray costs $150. You are short.', 1800);
      this._sprayArmed = false;
      return;
    }
    this.cash -= 150;
    CVH.police.heat = 0;
    CVH.police._recalc();
    car.health = 100;
    car.dead = false;
    this._sprayArmed = false;
    CVH.audio.spray();
    CVH.fx.confetti(cp);
    CVH.hud.toast("Pay 'n Spray", 'Fresh paint, fixed panels, forgotten felonies. -$150.', 2400);
    this.saveGame();
  },

  _foodCheck() {
    const P = CVH.player;
    for (const s of CVH.world.stands) {
      if (CVH.u.dist2(P.pos.x, P.pos.z, s.x, s.z) < 2.6) {
        if (P.health >= 100) { CVH.hud.toast('Food stand', 'You are stuffed already.', 1400); return; }
        if (this.cash < 25) { CVH.hud.toast('Food stand', 'A proper meal costs $25.', 1400); return; }
        this.cash -= 25;
        P.health = Math.min(100, P.health + 40);
        CVH.audio.heal();
        CVH.hud.toast('Food stand', 'Empanadas down. +40 health, -$25.', 1800);
        return;
      }
    }
  },
};

window.addEventListener('DOMContentLoaded', () => CVH.main.init());
