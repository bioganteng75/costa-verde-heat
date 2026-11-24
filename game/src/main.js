// main.js — boot (with the WebGL fallback), state machine, game loop,
// menu cinematic, save/load, BUSTED / WASTED / ending flow, debug hooks.
(function () {
  'use strict';
  var CVH = window.CVH;
  var U = CVH.util;

  var SAVE_KEY = 'costaVerdeHeat3DSaveV1';

  CVH.state = 'menu'; // menu | playing | paused | ending | busted | wasted
  var renderer = null;
  var scene = null;
  var camera = null;
  var overlayTimer = 0;
  var menuAngle = 0.6;
  var started = false;

  function $(id) { return document.getElementById(id); }

  // ---------------------------------------------------------------
  // Save / load — all through CVH.store (the safe wrapper).
  // ---------------------------------------------------------------
  function saveGame() {
    var data = {
      cash: CVH.player.cash,
      weapon: CVH.player.weapon,
      ammoPistol: CVH.player.ammoPistol,
      ammoSmg: CVH.player.ammoSmg,
      missions: CVH.missions.saveData()
    };
    CVH.store.set(SAVE_KEY, JSON.stringify(data));
    CVH.hud.toast('Game saved');
  }

  function loadSave() {
    var raw = CVH.store.get(SAVE_KEY);
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      CVH.player.cash = d.cash || 0;
      CVH.player.weapon = d.weapon || 'fist';
      CVH.player.ammoPistol = d.ammoPistol || 0;
      CVH.player.ammoSmg = d.ammoSmg || 0;
      CVH.missions.loadData(d.missions);
      return true;
    } catch (e) {
      return false;
    }
  }

  function hasSave() { return !!CVH.store.get(SAVE_KEY); }

  // ---------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------
  function show(id, display) {
    var n = $(id);
    if (n) n.style.display = display;
  }

  function enterPlaying() {
    show('menu', 'none');
    show('pause', 'none');
    show('ending', 'none');
    show('hud', 'block');
    CVH.state = 'playing';
    CVH.world.holdDay = false;
    CVH.input.requestLock(renderer.domElement);
  }

  function newGame() {
    CVH.audio.init(); CVH.audio.resume();
    CVH.missions.resetProgress();
    CVH.player.exitCar(true);
    CVH.player.reset();
    CVH.police.clearAll();
    CVH.store.remove(SAVE_KEY);
    enterPlaying();
    CVH.hud.toast('Welcome to Costa Verde. See Marisol at the porch for work.');
  }

  function continueGame() {
    CVH.audio.init(); CVH.audio.resume();
    CVH.missions.cancel();
    CVH.player.exitCar(true);
    CVH.player.reset();
    CVH.police.clearAll();
    if (loadSave()) CVH.hud.toast('Welcome back to Costa Verde.');
    enterPlaying();
  }

  function pauseGame() {
    if (CVH.state !== 'playing') return;
    CVH.state = 'paused';
    show('pause', 'flex');
    CVH.input.exitLock();
  }

  function resumeGame() {
    if (CVH.state !== 'paused') return;
    show('pause', 'none');
    CVH.state = 'playing';
    CVH.audio.resume();
    CVH.input.requestLock(renderer.domElement);
  }

  function quitToMenu() {
    show('pause', 'none');
    show('hud', 'none');
    show('menu', 'flex');
    CVH.state = 'menu';
    CVH.world.holdDay = true;
    CVH.world.setDayT(0.86);
    refreshContinue();
    CVH.input.exitLock();
  }

  function refreshContinue() {
    var b = $('btnContinue');
    if (b) b.disabled = !hasSave();
  }

  function busted() {
    CVH.state = 'busted';
    overlayTimer = 2.4;
    show('busted', 'flex');
    CVH.player.cash = Math.floor(CVH.player.cash * 0.9);
    if (CVH.audio) CVH.audio.fail();
  }

  function wasted() {
    CVH.state = 'wasted';
    overlayTimer = 2.4;
    show('wasted', 'flex');
    CVH.player.cash = Math.floor(CVH.player.cash * 0.9);
    if (CVH.audio) CVH.audio.fail();
  }

  function finishOverlay() {
    show('busted', 'none');
    show('wasted', 'none');
    var at = CVH.state === 'busted' ? CVH.world.policeStation : CVH.world.hospital;
    CVH.missions.cancel();            // the single cleanup path
    CVH.player.respawnAt(at.x, at.z);
    CVH.police.clearAll();
    CVH.state = 'playing';
  }

  CVH.onEnding = function () {
    CVH.state = 'ending';
    var s = $('endingStats');
    if (s) {
      s.textContent = 'Cash $' + CVH.player.cash + ' · Packages ' + CVH.missions.packagesTaken + '/14 · All 6 jobs done';
    }
    show('ending', 'flex');
    CVH.input.exitLock();
  };

  // ---------------------------------------------------------------
  // Simulation step (the rAF loop calls this; tests call it too)
  // ---------------------------------------------------------------
  CVH.step = function (dt) {
    var world = CVH.world;
    if (CVH.state === 'menu') {
      // Living title screen: the city keeps simulating behind the menu
      // while a cinematic camera orbits it at golden hour.
      world.holdDay = true;
      menuAngle += dt * 0.045;
      var r = 118, h = 42;
      camera.position.set(Math.cos(menuAngle) * r, h, Math.sin(menuAngle) * r);
      camera.lookAt(0, 6, 0);
      CVH.vehicles.updateTraffic(dt, { x: 0, z: 0 });
      world.updatePeds(dt, { x: 0, z: 40 }, false);
      CVH.fx.update(dt);
      return;
    }
    if (CVH.state === 'busted' || CVH.state === 'wasted') {
      overlayTimer -= dt;
      if (overlayTimer <= 0) finishOverlay();
      return;
    }
    if (CVH.state !== 'playing') return;

    world.advanceDay(dt);
    CVH.player.update(dt);
    CVH.vehicles.updateTraffic(dt, CVH.player.pos());
    CVH.police.update(dt, CVH.player);
    CVH.missions.update(dt);
    var danger = CVH.input.firing || CVH.police.stars() >= 2;
    world.updatePeds(dt, CVH.player.pos(), danger);
    CVH.fx.update(dt);
    CVH.player.updateCamera(camera, dt);
    CVH.hud.update();

    if (CVH.police.bust >= 1) busted();
    else if (CVH.player.dead) wasted();
  };

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  function boot() {
    var seed = 1;
    try {
      var s = new URLSearchParams(window.location.search).get('seed');
      if (s) seed = parseInt(s, 10) || 1;
    } catch (e) { /* default seed */ }

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      show('nogl', 'flex');
      return;
    }
    if (!renderer) { show('nogl', 'flex'); return; }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    $('game').appendChild(renderer.domElement);
    CVH.renderer = renderer;

    scene = new THREE.Scene();
    CVH.scene = scene;
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(0, 42, 118);
    camera.lookAt(0, 6, 0);
    CVH.camera = camera;

    CVH.world.build(scene, seed);
    CVH.world.holdDay = true;
    CVH.world.setDayT(0.86); // golden hour behind the menu
    CVH.player.build(scene);
    CVH.vehicles.seedCity(scene);
    CVH.missions.init(scene);
    CVH.hud.init();
    CVH.input.init(renderer.domElement);

    CVH.input.onLockLost = function () {
      if (CVH.state === 'playing') pauseGame();
    };
    CVH.input.onPauseKey = function () {
      if (CVH.state === 'playing') pauseGame();
      else if (CVH.state === 'paused') resumeGame();
    };
    CVH.input.onMuteKey = function () {
      CVH.audio.init();
      CVH.audio.toggleMute();
    };
    CVH.input.onInteractKey = function () {
      if (CVH.state === 'playing') CVH.player.tryInteract();
    };

    $('btnNewGame').addEventListener('click', newGame);
    $('btnContinue').addEventListener('click', continueGame);
    $('btnResume').addEventListener('click', resumeGame);
    $('btnSave').addEventListener('click', function () { saveGame(); });
    $('btnRestart').addEventListener('click', function () {
      show('pause', 'none');
      newGame();
    });
    $('btnQuit').addEventListener('click', quitToMenu);
    $('btnSound').addEventListener('click', function () {
      CVH.audio.init();
      CVH.audio.toggleMute();
    });
    $('btnFreeRoam').addEventListener('click', function () {
      show('ending', 'none');
      CVH.state = 'playing';
      CVH.hud.toast('Marisol: "Costa Verde is yours now. Free roam."');
      CVH.input.requestLock(renderer.domElement);
    });
    renderer.domElement.addEventListener('click', function () {
      CVH.audio.init(); CVH.audio.resume();
      if (CVH.state === 'playing' && !CVH.input.locked) CVH.input.requestLock(renderer.domElement);
    });

    refreshContinue();
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    var shotApplied = CVH.shots && CVH.shots.setup();
    if (shotApplied) show('hud', 'block');

    started = true;
    var last = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!CVH.debug.manual) CVH.step(dt);
      if (CVH.shots) CVH.shots.update();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------
  // Extra debug hooks for the playtest
  // ---------------------------------------------------------------
  CVH.debug.step = function (dt) { CVH.step(dt); };
  CVH.debug.setHeading = function (h) {
    CVH.player.heading = h;
    CVH.player.camYaw = h;
    if (CVH.player.mesh) CVH.player.mesh.rotation.y = h;
  };
  CVH.debug.teleport = function (x, z) {
    var p = CVH.player;
    if (p.driving && p.car) {
      p.car.x = x; p.car.z = z;
      CVH.vehicles.syncMesh(p.car);
      p.x = x; p.z = z;
    } else {
      p.x = x; p.z = z;
      if (p.mesh) p.mesh.position.set(x, CVH.world.groundY(x, z), z);
    }
  };
  CVH.debug.cameraPos = function () {
    if (!camera) return { x: 0, y: 0, z: 0 };
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  };
  CVH.debug.auditObjectives = function () { return CVH.world.auditObjectives(); };
  CVH.debug.startPlaying = function () { newGame(); };
  CVH.debug.pauseGame = function () { pauseGame(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
