// main.js — boot, the game loop and the state machine for Costa Verde
// Heat. Screens: menu -> playing <-> paused, with busted and wasted as
// the two ways a day can end early. Everything else lives in the module
// named for its job; this file only wires them together.

import { Input, initInput, endFrameInput, keyDown, keyPressed } from './input.js';
import { Sound } from './audio.js';
import {
  WORLD_W, WORLD_H, generateCity, drawWorld, intersections,
} from './world.js';
import {
  makeCar, spawnParkedCars, spawnTraffic, roadNodes, nodeNeighbours,
  updateTrafficCar, updatePlayerCar, carCarCollision, drawCar,
} from './vehicles.js';
import {
  createPlayer, createPedestrians, updatePedestrians, drawPedestrian,
  drawPlayer, playerAttack, updateBullets, drawBullets,
  updatePlayerOnFoot, pedestrianFlee, hurtPlayer,
} from './player.js';
import {
  createWanted, commitCrime, updateWanted, updatePoliceCar, updateBust, clearWanted,
} from './police.js';
import {
  createMissionState, updateMissions, drawObjectiveMarker, drawTaxiMarker,
} from './missions.js';
import { drawHUD, drawMenu, drawPause, drawEndScreen } from './hud.js';
import { setupShot } from './shots.js';

const SAVE_KEY = 'costaVerdeHeatSaveV1';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261123;

let vw = 1280;
let vh = 800;
function resize() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  canvas.width = vw;
  canvas.height = vh;
}
window.addEventListener('resize', resize);
resize();
initInput(canvas);

function buildWorldState() {
  const city = generateCity(seed);
  const nodes = roadNodes();
  const rng = city.rng;
  const cars = [
    ...spawnParkedCars(city, nodes, 30, rng),
    ...spawnTraffic(nodes, 15, rng),
  ];
  const start = city.landmarks.safehouse;
  return {
    city,
    nodes,
    cars,
    peds: createPedestrians(city, 44, rng),
    player: createPlayer(start.x, start.y),
    wanted: createWanted(),
    missions: createMissionState(),
    police: [],
    bullets: [],
    buttons: [],
    time: 0,
    state: 'menu',
    shotMode: false,
    packagesFound: 0,
    toastMsg: '',
    toastT: 0,
    muted: false,
    hasSave: false,
    lastFine: 0,
    policeSpawnT: 0,
    ramCd: 0,
    playerMoving: false,
    cam: { x: 0, y: 0, vw, vh },
  };
}

let G = buildWorldState();
G.hasSave = readSave() !== null;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    const taken = G.city.packages.filter((p) => p.taken).map((p) => p.id);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: G.player.cash,
      storyIndex: G.missions.storyIndex,
      packages: taken,
      weapon: G.player.weapon,
      ammo: G.player.ammo,
    }));
    G.hasSave = true;
  } catch {
    // Private mode: the city forgets, the game goes on.
  }
}
G.saveGame = saveGame;

function applySave(data) {
  G.player.cash = data.cash ?? G.player.cash;
  G.missions.storyIndex = data.storyIndex ?? 0;
  for (const id of data.packages ?? []) {
    const pkg = G.city.packages[id];
    if (pkg) { pkg.taken = true; G.packagesFound += 1; }
  }
  if (data.weapon === 'pistol') {
    G.player.weapon = 'pistol';
    G.player.ammo = data.ammo ?? 12;
  }
}

function toast(msg, t = 3.2) {
  G.toastMsg = msg;
  G.toastT = t;
}
G.toast = toast;

G.onCrime = (severity, x, y, witnessed) => commitCrime(G, severity, x, y, witnessed);
G.onPlayerCrash = (impact, car) => {
  pedestrianFlee(G.peds, car.x, car.y, 170);
  if (impact > 250) commitCrime(G, 0.9, car.x, car.y, true);
};
G.onBusted = () => {
  const fine = Math.min(G.player.cash, 90 + G.wanted.stars * 45);
  G.player.cash -= fine;
  G.lastFine = fine;
  G.state = 'busted';
  Sound.bustedJingle();
  Sound.setEngine(false);
  status.textContent = 'Busted.';
};
G.onWasted = () => {
  const fine = Math.min(G.player.cash, 120);
  G.player.cash -= fine;
  G.lastFine = fine;
  G.state = 'wasted';
  Sound.setEngine(false);
  Sound.setSiren(false);
  status.textContent = 'Wasted.';
};

function respawn() {
  const p = G.player;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
  }
  clearWanted(G);
  p.hp = p.maxHp;
  p.dead = false;
  const spot = G.state === 'busted' ? G.city.landmarks.policeHQ : G.city.landmarks.hospital;
  p.x = spot.x;
  p.y = spot.y + 60;
  G.state = 'playing';
  saveGame();
}

function enterExitCar() {
  const p = G.player;
  if (p.car) {
    const car = p.car;
    car.driver = null;
    car.speed = 0;
    p.car = null;
    p.x = car.x - Math.sin(car.angle) * 34;
    p.y = car.y + Math.cos(car.angle) * 34;
    Sound.setEngine(false);
    Sound.click();
    return;
  }
  let best = null;
  let bd = 62;
  for (const car of G.cars) {
    if (car.driver === 'player' || car.wrecked) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return;
  const wasTraffic = best.driver === 'traffic';
  const wasPolice = best.type === 'police';
  if (wasPolice) {
    const idx = G.police.indexOf(best);
    if (idx >= 0) G.police.splice(idx, 1);
  }
  best.driver = 'player';
  p.car = best;
  Sound.ensure();
  Sound.click();
  if (wasTraffic || wasPolice) {
    const witnesses = G.peds.some((ped) => !ped.down && Math.hypot(ped.x - p.x, ped.y - p.y) < 230);
    commitCrime(G, wasPolice ? 2.4 : 1.5, p.x, p.y, witnesses || wasPolice);
    pedestrianFlee(G.peds, p.x, p.y, 130);
    toast(wasPolice ? 'You stole a police car. Bold.' : 'Car borrowed. Permanently.');
  }
}

function updatePlaying(dt) {
  G.time += dt;
  G.toastT = Math.max(0, G.toastT - dt);
  G.ramCd = Math.max(0, G.ramCd - dt);
  const p = G.player;

  const camFocus = p.car ?? p;
  const mouseWorld = {
    x: Input.mouse.x + G.cam.x,
    y: Input.mouse.y + G.cam.y,
  };
  const aimAngle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);

  if (keyPressed('f')) enterExitCar();

  if (p.car) {
    const controls = {
      throttle: keyDown('w', 'arrowup') ? 1 : 0,
      brake: keyDown('s', 'arrowdown') ? 1 : 0,
      steer: (keyDown('a', 'arrowleft') ? -1 : 0) + (keyDown('d', 'arrowright') ? 1 : 0),
      handbrake: keyDown(' '),
    };
    const ratio = updatePlayerCar(G, p.car, controls, dt);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    G.playerMoving = Math.abs(p.car.speed) > 30;
    Sound.setEngine(true, ratio);
    // Running someone down is the city's loudest crime.
    for (const ped of G.peds) {
      if (!ped.down && Math.abs(p.car.speed) > 110 && Math.hypot(ped.x - p.car.x, ped.y - p.car.y) < 30) {
        ped.down = true;
        ped.downT = 8;
        commitCrime(G, 2.6, ped.x, ped.y, true);
        Sound.hit();
        pedestrianFlee(G.peds, ped.x, ped.y, 240);
      }
    }
    // Packages can be grabbed through the window, apparently.
    for (const pkg of G.city.packages) {
      if (!pkg.taken && Math.hypot(pkg.x - p.car.x, pkg.y - p.car.y) < 34) {
        pkg.taken = true;
        p.cash += 50;
        G.packagesFound += 1;
        Sound.cash();
        toast(`Cash package found (${G.packagesFound}/10) +$50`);
        saveGame();
      }
    }
    if (p.car.wrecked) {
      toast('This car is done. Find another.');
      enterExitCar();
    }
  } else {
    Sound.setEngine(false);
    const beforeX = p.x;
    const beforeY = p.y;
    updatePlayerOnFoot(G, dt, aimAngle);
    G.playerMoving = Math.hypot(p.x - beforeX, p.y - beforeY) > 12 * dt;
    if (Input.mouse.clicked || keyDown(' ')) playerAttack(G, aimAngle);
  }

  for (const car of G.cars) {
    if (car.driver === 'traffic') updateTrafficCar(G, car, dt);
    else if (car.driver === 'police') updatePoliceCar(G, car, dt);
  }
  // Car-to-car contact for every pair on the road.
  for (let i = 0; i < G.cars.length; i++) {
    for (let j = i + 1; j < G.cars.length; j++) {
      const a = G.cars[i];
      const b = G.cars[j];
      if (Math.abs(a.x - b.x) > 90 || Math.abs(a.y - b.y) > 90) continue;
      const closing = carCarCollision(a, b);
      if (closing > 190) {
        a.health -= 5;
        b.health -= 5;
        if (a === p.car || b === p.car) {
          Sound.crash();
          commitCrime(G, 0.7, p.x, p.y, true);
        }
      }
    }
  }

  updatePedestrians(G, dt);
  updateBullets(G, dt);
  updateWanted(G, dt);
  updateBust(G, dt);
  updateMissions(G, dt);

  // Camera follows the focus, clamped to the city.
  G.cam.x = Math.max(0, Math.min(WORLD_W - vw, camFocus.x - vw / 2));
  G.cam.y = Math.max(0, Math.min(WORLD_H - vh, camFocus.y - vh / 2));
  G.cam.vw = vw;
  G.cam.vh = vh;
}

function render() {
  ctx.clearRect(0, 0, vw, vh);
  // Sky-blue backdrop beyond the city edges.
  ctx.fillStyle = '#79c7e3';
  ctx.fillRect(0, 0, vw, vh);
  drawWorld(ctx, G.city, G.cam, vw, vh, G.time);
  drawObjectiveMarker(ctx, G, G.cam, G.time);
  drawTaxiMarker(ctx, G, G.cam, G.time);
  for (const car of G.cars) {
    if (car.x < G.cam.x - 90 || car.y < G.cam.y - 90 || car.x > G.cam.x + vw + 90 || car.y > G.cam.y + vh + 90) continue;
    drawCar(ctx, car, G.cam, G.time);
  }
  for (const ped of G.peds) {
    if (ped.x < G.cam.x - 40 || ped.y < G.cam.y - 40 || ped.x > G.cam.x + vw + 40 || ped.y > G.cam.y + vh + 40) continue;
    drawPedestrian(ctx, ped, G.cam);
  }
  drawPlayer(ctx, G.player, G.cam, G.time);
  drawBullets(ctx, G, G.cam);

  if (G.state === 'menu') drawMenu(ctx, G, vw, vh);
  else {
    drawHUD(ctx, G, vw, vh);
    if (G.state === 'paused') drawPause(ctx, G, vw, vh);
    if (G.state === 'busted') drawEndScreen(ctx, G, vw, vh, 'busted');
    if (G.state === 'wasted') drawEndScreen(ctx, G, vw, vh, 'wasted');
  }
}

function handleButtons() {
  if (!Input.mouse.clicked) return;
  const { x, y } = Input.mouse;
  for (const b of G.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      Sound.ensure();
      Sound.click();
      if (b.id === 'new') {
        const keepSave = G.hasSave;
        G = buildWorldState();
        wireState();
        G.hasSave = keepSave;
        G.state = 'playing';
        status.textContent = 'New game. Visit Marisol at Taller Vega.';
      } else if (b.id === 'continue') {
        const data = readSave();
        G = buildWorldState();
        wireState();
        if (data) applySave(data);
        G.hasSave = true;
        G.state = 'playing';
        status.textContent = 'Welcome back to Costa Verde.';
      } else if (b.id === 'resume') {
        G.state = 'playing';
      } else if (b.id === 'savequit') {
        saveGame();
        G.state = 'menu';
      } else if (b.id === 'respawn') {
        respawn();
      }
      return;
    }
  }
}

function wireState() {
  G.saveGame = saveGame;
  G.toast = toast;
  G.onCrime = (severity, x, y, witnessed) => commitCrime(G, severity, x, y, witnessed);
  G.onPlayerCrash = (impact, car) => {
    pedestrianFlee(G.peds, car.x, car.y, 170);
    if (impact > 250) commitCrime(G, 0.9, car.x, car.y, true);
  };
  G.onBusted = () => {
    const fine = Math.min(G.player.cash, 90 + G.wanted.stars * 45);
    G.player.cash -= fine;
    G.lastFine = fine;
    G.state = 'busted';
    Sound.bustedJingle();
    Sound.setEngine(false);
    status.textContent = 'Busted.';
  };
  G.onWasted = () => {
    const fine = Math.min(G.player.cash, 120);
    G.player.cash -= fine;
    G.lastFine = fine;
    G.state = 'wasted';
    Sound.setEngine(false);
    Sound.setSiren(false);
    status.textContent = 'Wasted.';
  };
  // Centre the camera on the player right away.
  G.cam.x = Math.max(0, Math.min(WORLD_W - vw, G.player.x - vw / 2));
  G.cam.y = Math.max(0, Math.min(WORLD_H - vh, G.player.y - vh / 2));
  G.cam.vw = vw;
  G.cam.vh = vh;
}
wireState();

// Global keys that work on every screen.
function handleGlobalKeys() {
  if (keyPressed('m')) {
    G.muted = Sound.toggleMute();
  }
  if (G.state === 'playing' && keyPressed('p', 'escape')) {
    G.state = 'paused';
    Sound.setEngine(false);
    Sound.setSiren(false);
  } else if (G.state === 'paused' && keyPressed('p', 'escape')) {
    G.state = 'playing';
  } else if (G.state === 'menu' && keyPressed('enter')) {
    G.state = 'playing';
    Sound.ensure();
  } else if ((G.state === 'busted' || G.state === 'wasted') && keyPressed('enter', 'r')) {
    respawn();
  }
}

let last = performance.now();
let shotFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (G.shotMode) {
    G.time = 12; // a fixed, flattering time of day for the lens
    // The frozen render never runs updatePlaying, so centre the camera
    // on the scene's focus (the player, or their car) here instead.
    const focus = G.player.car ?? G.player;
    G.cam.x = Math.max(0, Math.min(WORLD_W - vw, focus.x - vw / 2));
    G.cam.y = Math.max(0, Math.min(WORLD_H - vh, focus.y - vh / 2));
    G.cam.vw = vw;
    G.cam.vh = vh;
    render();
    shotFrames += 1;
    if (shotFrames >= 3) window.__shotReady = true;
    endFrameInput();
    return;
  }

  handleGlobalKeys();
  handleButtons();
  if (G.state === 'playing') updatePlaying(dt);
  else {
    Sound.setEngine(false);
    if (G.state === 'menu') {
      // Let the city breathe behind the title: traffic still rolls.
      G.time += dt;
      for (const car of G.cars) if (car.driver === 'traffic') updateTrafficCar(G, car, dt);
      updatePedestrians(G, dt);
      const lm = G.city.landmarks.marina;
      G.cam.x = Math.max(0, Math.min(WORLD_W - vw, lm.x - vw / 2));
      G.cam.y = Math.max(0, Math.min(WORLD_H - vh, lm.y - vh / 2));
      G.cam.vw = vw;
      G.cam.vh = vh;
    }
  }
  render();
  endFrameInput();
}

if (shotName) setupShot(G, shotName);
status.textContent = shotName ? `Screenshot scene ${shotName}` : 'Costa Verde Heat. Press Enter or click New Game.';
requestAnimationFrame(frame);
