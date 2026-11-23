// vehicles.js — every car in Costa Verde: parked cars waiting to be
// borrowed, traffic following the avenue/street network, and the arcade
// driving model for whichever car the player is sitting in.

import { AVENUES, STREETS, collideCircle, isWater } from './world.js';
import { Sound } from './audio.js';

export const CAR_TYPES = {
  sedan: { w: 48, h: 24, maxSpeed: 400, accel: 250, colors: ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#9b59b6', '#e67e22', '#1abc9c'] },
  taxi: { w: 48, h: 24, maxSpeed: 390, accel: 245, colors: ['#ffb300'] },
  sport: { w: 50, h: 24, maxSpeed: 540, accel: 340, colors: ['#ff5252', '#ffeb3b', '#00e5ff', '#76ff03'] },
  truck: { w: 62, h: 28, maxSpeed: 300, accel: 180, colors: ['#90a4ae', '#b0bec5', '#8d6e63'] },
  police: { w: 50, h: 25, maxSpeed: 470, accel: 320, colors: ['#263238'] },
};

let nextCarId = 1;

export function makeCar(x, y, angle, type, driver) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    x, y, angle, speed: 0,
    w: spec.w, h: spec.h, type, driver,
    color: spec.colors[(Math.random() * spec.colors.length) | 0],
    health: 100,
    targetNode: null,
    honkCd: 0,
    wrecked: false,
  };
}

/** All intersection nodes with their neighbours, for traffic routing. */
export function roadNodes() {
  const nodes = [];
  AVENUES.forEach((ax, ai) => {
    STREETS.forEach((sy, si) => {
      nodes.push({ x: ax, y: sy, ai, si });
    });
  });
  return nodes;
}

export function nodeNeighbours(nodes, node) {
  return nodes.filter((n) =>
    (n.ai === node.ai && Math.abs(n.si - node.si) === 1) ||
    (n.si === node.si && Math.abs(n.ai - node.ai) === 1));
}

function nearestNode(nodes, x, y) {
  let best = null;
  let bd = Infinity;
  for (const n of nodes) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function spawnParkedCars(city, nodes, count, rng) {
  const cars = [];
  const spots = [...city.parkSpots];
  for (let i = spots.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'truck'];
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const s = spots[i];
    const type = types[(rng() * types.length) | 0];
    cars.push(makeCar(s.x, s.y, s.angle, type, null));
  }
  return cars;
}

export function spawnTraffic(nodes, count, rng) {
  const cars = [];
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport'];
  for (let i = 0; i < count; i++) {
    const node = nodes[(rng() * nodes.length) | 0];
    const type = types[(rng() * types.length) | 0];
    const car = makeCar(node.x, node.y, 0, type, 'traffic');
    const options = nodeNeighbours(nodes, node);
    car.targetNode = options[(rng() * options.length) | 0];
    car.fromNode = node;
    car.speed = 90 + rng() * 60;
    cars.push(car);
  }
  return cars;
}

function steerToward(car, tx, ty, dt, turnRate = 3.2) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = turnRate * dt;
  car.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
  return Math.abs(diff);
}

/** Keep a car out of buildings and the sea; returns impact speed if it hit hard. */
function resolveCarCollision(city, car) {
  const pos = { x: car.x, y: car.y };
  const hit = collideCircle(city, pos, car.w * 0.42);
  let impact = 0;
  if (hit) {
    impact = Math.abs(car.speed);
    car.x = pos.x;
    car.y = pos.y;
    if (Math.abs(car.speed) > 60) car.speed = -car.speed * 0.25;
    else car.speed = 0;
  }
  return impact;
}

/** Circle-vs-circle shove between two cars; returns closing speed. */
export function carCarCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = (a.w + b.w) * 0.36;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const push = (rr - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const closing = Math.abs(a.speed - b.speed);
  const swap = (a.speed + b.speed) / 2;
  a.speed = swap * 0.8;
  b.speed = swap * 0.8;
  return closing;
}

export function updateTrafficCar(G, car, dt) {
  if (car.wrecked) return;
  const nodes = G.nodes;
  if (!car.targetNode) {
    car.fromNode = nearestNode(nodes, car.x, car.y);
    const options = nodeNeighbours(nodes, car.targetNode || car.fromNode);
    car.targetNode = options[(Math.random() * options.length) | 0];
  }
  // Aim at the target node, offset to the right-hand lane of travel.
  const dx = car.targetNode.x - car.x;
  const dy = car.targetNode.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const laneX = car.targetNode.x - uy * -16 + ux * 0; // right-hand side: perpendicular (-uy, ux) * -16 keeps lanes apart
  const laneY = car.targetNode.y + ux * -16;
  void laneX; void laneY;
  const aimX = car.targetNode.x + (-uy) * 16;
  const aimY = car.targetNode.y + ux * 16;

  // Slow for a car ahead in roughly the same direction.
  let desired = 150;
  for (const other of G.cars) {
    if (other === car || other.wrecked) continue;
    const ox = other.x - car.x;
    const oy = other.y - car.y;
    const ahead = ox * ux + oy * uy;
    const side = Math.abs(ox * -uy + oy * ux);
    if (ahead > 0 && ahead < 78 && side < 26) desired = Math.min(desired, Math.max(0, (ahead - 52) * 4));
  }
  if (G.player.car === null && !G.player.dead) {
    const ox = G.player.x - car.x;
    const oy = G.player.y - car.y;
    const ahead = ox * ux + oy * uy;
    const side = Math.abs(ox * -uy + oy * ux);
    if (ahead > 0 && ahead < 60 && side < 24) desired = 0;
  }

  const spec = CAR_TYPES[car.type];
  desired = Math.min(desired, spec.maxSpeed * 0.45);
  car.speed += Math.max(-260 * dt, Math.min(120 * dt, desired - car.speed));
  steerToward(car, aimX, aimY, dt, 2.6);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  resolveCarCollision(G.city, car);

  if (dist < 42) {
    const arrived = car.targetNode;
    const options = nodeNeighbours(nodes, arrived).filter((n) => n !== car.fromNode);
    car.fromNode = arrived;
    car.targetNode = options.length
      ? options[(Math.random() * options.length) | 0]
      : nodeNeighbours(nodes, arrived)[0];
  }
  if (isWater(car.x, car.y)) {
    const n = nearestNode(nodes, car.x, car.y);
    car.x = n.x; car.y = n.y;
    car.fromNode = n;
    car.targetNode = nodeNeighbours(nodes, n)[0];
  }
  car.honkCd = Math.max(0, car.honkCd - dt);
}

/** Drive the car the player sits in. controls: {throttle, brake, steer, handbrake}. */
export function updatePlayerCar(G, car, controls, dt) {
  const spec = CAR_TYPES[car.type];
  const wasSpeed = car.speed;
  if (controls.throttle > 0) car.speed += spec.accel * dt * controls.throttle;
  if (controls.brake > 0) {
    if (car.speed > 12) car.speed -= 420 * dt;
    else car.speed = Math.max(-spec.maxSpeed * 0.38, car.speed - spec.accel * 0.7 * dt);
  }
  const drag = controls.handbrake ? 0.6 : 1.6;
  car.speed -= car.speed * drag * dt * 0.35;
  if (!controls.throttle && !controls.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-spec.maxSpeed * 0.4, Math.min(spec.maxSpeed, car.speed));

  const speedRatio = car.speed / spec.maxSpeed;
  const steerPower = controls.steer * (1.9 - Math.min(1.15, Math.abs(speedRatio) * 1.1));
  if (Math.abs(car.speed) > 4) {
    car.angle += steerPower * dt * Math.sign(car.speed) * (controls.handbrake ? 1.5 : 1);
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  const impact = resolveCarCollision(G.city, car);
  if (impact > 170 && Math.abs(wasSpeed) > 170) {
    car.health -= (impact - 150) * 0.06;
    Sound.crash();
    G.onPlayerCrash?.(impact, car);
  }
  if (car.health <= 0 && !car.wrecked) {
    car.wrecked = true;
    car.speed = 0;
    Sound.crash();
  }
  return speedRatio;
}

export function drawCar(ctx, car, cam, time) {
  const sx = car.x - cam.x;
  const sy = car.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);
  const w = car.w;
  const h = car.h;
  // Shadow.
  ctx.fillStyle = 'rgba(40,30,10,0.3)';
  ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
  // Body.
  ctx.fillStyle = car.wrecked ? '#555' : car.color;
  roundRect(ctx, -w / 2, -h / 2, w, h, 7);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRect(ctx, -w * 0.12, -h * 0.36, w * 0.34, h * 0.72, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,210,240,0.7)';
  roundRect(ctx, w * 0.16, -h * 0.32, w * 0.09, h * 0.64, 3);
  ctx.fill();
  // Nose stripe.
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(w * 0.3, -h * 0.5, w * 0.2, h);
  // Wheels.
  ctx.fillStyle = '#16181c';
  const ww = 9;
  const wh = 5;
  ctx.fillRect(-w / 2 + 4, -h / 2 - 2, ww, wh);
  ctx.fillRect(w / 2 - ww - 4, -h / 2 - 2, ww, wh);
  ctx.fillRect(-w / 2 + 4, h / 2 - 3, ww, wh);
  ctx.fillRect(w / 2 - ww - 4, h / 2 - 3, ww, wh);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#fff8e1';
    ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.type === 'police') {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(-w * 0.32, -h * 0.5, w * 0.5, h);
    ctx.fillStyle = '#263238';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICÍA', -w * 0.07, 3);
    const flash = Math.floor(time * 5) % 2 === 0;
    ctx.fillStyle = flash ? '#ff1744' : '#2979ff';
    ctx.fillRect(-7, -h * 0.28, 14, 6);
    ctx.fillStyle = flash ? '#2979ff' : '#ff1744';
    ctx.fillRect(-7, h * 0.28 - 6, 14, 6);
  }
  if (car.type === 'truck') {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w * 0.5, h - 8);
  }
  if (car.wrecked) {
    ctx.strokeStyle = 'rgba(30,30,30,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 3, -h / 3);
    ctx.lineTo(w / 4, h / 4);
    ctx.moveTo(w / 4, -h / 4);
    ctx.lineTo(-w / 4, h / 3);
    ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
