// main.js — boot and orchestration: renderer (with the QA item 7 WebGL
// fallback), scene, the state machine (menu / playing / paused / over /
// ending / shot), save & load through the safe-storage wrapper, the
// third-person camera rig, the living title-screen cinematic (owner
// fix 2), pause handling (including pointer-lock loss, QA item 3), and
// the deterministic screenshot mode.
(function () {
  'use strict';

  var CVH = window.CVH = window.CVH || {};
  var THREE = window.THREE;

  var SAVE_KEY = 'costaVerdeHeat3DSaveV1';
  var params = new URLSearchParams(window.location.search);
  var SHOT = params.get('shot');
  CVH.seed = parseInt(params.get('seed') || '20261', 10) || 20261;

  CVH.time = 0;
  CVH.state = 'boot';
  CVH.stats = { earned: 0, packages: 0, jobs: 0 };
  CVH.debug = { lastArrowAngle: 0, arrowHeading: 0 };
  CVH.camYaw = 0;
  var camPitch = 0.34;
  var snapCam = true;
  var pendingRespawn = null;
  var lastSaveStamp = '';

  function showNoGl() {
    var n = document.getElementById('nogl');
    if (n) n.style.display = 'flex';
    var c = document.getElementById('game');
    if (c) c.style.display = 'none';
  }

  // ------------------------------------------------------------ save/load
  function saveGame() {
    var p = CVH.player;
    var data = {
      v: 1,
      cash: p.cash,
      earned: CVH.stats.earned,
      nextJob: CVH.missions.nextJob,
      jobsDone: CVH.missions.jobsDone,
      packages: CVH.world.packages.map(function (k) { return k.taken; }),
      hasPistol: p.hasPistol, hasSmg: p.hasSmg, weapon: p.weapon,
      x: p.x, z: p.z, heading: p.heading
    };
    CVH.store.set(SAVE_KEY, JSON.stringify(data));   // QA item 1 wrapper
  }
  function loadSave() {
    var raw = CVH.store.get(SAVE_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  CVH.saveGame = saveGame;

  function resetCollectables() {
    var i;
    for (i = 0; i < CVH.world.packages.length; i++) {
      CVH.world.packages[i].taken = false;
      CVH.world.packages[i].mesh.visible = true;
    }
    for (i = 0; i < CVH.world.pickups.length; i++) {
      CVH.world.pickups[i].taken = false;
      CVH.world.pickups[i].mesh.visible = true;
    }
  }

  function startRun(fromSave) {
    var p = CVH.player;
    CVH.missions.resetStory();              // QA item 5 cleanup path
    CVH.police.clearHeat();
    resetCollectables();
    p.weapon = 'fist'; p.hasPistol = false; p.hasSmg = false;
    p.cash = 120;
    CVH.stats.earned = 0; CVH.stats.packages = 0; CVH.stats.jobs = 0;
    p.reset(CVH.points.spawn.x, CVH.points.spawn.z, Math.PI);
    var d = fromSave ? loadSave() : null;
    if (d) {
      p.cash = d.cash | 0;
      CVH.stats.earned = d.earned | 0;
      CVH.stats.jobs = d.jobsDone | 0;
      CVH.missions.nextJob = d.nextJob | 0;
      CVH.missions.jobsDone = d.jobsDone | 0;
      if (d.packages) {
        for (var i = 0; i < d.packages.length && i < CVH.world.packages.length; i++) {
          if (d.packages[i]) {
            CVH.world.packages[i].taken = true;
            CVH.world.packages[i].mesh.visible = false;
            CVH.stats.packages++;
          }
        }
      }
      p.hasPistol = !!d.hasPistol; p.hasSmg = !!d.hasSmg;
      p.weapon = d.weapon || 'fist';
      if (typeof d.x === 'number') p.reset(d.x, d.z, d.heading || 0);
      CVH.hud.toast('Welcome back to Costa Verde.', 2.2);
    } else {
      CVH.hud.toast('Welcome to Costa Verde. Marisol is waiting at the safehouse.', 3.2);
    }
    CVH.state = 'playing';
    CVH.hud.showHud();
    snapCam = true;
  }

  // ------------------------------------------------------------ downfall
  CVH.onPlayerDown = function (kind) {
    if (CVH.state !== 'playing') return;
    var p = CVH.player;
    if (p.car) {
      p.car.input.throttle = 0;
      p.car.input.brake = true;
      if (p.car.driver === 'player') p.car.driver = 'parked';
      p.car = null;
      p.mesh.visible = true;
    }
    // parked cruisers stop too while the over-screen is up
    for (var i = 0; i < CVH.police.force.length; i++) {
      CVH.police.force[i].input.throttle = 0;
      CVH.police.force[i].input.brake = true;
    }
    CVH.missions.cancel();                  // QA item 5 cleanup path
    CVH.audio.engine(false, 0);
    CVH.audio.siren(false, 0);
    CVH.state = 'over';
    if (kind === 'busted') {
      var fine = 100 + CVH.police.stars * 40;
      p.cash = Math.max(0, p.cash - fine);
      pendingRespawn = CVH.points.police;
      CVH.police.clearHeat();
      CVH.audio.busted();
      CVH.hud.showOver('busted', 'The Costa Verde PD ran you down. Fine: ' + CVH.fmtCash(fine) + '. You are released outside the station — poorer, wiser, still free.');
    } else {
      var fee = Math.min(p.cash, 100);
      p.cash -= fee;
      pendingRespawn = CVH.points.hospital;
      CVH.police.clearHeat();
      CVH.hud.showOver('wasted', 'You wake up at the hospital smelling of antiseptic and salt air. Bill: ' + CVH.fmtCash(fee) + '. Costa Verde is not done with you yet.');
    }
  };

  CVH.onStoryComplete = function () {
    if (CVH.player.car) CVH.player.exitCar();
    CVH.state = 'ending';
    saveGame();
    CVH.hud.showEnding({
      earned: CVH.stats.earned,
      jobs: CVH.stats.jobs,
      packages: CVH.stats.packages
    });
    CVH.audio.mission();
  };

  // -------------------------------------------------------------- pause
  function pauseGame() {
    if (CVH.state !== 'playing') return;
    CVH.state = 'paused';
    CVH.hud.showPause(true);
    CVH.input.exitLock();
    CVH.audio.engine(false, 0);
  }
  function resumeGame() {
    if (CVH.state !== 'paused') return;
    CVH.state = 'playing';
    CVH.hud.showPause(false);
  }

  // -------------------------------------------------------------- actions
  function wireActions() {
    CVH.hud.onAction = function (name) {
      if (name === 'new') startRun(false);
      else if (name === 'continue') startRun(true);
      else if (name === 'resume') resumeGame();
      else if (name === 'save') { saveGame(); CVH.hud.toast('Game saved.', 1.6); }
      else if (name === 'restart') {
        CVH.missions.resetStory();
        CVH.police.clearHeat();
        if (CVH.player.car) CVH.player.exitCar();
        CVH.player.reset(CVH.points.spawn.x, CVH.points.spawn.z, Math.PI);
        resumeGame();
        CVH.hud.toast('Story restarted. Marisol has work for you.', 2.2);
      } else if (name === 'sound') {
        CVH.audio.toggleMute();
        CVH.hud.syncSoundLabel();          // QA item 6
      } else if (name === 'over') {
        CVH.player.reset(pendingRespawn.x, pendingRespawn.z, Math.PI);
        CVH.hud.hideOver();
        CVH.state = 'playing';
        snapCam = true;
      } else if (name === 'roam') {
        CVH.hud.hideEnding();
        CVH.hud.showHud();
        CVH.state = 'playing';
        snapCam = true;
      } else if (name === 'endnew') {
        CVH.hud.hideEnding();
        startRun(false);
      }
    };
    // QA item 3: Esc under pointer lock never reaches keydown — the
    // browser just drops the lock. Treat that as the pause key.
    CVH.input.onLockLost = function () {
      if (CVH.state === 'playing') pauseGame();
    };
  }

  // -------------------------------------------------------------- camera
  var camTargetPos = null;
  function updateCamera(dt) {
    var cam = CVH.camera;
    var p = CVH.player;
    CVH.camYaw -= CVH.input.orbitDX * 0.0052;
    camPitch = CVH.clamp(camPitch + CVH.input.orbitDY * 0.0042, -0.06, 1.0);
    var dist = p.car ? 8.8 : 6.4;
    var tx = p.x, ty = 1.7, tz = p.z;
    var ch = Math.cos(camPitch), sh = Math.sin(camPitch);
    var dx = tx + Math.sin(CVH.camYaw) * ch * dist;
    var dz = tz + Math.cos(CVH.camYaw) * ch * dist;
    var dy = ty + sh * dist;
    if (dy < 0.7) dy = 0.7;
    if (!camTargetPos) camTargetPos = new THREE.Vector3(dx, dy, dz);
    if (snapCam) {
      camTargetPos.set(dx, dy, dz);
      snapCam = false;
    } else {
      var k = 1 - Math.exp(-dt * 11);
      camTargetPos.x += (dx - camTargetPos.x) * k;
      camTargetPos.y += (dy - camTargetPos.y) * k;
      camTargetPos.z += (dz - camTargetPos.z) * k;
    }
    var shake = CVH.fx.shakeValue();
    cam.position.set(
      camTargetPos.x + (Math.random() - 0.5) * shake * 0.35,
      camTargetPos.y + (Math.random() - 0.5) * shake * 0.3,
      camTargetPos.z + (Math.random() - 0.5) * shake * 0.35
    );
    cam.lookAt(tx, ty, tz);
    var targetFov = 58 + (p.car ? CVH.clamp(Math.abs(p.car.speed) / p.car.topSpeed, 0, 1) * 8 : 0);
    if (Math.abs(cam.fov - targetFov) > 0.1) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 5);
      cam.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------ title cinematic
  // Owner fix 2: the menu floats over the LIVE city — traffic rolls,
  // pedestrians stroll, and the camera drifts in a slow cinematic orbit
  // at golden hour while the player reads the panel.
  var MENU_FOCUS = { x: 10, z: -10 };
  var menuAngle = 0.6;
  function updateMenu(dt) {
    CVH.dayT = 0.7; // hold golden hour behind the menu
    CVH.world.update(dt, MENU_FOCUS);
    CVH.vehicles.update(dt, MENU_FOCUS);
    CVH.player.updateCrowd(dt);
    CVH.fx.update(dt, CVH.scene);
    menuAngle += dt * 0.045;
    var r = 118 + Math.sin(CVH.time * 0.07) * 16;
    var h = 42 + Math.sin(CVH.time * 0.11) * 8;
    CVH.camera.position.set(
      MENU_FOCUS.x + Math.sin(menuAngle) * r,
      h,
      MENU_FOCUS.z + Math.cos(menuAngle) * r
    );
    CVH.camera.lookAt(MENU_FOCUS.x, 4, MENU_FOCUS.z);
    if (CVH.camera.fov !== 55) { CVH.camera.fov = 55; CVH.camera.updateProjectionMatrix(); }
  }
  CVH.debug.menuAngle = function () { return menuAngle; };

  // ------------------------------------------------------------- playing
  function updatePlaying(dt) {
    var p = CVH.player;
    p.update(dt);
    CVH.vehicles.update(dt, p);
    if (p.car) { // fix 6: logical position rides with the car
      p.x = p.car.pos.x;
      p.z = p.car.pos.z;
      p.heading = p.car.yaw;
    }
    CVH.police.update(dt);
    CVH.missions.update(dt);
    p.updateCrowd(dt);
    CVH.world.update(dt, p);
    CVH.fx.update(dt, CVH.scene);
    updateCamera(dt);
    CVH.hud.update();
    // autosave when the story moves forward
    var stamp = CVH.stats.jobs + ':' + CVH.stats.packages;
    if (stamp !== lastSaveStamp) {
      lastSaveStamp = stamp;
      if (CVH.state === 'playing') saveGame();
    }
  }

  function updateAmbient(dt) {
    // city life behind the busted / wasted / ending panels
    CVH.world.update(dt, CVH.player);
    CVH.vehicles.update(dt, CVH.player);
    CVH.player.updateCrowd(dt);
    CVH.fx.update(dt, CVH.scene);
  }

  CVH.debug.step = function (seconds) {
    var n = Math.max(1, Math.round(seconds / (1 / 60)));
    for (var i = 0; i < n; i++) {
      CVH.time += 1 / 60;
      if (CVH.state === 'playing') updatePlaying(1 / 60);
      else if (CVH.state === 'menu') updateMenu(1 / 60);
      CVH.input.postFrame();
    }
  };
  CVH.debug.startNew = function () { startRun(false); };
  CVH.debug.pauseGame = pauseGame;

  // ---------------------------------------------------------------- boot
  function boot() {
    if (!THREE) { showNoGl(); return; }
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      showNoGl();                        // QA item 7
      return;
    }
    CVH.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x9fd4e8, 190, 460);
    CVH.scene = scene;
    var camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.set(60, 42, 90);
    CVH.camera = camera;

    CVH.world.build(scene);
    CVH.vehicles.spawnInitial();
    CVH.player.buildCrowd();
    CVH.player.tagCarHitMeshes();
    CVH.missions.build(scene);
    CVH.fx.init(scene);
    CVH.hud.init();
    CVH.input.attach(renderer.domElement);
    wireActions();

    CVH.player.reset(CVH.points.spawn.x, CVH.points.spawn.z, Math.PI);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    window.addEventListener('keydown', function () { CVH.audio.unlock(); }, { once: true });

    if (SHOT) { setupShot(renderer); return; }

    CVH.state = 'menu';
    CVH.hud.showMenu(!!loadSave());
    runLoop(renderer);
  }

  // ------------------------------------------------------------- shot mode
  function setupShot(renderer) {
    CVH.state = 'shot';
    CVH.hud.showHud();
    var spec = CVH.shots.setup(SHOT);
    var focus = { x: CVH.player.x, z: CVH.player.z };
    for (var i = 0; i < 40; i++) {
      CVH.time += 1 / 30;
      CVH.world.update(1 / 30, focus);
      CVH.vehicles.update(0.001, focus);
      CVH.missions.update(1 / 30);
      CVH.player.updateCrowd(1 / 30);
      CVH.fx.update(1 / 30, CVH.scene);
      CVH.hud.update();
    }
    CVH.camera.position.set(spec.cam[0], spec.cam[1], spec.cam[2]);
    CVH.camera.lookAt(spec.look[0], spec.look[1], spec.look[2]);
    var frames = 0;
    function renderShot() {
      renderer.render(CVH.scene, CVH.camera);
      frames++;
      if (frames >= 3) { window.__shotReady = true; return; }
      requestAnimationFrame(renderShot);
    }
    requestAnimationFrame(renderShot);
  }

  // ------------------------------------------------------------- main loop
  function runLoop(renderer) {
    var last = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (dt <= 0) dt = 0.001;
      CVH.time += dt;

      // global keys first: Esc/P pauses, M mutes (QA item 6 sync)
      if (CVH.input.hit('Escape', 'KeyP')) {
        if (CVH.state === 'playing') pauseGame();
        else if (CVH.state === 'paused') resumeGame();
      }
      if (CVH.input.hit('KeyM')) {
        CVH.audio.toggleMute();
        CVH.hud.syncSoundLabel();
      }

      if (CVH.state === 'playing') updatePlaying(dt);
      else if (CVH.state === 'menu') updateMenu(dt);
      else if (CVH.state === 'over' || CVH.state === 'ending') updateAmbient(dt);

      CVH.input.postFrame();
      renderer.render(CVH.scene, CVH.camera);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
