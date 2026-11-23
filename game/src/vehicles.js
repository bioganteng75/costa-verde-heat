// vehicles.js — every car, bike and truck in Costa Verde.
// Six types with their own physics and looks, an arcade driving model
// for the player, and lane-following traffic AI that cruises the road
// grid, picks turns at intersections and brakes for obstacles.

import { ROAD_W, CYCLE, vRoadX, hRoadY, COLS, ROWS } from './world.js';

export const TYPES = {
  sedan:  { len: 46, wid: 22, maxSpeed: 268, accel: 195, rev: 105, turn: 2.7, hp: 100, mass: 1.0, name: 'Sedan' },
  sport:  { len: 48, wid: 22, maxSpeed: 395, accel: 305, rev: 120, turn: 2.9, hp: 85,  mass: 0.95, name: 'Sport Coupe' },
  taxi:   { len: 46, wid: 22, maxSpeed: 262, accel: 190, rev: 105, turn: 2.7, hp: 105, mass: 1.0, name: 'Taxi' },
  moto:   { len: 30, wid: 11, maxSpeed: 335, accel: 325, rev: 80,  turn: 3.8, hp: 45,  mass: 0.45, name: 'Motorcycle' },
  truck:  { len: 66, wid: 26, maxSpeed: 212, accel: 128, rev: 80,  turn: 1.7, hp: 185, mass: 2.3, name: 'Box Truck' },
  police: { len: 48, wid: 22, maxSpeed: 352, accel: 272, rev: 115, turn: 2.9, hp: 135, mass: 1.1, name: 'Patrol Car' },
};

const COLORS = {
  sedan: ['#c94f42', '#4a7fb5', '#e0e4e8', '#5da85f', '#8a6fc9', '#d9a441', '#707880'],
  sport: ['#e83e2e', '#ffb400', '#19b5a6', '#e8e8ec', '#2e6de8', '#ff5e8a'],
  moto: ['#2b2f36', '#c22e2e', '#2e7fc2', '#e07b28'],
  truck: ['#7a8894', '#b5533c', '#4f7a5a', '#c2c7cc'],
  taxi: ['#f7b731'],
  police: ['#eef1f4'],
};

let nextId = 1;

export function createVehicle(type, x, y, angle, opts = {}) {
  const t = TYPES[type];
  const palette = COLORS[type];
  return {
    id: nextId++,
    type, x, y, angle,
    speed: 0, steerVis: 0,
    hp: t.hp, maxHp: t.hp,
    color: opts.color || (palette ? palette[(Math.random() * palette.length) | 0] : '#eef1f4'),
    driver: opts.driver || null, // 'player' | 'traffic' | 'police' | null (parked)
    parked: !!opts.parked,
    dead: false,
    braking: false,
    smokeT: 0,
    stuckT: 0,
    reverseT: 0,
    ai: opts.ai || null, // traffic: {i, j, hx, hy}
    missionCar: false,
  };
}

export function vehicleRadius(v) {
  const t = TYPES[v.type];
  return Math.max(t.len, t.wid) * 0.42;
}

export function frontPoint(v, d) {
  return { x: v.x + Math.cos(v.angle) * d, y: v.y + Math.sin(v.angle) * d };
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Shared steering: turn the vehicle toward a world point and drive.
// Used by traffic and by the police pursuit code.
export function steerToward(v, tx, ty, dt, cruise, turnMul = 1) {
  const t = TYPES[v.type];
  const want = Math.atan2(ty - v.y, tx - v.x);
  const diff = angleDiff(v.angle, want);
  const turnRate = t.turn * turnMul * (v.speed < -1 ? -1 : 1);
  const maxTurn = turnRate * dt * Math.min(1, Math.abs(v.speed) / 90 + 0.35);
  const applied = Math.max(-Math.abs(maxTurn), Math.min(Math.abs(maxTurn), diff)) * Math.sign(diff || 1);
  v.angle += Math.abs(diff) < Math.abs(maxTurn) ? diff : applied;
  v.steerVis = angleLerp(v.steerVis, Math.max(-1, Math.min(1, diff * 1.6)), dt * 8);
  // Slow for sharp turns.
  const target = cruise * (Math.abs(diff) > 1.1 ? 0.35 : Math.abs(diff) > 0.5 ? 0.65 : 1);
  if (v.speed < target) v.speed = Math.min(target, v.speed + t.accel * 0.8 * dt);
  else v.speed = Math.max(target, v.speed - 260 * dt);
  v.x += Math.cos(v.angle) * v.speed * dt;
  v.y += Math.sin(v.angle) * v.speed * dt;
  return Math.hypot(tx - v.x, ty - v.y);
}

// --- player driving ---------------------------------------------------------

export function updateDriven(v, G, dt) {
  const t = TYPES[v.type];
  const inp = G.input;
  const up = inp.down('KeyW') || inp.down('ArrowUp');
  const down = inp.down('KeyS') || inp.down('ArrowDown');
  const left = inp.down('KeyA') || inp.down('ArrowLeft');
  const right = inp.down('KeyD') || inp.down('ArrowRight');
  const hand = inp.down('Space');

  const steerIn = (left ? -1 : 0) + (right ? 1 : 0);
  v.steerVis = angleLerp(v.steerVis, steerIn, dt * (steerIn === 0 ? 10 : 7));

  if (v.dead) {
    v.speed *= Math.max(0, 1 - 2.4 * dt);
  } else if (up) {
    v.speed += t.accel * dt * (v.speed < 0 ? 2.2 : 1);
    if (v.speed > t.maxSpeed) v.speed = t.maxSpeed;
  } else if (down) {
    if (v.speed > 12) v.speed -= 330 * dt;
    else {
      v.speed -= t.accel * 0.7 * dt;
      if (v.speed < -t.rev) v.speed = -t.rev;
    }
  } else {
    v.speed *= Math.max(0, 1 - 0.55 * dt);
    if (Math.abs(v.speed) < 2) v.speed = 0;
  }
  if (hand) v.speed *= Math.max(0, 1 - 1.5 * dt);
  v.braking = (down && v.speed > 12) || hand;

  const spd = v.speed;
  if (spd !== 0) {
    const grip = hand ? 1.5 : 1;
    v.angle += v.steerVis * t.turn * grip * dt * Math.min(1, Math.abs(spd) / 130) * (spd < 0 ? -1 : 1);
  }
  v.x += Math.cos(v.angle) * spd * dt;
  v.y += Math.sin(v.angle) * spd * dt;

  // Tyre smoke and skid marks when sliding or launching hard.
  const sliding = (hand && Math.abs(spd) > 110) || (Math.abs(v.steerVis) > 0.72 && Math.abs(spd) > 235);
  if (sliding) {
    const bx = v.x - Math.cos(v.angle) * t.len * 0.32;
    const by = v.y - Math.sin(v.angle) * t.len * 0.32;
    const px = Math.cos(v.angle + Math.PI / 2), py = Math.sin(v.angle + Math.PI / 2);
    G.fx.skid(bx + px * 8, by + py * 8);
    G.fx.skid(bx - px * 8, by - py * 8);
    if (Math.random() < 0.4) G.fx.smoke(bx, by, 1);
  }
  return Math.abs(spd) / t.maxSpeed;
}

// --- traffic AI ---------------------------------------------------------------

// Lane target point for entering intersection (i,j) with heading (hx,hy):
// the centre shifted to the driver's right-hand lane.
function lanePoint(i, j, hx, hy) {
  const off = ROAD_W / 4;
  return { x: vRoadX(i) - hy * off, y: hRoadY(j) + hx * off };
}

export function initTrafficAI(v) {
  // Snap the car onto the intersection grid: find nearest intersection,
  // and take the dominant axis of its current angle as its heading.
  const i = Math.max(0, Math.min(COLS, Math.round((v.x - ROAD_W / 2) / CYCLE)));
  const j = Math.max(0, Math.min(ROWS, Math.round((v.y - ROAD_W / 2) / CYCLE)));
  let hx = 0, hy = 0;
  if (Math.abs(Math.cos(v.angle)) >= Math.abs(Math.sin(v.angle))) hx = Math.cos(v.angle) >= 0 ? 1 : -1;
  else hy = Math.sin(v.angle) >= 0 ? 1 : -1;
  v.ai = { i, j, hx, hy };
}

export function updateTraffic(v, G, dt) {
  if (!v.ai) initTrafficAI(v);
  // Gridlock breaker: a car boxed in for a few seconds re-routes from
  // the nearest intersection and pulls away, so jams dissolve.
  if (Math.abs(v.speed) < 6) {
    v.aiStuck = (v.aiStuck || 0) + dt;
    if (v.aiStuck > 3) {
      v.ai = null;
      v.aiStuck = 0;
      initTrafficAI(v);
      v.speed = 55;
    }
  } else v.aiStuck = 0;
  const ai = v.ai;
  const target = lanePoint(ai.i, ai.j, ai.hx, ai.hy);

  // Obstacle scan: anything slow or stopped right ahead means brake.
  let blocked = false;
  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  for (const o of G.vehicles) {
    if (o === v) continue;
    const dx = o.x - v.x, dy = o.y - v.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > 62) continue;
    const lat = Math.abs(dx * -fy + dy * fx);
    if (lat < 17 && Math.abs(o.speed) < Math.abs(v.speed) + 4) { blocked = true; break; }
  }
  if (!blocked && G.player && !G.player.vehicle) {
    const dx = G.player.x - v.x, dy = G.player.y - v.y;
    const ahead = dx * fx + dy * fy;
    const lat = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < 48 && lat < 16) blocked = true;
  }

  if (blocked) {
    v.speed = Math.max(0, v.speed - 320 * dt);
    v.braking = v.speed > 4;
    v.x += Math.cos(v.angle) * v.speed * dt;
    v.y += Math.sin(v.angle) * v.speed * dt;
    return;
  }
  v.braking = false;
  const cruise = 118 + (v.id % 5) * 7;
  const dist = steerToward(v, target.x, target.y, dt, cruise);

  if (dist < 34) {
    // Arrived at the intersection: choose the next one.
    let ni = ai.i + ai.hx, nj = ai.j + ai.hy;
    const roll = Math.random();
    if (roll < 0.3) {
      // Turn left or right.
      const s = Math.random() < 0.5 ? 1 : -1;
      const nhx = ai.hy * s, nhy = -ai.hx * s;
      if (ni + nhx >= 0 && ni + nhx <= COLS && nj + nhy >= 0 && nj + nhy <= ROWS) {
        ai.hx = nhx; ai.hy = nhy;
        ni = ai.i + ai.hx; nj = ai.j + ai.hy;
      }
    }
    if (ni < 0 || ni > COLS || nj < 0 || nj > ROWS) {
      ai.hx = -ai.hx; ai.hy = -ai.hy;
      ni = ai.i + ai.hx; nj = ai.j + ai.hy;
    }
    ai.i = Math.max(0, Math.min(COLS, ni));
    ai.j = Math.max(0, Math.min(ROWS, nj));
  }
}

// --- drawing ------------------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawVehicle(ctx, v, G, cam) {
  const t = TYPES[v.type];
  const x = v.x - cam.x, y = v.y - cam.y;
  if (x < -120 || y < -120 || x > cam.vw + 120 || y > cam.vh + 120) return;
  const dark = G.dark || 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(v.angle);

  // Headlight cones at dusk/night.
  if (dark > 0.18 && !v.parked) {
    const grad = ctx.createLinearGradient(t.len / 2, 0, t.len / 2 + 130, 0);
    grad.addColorStop(0, `rgba(255,240,180,${0.22 * dark})`);
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(t.len / 2, s * t.wid * 0.3);
      ctx.lineTo(t.len / 2 + 130, s * t.wid * 0.3 - 16);
      ctx.lineTo(t.len / 2 + 130, s * t.wid * 0.3 + 22);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Shadow.
  ctx.fillStyle = 'rgba(30,25,15,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 4, t.len * 0.52, t.wid * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wheels (front pair steers).
  ctx.fillStyle = '#17191c';
  const ww = v.type === 'moto' ? 10 : 9, wh = 5;
  for (const [wx, wy, front] of [[-t.len * 0.33, -t.wid / 2, 0], [-t.len * 0.33, t.wid / 2 - wh, 0], [t.len * 0.33, -t.wid / 2, 1], [t.len * 0.33, t.wid / 2 - wh, 1]]) {
    ctx.save();
    ctx.translate(wx, wy + wh / 2);
    if (front) ctx.rotate(v.steerVis * 0.42);
    ctx.fillRect(-ww / 2, -wh / 2, ww, wh);
    ctx.restore();
  }

  const L = -t.len / 2, W = -t.wid / 2;

  if (v.type === 'truck') {
    // Cargo box + cab.
    ctx.fillStyle = '#dfe3e6';
    rr(ctx, L, W, t.len * 0.62, t.wid, 3); ctx.fill();
    ctx.fillStyle = 'rgba(90,100,110,0.35)';
    ctx.fillRect(L + 4, W + 3, t.len * 0.62 - 8, 2);
    ctx.fillRect(L + 4, -W - 5, t.len * 0.62 - 8, 2);
    const cabGrad = ctx.createLinearGradient(L + t.len * 0.62, 0, t.len / 2, 0);
    cabGrad.addColorStop(0, v.color); cabGrad.addColorStop(1, '#00000022');
    ctx.fillStyle = v.color;
    rr(ctx, L + t.len * 0.62, W, t.len * 0.38, t.wid, 4); ctx.fill();
    ctx.fillStyle = 'rgba(25,35,48,0.85)';
    ctx.fillRect(t.len * 0.30, W + 3, 7, t.wid - 6);
  } else if (v.type === 'moto') {
    ctx.fillStyle = v.color;
    rr(ctx, L, W + 2, t.len, t.wid - 4, 5); ctx.fill();
    ctx.fillStyle = '#20242a';
    ctx.fillRect(-2, W + 3, 9, t.wid - 6);
    // Rider: leathers + helmet.
    ctx.fillStyle = '#37414d';
    ctx.beginPath(); ctx.arc(-1, 0, 6.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b13c';
    ctx.beginPath(); ctx.arc(1.5, 0, 4.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // Body with a lengthwise gradient.
    const grad = ctx.createLinearGradient(L, 0, t.len / 2, 0);
    if (v.type === 'police') {
      grad.addColorStop(0, '#dfe3e6'); grad.addColorStop(0.5, '#f4f6f8'); grad.addColorStop(1, '#cfd4d9');
    } else {
      grad.addColorStop(0, v.color); grad.addColorStop(1, v.color);
    }
    ctx.fillStyle = grad;
    rr(ctx, L, W, t.len, t.wid, 6); ctx.fill();
    // Slight top shading.
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rr(ctx, L + 2, W + 2, t.len - 4, t.wid / 2 - 2, 5); ctx.fill();

    if (v.type === 'police') {
      ctx.fillStyle = '#23272e';
      ctx.fillRect(-t.len * 0.08, W + 1, t.len * 0.3, t.wid - 2);
      ctx.fillStyle = '#f4f6f8';
      ctx.font = 'bold 7px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', t.len * 0.07, 2.5);
      // Light bar, flashing.
      const phase = Math.sin(G.tNow * 14) > 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#5a0f0c';
      ctx.fillRect(-4, -6, 8, 5);
      ctx.fillStyle = phase ? '#0f2a5a' : '#2e7fff';
      ctx.fillRect(-4, 1, 8, 5);
      if (dark > 0.1 || phase) {
        ctx.fillStyle = phase ? 'rgba(255,60,50,0.25)' : 'rgba(50,120,255,0.25)';
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (v.type === 'taxi') {
      ctx.fillStyle = 'rgba(30,30,30,0.8)';
      ctx.fillRect(-t.len * 0.3, W + 1, 6, 4); ctx.fillRect(-t.len * 0.3, -W - 5, 6, 4);
      ctx.fillRect(t.len * 0.24, W + 1, 6, 4); ctx.fillRect(t.len * 0.24, -W - 5, 6, 4);
      ctx.fillStyle = '#fff6d8';
      rr(ctx, -6, -5, 12, 10, 2); ctx.fill();
      ctx.fillStyle = '#8a6d00';
      ctx.font = 'bold 6.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 2.4);
    }
    if (v.type === 'sport') {
      ctx.fillStyle = 'rgba(20,20,24,0.55)';
      ctx.fillRect(L + 2, -3, 8, 6); // rear spoiler hint
    }
    // Glass cabin.
    const glass = ctx.createLinearGradient(0, W, 0, -W);
    glass.addColorStop(0, 'rgba(30,45,60,0.92)');
    glass.addColorStop(0.5, 'rgba(90,130,160,0.9)');
    glass.addColorStop(1, 'rgba(30,45,60,0.92)');
    ctx.fillStyle = glass;
    rr(ctx, -t.len * 0.16, W + 3.5, t.len * 0.34, t.wid - 7, 3); ctx.fill();
    ctx.fillStyle = 'rgba(20,30,42,0.9)';
    ctx.fillRect(t.len * 0.20, W + 4, 4, t.wid - 8); // windshield pillar split
  }

  // Brake lights.
  if (v.braking) {
    ctx.fillStyle = '#ff2d20';
    ctx.fillRect(L - 1, W + 2, 3, 5);
    ctx.fillRect(L - 1, -W - 7, 3, 5);
    ctx.fillStyle = 'rgba(255,45,32,0.3)';
    ctx.beginPath(); ctx.arc(L - 2, 0, 10, 0, Math.PI * 2); ctx.fill();
  } else if (!v.parked) {
    ctx.fillStyle = '#a02318';
    ctx.fillRect(L, W + 2, 2, 5);
    ctx.fillRect(L, -W - 7, 2, 5);
  }
  // Headlight dots.
  if (!v.parked) {
    ctx.fillStyle = dark > 0.18 ? '#ffeeb0' : '#e8e4c8';
    ctx.fillRect(t.len / 2 - 2, W + 2, 2, 4);
    ctx.fillRect(t.len / 2 - 2, -W - 6, 2, 4);
  }

  // Damage scratches.
  if (v.hp < v.maxHp * 0.55) {
    ctx.fillStyle = 'rgba(25,25,28,0.4)';
    const n = v.hp < v.maxHp * 0.28 ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const dx = Math.sin(v.id * 31 + k * 47) * t.len * 0.32;
      const dy = Math.cos(v.id * 17 + k * 29) * t.wid * 0.3;
      ctx.fillRect(dx, dy, 6, 2.4);
    }
  }
  ctx.restore();
}
