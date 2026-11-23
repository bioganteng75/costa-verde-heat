// shots.js — deterministic screenshot scenes for Costa Verde Heat.
// ?shot=cover|drive|chase|mission&seed=1 arranges real game state — real
// cars, real police, a real mission objective, the real HUD — then main.js
// freezes the action and paints it for the screenshot. Nothing here draws
// anything the game itself would not draw.

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

/** Stage the named scene on a freshly built game state. */
export function setupShot(G, name) {
  const p = G.player;
  G.state = 'playing';
  G.shotMode = true;

  if (name === 'drive') {
    // Flat out down the central avenue in a borrowed sports car.
    const car = addCar(G, 1500, 1980, -Math.PI / 2, 'sport', 'player', 395);
    p.car = car;
    p.x = car.x; p.y = car.y;
    addCar(G, 1472, 1560, -Math.PI / 2, 'sedan', 'traffic', 130);
    addCar(G, 1528, 1180, Math.PI / 2, 'taxi', 'traffic', 120);
    addCar(G, 1472, 2260, -Math.PI / 2, 'sedan', 'traffic', 110);
    scatterPeds(G, 1420, 1760, 5);
    return;
  }

  if (name === 'chase') {
    // Three stars, three patrol cars, one very loud afternoon.
    const car = addCar(G, 1560, 1400, 0, 'sedan', 'player', 330);
    p.car = car;
    p.x = car.x; p.y = car.y;
    G.wanted.heat = 3.6;
    G.wanted.stars = 3;
    const c1 = addCar(G, 1380, 1330, 0.3, 'police', 'police', 300);
    const c2 = addCar(G, 1330, 1470, -0.25, 'police', 'police', 285);
    const c3 = addCar(G, 1830, 1290, 2.6, 'police', 'police', 240);
    G.police.push(c1, c2, c3);
    // The "Heat Check" escape step gives the banner its objective.
    G.missions.storyIndex = 2;
    G.missions.active = { def: STORY[2], stepIndex: 1, stepT: 0, cpIndex: 0 };
    addCar(G, 1500, 1080, Math.PI / 2, 'sedan', 'traffic', 120);
    scatterPeds(G, 1700, 1520, 4);
    return;
  }

  if (name === 'mission') {
    // Seconds left on Marisol's hot-package run, marina dead ahead.
    const car = addCar(G, 2820, 2310, 0, 'taxi', 'player', 265);
    p.car = car;
    p.x = car.x; p.y = car.y;
    G.missions.storyIndex = 1;
    G.missions.active = { def: STORY[1], stepIndex: 1, stepT: 41, cpIndex: 0 };
    addCar(G, 2700, 2240, 0, 'sedan', 'traffic', 90);
    scatterPeds(G, 3050, 2380, 4, 140);
    return;
  }

  // "cover" (and any unknown name): Rafe on foot downtown, mid-morning,
  // traffic rolling past and Marisol's first job waiting on the minimap.
  p.x = 1560;
  p.y = 1470;
  p.angle = -0.7;
  addCar(G, 1472, 1230, Math.PI / 2, 'sedan', 'traffic', 120);
  addCar(G, 1528, 1620, -Math.PI / 2, 'taxi', 'traffic', 125);
  addCar(G, 1230, 1372, 0, 'sport', 'traffic', 140);
  addCar(G, 1960, 1428, Math.PI, 'sedan', 'traffic', 115);
  addCar(G, 1620, 1330, Math.PI, 'sedan', null, 0); // parked, stealable
  scatterPeds(G, 1620, 1500, 7);
}
