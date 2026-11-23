// shots.js — deterministic screenshot scenes for the entry's gallery.
// Each scene arranges real game state (real entities, real HUD) and
// freezes it; main.js renders a few frames and then sets
// window.__shotReady so the capture script can fire.

import { vRoadX, hRoadY } from './world.js';
import { createVehicle } from './vehicles.js';
import { setStars } from './police.js';

function placeTraffic(G, type, x, y, angle) {
  const v = createVehicle(type, x, y, angle, { driver: 'traffic' });
  v.speed = 90;
  G.vehicles.push(v);
  return v;
}

function placePolice(G, x, y, angle, pursuit = true) {
  const v = createVehicle('police', x, y, angle, { driver: pursuit ? 'police' : 'block', parked: !pursuit });
  G.vehicles.push(v);
  if (pursuit) G.police.cars.push(v);
  return v;
}

export function setupShot(G, name) {
  const p = G.player;
  G.state = 'playing';
  G.save.cash = 1250;

  if (name === 'cover') {
    // Morning downtown: the player on foot, traffic flowing, the whole
    // HUD live and Marisol's marker on the minimap.
    G.dayT = 0.30;
    p.x = vRoadX(4) - 6; // middle of the downtown intersection, clear of rooftops
    p.y = hRoadY(3) + 10;
    p.angle = -0.5;
    p.weapon = 'pistol';
    placeTraffic(G, 'sedan', vRoadX(4) - 10, hRoadY(3) - 150, Math.PI / 2);
    placeTraffic(G, 'taxi', vRoadX(4) + 16, hRoadY(3) + 190, -Math.PI / 2);
    placeTraffic(G, 'sport', vRoadX(3) + 120, hRoadY(3) - 16, 0);
    G.save.cash = 1250;
  }

  if (name === 'chase') {
    // Four stars on a downtown avenue: pursuit behind, a roadblock
    // ahead, skid marks under the tyres, escape banner up.
    G.dayT = 0.44;
    const car = createVehicle('sport', vRoadX(2) + 320, hRoadY(3) - 18, 0, { color: '#e83e2e' });
    car.speed = 305;
    G.vehicles.push(car);
    p.vehicle = car;
    p.x = car.x; p.y = car.y;
    setStars(G, 4);
    placePolice(G, car.x - 120, car.y + 26, 0.12);
    placePolice(G, car.x - 210, car.y - 30, -0.08);
    placePolice(G, car.x - 300, car.y + 8, 0.04);
    const bx = vRoadX(5), by = hRoadY(3);
    const block = [];
    for (let k = -1; k <= 1; k++) block.push(placePolice(G, bx, by + k * 25, Math.PI / 2, false));
    G.police.roadblock = { cars: block, x: bx, y: by };
    G.fx.skidTrail(car.x - 26, car.y + 9, 0, 190);
    G.fx.skidTrail(car.x - 26, car.y - 9, 0, 150);
    G.fx.sparks(car.x - 30, car.y + 12, Math.PI, 14);
    G.objectiveOverride = { x: null, y: null, text: 'SHAKE THE HEAT — lose the police!', timer: null };
    G.save.cash = 3420;
  }

  if (name === 'dusk') {
    // The coastal avenue at dusk: lamps lit, headlights on, palms
    // silhouetted against the sea.
    G.dayT = 0.70;
    const car = createVehicle('sedan', vRoadX(9) - 16, hRoadY(4) - 60, Math.PI / 2, { color: '#4a7fb5' });
    car.speed = 150;
    G.vehicles.push(car);
    p.vehicle = car;
    p.x = car.x; p.y = car.y;
    const ahead = placeTraffic(G, 'sedan', vRoadX(9) - 16, hRoadY(4) + 190, Math.PI / 2);
    ahead.speed = 120;
    const north = placeTraffic(G, 'taxi', vRoadX(9) + 16, hRoadY(4) - 260, -Math.PI / 2);
    north.speed = 110;
    G.save.cash = 2080;
  }

  if (name === 'mission') {
    // Mid-delivery in Marisol's "Hot Lunch": taxi flying downtown,
    // gold marker across the map, 54 seconds on the banner clock.
    G.dayT = 0.38;
    G.missions.startAt(1); // Hot Lunch
    const A = G.missions.active;
    A.idx = 1; // already collected; the timed delivery stage is live
    A.stages[1].timeLeft = 54;
    const car = createVehicle('taxi', vRoadX(5) + 60, hRoadY(2) - 17, 0, {});
    car.speed = 215;
    G.vehicles.push(car);
    p.vehicle = car;
    p.x = car.x; p.y = car.y;
    placeTraffic(G, 'sedan', vRoadX(5) - 190, hRoadY(2) + 17, Math.PI);
    placeTraffic(G, 'sport', vRoadX(6) + 40, hRoadY(2) + 17, Math.PI);
    G.save.cash = 860;
  }
}
