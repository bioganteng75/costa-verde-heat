// vehicles.js — every vehicle in Costa Verde: parked rides waiting to
// be borrowed, traffic following the avenue/street network, and the
// arcade driving model for whichever vehicle the player is sitting in.
//
// v2 garage: a nimble motorcycle and a heavy truck join the fleet, each
// with its own mass, grip and toughness; the driving model reports
// slides, off-road dust and hard hits through G hooks so main.js can
// feed the effects layer. Drawing grew up too — shaded bodies, glass,
// steering front wheels, brake lights and headlight cones after dark.

import { AVENUES, STREETS, collideCircle, isSand, isWater } from './world.js';
import { Sound } from './audio.js';

export const CAR_TYPES = {
  sedan: { w: 48, h: 24, maxSpeed: 400, accel: 250, mass: 1, hp: 100, name: 'Sedán', colors: ['#e74c3c', '#3498db', '#f1c40f', '#ecf0f1', '#9b59b6', '#e67e22', '#1abc9c'] },
  taxi: { w: 48, h: 24, maxSpeed: 390, accel: 245, mass: 1, hp: 100, name: 'Taxi', colors: ['#ffb300'] },
  sport: { w: 50, h: 24, maxSpeed: 545, accel: 345, mass: 0.95, hp: 95, name: 'Deportivo', colors: ['#ff5252', '#ffeb3b', '#00e5ff', '#76ff03'] },
  truck: { w: 64, h: 29, maxSpeed: 295, accel: 165, mass: 2.3, hp: 190, name: 'Camión', colors: ['#90a4ae', '#b0bec5', '#8d6e63'] },
  moto: { w: 36, h: 15, maxSpeed: 575, accel: 395, mass: 0.45, hp: 55, name: 'Moto', colors: ['#d81b60', '#00897b', '#5e35b1', '#fb8c00', '#3949ab'] },
  police: { w: 50, h: 25, maxSpeed: 470, accel: 320, mass: 1.1, hp: 120, name: 'Patrulla', colors: ['#263238'] },
};

export function carDisplayName(car) {
  return CAR_TYPES[car.type]?.name ?? 'Car';
}

let nextCarId = 1;

export function makeCar(x, y, angle, type, driver) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++,
    x, y, angle, speed: 0,
    w: spec.w, h: spec.h, type, driver,
    color: spec.colors[(Math.random() * spec.colors.length) | 0],
    riderColor: ['#ef5350', '#42a5f5', '#ffee58', '#ab47bc'][(Math.random() * 4) | 0],
    health: spec.hp,
    maxHealth: spec.hp,
    steerVis: 0,     // smoothed steering angle for the front wheels
    braking: false,  // brake lights + skid decisions read this
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
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'truck', 'moto', 'sedan'];
  for (let i = 0; i < Math.min(count, spots.length); i++) {
    const s = spots[i];
    const type = types[(rng() * types.length) | 0];
    cars.push(makeCar(s.x, s.y, s.angle, type, null));
  }
  return cars;
}

export function spawnTraffic(nodes, count, rng) {
  const cars = [];
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'truck', 'sport', 'moto'];
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
  car.steerVis += ((Math.max(-1, Math.min(1, diff))) - car.steerVis) * Math.min(1, dt * 7);
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

/** Circle-vs-circle shove between two cars; mass decides who budges. */
export function carCarCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rr = (a.w + b.w) * 0.36;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const overlap = rr - d;
  const ma = CAR_TYPES[a.type].mass;
  const mb = CAR_TYPES[b.type].mass;
  const pushA = overlap * (mb / (ma + mb));
  const pushB = overlap * (ma / (ma + mb));
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * pushA; a.y -= ny * pushA;
  b.x += nx * pushB; b.y += ny * pushB;
  const closing = Math.abs(a.speed - b.speed);
  const swap = (a.speed * ma + b.speed * mb) / (ma + mb);
  a.speed = swap * 0.82;
  b.speed = swap * 0.82;
  return closing;
}

export function updateTrafficCar(G, car, dt) {
  if (car.wrecked) return;
  const nodes = G.nodes;
  if (!car.targetNode) {
    car.fromNode = nearestNode(nodes, car.x, car.y);
    const options = nodeNeighbours(nodes, car.fromNode);
    car.targetNode = options[(Math.random() * options.length) | 0];
  }
  // Aim at the target node, offset to the right-hand lane of travel.
  const dx = car.targetNode.x - car.x;
  const dy = car.targetNode.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const aimX = car.targetNode.x + (-uy) * 16;
  const aimY = car.targetNode.y + ux * 16;

  // Slow for a car ahead in roughly the same direction.
  let desired = car.type === 'moto' ? 185 : 150;
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
  car.braking = desired < car.speed - 24;
  car.speed += Math.max(-260 * dt, Math.min(120 * dt, desired - car.speed));
  steerToward(car, aimX, aimY, dt, car.type === 'moto' ? 3.6 : 2.6);
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

/** Drive the vehicle the player sits in. controls: {throttle, brake, steer, handbrake}. */
export function updatePlayerCar(G, car, controls, dt) {
  const spec = CAR_TYPES[car.type];
  const wasSpeed = car.speed;
  if (controls.throttle > 0) car.speed += spec.accel * dt * controls.throttle;
  car.braking = false;
  if (controls.brake > 0) {
    if (car.speed > 12) { car.speed -= 430 * dt; car.braking = true; }
    else car.speed = Math.max(-spec.maxSpeed * 0.38, car.speed - spec.accel * 0.7 * dt);
  }
  // Sand and grass drag hard; the handbrake drags harder.
  const onSand = isSand(car.x, car.y);
  const drag = (controls.handbrake ? 0.65 : 1.6) + (onSand ? 2.6 : 0);
  car.speed -= car.speed * drag * dt * 0.35;
  if (!controls.throttle && !controls.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-spec.maxSpeed * 0.4, Math.min(spec.maxSpeed, car.speed));

  const speedRatio = car.speed / spec.maxSpeed;
  // The bike carves; the truck wallows. Grip scales the steering bite.
  const grip = car.type === 'moto' ? 1.3 : car.type === 'truck' ? 0.78 : 1;
  const steerPower = controls.steer * grip * (1.9 - Math.min(1.15, Math.abs(speedRatio) * 1.1));
  if (Math.abs(car.speed) > 4) {
    car.angle += steerPower * dt * Math.sign(car.speed) * (controls.handbrake ? 1.55 : 1);
  }
  car.steerVis += (controls.steer - car.steerVis) * Math.min(1, dt * 9);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // Report the slide show: skids when the rear breaks loose, dust off-road.
  const sliding = (controls.handbrake && Math.abs(car.speed) > 130)
    || (Math.abs(controls.steer) > 0 && Math.abs(car.speed) > 330 && Math.abs(steerPower) > 1.2);
  if (sliding) G.onVehicleSlide?.(car);
  if (onSand && Math.abs(car.speed) > 60) G.onOffroad?.(car);

  const impact = resolveCarCollision(G.city, car);
  if (impact > 170 && Math.abs(wasSpeed) > 170) {
    car.health -= (impact - 150) * 0.055 / spec.mass;
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

function wheel(ctx, x, y, w, h, steer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(steer || 0);
  ctx.fillStyle = '#14161a';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-w / 2 + 2, -1, w - 4, 2);
  ctx.restore();
}

export function drawCar(ctx, car, cam, time, dusk = 0) {
  const sx = car.x - cam.x;
  const sy = car.y - cam.y;
  const w = car.w;
  const h = car.h;
  ctx.save();
  ctx.translate(sx, sy);

  // Headlight cones first, under the body, once the light goes.
  const lightsOn = dusk > 0.3 && !car.wrecked && (car.driver !== null || Math.abs(car.speed) > 5);
  if (lightsOn) {
    ctx.save();
    ctx.rotate(car.angle);
    ctx.globalCompositeOperation = 'lighter';
    const cone = ctx.createLinearGradient(w / 2, 0, w / 2 + 130, 0);
    cone.addColorStop(0, 'rgba(255,230,150,0.30)');
    cone.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = cone;
    for (const off of [-h * 0.3, h * 0.3]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, off);
      ctx.lineTo(w / 2 + 130, off - 20);
      ctx.lineTo(w / 2 + 130, off + 20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.rotate(car.angle);
  // Ground shadow.
  ctx.fillStyle = 'rgba(40,30,10,0.3)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 3, -h / 2 + 4, w, h, 7);
  ctx.fill();

  if (car.type === 'moto') {
    // Two wheels in line, a tank, and the rider hunched over both.
    wheel(ctx, -w * 0.32, 0, 11, 5, car.steerVis * 0.4);
    wheel(ctx, w * 0.32, 0, 11, 5, 0);
    const bodyGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    bodyGrad.addColorStop(0, car.wrecked ? '#555' : car.color);
    bodyGrad.addColorStop(0.5, car.wrecked ? '#444' : car.color);
    bodyGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-w * 0.34, -h * 0.3, w * 0.68, h * 0.6, 5);
    ctx.fill();
    // Rider: leathers and a helmet, leaning with the steering.
    ctx.save();
    ctx.translate(0, car.steerVis * 2.4);
    ctx.fillStyle = car.riderColor;
    ctx.beginPath();
    ctx.arc(-2, 0, 7.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eceff1';
    ctx.beginPath();
    ctx.arc(4.5, 0, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,30,45,0.8)';
    ctx.fillRect(6.5, -4.4, 3.4, 8.8);
    ctx.restore();
    if (car.braking) {
      ctx.fillStyle = '#ff1744';
      ctx.fillRect(-w / 2 - 1, -2.5, 3.4, 5);
    }
    ctx.restore();
    return;
  }

  // Body with a lengthwise sheen.
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, car.wrecked ? '#4c4c4c' : car.color);
  grad.addColorStop(0.55, car.wrecked ? '#5a5a5a' : car.color);
  grad.addColorStop(1, car.wrecked ? '#3d3d3d' : car.color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 2.5, w - 8, 3.4);

  if (car.type === 'truck') {
    // Cab up front, ribbed cargo box behind.
    ctx.fillStyle = 'rgba(20,30,45,0.85)';
    ctx.beginPath();
    ctx.roundRect(w * 0.18, -h * 0.34, w * 0.16, h * 0.68, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(-w / 2 + 5, -h / 2 + 4, w * 0.52, h - 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 12 + i * 11, -h / 2 + 4);
      ctx.lineTo(-w / 2 + 12 + i * 11, h / 2 - 4);
      ctx.stroke();
    }
  } else {
    // Cabin glass with a sky reflection, then the rear window.
    const glass = ctx.createLinearGradient(0, -h * 0.36, 0, h * 0.36);
    glass.addColorStop(0, 'rgba(28,42,60,0.92)');
    glass.addColorStop(0.5, 'rgba(90,140,180,0.85)');
    glass.addColorStop(1, 'rgba(24,36,52,0.92)');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-w * 0.12, -h * 0.36, w * 0.34, h * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,240,0.65)';
    ctx.beginPath();
    ctx.roundRect(w * 0.17, -h * 0.32, w * 0.09, h * 0.64, 3);
    ctx.fill();
    // Nose stripe.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(w * 0.32, -h * 0.5, w * 0.18, h);
  }

  // Wheels; the front pair turns with the steering.
  const fs = car.steerVis * 0.42;
  wheel(ctx, -w / 2 + 8, -h / 2 - 1.5, 10, 5.5, 0);
  wheel(ctx, w / 2 - 8, -h / 2 - 1.5, 10, 5.5, fs);
  wheel(ctx, -w / 2 + 8, h / 2 - 3.5, 10, 5.5, 0);
  wheel(ctx, w / 2 - 8, h / 2 - 3.5, 10, 5.5, fs);

  // Tail lights: dim at dusk, blazing under braking. Headlights as dots.
  if (dusk > 0.3 || car.braking) {
    ctx.fillStyle = car.braking ? '#ff1744' : 'rgba(255,60,60,0.75)';
    ctx.fillRect(-w / 2 - 1, -h * 0.34, 3.4, 6);
    ctx.fillRect(-w / 2 - 1, h * 0.34 - 6, 3.4, 6);
  }
  if (dusk > 0.3) {
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(w / 2 - 1.6, -h * 0.34, 3, 5.4);
    ctx.fillRect(w / 2 - 1.6, h * 0.34 - 5.4, 3, 5.4);
  }

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
    ctx.fillRect(-w * 0.34, -h * 0.5, w * 0.46, h);
    ctx.fillStyle = '#263238';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('POLICÍA', -w * 0.11, 3);
    const flash = Math.floor(time * 5) % 2 === 0;
    ctx.fillStyle = flash ? '#ff1744' : '#2979ff';
    ctx.fillRect(-7, -h * 0.3, 14, 6);
    ctx.fillStyle = flash ? '#2979ff' : '#ff1744';
    ctx.fillRect(-7, h * 0.3 - 6, 14, 6);
    if (dusk > 0.3) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = flash ? 'rgba(255,40,70,0.20)' : 'rgba(50,110,255,0.20)';
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (car.wrecked) {
    ctx.strokeStyle = 'rgba(25,25,25,0.85)';
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
