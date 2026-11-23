// main.js — boot, the game loop, the day cycle, collisions, interactions
// (enter/exit cars, Pay 'n Spray, food stands, pickups), the save system,
// and the menu / pause / busted / wasted state machine.
window.CVH = window.CVH || {};

CVH.G = {
  state: 'menu',           // menu | playing | paused | ended
  scene: null, camera: null, renderer: null,
  time: 0, dayT: 0.16, dayLength: 420,
  cash: 120, cars: [], playerCar: null,
  packagesFound: 0, frozen: false, endKind: null,
  fps: 60, _frame: 0,
  sun: null, hemi: null, sky: new THREE.Color(0x87c5e8),
  focusPos() { return this.playerCar ? this.playerCar.group.position : CVH.playerCtl.pos; },
  focusVel() { return this.playerCar ? this.playerCar.vel : CVH.playerCtl._vel; },
  focusSpeed() { return this.playerCar ? this.playerCar.speed2D() : CVH.playerCtl.speedNow; },
  addCash(n) { this.cash += n; if (n > 0) CVH.audio.cash(); },
  saveGame() { CVH.main.saveGame(); },
  busted() { CVH.main.busted(); },
};

CVH.main = {
  SAVE_KEY: 'costaVerdeHeat3DSaveV1',
  _respawnTimers: [],

  init() {
    const G = CVH.G;
    const canvas = document.getElementById('game');
    G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    G.renderer.setSize(window.innerWidth, window.innerHeight);
    G.renderer.shadowMap.enabled = true;
    G.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.scene = new THREE.Scene();
    G.scene.fog = new THREE.Fog(0x87c5e8, 120, 420);
    G.camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 900);
    G.camera.position.set(0, 40, -90);

    G.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.75);
    G.scene.add(G.hemi);
    G.sun = new THREE.DirectionalLight(0xffffff, 1.1);
    G.sun.castShadow = true;
    G.sun.shadow.mapSize.set(2048, 2048);
    G.sun.shadow.camera.left = -70; G.sun.shadow.camera.right = 70;
    G.sun.shadow.camera.top = 70; G.sun.shadow.camera.bottom = -70;
    G.sun.shadow.camera.far = 320;
    G.sun.shadow.bias = -0.0006;
    G.scene.add(G.sun); G.scene.add(G.sun.target);

    const seedParam = parseInt(new URLSearchParams(location.search).get('seed') || '1', 10);
    CVH.world.build(G.scene, seedParam);
    CVH.fx.init(G.scene);
    CVH.missions.init(G.scene);
    CVH.playerCtl.create(G.scene, CVH.world.landmarks.safehouse.x, CVH.world.landmarks.safehouse.z);
    CVH.playerCtl._vel = new THREE.Vector3();
    CVH.peds.spawn(G.scene, CVH.world, 22);
    G.peds = CVH.peds;      // modules reach pedestrians through G
    // Screenshot scenes stage their own cars; ambient traffic would only
    // wander into the frame, so it is skipped when a scene is requested.
    const shotRequested = new URLSearchParams(location.search).get('shot');
    if (!shotRequested) {
      this._spawnTraffic(13);
      this._spawnParked(16);
    }
    CVH.hud.init();
    CVH.input.init(canvas);

    canvas.addEventListener('click', () => {
      if (G.state === 'playing') { CVH.audio.init(); CVH.input.requestLock(canvas); }
    });
    window.addEventListener('resize', () => {
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
      G.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const shot = CVH.shots.detect();
    if (shot) {
      G.state = 'playing';
      CVH.hud.hideMenu();
      CVH.shots.setup(G);
    } else {
      CVH.hud.showMenu(!!this.loadSave());
    }
    this._applyDay();
    requestAnimationFrame((t) => this._loop(t));
  },

  // --- world population ---------------------------------------------------------
  _spawnTraffic(n) {
    const G = CVH.G, W = CVH.world;
    const types = ['sedan', 'sedan', 'taxi', 'sport', 'moto', 'truck', 'sedan', 'taxi'];
    for (let i = 0; i < n; i++) {
      const car = CVH.vehicles.create(types[i % types.length], { driver: 'traffic' });
      CVH.vehicles.initTraffic(car, W);
      G.scene.add(car.group);
      G.cars.push(car);
    }
  },

  _spawnParked(n) {
    const G = CVH.G, W = CVH.world;
    const types = ['sedan', 'sport', 'sedan', 'moto', 'taxi', 'sedan', 'sport', 'truck'];
    for (let i = 0; i < n; i++) {
      const vertical = Math.random() < 0.5;
      const rx = W.roadXs[Math.floor(Math.random() * W.roadXs.length)];
      const rz = W.roadZs[Math.floor(Math.random() * W.roadZs.length)];
      const along = (Math.random() - 0.5) * 44;
      const x = vertical ? rx + (Math.random() < 0.5 ? -9.8 : 9.8) : rx + along;
      const z = vertical ? rz + along : rz + (Math.random() < 0.5 ? -9.8 : 9.8);
      const car = CVH.vehicles.create(types[i % types.length], {
        driver: 'parked', x, z, heading: vertical ? (Math.random() < 0.5 ? 0 : Math.PI) : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      });
      if (!W.collideCircle(car.group.position, car.cfg.r + 0.4)) { /* placed clean */ }
      G.scene.add(car.group);
      G.cars.push(car);
    }
  },

  // --- run lifecycle --------------------------------------------------------------
  newGame() {
    const G = CVH.G;
    localStorage.removeItem(this.SAVE_KEY);
    this._resetRun();
    G.cash = 120;
    CVH.missions.jobIndex = 0;
    CVH.hud.hideMenu(); CVH.hud.hideEnd();
    G.state = 'playing';
    CVH.hud.toast('Costa Verde', 'Marisol Vega is waiting at the safehouse, south-west. Try not to keep her.', 4600);
  },

  continueGame() {
    const G = CVH.G;
    const save = this.loadSave();
    this._resetRun();
    if (save) {
      G.cash = save.cash || 0;
      CVH.missions.jobIndex = save.jobIndex || 0;
      for (const id of save.packages || []) {
        const p = CVH.world.pickups.packages[id];
        if (p && !p.taken) { p.taken = true; p.mesh.visible = false; G.packagesFound++; }
      }
    }
    CVH.hud.hideMenu(); CVH.hud.hideEnd();
    G.state = 'playing';
    CVH.hud.toast('Welcome back', 'Marisol has work when you are ready.', 3000);
  },

  restart() { CVH.hud.hidePause(); this.newGame(); },

  _resetRun() {
    const G = CVH.G, P = CVH.playerCtl, L = CVH.world.landmarks;
    if (G.playerCar) { G.playerCar.driver = 'parked'; G.playerCar = null; }
    P.hp = P.maxHp; P.weapon = 'fist';
    P.pos.set(L.safehouse.x, 0, L.safehouse.z);
    P.h.group.visible = true;
    P.heading = Math.PI * 0.75;
    CVH.camera.yaw = P.heading; CVH.camera.snap(P.pos);
    CVH.police.reset();
    CVH.missions.active = null; CVH.missions.taxi = null;
    for (const p of CVH.world.pickups.packages) { p.taken = false; p.mesh.visible = true; }
    for (const w of CVH.world.pickups.weapons) { w.taken = false; w.mesh.visible = true; }
    G.packagesFound = 0;
    G.endKind = null;
  },

  pause() {
    const G = CVH.G;
    if (G.state !== 'playing') return;
    G.state = 'paused';
    CVH.hud.showPause();
    if (document.exitPointerLock) document.exitPointerLock();
    CVH.audio.engine(false, 0); CVH.audio.siren(false);
  },
  resume() {
    const G = CVH.G;
    if (G.state !== 'paused') return;
    CVH.hud.hidePause();
    G.state = 'playing';
  },

  busted() {
    const G = CVH.G;
    if (G.state !== 'playing') return;
    G.state = 'ended'; G.endKind = 'busted';
    if (document.exitPointerLock) document.exitPointerLock();
    CVH.audio.engine(false, 0); CVH.audio.siren(false);
    CVH.audio.jobFail();
    CVH.hud.showEnd('BUSTED', 'The Costa Verde police walk you out in cuffs. Fine: $150, and they keep your weapon.');
  },
  wasted() {
    const G = CVH.G;
    if (G.state !== 'playing') return;
    G.state = 'ended'; G.endKind = 'wasted';
    if (document.exitPointerLock) document.exitPointerLock();
    CVH.audio.engine(false, 0); CVH.audio.siren(false);
    CVH.audio.jobFail();
    CVH.hud.showEnd('WASTED', 'You wake up in Hospital San Verde smelling of antiseptic. Bill: $200.');
  },

  respawn() {
    const G = CVH.G, P = CVH.playerCtl, L = CVH.world.landmarks;
    CVH.hud.hideEnd();
    if (G.playerCar) { G.playerCar.driver = 'parked'; G.playerCar = null; }
    P.h.group.visible = true;
    P.hp = P.maxHp;
    if (G.endKind === 'busted') {
      G.cash = Math.max(0, G.cash - 150);
      P.weapon = 'fist';
      P.pos.set(L.policeStation.x, 0, L.policeStation.z);
    } else {
      G.cash = Math.max(0, G.cash - 200);
      P.pos.set(L.hospital.x, 0, L.hospital.z);
    }
    CVH.police.reset();
    CVH.missions.active = null;
    if (CVH.missions.taxi) { CVH.missions.taxi.ped.h.group.visible = true; CVH.missions.taxi = null; }
    CVH.camera.snap(P.pos);
    G.state = 'playing';
    this.saveGame();
  },

  // --- save ----------------------------------------------------------------------
  saveGame() {
    const G = CVH.G;
    const taken = CVH.world.pickups.packages.filter((p) => p.taken).map((p) => p.id);
    localStorage.setItem(this.SAVE_KEY, JSON.stringify({
      cash: Math.floor(G.cash), jobIndex: CVH.missions.jobIndex, packages: taken,
    }));
  },
  loadSave() {
    try { const s = localStorage.getItem(this.SAVE_KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  },

  // --- day cycle -------------------------------------------------------------------
  _applyDay() {
    const G = CVH.G;
    const ang = G.dayT * Math.PI * 2 + 0.6;
    const elev = Math.sin(ang);
    const daylight = CVH.util.clamp(elev * 1.8 + 0.3, 0.07, 1);
    const dusk = CVH.util.clamp(1 - Math.abs(elev - 0.04) / 0.3, 0, 1);
    const lit = CVH.util.clamp(0.42 - elev, 0, 1);          // windows, lamps, headlights
    const skyDay = new THREE.Color(0x87c5e8), skyDusk = new THREE.Color(0xf7a55c), skyNight = new THREE.Color(0x1d2c47);
    const sky = skyDay.clone();
    if (elev < 0.25) sky.lerp(skyDusk, dusk * 0.85);
    if (elev < -0.12) sky.lerp(skyNight, CVH.util.clamp((-elev - 0.12) * 2.2, 0, 1));
    G.scene.fog.color.copy(sky);
    G.renderer.setClearColor(sky);
    const f = G.focusPos();
    G.sun.position.set(f.x + Math.cos(ang) * 130, Math.max(14, elev * 150), f.z + 55);
    G.sun.target.position.set(f.x, 0, f.z);
    G.sun.intensity = 0.22 + daylight * 0.85;
    G.sun.color.setHex(dusk > 0.45 && elev > -0.1 ? 0xffb37a : 0xffffff);
    G.hemi.intensity = 0.26 + daylight * 0.36;
    G._lit = lit;
    return lit;
  },

  // --- interactions ------------------------------------------------------------------
  _interact(dt) {
    const G = CVH.G, P = CVH.playerCtl, W = CVH.world, L = W.landmarks;
    const I = CVH.input;
    let prompt = null;
    if (!G.playerCar) {
      // Nearest enterable car
      let near = null, nd = 3.4;
      for (const car of G.cars) {
        if (car.dead) continue;
        const d = CVH.util.dist2D(P.pos.x, P.pos.z, car.group.position.x, car.group.position.z);
        if (d < nd) { nd = d; near = car; }
      }
      if (near) {
        prompt = 'F — get in the ' + near.type;
        if (I.hit('KeyF')) this._enterCar(near);
      }
      // Food stands
      if (!prompt) for (const s of L.foodStands) {
        if (CVH.util.dist2D(P.pos.x, P.pos.z, s.x, s.z) < 3.6) {
          prompt = 'E — hot food, $25 (heals 40)';
          if (I.hit('KeyE')) {
            if (G.cash >= 25 && P.hp < P.maxHp) {
              G.cash -= 25; P.hp = Math.min(P.maxHp, P.hp + 40);
              CVH.audio.heal(); CVH.hud.toast('Food stand', 'Empanadas fix everything. +40 health.', 2200);
            } else if (P.hp >= P.maxHp) CVH.hud.toast('Food stand', 'You are stuffed already.', 1600);
            else CVH.hud.toast('Food stand', 'Not enough cash.', 1600);
          }
          break;
        }
      }
      // Weapon pickups
      for (const w of W.pickups.weapons) {
        if (w.taken) continue;
        if (CVH.util.dist2D(P.pos.x, P.pos.z, w.x, w.z) < 2.3) {
          P.weapon = w.kind;
          w.taken = true; w.mesh.visible = false; w.respawnAt = G.time + 45;
          CVH.audio.pickup();
          CVH.hud.toast('Weapon', w.kind === 'smg' ? 'SMG acquired — hold click to spray.' : 'Pistol acquired — click to fire.', 2400);
        }
      }
    } else {
      const car = G.playerCar;
      prompt = 'F — get out';
      if (I.hit('KeyF')) this._exitCar();
      // Pay 'n Spray
      const ps = L.paynspray;
      if (CVH.util.dist2D(car.group.position.x, car.group.position.z, ps.x, ps.z) < ps.r) {
        const needs = CVH.police.stars > 0 || car.hp < car.maxHp;
        prompt = needs ? "E — Pay 'n Spray ($150): lose the heat, fix the car" : "Pay 'n Spray — you are clean and shiny already";
        if (needs && I.hit('KeyE')) {
          if (G.cash >= 150) {
            G.cash -= 150;
            CVH.police.setHeat(0);
            car.hp = car.maxHp; car.dead = false;
            CVH.audio.spray();
            CVH.hud.toast("Pay 'n Spray", 'New plates, new paint, no problems.', 2600);
          } else CVH.hud.toast("Pay 'n Spray", 'Resprays are $150, friend.', 1800);
        }
      }
    }
    // Cash packages, by foot or by car
    const f = G.focusPos();
    for (const p of W.pickups.packages) {
      if (p.taken) continue;
      if (CVH.util.dist2D(f.x, f.z, p.x, p.z) < 2.8) {
        p.taken = true; p.mesh.visible = false;
        G.packagesFound++;
        G.addCash(75);
        CVH.fx.sparkle(p.x, 1.4, p.z);
        CVH.hud.toast('Cash package', '+$75 — ' + G.packagesFound + ' of ' + W.pickups.packages.length + ' found.', 2000);
        this.saveGame();
      }
    }
    // Weapon respawns
    for (const w of W.pickups.weapons) {
      if (w.taken && w.respawnAt && G.time > w.respawnAt) { w.taken = false; w.mesh.visible = true; }
    }
    CVH.hud.setPrompt(G.state === 'playing' ? prompt : null);
  },

  _enterCar(car) {
    const G = CVH.G, P = CVH.playerCtl;
    const wasParked = car.driver === 'parked';
    if (!car.owned) {
      CVH.police.reportCrime('theft', car.group.position);
      car.owned = true;
      if (wasParked) CVH.hud.toast('Stolen', 'That ' + car.type + ' is yours now. Probably.', 1800);
    }
    if (car.driver === 'traffic' && car.ai) car.ai = null;
    car.driver = 'player';
    G.playerCar = car;
    P.h.group.visible = false;
    CVH.audio.ui();
  },

  _exitCar() {
    const G = CVH.G, P = CVH.playerCtl;
    const car = G.playerCar;
    if (!car) return;
    const rx = -Math.cos(car.heading), rz = Math.sin(car.heading);
    P.pos.set(car.group.position.x + rx * 2.4, 0, car.group.position.z + rz * 2.4);
    CVH.world.collideCircle(P.pos, 0.55);
    P.heading = car.heading;
    P.h.group.visible = true;
    car.driver = 'parked';
    car.vel.multiplyScalar(0.15);
    G.playerCar = null;
    CVH.audio.engine(false, 0);
    CVH.audio.ui();
  },

  // --- collisions -----------------------------------------------------------------------
  _collisions(dt) {
    const G = CVH.G, W = CVH.world, P = CVH.playerCtl;
    // Cars vs buildings
    for (const car of G.cars) {
      const p = car.group.position;
      const preSpeed = car.speed2D();
      if (W.collideCircle(p, car.cfg.r)) {
        if (preSpeed > 6.5) {
          CVH.vehicles.damage(car, preSpeed * 0.55);
          CVH.fx.sparks(p.x, 0.8, p.z);
          CVH.audio.crash(preSpeed > 13);
          if (car === G.playerCar) {
            CVH.fx.addShake(Math.min(0.7, preSpeed * 0.03));
            P.hurt(preSpeed * 0.35);
          }
          car.vel.multiplyScalar(0.45);
        } else car.vel.multiplyScalar(0.8);
      }
      if (car.dead && Math.random() < dt * 2) CVH.fx.smoke(p.x, 1.2, p.z);
    }
    // Cars vs cars
    const cars = G.cars;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const pa = a.group.position, pb = b.group.position;
      const dx = pb.x - pa.x, dz = pb.z - pa.z;
      const rr = a.cfg.r + b.cfg.r;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2;
      const nx = dx / d, nz = dz / d;
      const rel = Math.abs((a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz);
      if (a.driver !== 'parked') { pa.x -= nx * push; pa.z -= nz * push; }
      if (b.driver !== 'parked') { pb.x += nx * push; pb.z += nz * push; }
      if (rel > 3.5) {
        CVH.vehicles.damage(a, rel * 0.5); CVH.vehicles.damage(b, rel * 0.5);
        CVH.fx.sparks((pa.x + pb.x) / 2, 0.8, (pa.z + pb.z) / 2);
        if (a === G.playerCar || b === G.playerCar) {
          CVH.audio.crash(rel > 9);
          CVH.fx.addShake(Math.min(0.6, rel * 0.035));
          P.hurt(rel * 0.3);
          const other = a === G.playerCar ? b : a;
          if (other.driver === 'police') CVH.police.reportCrime('policeHit', pa);
        }
      }
      const swap = Math.min(rel * 0.4, 4);
      a.vel.x -= nx * swap; a.vel.z -= nz * swap;
      b.vel.x += nx * swap; b.vel.z += nz * swap;
    }
    // Cars vs pedestrians, and cars vs the player on foot
    for (const car of cars) {
      if (car.speed2D() < 4) continue;
      const cp = car.group.position;
      for (const ped of G.peds.list) {
        if (ped.state === 'down') continue;
        if (CVH.util.dist2D(ped.pos.x, ped.pos.z, cp.x, cp.z) < car.cfg.r + 0.55) {
          G.peds.knockDown(ped);
          CVH.fx.bloodlessPuff(ped.pos.x, 1, ped.pos.z);
          if (car === G.playerCar) {
            CVH.police.reportCrime('hitrun', ped.pos);
            CVH.fx.addShake(0.25);
            CVH.audio.crash(false);
          }
        }
      }
      if (!G.playerCar && car.driver !== 'parked') {
        if (CVH.util.dist2D(P.pos.x, P.pos.z, cp.x, cp.z) < car.cfg.r + 0.7) {
          const s = car.speed2D();
          P.hurt(s * 1.1);
          const dx = P.pos.x - cp.x, dz = P.pos.z - cp.z, d = Math.max(0.5, Math.hypot(dx, dz));
          P.pos.x += (dx / d) * 2.2; P.pos.z += (dz / d) * 2.2;
          CVH.fx.addShake(0.5);
          CVH.audio.crash(false);
        }
      }
    }
  },

  // --- the loop ----------------------------------------------------------------------------
  _last: 0,
  _loop(t) {
    requestAnimationFrame((nt) => this._loop(nt));
    const G = CVH.G;
    const dt = Math.min(0.05, this._last ? (t - this._last) / 1000 : 0.016);
    this._last = t;
    if (dt > 0) G.fps = G.fps * 0.95 + (1 / dt) * 0.05;
    const I = CVH.input;

    if (I.hit('KeyM')) { const m = CVH.audio.toggleMute(); CVH.hud.toast('Sound', m ? 'Muted.' : 'Sound on.', 1200); }
    if (I.hit('KeyP') || I.hit('Escape')) {
      if (G.state === 'playing') this.pause();
      else if (G.state === 'paused') this.resume();
    }

    const lit = this._applyDay();
    const P = CVH.playerCtl;

    if (G.state === 'menu') {
      // Slow cinematic orbit over the city while the menu is up.
      const a = t * 0.00004;
      G.camera.position.set(Math.cos(a) * 105, 42, Math.sin(a) * 105);
      G.camera.lookAt(0, 0, 0);
      this._ambient(dt);
    } else if (G.state === 'playing' || G.state === 'ended') {
      if (G.frozen) {
        CVH.missions.update(0);
        CVH.hud.update(0);
        CVH.camera.apply(G.camera, G.focusPos());
        CVH.fx.update(dt);
        G._frame++;
        if (G._frame > 40) window.__shotReady = true;
      } else if (G.state === 'playing') {
        G.time += dt;
        G.dayT = (G.dayT + dt / G.dayLength) % 1;
        // Actors
        if (G.playerCar) {
          CVH.vehicles.updatePlayerCar(G.playerCar, dt);
          if (G.playerCar.group.position.x > 262) G.playerCar.vel.multiplyScalar(Math.exp(-1.1 * dt)); // sand drag
          if (Math.random() < dt * 3 && G.playerCar.speed2D() > 12) {
            const p = G.playerCar.group.position;
            CVH.fx.dust(p.x, 0.3, p.z);
          }
        } else {
          P.update(dt);
          P._vel.set(Math.sin(P.heading) * P.speedNow, 0, Math.cos(P.heading) * P.speedNow);
        }
        const blockers = G.cars.concat(G.playerCar ? [] : [{ group: P.h.group }], G.peds.list);
        for (const car of G.cars) {
          if (car.driver === 'traffic') CVH.vehicles.updateTraffic(car, dt, CVH.world, blockers);
          if ((car.type === 'moto' || car.type === 'truck') && car.driver === 'player') { /* physics already run */ }
          // Dusk lighting on every car
          if (car.refs.beamMat) car.refs.beamMat.opacity = (car === G.playerCar) ? lit * 0.13 : 0;
          car.refs.headMat.color.setHex(lit > 0.35 ? 0xffeeb0 : 0x8a8a72);
          if (car.dead && Math.random() < dt * 1.5) CVH.fx.smoke(car.group.position.x, 1.3, car.group.position.z);
        }
        CVH.peds.update(dt, CVH.world);
        CVH.police.update(dt);
        CVH.missions.update(dt);
        this._collisions(dt);
        this._interact(dt);
        if (P.hp <= 0) this.wasted();
        // Camera
        const focus = G.focusPos();
        if (G.playerCar) CVH.camera.update(dt, focus, 'drive', G.playerCar.heading);
        else CVH.camera.update(dt, focus, 'foot');
        CVH.camera.apply(G.camera, focus);
        // Audio beds
        CVH.audio.engine(!!G.playerCar, G.playerCar ? Math.min(1, G.playerCar.speed2D() / 30) : 0, G.playerCar && G.playerCar.type === 'moto');
        CVH.hud.update(dt);
      } else {
        this._ambient(dt);
        CVH.camera.apply(G.camera, G.focusPos());
      }
    } else if (G.state === 'paused') {
      // Render the frozen frame; nothing moves.
    }

    CVH.world.update(G.state === 'playing' && !G.frozen ? dt : dt * 0.25, lit);
    if (G.state !== 'paused') CVH.fx.update(dt);
    // Sun shadow follows the action
    const f2 = G.focusPos();
    G.sun.position.x += f2.x - G.sun.target.position.x;
    G.sun.position.z += f2.z - G.sun.target.position.z;
    G.sun.target.position.set(f2.x, 0, f2.z);
    G.renderer.render(G.scene, G.camera);
    I.endFrame();
  },

  _ambient(dt) {
    const G = CVH.G;
    for (const car of G.cars) {
      if (car.driver === 'traffic') CVH.vehicles.updateTraffic(car, dt, CVH.world, G.cars);
      car.refs.headMat.color.setHex(G._lit > 0.35 ? 0xffeeb0 : 0x8a8a72);
    }
    CVH.peds.update(dt, CVH.world);
  },
};

window.addEventListener('DOMContentLoaded', () => CVH.main.init());

// Small read-only peephole for automated smoke tests.
window.__gameState = () => {
  const G = CVH.G;
  if (!G.scene) return { state: 'boot' };
  const f = G.focusPos();
  return {
    state: G.state, cash: Math.floor(G.cash), stars: CVH.police.stars,
    hp: Math.round(CVH.playerCtl.hp), jobIndex: CVH.missions.jobIndex,
    inCar: !!G.playerCar, focus: { x: Math.round(f.x), z: Math.round(f.z) },
    speed: Math.round(G.focusSpeed() * 3.6), fps: Math.round(G.fps),
    cars: G.cars.length, police: CVH.police.cars.length,
  };
};
