// police.js — the wanted system of Costa Verde: crimes raise heat, heat
// becomes stars, stars bring patrol cars that hunt Rafe across the grid.
// Staying out of sight lets the heat bleed away; getting cornered while
// slow fills the bust meter, and an empty meter is a free man.
//
// v2 escalation: at four stars and up the Policía stop chasing fair —
// they seal the intersection ahead with a roadblock of parked patrol
// cars and wait for you to make the mistake. Pursuit speed scales with
// the stars, so a one-star tail is a nuisance and a five-star tail is a
// nightmare, but never an impossible one.

import { CAR_TYPES, makeCar, nodeNeighbours } from './vehicles.js';
import { collideCircle } from './world.js';
import { Sound } from './audio.js';

export function createWanted() {
  return {
    heat: 0,          // 0..~6, stars are floor(heat) capped at 5
    stars: 0,
    lastCrimeAt: -99, // G.time of the last witnessed crime
    seenT: 0,         // seconds since a police unit last saw the player
    bustMeter: 0,     // 0..1, fills while cornered
  };
}

/** Register a crime. severity ~0.5 (shove) .. 2.5 (gunfire). */
export function commitCrime(G, severity, x, y, witnessed = true) {
  const w = G.wanted;
  const now = G.time;
  // Fresh eyes matter most: a crime in front of a patrol counts double.
  let seen = witnessed;
  if (!seen) {
    for (const car of G.cars) {
      if (car.type === 'police' && Math.hypot(car.x - x, car.y - y) < 340) { seen = true; break; }
    }
  }
  if (seen) {
    w.heat = Math.min(6.4, w.heat + severity * 0.62);
    w.lastCrimeAt = now;
    w.seenT = 0;
  } else {
    w.heat = Math.min(6.4, w.heat + severity * 0.2);
  }
  w.stars = Math.min(5, Math.floor(w.heat));
}

function policeTargetCount(w) {
  return w.stars <= 0 ? 0 : Math.min(6, w.stars + 1);
}

function spawnPolice(G) {
  // Come from a road node a few blocks away, never on top of the player.
  const px = G.player.car ? G.player.car.x : G.player.x;
  const py = G.player.car ? G.player.car.y : G.player.y;
  let best = null;
  let bestScore = -Infinity;
  for (const n of G.nodes) {
    const d = Math.hypot(n.x - px, n.y - py);
    if (d < 420 || d > 1250) continue;
    const score = -Math.abs(d - 750) + Math.random() * 60;
    if (score > bestScore) { bestScore = score; best = n; }
  }
  if (!best) return;
  const car = makeCar(best.x, best.y, 0, 'police', 'police');
  car.targetNode = nodeNeighbours(G.nodes, best)[0];
  car.fromNode = best;
  G.cars.push(car);
  G.police.push(car);
}

/** Patrol speed factor by stars: polite at one, relentless at five. */
export function pursuitFactor(stars) {
  return 0.9 + stars * 0.045;
}

/**
 * Seal an intersection ahead of the player with parked patrol cars.
 * The block is a pair (a triple at five stars) set across the road the
 * player is travelling on, far enough ahead to be a decision, not a
 * jump-scare. Blocks dissolve once the heat drops or the player is far.
 */
export function spawnRoadblock(G) {
  const p = G.player;
  const focus = p.car ?? p;
  const heading = p.car ? p.car.angle : p.angle;
  const aheadX = focus.x + Math.cos(heading) * 620;
  const aheadY = focus.y + Math.sin(heading) * 620;
  let node = null;
  let bd = Infinity;
  for (const n of G.nodes) {
    const d = Math.hypot(n.x - aheadX, n.y - aheadY);
    if (d < bd) { bd = d; node = n; }
  }
  if (!node || bd > 420) return false;
  // Park across whichever road runs through the node toward the player.
  const acrossAngle = Math.abs(Math.cos(heading)) > Math.abs(Math.sin(heading))
    ? Math.PI / 2   // player runs east-west: cars face north, sealing lanes
    : 0;           // player runs north-south: cars face east
  const cars = [];
  const count = G.wanted.stars >= 5 ? 3 : 2;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 44;
    const bx = acrossAngle === 0 ? node.x : node.x + off;
    const by = acrossAngle === 0 ? node.y + off : node.y;
    const car = makeCar(bx, by, acrossAngle + (i % 2 ? 0.06 : -0.06), 'police', 'block');
    car.speed = 0;
    G.cars.push(car);
    cars.push(car);
  }
  G.roadblocks.push({ cars, x: node.x, y: node.y });
  G.toast?.('Roadblock ahead!');
  Sound.horn();
  return true;
}

function clearRoadblocks(G, dissolveFar) {
  const p = G.player;
  for (let i = G.roadblocks.length - 1; i >= 0; i--) {
    const rb = G.roadblocks[i];
    const d = Math.hypot(rb.x - p.x, rb.y - p.y);
    if (dissolveFar && d < 950) continue;
    for (const car of rb.cars) {
      const idx = G.cars.indexOf(car);
      if (idx >= 0) G.cars.splice(idx, 1);
    }
    G.roadblocks.splice(i, 1);
  }
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  const px = G.player.car ? G.player.car.x : G.player.x;
  const py = G.player.car ? G.player.car.y : G.player.y;

  // Line of sight: any live patrol within 330 units refreshes the hunt.
  let seen = false;
  for (const cop of G.police) {
    if (cop.wrecked) continue;
    if (Math.hypot(cop.x - px, cop.y - py) < 330) { seen = true; break; }
  }
  if (seen) w.seenT = 0;
  else w.seenT += dt;

  // Heat decays only while unseen and no fresh crime has landed.
  if (!seen && G.time - w.lastCrimeAt > 4) {
    w.heat = Math.max(0, w.heat - dt * 0.15);
    w.stars = Math.min(5, Math.floor(w.heat));
  }

  // Keep the patrol strength matched to the stars.
  const want = policeTargetCount(w);
  const alive = G.police.filter((c) => !c.wrecked);
  if (alive.length < want) {
    G.policeSpawnT -= dt;
    if (G.policeSpawnT <= 0) {
      spawnPolice(G);
      G.policeSpawnT = 2.2;
    }
  } else if (alive.length > want + 1) {
    // Extras peel off when the heat drops.
    const extra = alive[alive.length - 1];
    extra.driver = 'traffic';
    G.police.splice(G.police.indexOf(extra), 1);
  }

  // Roadblocks: raised at four stars, refreshed on a long cooldown,
  // dissolved when the heat dies or the player leaves them behind.
  G.roadblockCd = Math.max(0, (G.roadblockCd ?? 0) - dt);
  if (w.stars >= 4) {
    if (G.roadblocks.length === 0 && G.roadblockCd <= 0) {
      if (spawnRoadblock(G)) G.roadblockCd = 26;
      else G.roadblockCd = 5;
    }
  } else if (G.roadblocks.length) {
    clearRoadblocks(G, false);
  }
  if (G.roadblocks.length) clearRoadblocks(G, true);

  Sound.setSiren(w.stars >= 1 && alive.length > 0 && !G.player.dead);
}

export function updatePoliceCar(G, car, dt) {
  if (car.wrecked) return;
  const target = G.player.car ?? G.player;
  const tx = target.x;
  const ty = target.y;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Aim slightly ahead of a moving target to cut corners.
  const lead = Math.min(0.5, dist / 700);
  const aimX = tx + (target === G.player.car ? Math.cos(target.angle) * target.speed * lead : 0);
  const aimY = ty + (target === G.player.car ? Math.sin(target.angle) * target.speed * lead : 0);

  const want = Math.atan2(aimY - car.y, aimX - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const spec = CAR_TYPES.police;
  car.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));

  let desired = spec.maxSpeed * pursuitFactor(G.wanted.stars) * (dist > 260 ? 1 : 0.74);
  if (Math.abs(diff) > 2.2) desired = -120; // badly turned around: back up
  car.braking = desired < car.speed - 30;
  car.speed += Math.max(-380 * dt, Math.min(spec.accel * dt, desired - car.speed));
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const pos = { x: car.x, y: car.y };
  if (collideCircle(G.city, pos, car.w * 0.42)) {
    car.x = pos.x;
    car.y = pos.y;
    car.speed *= -0.2;
    G.onSpark?.(car.x, car.y);
  }

  // Ramming a fleeing car hurts it a little and the player a little.
  if (G.player.car && car !== G.player.car) {
    const d = Math.hypot(G.player.car.x - car.x, G.player.car.y - car.y);
    if (d < (car.w + G.player.car.w) * 0.4 && Math.abs(car.speed) > 130 && G.ramCd <= 0) {
      G.player.car.health -= 7;
      G.ramCd = 0.8;
      Sound.crash();
      G.onSpark?.(G.player.car.x, G.player.car.y);
    }
  }
}

/** Bust logic: cornered + slow + close police fills the meter. */
export function updateBust(G, dt) {
  const w = G.wanted;
  if (w.stars <= 0 || G.player.dead) { w.bustMeter = Math.max(0, w.bustMeter - dt * 0.6); return; }
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const speed = p.car ? Math.abs(p.car.speed) : (G.playerMoving ? 150 : 0);
  let near = 0;
  for (const cop of G.police) {
    if (cop.wrecked) continue;
    if (Math.hypot(cop.x - px, cop.y - py) < 95) near++;
  }
  // One cop is a warning; two are a problem. Moving even slowly bleeds it.
  if (near > 0 && speed < 42) {
    w.bustMeter += dt * (near >= 2 ? 0.5 : 0.3);
  } else {
    w.bustMeter = Math.max(0, w.bustMeter - dt * 0.55);
  }
  if (w.bustMeter >= 1) {
    w.bustMeter = 0;
    G.onBusted?.();
  }
}

export function clearWanted(G) {
  G.wanted.heat = 0;
  G.wanted.stars = 0;
  G.wanted.bustMeter = 0;
  for (const cop of G.police) cop.driver = 'traffic';
  G.police.length = 0;
  if (G.roadblocks?.length) clearRoadblocks(G, false);
  Sound.setSiren(false);
}
