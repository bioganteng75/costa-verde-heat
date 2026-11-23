// main.js — Costa Verde Heat: boot, game loop, state machine.
// Owns the shared game object G, the camera, the day cycle, vehicle
// collisions, world interactions (Pay 'n Spray, food stands, pickups),
// saving, and the busted/wasted flow. Systems live in the sibling
// modules; this file wires them together.

import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createFX } from './fx.js';
import {
  createWorld, drawGround, drawBuilding, drawPalm, drawLampGlow, drawPickups,
  collideCircle, isRoad, randomRoadPoint, mulberry32,
  WORLD_W, WORLD_H, CITY_W, CITY_H, ROAD_W, vRoadX, hRoadY,
} from './world.js';
import {
  createPlayer, updatePlayer, drawPlayer, createPeds, updatePeds, drawPed,
  updateBullets, drawBullets, scarePeds, hurtPed,
} from './player.js';
import { createVehicle, updateDriven, updateTraffic, initTrafficAI, drawVehicle, vehicleRadius, TYPES } from './vehicles.js';
import { createPolice, updatePolice, reportCrime, clearHeat } from './police.js';
import { createMissions } from './missions.js';
import { drawHUD, drawMarkers, drawMenu, drawPause, drawEndScreen } from './hud.js';
import { setupShot } from './shots.js';

const SAVE_KEY = 'costaVerdeHeatSaveV2';
const DAY_LEN = 420; // seconds per full day cycle

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '1337', 10) || 1337;
const shotName = params.get('shot');

function defaultSave() {
  return { cash: 250, missionIndex: 0, racesWon: [], packages: [], weapon: 'fists' };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.cash !== 'number' || !Array.isArray(s.packages)) return null;
    return Object.assign(defaultSave(), s);
  } catch { return null; }
}

// ---------------------------------------------------------------------------

const G = {
  canvas, ctx,
  viewW: window.innerWidth, viewH: window.innerHeight,
  state: 'menu',
  tNow: 0,
  dayT: 0.30,
  dark: 0,
  warm: 0,
  shotMode: !!shotName,
  objectiveOverride: null,
  contextHint: '',
  playerSpeed: 0,
  toasts: [],
  endInfo: null,
  cam: { x: 0, y: 0, vw: window.innerWidth, vh: window.innerHeight },
  sprayCd: 0,
  crashCrimeT: -9,
  policeCrashT: -9,
  frame: 0,
};
window.__game = G;

G.world = createWorld(seed);
G.fx = createFX();
G.audio = createAudio();
G.input = createInput(canvas);
G.player = createPlayer(G.world);
const worldRng = mulberry32(seed + 77);
G.peds = createPeds(G.world, 44, worldRng);
G.vehicles = [];
const P = createPolice();
P.reportCrime = reportCrime;
G.police = P;

const stored = loadSave();
G.hasSave = !!stored;
G.save = stored || defaultSave();

G.persist = function () {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch { /* private mode */ }
  G.hasSave = true;
};
G.toast = function (text, color = '#ffffff', dur = 3) {
  G.toasts.push({ text, color, t: dur, max: dur });
  if (G.toasts.length > 4) G.toasts.shift();
};
G.addCash = function (n, label) {
  G.save.cash += n;
  const a = G.player.vehicle || G.player;
  G.fx.text(a.x, a.y - 26, `+$${n}${label ? ' · ' + label : ''}`, '#7dff9a');
  G.audio.cash();
  G.persist();
};

// ---------------------------------------------------------------------------
// Ambient population: parked cars along the curbs, traffic on the grid.

function pickType(rng, table) {
  let r = rng();
  for (const [t, w] of table) { if (r < w) return t; r -= w; }
  return 'sedan';
}

function spawnAmbient() {
  const rng = mulberry32(seed + 5);
  const start = G.world.services.safehouse;
  const parkedTable = [['sedan', 0.44], ['taxi', 0.56], ['sport', 0.69], ['moto', 0.82], ['truck', 0.91], ['sedan', 1]];
  for (let k = 0; k < 46; k++) {
    const type = pickType(rng, parkedTable);
    let x, y, angle;
    if (rng() < 0.55) {
      const i = (rng() * 10) | 0;
      const side = rng() < 0.5 ? -1 : 1;
      x = vRoadX(i) + side * (ROAD_W / 2 - 13);
      y = 70 + rng() * (CITY_H - 140);
      angle = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const j = (rng() * 8) | 0;
      const side = rng() < 0.5 ? -1 : 1;
      y = hRoadY(j) + side * (ROAD_W / 2 - 13);
      x = 70 + rng() * (CITY_W - 140);
      angle = side < 0 ? 0 : Math.PI;
    }
    if (Math.hypot(x - start.x, y - start.y) < 150) continue;
    if (G.vehicles.some((v) => Math.hypot(v.x - x, v.y - y) < 52)) continue;
    G.vehicles.push(createVehicle(type, x, y, angle, { parked: true, driver: null }));
  }
  for (let k = 0; k < 13; k++) {
    const pt = randomRoadPoint(rng);
    if (Math.hypot(pt.x - start.x, pt.y - start.y) < 260) continue;
    const onV = Math.abs(pt.x - vRoadX(Math.round((pt.x - ROAD_W / 2) / 288))) < 2;
    const angle = onV ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const v = createVehicle(pickType(rng, parkedTable), pt.x, pt.y, angle, { driver: 'traffic' });
    initTrafficAI(v);
    G.vehicles.push(v);
  }
}
spawnAmbient();

G.missions = createMissions(G);

function applySave() {
  for (const pk of G.world.packages) pk.taken = G.save.packages.includes(pk.id);
  G.player.weapon = G.save.weapon || 'fists';
}

function resetWorldForNewGame() {
  G.vehicles = G.vehicles.filter((v) => v.type !== 'police');
  G.police.cars = [];
  G.police.roadblock = null;
  clearHeat(G);
  for (const pk of G.world.pickups) pk.taken = false;
  G.player = createPlayer(G.world);
  G.missions = createMissions(G);
}

function startRun(fresh) {
  if (fresh) {
    G.save = defaultSave();
    resetWorldForNewGame();
  } else {
    G.player = createPlayer(G.world);
    G.missions = createMissions(G);
  }
  applySave();
  G.player.hp = G.player.maxHp;
  G.state = 'playing';
  G.audio.ensure();
  G.audio.start();
  snapCamera();
  G.toast(fresh ? 'Welcome to Costa Verde' : 'Welcome back to Costa Verde', '#ffd76a', 3);
}

// ---------------------------------------------------------------------------
// Busted / wasted

function exitVehicle(placeBeside = true) {
  const p = G.player;
  const v = p.vehicle;
  if (!v) return;
  if (placeBeside) {
    const px = v.x + Math.cos(v.angle + Math.PI / 2) * (vehicleRadius(v) + 15);
    const py = v.y + Math.sin(v.angle + Math.PI / 2) * (vehicleRadius(v) + 15);
    const res = collideCircle(G.world, px, py, p.r, 30);
    p.x = res.x; p.y = res.y;
  }
  v.driver = null;
  v.parked = true;
  v.speed *= 0.35;
  p.vehicle = null;
}

function clearPolicePresence() {
  G.vehicles = G.vehicles.filter((v) => v.type !== 'police');
  G.police.cars = [];
  G.police.roadblock = null;
  clearHeat(G);
  G.audio.siren(false);
}

G.triggerBusted = function () {
  if (G.state !== 'playing') return;
  const fine = 150 + G.police.stars * 100;
  G.save.cash = Math.max(0, G.save.cash - fine);
  exitVehicle(false);
  const st = G.world.services.station;
  G.player.x = st.x; G.player.y = st.y + 26;
  G.player.hp = G.player.maxHp;
  G.player.weapon = 'fists';
  G.save.weapon = 'fists';
  clearPolicePresence();
  G.endInfo = {
    title: 'BUSTED', color: '#4a9eff',
    lines: [`Fine paid: $${fine}`, 'Your weapon was confiscated.', 'The Costa Verde PD thanks you for your cooperation.'],
  };
  G.state = 'busted';
  G.audio.bustedJingle();
  G.audio.engine(0, false);
  G.persist();
  snapCamera();
};

G.triggerWasted = function () {
  if (G.state !== 'playing') return;
  const fee = 100;
  G.save.cash = Math.max(0, G.save.cash - fee);
  exitVehicle(false);
  const h = G.world.services.hospital;
  G.player.x = h.x; G.player.y = h.y + 26;
  G.player.hp = G.player.maxHp;
  clearPolicePresence();
  G.endInfo = {
    title: 'WASTED', color: '#ff5040',
    lines: [`Hospital bill: $${fee}`, 'Marisol sent flowers. She expects you back at work.'],
  };
  G.state = 'wasted';
  G.audio.fail();
  G.audio.engine(0, false);
  G.persist();
  snapCamera();
};

// ---------------------------------------------------------------------------
// Day cycle

function lerp(a, b, t) { return a + (b - a) * t; }
function darkFor(t) {
  if (t < 0.50) return 0;
  if (t < 0.62) return lerp(0, 0.25, (t - 0.50) / 0.12);
  if (t < 0.74) return lerp(0.25, 0.85, (t - 0.62) / 0.12);
  if (t < 0.90) return 0.85;
  return lerp(0.85, 0, (t - 0.90) / 0.10);
}
function warmFor(t) {
  const d = Math.abs(t - 0.64);
  return d < 0.11 ? (1 - d / 0.11) * 0.5 : 0;
}

// ---------------------------------------------------------------------------
// Interactions

function tryEnterExit() {
  const p = G.player;
  if (p.vehicle) { exitVehicle(true); G.audio.ui(); return; }
  let best = null, bd = 58;
  for (const v of G.vehicles) {
    if (v.dead) continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bd) { bd = d; best = v; }
  }
  if (!best) return;
  if (best.driver === 'traffic' && Math.abs(best.speed) > 48) {
    G.toast('Too fast to grab!', '#ff9a8a', 1.6);
    return;
  }
  const wasParked = best.parked;
  best.driver = 'player';
  best.parked = false;
  best.ai = null;
  if (best.type === 'police') {
    const gi = G.police.cars.indexOf(best);
    if (gi >= 0) G.police.cars.splice(gi, 1);
    if (G.police.roadblock) {
      const bi = G.police.roadblock.cars.indexOf(best);
      if (bi >= 0) G.police.roadblock.cars.splice(bi, 1);
    }
  }
  p.vehicle = best;
  G.audio.ensure();
  G.audio.ui();
  reportCrime(G, 'theft', best.x, best.y);
  if (wasParked) scarePeds(G, best.x, best.y, 120);
}

function interactions(dt) {
  const p = G.player;
  const a = p.vehicle || p;
  G.contextHint = '';
  G.sprayCd = Math.max(0, G.sprayCd - dt);

  // Cash packages.
  for (const pk of G.world.packages) {
    if (pk.taken) continue;
    if (Math.hypot(pk.x - a.x, pk.y - a.y) < 30) {
      pk.taken = true;
      G.save.packages.push(pk.id);
      G.fx.sparkle(pk.x, pk.y, 14);
      G.addCash(75, 'package found');
      G.toast(`Hidden package ${G.save.packages.length}/18`, '#7dff9a', 2.2);
    }
  }
  // Weapon pickups (on foot).
  if (!p.vehicle) {
    for (const pk of G.world.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.x - p.x, pk.y - p.y) < 26) {
        if (p.weapon !== pk.kind) {
          p.weapon = pk.kind;
          G.save.weapon = pk.kind;
          pk.taken = true;
          pk.respawnT = 90;
          G.toast(pk.kind === 'smg' ? 'Picked up the SMG — hold to fire' : 'Picked up the Pistol', '#ffd76a', 2.6);
          G.audio.pickup();
          G.persist();
        }
      }
    }
  }
  for (const pk of G.world.pickups) {
    if (pk.taken && pk.respawnT !== undefined) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) pk.taken = false;
    }
  }
  // Food stands.
  if (!p.vehicle) {
    for (const s of G.world.stands) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < 32) {
        if (p.hp >= p.maxHp) G.contextHint = 'Health full — nice';
        else if (G.save.cash < 25) G.contextHint = 'Food stand — need $25 to eat';
        else {
          G.contextHint = 'E — eat ($25, heals)';
          if (G.input.hit('KeyE')) {
            G.save.cash -= 25;
            p.hp = Math.min(p.maxHp, p.hp + 45);
            G.audio.heal();
            G.toast('Ate well — health restored', '#7dff9a', 2);
            G.persist();
          }
        }
      }
    }
  }
  // Pay 'n Spray.
  const ps = G.world.services.paynspray;
  if (p.vehicle && G.sprayCd <= 0) {
    const v = p.vehicle;
    const cx = ps.x + ps.w / 2, cy = ps.y + ps.h / 2;
    if (Math.abs(v.x - cx) < ps.w / 2 && Math.abs(v.y - cy) < ps.h / 2 && Math.abs(v.speed) < 26) {
      if (G.police.stars === 0 && v.hp >= v.maxHp) {
        G.contextHint = "Pay 'n Spray — nothing to fix";
      } else if (G.save.cash < 150) {
        G.contextHint = "Pay 'n Spray — need $150";
      } else {
        G.save.cash -= 150;
        v.hp = v.maxHp;
        v.dead = false;
        clearHeat(G);
        G.sprayCd = 3;
        G.audio.cash();
        G.toast("Fresh paint, new plates — you're nobody again", '#7dff9a', 3);
        G.persist();
      }
    }
  }
  // Hints: car entry / Marisol.
  if (!p.vehicle) {
    let bd = 58;
    for (const v of G.vehicles) {
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d < bd) bd = d;
    }
    if (bd < 58 && !G.contextHint) G.contextHint = 'F — get in';
    const mz = G.world.services.marisol;
    if (!G.missions.active && G.save.missionIndex < 7 && Math.hypot(mz.x - p.x, mz.y - p.y) < 90 && !G.contextHint) {
      G.contextHint = 'Marisol has work for you — walk up to her';
    }
  }
}

// ---------------------------------------------------------------------------
// Collisions between vehicles, and vehicles vs people.

function vehicleCollisions(dt) {
  const vs = G.vehicles;
  // Buildings + bounds.
  for (const v of vs) {
    const r = vehicleRadius(v);
    const res = collideCircle(G.world, v.x, v.y, r, 2);
    if (res.hit) {
      const impact = Math.abs(v.speed);
      const wasPlayer = v === G.player.vehicle;
      v.x = res.x; v.y = res.y;
      if (impact > 92) {
        v.hp -= (impact - 92) * 0.055;
        G.fx.sparks(v.x + Math.cos(v.angle) * r, v.y + Math.sin(v.angle) * r, v.angle + Math.PI, 8);
        if (wasPlayer) {
          G.fx.shake(Math.min(0.5, (impact - 92) / 380));
          G.audio.crash((impact - 92) / 300);
          if (impact > 235) hurtPlayer(7);
          if (G.tNow - G.crashCrimeT > 1.6) {
            G.crashCrimeT = G.tNow;
            reportCrime(G, 'crash', v.x, v.y);
          }
        }
      }
      if (impact > 30) v.speed = -v.speed * 0.26;
    }
  }
  // Car vs car.
  for (let i = 0; i < vs.length; i++) {
    for (let j = i + 1; j < vs.length; j++) {
      const A = vs[i], B = vs[j];
      const dx = B.x - A.x, dy = B.y - A.y;
      const rr2 = vehicleRadius(A) + vehicleRadius(B);
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr2 * rr2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = rr2 - d;
      const mA = TYPES[A.type].mass, mB = TYPES[B.type].mass;
      A.x -= nx * overlap * (mB / (mA + mB));
      A.y -= ny * overlap * (mB / (mA + mB));
      B.x += nx * overlap * (mA / (mA + mB));
      B.y += ny * overlap * (mA / (mA + mB));
      const rel = (A.speed - B.speed) * 0.5;
      const impact = Math.abs(rel) + Math.abs(A.speed - B.speed) * 0.3;
      if (impact > 26) {
        A.hp -= impact * 0.10 * (mB / mA);
        B.hp -= impact * 0.10 * (mA / mB);
        A.speed *= 0.55; B.speed *= 0.55;
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        G.fx.sparks(mx, my, Math.atan2(ny, nx), 9);
        const playerInvolved = A === G.player.vehicle || B === G.player.vehicle;
        if (playerInvolved) {
          G.fx.shake(Math.min(0.55, impact / 320));
          G.audio.crash(impact / 260);
          if (impact > 120) hurtPlayer(5);
          const other = A === G.player.vehicle ? B : A;
          if (other.type === 'police') {
            if (G.tNow - G.policeCrashT > 1) {
              G.policeCrashT = G.tNow;
              reportCrime(G, 'policecrash', mx, my, true);
            }
          } else if (G.tNow - G.crashCrimeT > 1.6) {
            G.crashCrimeT = G.tNow;
            reportCrime(G, 'crash', mx, my);
          }
        }
      }
    }
  }
  // Vehicles vs pedestrians, and vs the player on foot.
  for (const v of vs) {
    if (Math.abs(v.speed) < 42) continue;
    const r = vehicleRadius(v);
    for (const p of G.peds) {
      if (p.hidden || p.state === 'down') continue;
      if (Math.hypot(p.x - v.x, p.y - v.y) < r + 9) {
        hurtPed(G, p, 70, v.x - Math.cos(v.angle) * 20, v.y - Math.sin(v.angle) * 20);
        G.fx.puff(p.x, p.y);
        if (v === G.player.vehicle) {
          reportCrime(G, 'hitrun', p.x, p.y, true);
          G.fx.shake(0.3);
          G.audio.crash(0.35);
        }
      }
    }
    const pl = G.player;
    if (!pl.vehicle && v !== pl.vehicle && Math.abs(v.speed) > 52) {
      if (Math.hypot(pl.x - v.x, pl.y - v.y) < r + 11) {
        hurtPlayer(16);
        const push = 30;
        const ang = Math.atan2(pl.y - v.y, pl.x - v.x);
        const res = collideCircle(G.world, pl.x + Math.cos(ang) * push, pl.y + Math.sin(ang) * push, pl.r, 30);
        pl.x = res.x; pl.y = res.y;
        G.fx.shake(0.35);
      }
    }
  }
}

function hurtPlayer(dmg) {
  const p = G.player;
  p.hp -= dmg;
  p.hurtT = 1;
  if (p.hp <= 0 && G.state === 'playing') {
    p.hp = 0;
    G.triggerWasted();
  }
}
G.hurtPlayer = hurtPlayer;

// ---------------------------------------------------------------------------
// Update

function update(dt) {
  const p = G.player;
  const prevX = (p.vehicle || p).x, prevY = (p.vehicle || p).y;
  p.hurtT = Math.max(0, p.hurtT - dt); // decays in the car too (vignette)

  if (p.vehicle) {
    const ratio = updateDriven(p.vehicle, G, dt);
    p.x = p.vehicle.x; p.y = p.vehicle.y;
    G.audio.engine(ratio, !p.vehicle.dead);
  } else {
    updatePlayer(G, dt);
    G.audio.engine(0, false);
  }
  const a = p.vehicle || p;
  G.playerSpeed = dt > 0 ? Math.hypot(a.x - prevX, a.y - prevY) / dt : 0;

  if (G.input.hit('KeyF')) tryEnterExit();

  for (const v of G.vehicles) {
    if (v.driver === 'traffic') updateTraffic(v, G, dt);
    // Engine smoke for dying cars.
    if (v.hp < v.maxHp * 0.38 && !v.parked) {
      v.smokeT -= dt;
      if (v.smokeT <= 0) {
        v.smokeT = 0.13;
        const f = { x: v.x + Math.cos(v.angle) * TYPES[v.type].len * 0.4, y: v.y + Math.sin(v.angle) * TYPES[v.type].len * 0.4 };
        G.fx.smoke(f.x, f.y, 1, v.hp < v.maxHp * 0.16);
      }
    }
    if (v.hp <= 0 && !v.dead) {
      v.dead = true;
      G.fx.smoke(v.x, v.y, 10, true);
      if (v === p.vehicle) {
        G.toast('Your ride is wrecked!', '#ff9a8a', 2.6);
        hurtPlayer(6);
      }
    }
  }

  updatePeds(G, dt);
  updateBullets(G, dt);
  updatePolice(G, dt);
  if (G.state !== 'playing') return; // busted/wasted may have fired
  G.missions.update(dt);
  interactions(dt);
  vehicleCollisions(dt);
  if (p.hp <= 0 && G.state === 'playing') G.triggerWasted();
}

// ---------------------------------------------------------------------------
// Camera + render

function snapCamera() {
  const a = G.player.vehicle || G.player;
  G.cam.x = a.x - G.viewW / 2;
  G.cam.y = a.y - G.viewH / 2;
}

function updateCamera(dt) {
  const a = G.player.vehicle || G.player;
  let tx = a.x - G.viewW / 2, ty = a.y - G.viewH / 2;
  if (G.player.vehicle) {
    tx += Math.cos(G.player.vehicle.angle) * G.player.vehicle.speed * 0.34;
    ty += Math.sin(G.player.vehicle.angle) * G.player.vehicle.speed * 0.34;
  }
  const k = 1 - Math.exp(-5.2 * dt);
  G.cam.x += (tx - G.cam.x) * k;
  G.cam.y += (ty - G.cam.y) * k;
  const sh = G.fx.shakeOffset();
  G.cam.sx = sh.x; G.cam.sy = sh.y;
}

function render() {
  const cam = { x: G.cam.x + (G.cam.sx || 0), y: G.cam.y + (G.cam.sy || 0), vw: G.viewW, vh: G.viewH };
  G.camRender = cam;
  drawGround(ctx, G.world, cam, G.tNow);
  G.fx.drawSkids(ctx, cam);
  drawPickups(ctx, G.world, cam, G.tNow);
  if (G.state !== 'menu') drawMarkers(ctx, G, cam);

  // Depth-sorted pass: buildings, palms, people, vehicles.
  const drawables = [];
  for (const b of G.world.buildings) {
    if (b.x + b.w < cam.x - 200 || b.x > cam.x + cam.vw + 200 || b.y + b.h < cam.y - 200 || b.y > cam.y + cam.vh + 200) continue;
    drawables.push({ y: b.y + b.h, fn: () => drawBuilding(ctx, b, cam, G.dark) });
  }
  for (const pl of G.world.palms) {
    drawables.push({ y: pl.y, fn: () => drawPalm(ctx, pl, cam, G.tNow) });
  }
  for (const ped of G.peds) {
    if (ped.hidden) continue;
    drawables.push({ y: ped.y, fn: () => drawPed(ctx, ped, cam, G.tNow) });
  }
  for (const v of G.vehicles) {
    drawables.push({ y: v.y, fn: () => drawVehicle(ctx, v, G, cam) });
  }
  if (!G.player.vehicle && G.state !== 'menu') {
    drawables.push({ y: G.player.y, fn: () => drawPlayer(ctx, G, cam) });
  }
  drawables.sort((m, n) => m.y - n.y);
  for (const d of drawables) d.fn();

  drawBullets(ctx, cam);
  G.fx.drawParts(ctx, cam);

  // Lighting: dusk warmth, then night darkness, then lamp glow on top.
  if (G.warm > 0.01) {
    ctx.fillStyle = `rgba(255,116,40,${G.warm * 0.22})`;
    ctx.fillRect(0, 0, G.viewW, G.viewH);
  }
  if (G.dark > 0.01) {
    ctx.fillStyle = `rgba(16,18,52,${G.dark * 0.42})`;
    ctx.fillRect(0, 0, G.viewW, G.viewH);
    drawLampGlow(ctx, G.world, cam, G.dark);
  }

  if (G.state === 'menu') { drawMenu(ctx, G); return; }
  drawHUD(ctx, G);
  if (G.state === 'paused') drawPause(ctx, G);
  if (G.state === 'busted' || G.state === 'wasted') drawEndScreen(ctx, G);
}

// ---------------------------------------------------------------------------
// Main loop

let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  G.tNow += dt;
  G.frame++;

  if (G.shotMode) {
    // Frozen tableau: render real state, announce readiness.
    G.dark = darkFor(G.dayT);
    G.warm = warmFor(G.dayT);
    render();
    if (G.frame > 45) window.__shotReady = true;
    G.input.endFrame();
    return;
  }

  // Global keys.
  if (G.input.hit('KeyM')) {
    const m = G.audio.toggleMute();
    G.toast(m ? 'Sound off' : 'Sound on', '#ffffff', 1.4);
  }
  if (G.state === 'menu') {
    // Slow scenic pan behind the menu.
    G.cam.x = WORLD_W * 0.32 + Math.sin(G.tNow * 0.05) * 300 - G.viewW / 2;
    G.cam.y = WORLD_H * 0.4 + Math.cos(G.tNow * 0.037) * 200 - G.viewH / 2;
    G.dark = darkFor(0.34);
    G.warm = 0.1;
    for (const v of G.vehicles) if (v.driver === 'traffic') updateTraffic(v, G, dt);
    updatePeds(G, dt);
    G.fx.update(dt);
    if (G.input.hit('Enter')) startRun(true);
    else if (G.input.hit('KeyC') && G.hasSave) startRun(false);
  } else if (G.state === 'playing') {
    G.dayT = (G.dayT + dt / DAY_LEN) % 1;
    G.dark = darkFor(G.dayT);
    G.warm = warmFor(G.dayT);
    update(dt);
    G.fx.update(dt);
    updateCamera(dt);
    if (G.input.hit('Escape')) { G.state = 'paused'; G.audio.engine(0, false); G.audio.siren(false); }
  } else if (G.state === 'paused') {
    if (G.input.hit('Escape')) G.state = 'playing';
    else if (G.input.hit('KeyS')) { G.persist(); G.toast('Game saved', '#7dff9a', 1.6); }
    else if (G.input.hit('KeyQ')) G.state = 'menu';
  } else if (G.state === 'busted' || G.state === 'wasted') {
    G.fx.update(dt);
    updateCamera(dt);
    if (G.input.hit('Enter')) G.state = 'playing';
  }

  // Toasts tick down in every state.
  for (let i = G.toasts.length - 1; i >= 0; i--) {
    G.toasts[i].t -= dt;
    if (G.toasts[i].t <= 0) G.toasts.splice(i, 1);
  }

  render();
  G.input.endFrame();
}

function resize() {
  G.viewW = window.innerWidth;
  G.viewH = window.innerHeight;
  canvas.width = G.viewW;
  canvas.height = G.viewH;
  G.cam.vw = G.viewW;
  G.cam.vh = G.viewH;
}
window.addEventListener('resize', resize);
resize();

// Screenshot mode: set the run up, arrange the scene, snap the camera.
if (G.shotMode) {
  G.save = defaultSave();
  applySave();
  setupShot(G, shotName);
  snapCamera();
}

requestAnimationFrame(loop);
