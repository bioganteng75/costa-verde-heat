// Costa Verde Heat — boot, state machine, cameras, save/load, and the
// busted / wasted / ending flows. States: menu (living title screen over the
// simulated city), playing, paused, ending.
(function () {
  const SAVE_KEY = 'costaVerdeHeat3DSaveV1';

  let renderer = null, scene = null, camera = null;
  let state = 'menu';
  let dayT = 0.86;
  let menuAngle = 0.6;
  let lastTs = 0;
  let saveTick = 0;

  const game = {
    get state() { return state; },
    get dayT() { return dayT; },
    set dayT(v) { dayT = v; },
    setState: setState,
    newGame: newGame,
    continueGame: continueGame,
    hasSave: hasSave,
    save: save
  };
  CVH.game = game;

  function el(id) { return document.getElementById(id); }

  function hasSave() { return !!CVH.store.get(SAVE_KEY, null); }

  function save() {
    const p = CVH.player;
    CVH.store.setJSON(SAVE_KEY, {
      cash: Math.floor(p.cash),
      jobIndex: CVH.missions.jobIndex,
      packages: CVH.missions.packagesFound,
      weapon: p.weapon,
      ammo: p.ammo,
      pos: { x: Math.round(p.pos.x), z: Math.round(p.pos.z) }
    });
  }

  function newGame() {
    CVH.missions.resetStory();
    CVH.police.reset();
    const p = CVH.player;
    p.cash = 150;
    p.weapon = null;
    p.ammo = { pistol: 0, smg: 0 };
    p.reset(CVH.world.points.spawn);
    dayT = 0.3;
    save();
  }

  function continueGame() {
    const data = CVH.store.getJSON(SAVE_KEY, null);
    const p = CVH.player;
    CVH.missions.resetStory();
    CVH.police.reset();
    p.reset(CVH.world.points.spawn);
    if (data) {
      p.cash = data.cash || 0;
      p.weapon = data.weapon || null;
      p.ammo = data.ammo || { pistol: 0, smg: 0 };
      CVH.missions.applySave(data);
      if (data.pos) CVH.debug.teleport(data.pos.x, data.pos.z);
    }
  }

  function setState(next) {
    state = next;
    el('titleScreen').style.display = next === 'menu' ? 'flex' : 'none';
    el('pauseMenu').style.display = next === 'paused' ? 'flex' : 'none';
    el('endingScreen').style.display = next === 'ending' ? 'flex' : 'none';
    el('hud').style.visibility = (next === 'playing' || next === 'paused') ? 'visible' : 'hidden';
    if (next === 'menu') dayT = 0.86; // title screen lives at golden hour
  }

  function startPlay(fresh) {
    CVH.audio.ensure();
    if (fresh) newGame(); else continueGame();
    setState('playing');
    CVH.input.lock(renderer.domElement);
  }

  function busted() {
    const p = CVH.player;
    const fine = Math.min(p.cash, 150);
    p.cash -= fine;
    CVH.audio.bustedJingle();
    CVH.missions.cancel();
    CVH.police.reset();
    p.reset(CVH.world.points.policeStation);
    CVH.hud.banner('BUSTED', 'The C.V.P.D. takes $' + fine + ' and your afternoon.');
    save();
  }

  function wasted() {
    const p = CVH.player;
    const bill = Math.min(p.cash, 100);
    p.cash -= bill;
    CVH.audio.bustedJingle();
    CVH.missions.cancel();
    CVH.police.reset();
    p.reset(CVH.world.points.hospital);
    CVH.hud.banner('WASTED', 'St. Verde General patches you up for $' + bill + '.');
    save();
  }

  // ------------------------------------------------------------ simulation
  function updateSim(dt) {
    if (state === 'menu') {
      // the city lives behind the title: traffic and citizens keep moving
      CVH.vehicles.update(dt);
      CVH.peds.update(dt);
      menuAngle += dt * 0.05;
      const cx = 30 + Math.cos(menuAngle) * 118;
      const cz = Math.sin(menuAngle) * 118;
      camera.position.set(cx, 42, cz);
      camera.lookAt(30, 6, 0);
      CVH.world.updateSky(0.86, scene);
      return;
    }
    if (state !== 'playing' && state !== 'ending') return;
    if (state === 'playing') {
      CVH.player.update(dt);
      // camera follow makes driving feel right: ease camYaw behind the car
      if (CVH.player.state === 'car' && CVH.player.car && Math.abs(CVH.player.car.speed) > 2) {
        CVH.player.camYaw = CVH.turnToward(CVH.player.camYaw, CVH.player.car.heading, 1.6 * dt);
      }
    }
    CVH.vehicles.update(dt);
    CVH.police.update(dt);
    CVH.peds.update(dt);
    CVH.missions.update(dt);
    dayT = (dayT + dt / 420) % 1;
    CVH.world.updateSky(dayT, scene);
    updateCamera(dt);
    CVH.hud.update();
    saveTick += dt;
    if (saveTick > 6) { saveTick = 0; save(); }
  }

  const camPos = new THREE.Vector3(60, 30, 90);
  function updateCamera(dt) {
    const p = CVH.player;
    let tx, ty, tz, lx, ly, lz;
    if (p.state === 'car' && p.car) {
      const cp = p.car.mesh.position;
      const f = CVH.forwardOf(p.camYaw);
      tx = cp.x - f.x * 10.5; tz = cp.z - f.z * 10.5; ty = 4.1;
      lx = cp.x + f.x * 8; lz = cp.z + f.z * 8; ly = 1.4;
    } else {
      const f = CVH.forwardOf(p.camYaw);
      tx = p.pos.x - f.x * 7.6; tz = p.pos.z - f.z * 7.6; ty = 2.1 + p.camPitch * 3.6;
      lx = p.pos.x + f.x * 5; lz = p.pos.z + f.z * 5; ly = 1.65;
    }
    const k = 1 - Math.exp(-dt * 7);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    camPos.y = Math.max(0.7, camPos.y);
    camera.position.copy(camPos);
    camera.lookAt(lx, ly, lz);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
    lastTs = ts;
    if (!CVH.debug.freeze) updateSim(dt);
    else if (state === 'playing') CVH.hud.update();
    renderer.render(scene, camera);
  }

  CVH.debug.step = function (dt) { updateSim(dt); };
  CVH.debug.getCameraPos = function () {
    return camera ? { x: camera.position.x, y: camera.position.y, z: camera.position.z } : null;
  };

  // ------------------------------------------------------------ boot
  function boot() {
    const container = el('gameContainer');
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      el('webglError').style.display = 'flex';
      return;
    }
    if (!renderer) { el('webglError').style.display = 'flex'; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc25e63, 190, 560);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.copy(camPos);

    CVH.world.build(scene);
    CVH.vehicles.spawnInitial(scene);
    CVH.peds.spawnInitial(scene);
    CVH.player.build(scene);
    CVH.missions.build(scene);
    CVH.hud.init();
    CVH.input.init(renderer.domElement);

    CVH.police.onBusted = busted;
    CVH.player.onWasted = wasted;
    CVH.missions.onEnding = function () {
      setState('ending');
      CVH.audio.jobDone();
      save();
    };
    CVH.missions.onProgress = function () { save(); };

    CVH.input.onLockLost = function () {
      if (state === 'playing') setState('paused');
    };
    CVH.input.onAnyKey = function (code) {
      if (code === 'KeyM') { CVH.audio.ensure(); CVH.audio.toggleMuted(); }
      if (state === 'playing') {
        if (code === 'KeyF') CVH.player.toggleCar();
        if (code === 'KeyT') CVH.missions.startTaxi();
        if (code === 'KeyP') setState('paused');
      } else if (state === 'paused' && (code === 'KeyP' || code === 'Escape')) {
        setState('playing');
        CVH.input.lock(renderer.domElement);
      }
    };
    renderer.domElement.addEventListener('mousedown', function () {
      if (state !== 'playing') return;
      if (!CVH.input.isLocked()) { CVH.audio.ensure(); CVH.input.lock(renderer.domElement); }
      else CVH.player.shoot();
    });
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // menu buttons
    el('newGameBtn').addEventListener('click', function () { startPlay(true); });
    el('continueBtn').addEventListener('click', function () { startPlay(false); });
    el('resumeBtn').addEventListener('click', function () { setState('playing'); CVH.input.lock(renderer.domElement); });
    el('restartBtn').addEventListener('click', function () { newGame(); setState('playing'); CVH.input.lock(renderer.domElement); });
    el('saveBtn').addEventListener('click', function () { save(); CVH.hud.toast('Saved.'); });
    el('pauseSoundBtn').addEventListener('click', function () { CVH.audio.ensure(); CVH.audio.toggleMuted(); });
    el('endingCloseBtn').addEventListener('click', function () { setState('playing'); CVH.input.lock(renderer.domElement); });
    if (!hasSave()) el('continueBtn').classList.add('disabled');

    // title-screen stat chips are static HTML; refresh continue availability
    setState('menu');
    CVH.world.updateSky(0.86, scene);
    CVH.debug.ready = true;
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
