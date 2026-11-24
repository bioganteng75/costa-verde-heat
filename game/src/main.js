'use strict';
// Costa Verde Heat 3D — boot and state machine. States: menu, playing,
// paused, busted, wasted, ending, shot, nogl. Owns the save game (always via
// CVH.store, the fail-safe wrapper), the Pay 'n Spray service, package and
// pickup collection, food stands, and the fixed-step test hook the automated
// playtest drives (window.__game.step).

CVH.UP = new THREE.Vector3(0, 1, 0);

CVH.game = { cash: 150, earned: 0, packages: [] };

CVH.main = {
  SAVE_KEY: 'costaVerdeHeat3DSaveV1',
  state: 'menu',
  renderer: null,
  scene: null,
  camera: null,
  clock: null,
  isShot: false,
  shotFrames: 0,
  pnsCd: 0,
  _menuT: 0,

  boot: function () {
    if (this._booted) return;
    this._booted = true;
    const params = new URLSearchParams(window.location.search);
    const seedParam = parseInt(params.get('seed') || '', 10);
    CVH.rng = CVH.makeRng(Number.isFinite(seedParam) ? seedParam : 20261124);
    const shotName = params.get('shot');

    let renderer = null;
    try {
      if (!window.WebGLRenderingContext) throw new Error('no WebGL');
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      renderer = null;
    }
    if (!renderer) {
      // WebGL fallback: a clear full-screen message instead of a blank page.
      const n = document.getElementById('nogl');
      if (n) n.style.display = 'flex';
      this.state = 'nogl';
      window.__game = CVH;
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app').appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(-156, 8, 150);
    const scene = this.scene;

    CVH.world.build(scene);
    CVH.fx.init(scene);
    CVH.vehicles.spawnTraffic(scene, 14);
    CVH.vehicles.spawnParked(scene, 12);
    CVH.player.init(scene);
    CVH.police.init();
    CVH.missions.init(scene);
    CVH.player.reset(CVH.world.safehousePos.x, CVH.world.safehousePos.z, Math.PI);

    CVH.input.init(renderer.domElement);
    CVH.input.onLockLost = () => {
      if (CVH.main.state === 'playing') CVH.main.pauseGame();
    };
    renderer.domElement.addEventListener('click', () => {
      CVH.audio.init();
      if (CVH.main.state === 'playing') CVH.input.requestLock();
    });
    window.addEventListener('resize', () => {
      CVH.main.camera.aspect = window.innerWidth / window.innerHeight;
      CVH.main.camera.updateProjectionMatrix();
      CVH.main.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    CVH.hud.init({
      onNew: () => CVH.main.newGame(),
      onContinue: () => CVH.main.continueGame(),
      onResume: () => CVH.main.resumeGame(),
      onSave: () => { CVH.main.saveGame(); CVH.hud.toast('Game saved.'); },
      onRestart: () => CVH.main.restartStory(),
      onQuit: () => CVH.main.quitToMenu(),
      onBustedOk: () => CVH.main.dismissScreen(),
      onWastedOk: () => CVH.main.dismissScreen(),
      onRoam: () => CVH.main.dismissScreen(),
      onEndingNew: () => CVH.main.newGame()
    });

    this.clock = new THREE.Clock();
    window.__game = CVH;
    window.CVH = CVH;

    if (shotName) {
      this.isShot = true;
      this.state = 'shot';
      CVH.hud.showHud();
      CVH.shots.setup(shotName, scene);
    } else {
      this.state = 'menu';
      CVH.hud.showMain(this.hasSave());
    }
    renderer.setAnimationLoop(() => CVH.main._frame());
  },

  // ---- save / load ---------------------------------------------------------------
  hasSave: function () {
    return CVH.store.get(this.SAVE_KEY) !== null;
  },

  saveGame: function () {
    CVH.store.set(this.SAVE_KEY, {
      cash: CVH.game.cash,
      earned: CVH.game.earned,
      jobIndex: CVH.missions.jobIndex,
      packages: CVH.game.packages.slice(),
      weapon: CVH.player.weapon
    });
  },

  _applySave: function (s) {
    if (!s) return;
    CVH.game.cash = typeof s.cash === 'number' ? s.cash : 150;
    CVH.game.earned = typeof s.earned === 'number' ? s.earned : 0;
    CVH.game.packages = Array.isArray(s.packages) ? s.packages.slice() : [];
    CVH.missions.jobIndex = typeof s.jobIndex === 'number' ? s.jobIndex : 0;
    CVH.player.weapon = s.weapon || 'fist';
    for (let i = 0; i < CVH.world.packages.length; i++) {
      const pk = CVH.world.packages[i];
      if (CVH.game.packages.indexOf(pk.id) >= 0) {
        pk.taken = true;
        pk.mesh.visible = false;
      }
    }
    if (CVH.player.weapon !== 'fist') {
      for (let i = 0; i < CVH.world.pickups.length; i++) {
        if (CVH.world.pickups[i].kind === CVH.player.weapon) {
          CVH.world.pickups[i].taken = true;
          CVH.world.pickups[i].mesh.visible = false;
        }
      }
    }
  },

  _resetWorldCollectables: function () {
    CVH.game.packages = [];
    for (let i = 0; i < CVH.world.packages.length; i++) {
      const pk = CVH.world.packages[i];
      pk.taken = false;
      pk.mesh.visible = true;
    }
    for (let i = 0; i < CVH.world.pickups.length; i++) {
      const pu = CVH.world.pickups[i];
      pu.taken = false;
      pu.mesh.visible = true;
    }
  },

  // ---- state changes ---------------------------------------------------------------
  newGame: function () {
    CVH.missions.cancel();
    CVH.store.del(this.SAVE_KEY);
    CVH.game.cash = 150;
    CVH.game.earned = 0;
    this._resetWorldCollectables();
    CVH.missions.jobIndex = 0;
    CVH.police.forceReset();
    CVH.player.weapon = 'fist';
    CVH.player.reset(CVH.world.safehousePos.x, CVH.world.safehousePos.z, Math.PI);
    this.state = 'playing';
    CVH.hud.showHud();
    CVH.hud.toast('Welcome to Costa Verde. Marisol Vega is waiting at the safehouse porch.', 4600);
  },

  continueGame: function () {
    const s = CVH.store.get(this.SAVE_KEY);
    if (!s) { this.newGame(); return; }
    CVH.missions.cancel();
    this._resetWorldCollectables();
    CVH.police.forceReset();
    CVH.player.reset(CVH.world.safehousePos.x, CVH.world.safehousePos.z, Math.PI);
    this._applySave(s);
    this.state = 'playing';
    CVH.hud.showHud();
    CVH.hud.toast('Welcome back to Costa Verde.');
  },

  restartStory: function () {
    // The single cleanup path clears the active job/taxi and any target car.
    CVH.missions.cancel();
    CVH.missions.jobIndex = 0;
    CVH.police.forceReset();
    if (CVH.player.inCar) CVH.player.exitCar();
    CVH.player.mesh.position.set(CVH.world.safehousePos.x, 0, CVH.world.safehousePos.z);
    this.state = 'playing';
    CVH.hud.hidePause();
    CVH.hud.toast('Story restarted — Marisol has work for you.');
  },

  pauseGame: function () {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    CVH.hud.showPause();
    CVH.audio.engine(0, false);
    CVH.audio.siren(false, 0);
  },

  resumeGame: function () {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    CVH.hud.hidePause();
  },

  quitToMenu: function () {
    CVH.missions.cancel();
    this.state = 'menu';
    CVH.hud.showMain(this.hasSave());
    CVH.audio.engine(0, false);
    CVH.audio.siren(false, 0);
  },

  dismissScreen: function () {
    if (this.state === 'busted' || this.state === 'wasted' || this.state === 'ending') {
      this.state = 'playing';
      CVH.hud.showHud();
    }
  },

  onBusted: function () {
    const fine = Math.min(CVH.game.cash, 40 + CVH.police.stars * 30);
    CVH.game.cash -= fine;
    CVH.missions.cancel();
    CVH.police.forceReset();
    CVH.player.weapon = 'fist';
    CVH.player.reset(CVH.world.policePos.x, CVH.world.policePos.z, 0);
    this.state = 'busted';
    CVH.input.releaseLock();
    CVH.audio.engine(0, false);
    CVH.audio.siren(false, 0);
    CVH.hud.showBusted('The Costa Verde PD got you. Fine: ' + CVH.fmtCash(fine) + '. Your weapon was confiscated.');
  },

  onWasted: function () {
    const fee = Math.min(CVH.game.cash, 100);
    CVH.game.cash -= fee;
    CVH.missions.cancel();
    CVH.police.forceReset();
    CVH.player.reset(CVH.world.hospitalPos.x, CVH.world.hospitalPos.z, 0);
    this.state = 'wasted';
    CVH.input.releaseLock();
    CVH.audio.engine(0, false);
    CVH.audio.siren(false, 0);
    CVH.hud.showWasted('You woke up at St. Marina General. Medical bill: ' + CVH.fmtCash(fee) + '.');
  },

  onStoryComplete: function () {
    this.state = 'ending';
    CVH.input.releaseLock();
    CVH.audio.engine(0, false);
    CVH.hud.showEnding({
      earned: CVH.game.earned,
      packages: CVH.game.packages.length,
      cash: CVH.game.cash
    });
  },

  // ---- per-frame ---------------------------------------------------------------------
  _frame: function () {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const scene = this.scene, camera = this.camera;

    if (this.state === 'shot') {
      CVH.world.updateVisuals(dt);
      CVH.vehicles.updateVisuals();
      CVH.missions.updateVisuals();
      CVH.fx.update(dt);
      CVH.player.updateCamera(0, camera);
      CVH.hud.update(0.016);
      this.shotFrames++;
      if (this.shotFrames === 45) window.__shotReady = true;
      this.renderer.render(scene, camera);
      CVH.input.endFrame();
      return;
    }

    if (this.state === 'menu') {
      this._menuT += dt;
      CVH.world.update(dt, scene);
      CVH.vehicles.update(dt);
      CVH.vehicles.updateVisuals();
      CVH.player.updatePeds(dt);
      CVH.fx.update(dt);
      const cx = CVH.world.safehousePos.x, cz = CVH.world.safehousePos.z - 8;
      const t = this._menuT * 0.07;
      camera.position.set(cx + Math.sin(t) * 25, 8.5, cz + Math.cos(t) * 25);
      camera.lookAt(cx, 2, cz - 6);
      CVH.world.sunFollow(CVH.player.mesh.position);
      this.renderer.render(scene, camera);
      CVH.input.endFrame();
      return;
    }

    if (this.state === 'playing') {
      this._updatePlaying(dt);
    } else {
      // paused / busted / wasted / ending: the world holds its breath.
      CVH.world.updateVisuals(dt);
      CVH.vehicles.updateVisuals();
      CVH.fx.update(dt);
    }
    this.renderer.render(scene, camera);
    CVH.input.endFrame();
  },

  // The full simulation step. Also driven at a fixed step by the playtest.
  _updatePlaying: function (dt) {
    const scene = this.scene, camera = this.camera;
    const pl = CVH.player;

    // Global keys.
    if (CVH.input.hit('Escape') || CVH.input.hit('KeyP')) { this.pauseGame(); return; }
    if (CVH.input.hit('KeyM')) {
      CVH.audio.toggleMute();
      CVH.hud.syncMuteLabel();
    }
    if (CVH.input.hit('KeyF')) pl.tryEnterExit();
    if (CVH.input.hit('KeyE')) this._interact();

    CVH.world.update(dt, scene);
    pl.update(dt, camera);
    CVH.vehicles.update(dt);
    CVH.vehicles.updateVisuals();
    CVH.police.update(dt, scene);
    CVH.missions.update(dt, scene);
    pl.updatePeds(dt);
    CVH.fx.update(dt);
    this._collectChecks(dt);
    CVH.world.sunFollow(pl.mesh.position);
    CVH.hud.update(dt);
    this._updatePrompt();

    // Engine + siren beds.
    if (pl.inCar) CVH.audio.engine(CVH.clamp(pl.inCar.speed / pl.inCar.cfg.maxF, 0, 1), true);
    else CVH.audio.engine(0, false);

    if (CVH.police.bust >= 1 && this.state === 'playing') this.onBusted();
    else if (pl.health <= 0 && this.state === 'playing') this.onWasted();
  },

  // Fixed-step driver for the automated playtest: advances the simulation
  // by `seconds` of game time in 1/30 s steps, whatever the real frame rate.
  step: function (seconds) {
    if (this.state !== 'playing') return;
    const n = Math.max(1, Math.round(seconds / (1 / 30)));
    for (let i = 0; i < n; i++) {
      this._updatePlaying(1 / 30);
      if (this.state !== 'playing') break;
    }
  },

  _interact: function () {
    const pl = CVH.player;
    if (pl.inCar) return;
    const p = pl.mesh.position;
    // Food stands first: heal for cash.
    for (let i = 0; i < CVH.world.stands.length; i++) {
      const s = CVH.world.stands[i];
      if (CVH.dist2d(p.x, p.z, s.x, s.z) < 3.6) {
        if (pl.health >= pl.maxHealth) { CVH.hud.toast('You feel fine already.'); return; }
        if (CVH.game.cash < s.price) { CVH.hud.toast('Not enough cash for food.'); return; }
        CVH.game.cash -= s.price;
        pl.health = Math.min(pl.maxHealth, pl.health + s.heal);
        CVH.audio.pickup();
        CVH.hud.toast('Ate well. +' + s.heal + ' health for ' + CVH.fmtCash(s.price) + '.');
        return;
      }
    }
    CVH.missions.tryInteract(this.scene);
  },

  _updatePrompt: function () {
    const pl = CVH.player;
    if (pl.inCar) { CVH.hud.setPrompt(null); return; }
    const p = pl.mesh.position;
    for (let i = 0; i < CVH.world.stands.length; i++) {
      const s = CVH.world.stands[i];
      if (CVH.dist2d(p.x, p.z, s.x, s.z) < 3.6) {
        CVH.hud.setPrompt('E — eat (' + CVH.fmtCash(s.price) + ', +' + s.heal + ' health)');
        return;
      }
    }
    if (!CVH.missions.active && CVH.missions.jobIndex < CVH.missions.JOBS.length &&
        CVH.dist2d(p.x, p.z, CVH.missions.PORCH.x, CVH.missions.PORCH.z) < 4) {
      CVH.hud.setPrompt('E — talk to Marisol (job: ' + CVH.missions.JOBS[CVH.missions.jobIndex].name + ')');
      return;
    }
    const car = pl.nearestCar(2.2);
    if (car) { CVH.hud.setPrompt('F — ' + (car.driver === 'police' ? 'steal the cruiser' : 'enter vehicle')); return; }
    CVH.hud.setPrompt(null);
  },

  _collectChecks: function (dt) {
    const pl = CVH.player;
    const p = pl.mesh.position;
    // Cash packages.
    for (let i = 0; i < CVH.world.packages.length; i++) {
      const pk = CVH.world.packages[i];
      if (pk.taken) continue;
      if (CVH.dist2d(p.x, p.z, pk.x, pk.z) < 2) {
        pk.taken = true;
        pk.mesh.visible = false;
        CVH.game.packages.push(pk.id);
        CVH.game.cash += 150;
        CVH.game.earned += 150;
        CVH.audio.pickup();
        CVH.hud.toast('Cash package found — +$150 (' + CVH.game.packages.length + '/14)');
        this.saveGame();
      }
    }
    // Weapon pickups (on foot).
    if (!pl.inCar) {
      for (let i = 0; i < CVH.world.pickups.length; i++) {
        const pu = CVH.world.pickups[i];
        if (pu.taken) continue;
        if (CVH.dist2d(p.x, p.z, pu.x, pu.z) < 1.9) {
          pu.taken = true;
          pu.mesh.visible = false;
          pl.weapon = pu.kind;
          CVH.audio.pickup();
          CVH.hud.toast(pu.kind === 'smg' ? 'SMG acquired — hold click to fire.' : 'Pistol acquired — click to fire.');
          this.saveGame();
        }
      }
    }
    // Pay 'n Spray service.
    this.pnsCd -= dt;
    const pns = CVH.world.paynspray;
    if (pl.inCar && pns && this.pnsCd <= 0) {
      const cp = pl.inCar.mesh.position;
      const inside = cp.x > pns.minX && cp.x < pns.maxX && cp.z > pns.minZ && cp.z < pns.maxZ;
      if (inside && (CVH.police.heat > 0 || pl.inCar.health < 100)) {
        if (CVH.game.cash >= 100) {
          CVH.game.cash -= 100;
          pl.inCar.health = 100;
          CVH.police.forceReset();
          CVH.audio.cash();
          CVH.hud.toast("Pay 'n Spray — fresh paint, full repairs, no more heat. $100.");
          this.pnsCd = 3;
        } else {
          CVH.hud.toast("Pay 'n Spray needs $100.");
          this.pnsCd = 3;
        }
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => CVH.main.boot());
if (document.readyState !== 'loading') CVH.main.boot();
