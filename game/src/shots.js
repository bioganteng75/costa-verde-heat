// shots.js — deterministic screenshot scenes for Costa Verde Heat.
// ?shot=cover|chase|dusk|mission&seed=1 arranges real game state — real
// cars, real police, a real roadblock, a real mission objective, the
// real HUD — then main.js freezes the action and paints it for the
// screenshot. Nothing here draws anything the game itself would not
// draw; even the skid marks and sparks in the chase are laid into the
// same fx stores the live game fills.

import { makeCar } from './vehicles.js';
import { STORY } from './missions.js';

function addCar(G, x, y, angle, type, driver, speed = 0) {
  const car = makeCar(x, y, angle, type, driver);
  car.speed = speed;
  G.cars.push(car);
  return car;
}

function scatterPeds(G, cx, cy, n, spread = 190) {
  let placed = 0;
  for (const ped of G.peds) {
    if (placed >= n) break;
    ped.x = cx + ((placed * 67) % spread) - spread / 2;
    ped.y = cy + ((placed * 41) % 120) - 60;
    ped.state = 'walk';
    ped.tx = ped.x + 60;
    ped.ty = ped.y + 20;
    placed++;
  }
}

/** Lay a curving pair of tyre marks into the fx store, as a slide would. */
function laySkidTrail(G, x0, y0, x1, y1, bend) {
  const steps = 34;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * bend;
    const ang = Math.atan2((y1 - y0) + Math.cos(t * Math.PI) * bend * Math.PI * 0.06, x1 - x0);
    for (const off of [-11, 11]) {
      G.fx.skids.push({
        x: x - Math.sin(ang) * off,
        y: y + Math.cos(ang) * off,
        ang, a: 0.5,
      });
    }
  }
}

/** Freeze a burst of collision sparks into the fx store. */
function laySparks(G, x, y, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 90 + Math.random() * 240;
    G.fx.particles.push({
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0.5, maxLife: 0.58,
      size: 2 + Math.random() * 2,
    });
  }
}

/** Stage the named scene on a freshly built game state. */
export function setupShot(G, name) {
  const p = G.player;
  G.state = 'playing';
  G.shotMode = true;

  if (name === 'chase') {
    // Four stars: a borrowed Deportivo outruns three patrol cars toward
    // the roadblock sealing the next avenue — and the barrier wins ties.
    const car = addCar(G, 1650, 1400, 0, 'sport', 'player', 430);
    p.car = car;
    p.x = car.x; p.y = car.y;
    p.cash = 1240;
    G.wanted.heat = 4.4;
    G.wanted.stars = 4;
    const c1 = addCar(G, 1425, 1332, 0.22, 'police', 'police', 385);
    const c2 = addCar(G, 1395, 1472, -0.2, 'police', 'police', 370);
    const c3 = addCar(G, 1528, 1120, Math.PI / 2 + 0.25, 'police', 'police', 300);
    G.police.push(c1, c2, c3);
    // The roadblock: two patrol cars parked across the avenue ahead.
    const b1 = addCar(G, 2086, 1356, Math.PI / 2, 'police', 'block', 0);
    const b2 = addCar(G, 2086, 1444, -Math.PI / 2, 'police', 'block', 0);
    G.roadblocks.push({ cars: [b1, b2], x: 2100, y: 1400 });
    // The slide that started it all, still smoking on the asphalt.
    laySkidTrail(G, 1210, 1470, 1635, 1405, -34);
    laySparks(G, 1420, 1300, 16);
    // The "Heat Check" escape step gives the banner its objective.
    G.missions.storyIndex = 2;
    G.missions.active = { def: STORY[2], stepIndex: 1, stepT: 0, cpIndex: 0 };
    const civ = addCar(G, 1500, 1080, Math.PI / 2, 'sedan', 'traffic', 120);
    civ.braking = true;
    scatterPeds(G, 1750, 1560, 4);
    return;
  }

  if (name === 'dusk') {
    // Golden hour on the coastal avenue: headlights on, the sea going
    // dark, a truck ambling home and the whole city lit amber.
    G.forceDusk = 1;
    const car = addCar(G, 2350, 2280, 0, 'sport', 'player', 380);
    p.car = car;
    p.x = car.x; p.y = car.y;
    p.cash = 860;
    const truck = addCar(G, 2760, 2252, 0, 'truck', 'traffic', 130);
    truck.braking = true;
    addCar(G, 1980, 2308, Math.PI, 'sedan', 'traffic', 150);
    addCar(G, 2215, 2348, 0.4, 'moto', null, 0); // parked by the sand
    scatterPeds(G, 2560, 2430, 5, 260);
    return;
  }

  if (name === 'mission') {
    // Seconds left on Marisol's hot-package run, marina dead ahead.
    const car = addCar(G, 2790, 2300, 0.35, 'taxi', 'player', 265);
    p.car = car;
    p.x = car.x; p.y = car.y;
    p.cash = 410;
    G.missions.storyIndex = 1;
    G.missions.active = { def: STORY[1], stepIndex: 1, stepT: 41, cpIndex: 0 };
    addCar(G, 2620, 2210, 0, 'sedan', 'traffic', 90);
    addCar(G, 3060, 2260, Math.PI, 'moto', 'traffic', 160);
    scatterPeds(G, 3050, 2380, 4, 140);
    return;
  }

  // "cover" (and any unknown name): Rafe on foot in the downtown
  // canyon, towers overhead, traffic rolling past and Marisol's first
  // job waiting up north — close enough to point an arrow at.
  p.x = 2165;
  p.y = 1475;
  p.angle = -0.7;
  p.cash = 235;
  addCar(G, 2072, 1180, Math.PI / 2, 'sedan', 'traffic', 120);
  addCar(G, 2128, 1660, -Math.PI / 2, 'taxi', 'traffic', 125);
  addCar(G, 1850, 1372, Math.PI, 'sport', 'traffic', 140);
  addCar(G, 2480, 1428, 0, 'sedan', 'traffic', 115);
  addCar(G, 2235, 1335, 0, 'moto', null, 0); // parked, stealable
  scatterPeds(G, 2240, 1520, 7);
}
