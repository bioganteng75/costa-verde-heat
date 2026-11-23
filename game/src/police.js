// police.js — the Costa Verde PD: wanted heat, witnesses, pursuit AI,
// roadblocks at high heat, and the bust meter.
// Crimes only count when somebody sees them (a pedestrian nearby, a
// patrol car in range, or the victim themselves). Heat decays while
// nobody has eyes on the player.

import { createVehicle, steerToward, TYPES } from './vehicles.js';
import { randomRoadPoint, vRoadX, hRoadY, CYCLE, ROAD_W, COLS, ROWS } from './world.js';

export const CRIME_HEAT = {
  theft: 55,
  assault: 45,
  hitrun: 120,
  shots: 22,
  policecrash: 80,
  vandal: 16,
  crash: 10,
};

export function createPolice() {
  return {
    heat: 0,
    stars: 0,
    lastSeenT: 99,   // seconds since any witness saw the player
    bust: 0,         // 0..1 bust meter
    cars: [],        // pursuit cars (also present in G.vehicles)
    spawnT: 0,
    blockCd: 24,
    roadblock: null, // { cars: [], x, y }
    starFlash: 0,
    shotCrimeT: -9,
  };
}

export function playerAnchor(G) {
  return G.player.vehicle || G.player;
}

function witnessed(G, x, y) {
  for (const p of G.peds) {
    if (p.hidden || p.state === 'down') continue;
    if (Math.hypot(p.x - x, p.y - y) < 245) return true;
  }
  for (const v of G.vehicles) {
    if (v.type === 'police' && Math.hypot(v.x - x, v.y - y) < 440) return true;
  }
  return false;
}

// Returns true when the crime was seen and heat was applied.
export function reportCrime(G, type, x, y, always = false) {
  const P = G.police;
  if (type === 'hitrun') always = true; // the victim always reports it
  if (!always && !witnessed(G, x, y)) return false;
  if (type === 'shots') {
    if (G.tNow - P.shotCrimeT < 0.8) return true; // don't stack per bullet
    P.shotCrimeT = G.tNow;
  }
  const before = P.stars;
  P.heat = Math.min(500, P.heat + (CRIME_HEAT[type] || 20));
  P.lastSeenT = 0;
  P.stars = starsFor(P.heat);
  if (P.stars > before) P.starFlash = 1.4;
  return true;
}

export function starsFor(heat) {
  return heat <= 0 ? 0 : Math.min(5, Math.ceil(heat / 100));
}

export function setStars(G, n) {
  const P = G.police;
  P.heat = n <= 0 ? 0 : (n - 1) * 100 + 55;
  P.stars = starsFor(P.heat);
  P.lastSeenT = 0;
  P.starFlash = 1.4;
}

export function clearHeat(G) {
  const P = G.police;
  P.heat = 0;
  P.stars = 0;
  P.bust = 0;
}

function spawnPatrol(G, near) {
  const a = playerAnchor(G);
  for (let tries = 0; tries < 8; tries++) {
    const pt = randomRoadPoint(Math.random);
    const d = Math.hypot(pt.x - a.x, pt.y - a.y);
    if (d < near - 80 || d > near + 220) continue;
    const ang = Math.atan2(a.y - pt.y, a.x - pt.x);
    const car = createVehicle('police', pt.x, pt.y, ang, { driver: 'police' });
    G.vehicles.push(car);
    G.police.cars.push(car);
    return car;
  }
  return null;
}

function removeCar(G, car) {
  const gi = G.vehicles.indexOf(car);
  if (gi >= 0) G.vehicles.splice(gi, 1);
  const pi = G.police.cars.indexOf(car);
  if (pi >= 0) G.police.cars.splice(pi, 1);
}

export function updatePolice(G, dt) {
  const P = G.police;
  const a = playerAnchor(G);
  P.starFlash = Math.max(0, P.starFlash - dt);

  // --- who can see the player right now? --------------------------------
  let seen = false;
  for (const c of P.cars) {
    if (Math.hypot(c.x - a.x, c.y - a.y) < 540) { seen = true; break; }
  }
  if (!seen) {
    for (const p of G.peds) {
      if (!p.hidden && p.state !== 'down' && Math.hypot(p.x - a.x, p.y - a.y) < 200) { seen = true; break; }
    }
  }
  if (seen) P.lastSeenT = 0; else P.lastSeenT += dt;

  // --- heat decay while unseen -------------------------------------------
  if (P.lastSeenT > 3.5 && P.heat > 0) {
    P.heat = Math.max(0, P.heat - (P.stars >= 4 ? 3.4 : 6.5) * dt);
    P.stars = starsFor(P.heat);
  }

  // --- spawning / retiring patrols ----------------------------------------
  const desired = P.stars === 0 ? 0 : Math.min(2 + P.stars, 7);
  P.spawnT -= dt;
  if (P.cars.length < desired && P.spawnT <= 0) {
    if (spawnPatrol(G, 620)) P.spawnT = 1.1;
    else P.spawnT = 0.4;
  }
  for (let i = P.cars.length - 1; i >= 0; i--) {
    const c = P.cars[i];
    const d = Math.hypot(c.x - a.x, c.y - a.y);
    if (d > 980 || (P.stars === 0 && d > 620)) removeCar(G, c);
  }

  // --- pursuit --------------------------------------------------------------
  const inCar = !!G.player.vehicle;
  const pv = G.player.vehicle;
  for (const c of P.cars) {
    if (c.dead) continue;
    let tx = a.x, ty = a.y;
    if (inCar && pv) { tx += Math.cos(pv.angle) * pv.speed * 0.38; ty += Math.sin(pv.angle) * pv.speed * 0.38; }
    if (c.reverseT > 0) {
      c.reverseT -= dt;
      c.speed = -125;
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      continue;
    }
    const cruise = TYPES.police.maxSpeed * (P.stars >= 4 ? 1.0 : 0.93);
    steerToward(c, tx, ty, dt, cruise, 1.12);
    if (Math.abs(c.speed) < 14 && Math.hypot(tx - c.x, ty - c.y) > 90) {
      c.stuckT += dt;
      if (c.stuckT > 0.9) { c.reverseT = 0.55; c.stuckT = 0; }
    } else c.stuckT = 0;
  }

  // --- roadblocks at 4+ stars -----------------------------------------------
  P.blockCd -= dt;
  if (P.roadblock) {
    const rb = P.roadblock;
    const d = Math.hypot(rb.x - a.x, rb.y - a.y);
    if (d < 170) {
      for (const c of rb.cars) {
        c.driver = 'police';
        if (!P.cars.includes(c)) P.cars.push(c);
      }
      P.roadblock = null;
    } else if (d > 620) {
      for (const c of rb.cars) {
        const gi = G.vehicles.indexOf(c);
        if (gi >= 0) G.vehicles.splice(gi, 1);
      }
      P.roadblock = null;
    }
  } else if (P.stars >= 4 && inCar && P.blockCd <= 0 && Math.abs(pv.speed) > 120) {
    // Seal the intersection ahead of the player's travel direction.
    const aheadX = a.x + Math.cos(pv.angle) * 430;
    const aheadY = a.y + Math.sin(pv.angle) * 430;
    const ii = Math.max(0, Math.min(COLS, Math.round((aheadX - ROAD_W / 2) / CYCLE)));
    const jj = Math.max(0, Math.min(ROWS, Math.round((aheadY - ROAD_W / 2) / CYCLE)));
    const cx = vRoadX(ii), cy = hRoadY(jj);
    const horizontal = Math.abs(Math.cos(pv.angle)) > Math.abs(Math.sin(pv.angle));
    const cars = [];
    for (let k = -1; k <= 1; k++) {
      const px = horizontal ? cx : cx + k * 24;
      const py = horizontal ? cy + k * 24 : cy;
      const car = createVehicle('police', px, py, horizontal ? Math.PI / 2 : 0, { driver: 'block', parked: true });
      G.vehicles.push(car);
      cars.push(car);
    }
    P.roadblock = { cars, x: cx, y: cy };
    P.blockCd = 34;
  }

  // --- bust meter --------------------------------------------------------------
  let nearest = 1e9;
  for (const v of G.vehicles) {
    if (v.type !== 'police' || v.dead) continue;
    const d = Math.hypot(v.x - a.x, v.y - a.y);
    if (d < nearest) nearest = d;
  }
  const playerSpeed = inCar ? Math.abs(pv.speed) : (G.playerSpeed || 0);
  const inDanger = inCar ? (nearest < 86 && playerSpeed < 38) : (nearest < 98 && playerSpeed < 175);
  if (inDanger && P.stars > 0) {
    P.bust = Math.min(1, P.bust + dt / (inCar ? 3.0 : 2.3));
    if (P.bust >= 1) { G.triggerBusted(); return; }
  } else {
    P.bust = Math.max(0, P.bust - dt * 0.65);
  }

  // Siren audible when a patrol is reasonably close.
  G.audio.siren(P.stars > 0 && nearest < 720);
}
