// main.js — boot, state machine (menu / playing / paused / ending),
// cameras (orbit on foot, chase while driving, cinematic orbit in the menu),
// busted/wasted flow, save & continue, and the CVH.debug test hooks.
(function () {
  'use strict';
  var U = CVH.util;
  var W = CVH.world;

  var SAVE_KEY = 'costaVerdeHeat3DSaveV1';
  var renderer = null, camera = null;
  var state = 'menu';
  var camYaw = Math.PI, camPitch = 0.32;
  var menuAngle = 0.6;
  var started = false;

  function $(id) { return document.getElementById(id); }

  function show(id, disp) { var e = $(id); if (e) e.style.display = disp; }

  function setState(s) {
    state = s;
    show('menu', s === 'menu' ? 'flex' : 'none');
    show('pause', s === 'paused' ? 'flex' : 'none');
    show('ending', s === 'ending' ? 'flex' : 'none');
    show('hud', (s === 'playing' || s === 'paused') ? 'block' : 'none');
  }

  function boot() {
    CVH.hud.grab();
    var container = $('game');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      show('nogl', 'flex');
      show('menu', 'none');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    W.build();
    CVH.vehicles.initTraffic(W.PLACES.porch.x, W.PLACES.porch.z);
    CVH.peds.init();
    CVH.player.build();
    CVH.missions.buildPickups();
    CVH.hud.syncSoundLabel();

    // ---- UI wiring ----
    $('btnNewGame').addEventListener('click', function () { CVH.audio.click(); newGame(); });
    $('btnContinue').addEventListener('click', function () { CVH.audio.click(); continueGame(); });
    $('btnResume').addEventListener('click', function () { CVH.audio.click(); resume(); });
    $('btnSave').addEventListener('click', function () { CVH.audio.click(); saveGame(); CVH.hud.toast('Game saved'); });
    $('btnRestart').addEventListener('click', function () { CVH.audio.click(); newGame(); });
    $('btnQuit').addEventListener('click', function () { CVH.audio.click(); setState('menu'); });
    $('btnEnding').addEventListener('click', function () { CVH.audio.click(); setState('playing'); });
    document.querySelectorAll('.btnSound').forEach(function (b) {
      b.addEventListener('click', function () { CVH.audio.toggleMute(); });
    });
    renderer.domElement.addEventListener('click', function () {
      if (state === 'playing' && !CVH.input.locked) CVH.input.lock(CVH.renderer.domElement);
    });
    refreshContinue();

    setState('menu');
    started = true;
    requestAnimationFrame(frame);
    if (CVH.shots) CVH.shots.init();
  }

  function refreshContinue() {
    var has = !!CVH.store.get(SAVE_KEY);
    var b = $('btnContinue');
    if (b) { b.disabled = !has; b.style.opacity = has ? '1' : '0.45'; }
  }

  function resetPlayer() {
    var P = CVH.player.data;
    if (P.driving) CVH.player.exitCar();
    P.x = W.PLACES.porch.x; P.z = W.PLACES.porch.z - 8;
    P.heading = Math.PI;
    P.hp = P.maxHp; P.cash = 120; P.weapon = 'fist'; P.dead = false;
    camYaw = Math.PI;
  }

  function newGame() {
    CVH.store.remove(SAVE_KEY);
    CVH.missions.reset();
    CVH.police.setHeat(0);
    resetPlayer();
    setState('playing');
    CVH.hud.toast('Welcome to Costa Verde. Marisol has work for you.');
  }

  function saveGame() {
    var P = CVH.player.data;
    var data = {
      cash: P.cash, hp: P.hp, weapon: P.weapon,
      jobIndex: CVH.missions.jobIndex, x: P.x, z: P.z,
      packages: CVH.missions.packagesTakenCount()
    };
    CVH.store.set(SAVE_KEY, JSON.stringify(data));
    refreshContinue();
  }

  function continueGame() {
    var raw = CVH.store.get(SAVE_KEY);
    if (!raw) return;
    var data = null;
    try { data = JSON.parse(raw); } catch (e) { data = null; }
    if (!data) return;
    CVH.missions.reset();
    CVH.missions.setJobIndex(data.jobIndex || 0);
    var P = CVH.player.data;
    if (P.driving) CVH.player.exitCar();
    P.cash = data.cash || 0; P.hp = data.hp || 100; P.weapon = data.weapon || 'fist';
    P.x = data.x || W.PLACES.porch.x; P.z = data.z || W.PLACES.porch.z - 8;
    P.dead = false;
    CVH.police.setHeat(0);
    setState('playing');
    CVH.hud.toast('Welcome back to Costa Verde.');
  }

  function pauseGame() { if (state === 'playing') setState('paused'); }
  function resume() { if (state === 'paused') setState('playing'); }

  CVH.onLockLost = function () { if (state === 'playing') pauseGame(); };
  CVH.onBusted = function () {
    var P = CVH.player.data;
    CVH.missions.cancel(); // single cleanup path
    var fine = Math.floor(P.cash * 0.15);
    P.cash -= fine;
    CVH.police.setHeat(0);
    if (P.driving) CVH.player.exitCar();
    P.x = W.PLACES.porch.x; P.z = W.PLACES.porch.z - 8;
    P.hp = Math.max(60, P.hp);
    CVH.audio.fail();
    CVH.hud.toast('BUSTED! The cops took $' + fine + '. Marisol is not impressed.');
  };
  CVH.onWasted = function () {
    var P = CVH.player.data;
    CVH.missions.cancel(); // single cleanup path
    CVH.police.setHeat(Math.floor(CVH.police.heat / 2));
    if (P.driving) CVH.player.exitCar();
    P.x = W.PLACES.hospital.x; P.z = W.PLACES.hospital.z + 4;
    P.hp = 100; P.dead = false;
    P.cash = Math.max(0, P.cash - 50);
    CVH.hud.toast('WASTED! Hospital bill: $50.');
  };
  CVH.onEnding = function () {
    setState('ending');
    CVH.audio.success();
  };

  // ---------------- simulation tick ----------------
  function tick(dt) {
    var P = CVH.player.data;
    if (state === 'menu') {
      // living title screen: the city keeps simulating behind the menu
      W.setDayT(0.86); // golden hour, held
      menuAngle += dt * 0.045;
      var cx = Math.cos(menuAngle) * 118;
      var cz = Math.sin(menuAngle) * 118;
      camera.position.set(cx, 42, cz);
      camera.lookAt(0, 8, 0);
      CVH.vehicles.updateTraffic(dt, 0, 0);
      CVH.peds.update(dt, 0, 0, CVH.threat);
      if (CVH.threat.t > 0) { CVH.threat.t -= dt; if (CVH.threat.t <= 0) CVH.threat.active = false; }
      return;
    }
    if (state !== 'playing') return;

    W.advanceDay(dt);
    // mouse look
    if (CVH.input.locked) {
      var md = CVH.input.consumeMouse();
      camYaw -= md.dx * 0.0031;
      camPitch = U.clamp(camPitch + md.dy * 0.0026, 0.06, 1.1);
    }
    if (CVH.input.pressed('KeyM')) CVH.audio.toggleMute();
    if (CVH.input.pressed('KeyP')) { pauseGame(); CVH.input.endFrame(); return; }

    CVH.player.update(dt, camYaw);
    CVH.vehicles.updateTraffic(dt, P.x, P.z);
    CVH.peds.update(dt, P.x, P.z, CVH.threat);
    if (CVH.threat.t > 0) { CVH.threat.t -= dt; if (CVH.threat.t <= 0) CVH.threat.active = false; }
    CVH.police.update(dt, P);
    CVH.missions.update(dt);
    CVH.fx.update(dt);
    updateCamera(dt, P);
    CVH.hud.update();
    CVH.input.endFrame();
  }

  function updateCamera(dt, P) {
    if (P.driving) {
      var car = P.driving;
      var targetYaw = car.heading;
      var dh = U.wrapAngle(targetYaw - camYaw);
      camYaw += dh * Math.min(1, dt * 4.5);
      var f = U.fwd(camYaw);
      var dist = 10.5, hgt = 4.2;
      camera.position.set(car.x - f.x * dist, hgt, car.z - f.z * dist);
      camera.lookAt(car.x + f.x * 6, 1.6, car.z + f.z * 6);
    } else {
      var f2 = U.fwd(camYaw);
      var d2 = 7.6;
      var y = 1.7 + Math.sin(camPitch) * 4.4;
      camera.position.set(P.x - f2.x * d2 * Math.cos(camPitch), y, P.z - f2.z * d2 * Math.cos(camPitch));
      camera.lookAt(P.x + f2.x * 4, 1.7, P.z + f2.z * 4);
      // keep the camera out of buildings
      if (W.hitsBuilding(camera.position.x, camera.position.z, 0.4)) camera.position.y = 16;
    }
  }

  var lastTs = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!renderer) return;
    var dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    if (!window.__manualStep) tick(dt);
    else if (state === 'playing') { updateCamera(0.016, CVH.player.data); CVH.hud.update(); }
    renderer.render(W.scene, camera);
  }

  // ---------------- debug hooks (used by the automated playtest) ----------------
  CVH.debug = CVH.debug || {};
  CVH.debug.step = function (dt) { tick(dt); if (renderer) renderer.render(W.scene, camera); };
  CVH.debug.getState = function () { return state; };
  CVH.debug.setState = function (s) { setState(s); };
  CVH.debug.newGame = newGame;
  CVH.debug.pauseGame = pauseGame;
  CVH.debug.setCamYaw = function (y) { camYaw = y; };
  CVH.debug.getCamYaw = function () { return camYaw; };
  CVH.debug.menuCamPos = function () { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; };
  CVH.debug.teleport = function (x, z) {
    var P = CVH.player.data;
    if (P.driving) { P.driving.x = x; P.driving.z = z; CVH.vehicles.syncMesh(P.driving); P.x = x; P.z = z; }
    else { P.x = x; P.z = z; }
  };
  CVH.debug.setHeading = function (h) {
    var P = CVH.player.data;
    P.heading = h;
    if (P.driving) { P.driving.heading = h; CVH.vehicles.syncMesh(P.driving); }
  };
  CVH.debug.saveGame = saveGame;
  CVH.renderer = null;

  document.addEventListener('DOMContentLoaded', function () {
    boot();
    CVH.renderer = renderer;
    CVH.debug.camera = camera;
  });
  CVH.getState = function () { return state; };
  Object.defineProperty(CVH, 'state', { get: function () { return state; } });
})();
