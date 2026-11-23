// player.js — the player on foot, twin-stick combat, bullets, and the
// pedestrians who fill Costa Verde's sidewalks.
// The player walks with WASD, aims with the mouse, and fights with
// fists, a pistol or an SMG. Pedestrians wander block perimeters,
// flee danger, and can be flagged as taxi fares by the missions code.

import { collideCircle, blockX, blockY, BLOCK, COLS, ROWS } from './world.js';
import { vehicleRadius } from './vehicles.js';

const SKIN = ['#f2c79b', '#c98d5f', '#8a5a34', '#6e4525', '#ffd9b3'];
const SHIRTS = ['#e8574a', '#4a90d9', '#f2b13c', '#57b06a', '#e8e4da', '#9a6fd0', '#3fbfae', '#e87fa5', '#5a6b7a'];

export function createPlayer(world) {
  const s = world.services.safehouse;
  return {
    x: s.x - 60, y: s.y + 34,
    angle: -Math.PI / 2,
    r: 11,
    hp: 100, maxHp: 100,
    weapon: 'fists', // 'fists' | 'pistol' | 'smg'
    vehicle: null,
    walkPhase: 0,
    fireCd: 0,
    punchT: 0,
    hurtT: 0,
    dead: false,
  };
}

// --- bullets ------------------------------------------------------------------

export const bullets = [];

export function fireBullet(G, x, y, angle, speed = 760) {
  bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.62 });
}

export function updateBullets(G, dt) {
  const world = G.world;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      for (const bd of world.buildings) {
        if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) {
          G.fx.sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), 4);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const p of G.peds) {
        if (p.state === 'down' || p.hidden) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) < 11) {
          hurtPed(G, p, 46, b.x - b.vx * 0.02, b.y - b.vy * 0.02);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const v of G.vehicles) {
        if (v === (G.player && G.player.vehicle)) continue;
        if (Math.hypot(v.x - b.x, v.y - b.y) < vehicleRadius(v)) {
          v.hp -= 7;
          G.fx.sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), 5);
          if (v.type === 'police') G.police.reportCrime(G, 'shots', b.x, b.y, true);
          dead = true;
          break;
        }
      }
    }
    if (dead) bullets.splice(i, 1);
  }
}

export function drawBullets(ctx, cam) {
  ctx.fillStyle = '#ffe27a';
  for (const b of bullets) {
    ctx.fillRect(b.x - cam.x - 2, b.y - cam.y - 1, 4, 2);
  }
}

// --- player -------------------------------------------------------------------

export function updatePlayer(G, dt) {
  const p = G.player;
  const inp = G.input;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.punchT = Math.max(0, p.punchT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (p.vehicle) return;

  let mx = 0, my = 0;
  if (inp.down('KeyW') || inp.down('ArrowUp')) my -= 1;
  if (inp.down('KeyS') || inp.down('ArrowDown')) my += 1;
  if (inp.down('KeyA') || inp.down('ArrowLeft')) mx -= 1;
  if (inp.down('KeyD') || inp.down('ArrowRight')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    const sprint = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const speed = sprint ? 240 : 152;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.walkPhase += dt * (sprint ? 13 : 9.5);
    const res = collideCircle(G.world, p.x, p.y, p.r, 30);
    p.x = res.x; p.y = res.y;
    if (!inp.mouse.down) p.angle = Math.atan2(my, mx);
  }

  // Aim at the mouse (world space).
  const mwx = G.cam.x + inp.mouse.x, mwy = G.cam.y + inp.mouse.y;
  if (inp.mouse.down || p.weapon !== 'fists') {
    p.angle = Math.atan2(mwy - p.y, mwx - p.x);
  }

  // Attack.
  const attacking = inp.mouse.down || inp.down('Space');
  if (attacking && p.fireCd <= 0) {
    if (p.weapon === 'fists') {
      p.fireCd = 0.34;
      p.punchT = 0.16;
      G.audio.punch();
      const hx = p.x + Math.cos(p.angle) * 24, hy = p.y + Math.sin(p.angle) * 24;
      let hitSomething = false;
      for (const ped of G.peds) {
        if (ped.state === 'down' || ped.hidden) continue;
        if (Math.hypot(ped.x - hx, ped.y - hy) < 17) {
          hurtPed(G, ped, 34, p.x, p.y);
          G.police.reportCrime(G, 'assault', ped.x, ped.y);
          hitSomething = true;
        }
      }
      for (const v of G.vehicles) {
        if (Math.hypot(v.x - hx, v.y - hy) < vehicleRadius(v) + 6) {
          v.hp -= 4;
          G.fx.sparks(hx, hy, p.angle, 4);
          hitSomething = true;
        }
      }
      if (hitSomething) G.fx.puff(hx, hy);
    } else {
      const isSmg = p.weapon === 'smg';
      p.fireCd = isSmg ? 0.095 : 0.27;
      const spread = isSmg ? (Math.random() - 0.5) * 0.11 : (Math.random() - 0.5) * 0.03;
      const gx = p.x + Math.cos(p.angle) * 16, gy = p.y + Math.sin(p.angle) * 16;
      fireBullet(G, gx, gy, p.angle + spread);
      G.fx.muzzle(gx, gy, p.angle);
      if (isSmg) G.audio.smgShot(); else G.audio.shot();
      G.police.reportCrime(G, 'shots', p.x, p.y);
      scarePeds(G, p.x, p.y, 240);
    }
  }
}

export function drawPlayer(ctx, G, cam) {
  const p = G.player;
  if (p.vehicle) return;
  const x = p.x - cam.x, y = p.y - cam.y;
  ctx.fillStyle = 'rgba(30,25,15,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.sin(p.walkPhase) * 1.4;
  // Legs.
  ctx.fillStyle = '#2e3d4d';
  ctx.fillRect(x - 5 + Math.sin(p.walkPhase) * 3, y + 2, 4, 6);
  ctx.fillRect(x + 1 - Math.sin(p.walkPhase) * 3, y + 2, 4, 6);
  // Torso: teal jacket.
  ctx.fillStyle = p.hurtT > 0.5 ? '#d94f3f' : '#128a7d';
  ctx.beginPath();
  ctx.arc(x, y + bob * 0.3, 7.6, 0, Math.PI * 2);
  ctx.fill();
  // Arms toward aim; a fist pops out while punching.
  const ax = Math.cos(p.angle), ay = Math.sin(p.angle);
  ctx.fillStyle = '#0f6e62';
  ctx.beginPath();
  ctx.arc(x + ax * 7 - ay * 4, y + ay * 7 + ax * 4, 3, 0, Math.PI * 2);
  ctx.arc(x + ax * 7 + ay * 4, y + ay * 7 - ax * 4, 3, 0, Math.PI * 2);
  ctx.fill();
  if (p.punchT > 0) {
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(x + ax * 15, y + ay * 15, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.weapon !== 'fists') {
    ctx.fillStyle = '#20242a';
    ctx.save();
    ctx.translate(x + ax * 9, y + ay * 9);
    ctx.rotate(p.angle);
    ctx.fillRect(0, -1.6, p.weapon === 'smg' ? 15 : 10, 3.2);
    ctx.restore();
  }
  // Head + cap.
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(x, y + bob * 0.3, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8574a';
  ctx.beginPath();
  ctx.arc(x, y + bob * 0.3, 4.4, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + ax * 3 - 4, y + bob * 0.3 - 1.4 + ay * 2, 8, 2.4);
}

// --- pedestrians ----------------------------------------------------------------

export function createPeds(world, n, rng) {
  const peds = [];
  for (let k = 0; k < n; k++) {
    const bi = (rng() * COLS) | 0, bj = (rng() * ROWS) | 0;
    const p = {
      x: 0, y: 0, tx: 0, ty: 0,
      bi, bj,
      angle: rng() * Math.PI * 2,
      speed: 52 + rng() * 26,
      hp: 60,
      state: 'walk', // 'walk' | 'flee' | 'down'
      fleeT: 0, downT: 0,
      dangerX: 0, dangerY: 0,
      walkPhase: rng() * 6,
      skin: SKIN[(rng() * SKIN.length) | 0],
      shirt: SHIRTS[(rng() * SHIRTS.length) | 0],
      fare: false, hidden: false,
    };
    const pt = perimeterPoint(p, rng);
    p.x = pt.x; p.y = pt.y;
    const t2 = perimeterPoint(p, rng);
    p.tx = t2.x; p.ty = t2.y;
    peds.push(p);
  }
  return peds;
}

function perimeterPoint(p, rng) {
  const bx = blockX(p.bi), by = blockY(p.bj);
  const side = (rng() * 4) | 0, t = rng();
  const inset = 5;
  if (side === 0) return { x: bx + t * BLOCK, y: by + inset };
  if (side === 1) return { x: bx + t * BLOCK, y: by + BLOCK - inset };
  if (side === 2) return { x: bx + inset, y: by + t * BLOCK };
  return { x: bx + BLOCK - inset, y: by + t * BLOCK };
}

export function hurtPed(G, p, dmg, fromX, fromY) {
  if (p.state === 'down') return;
  p.hp -= dmg;
  G.fx.puff(p.x, p.y);
  if (p.hp <= 0) {
    p.state = 'down';
    p.downT = 7;
  } else {
    p.state = 'flee';
    p.fleeT = 2.6;
    p.dangerX = fromX; p.dangerY = fromY;
  }
}

export function scarePeds(G, x, y, r) {
  for (const p of G.peds) {
    if (p.state !== 'walk' || p.hidden) continue;
    if (Math.hypot(p.x - x, p.y - y) < r) {
      p.state = 'flee';
      p.fleeT = 2 + Math.random() * 1.5;
      p.dangerX = x; p.dangerY = y;
    }
  }
}

export function updatePeds(G, dt) {
  const rng = Math.random;
  for (const p of G.peds) {
    if (p.hidden) continue;
    if (p.state === 'down') {
      p.downT -= dt;
      if (p.downT <= 0) { p.state = 'flee'; p.fleeT = 2; p.hp = 40; p.dangerX = G.player.x; p.dangerY = G.player.y; }
      continue;
    }
    let mvx = 0, mvy = 0, spd = p.speed;
    if (p.state === 'flee') {
      p.fleeT -= dt;
      const dx = p.x - p.dangerX, dy = p.y - p.dangerY;
      const d = Math.hypot(dx, dy) || 1;
      mvx = dx / d; mvy = dy / d;
      spd = 218;
      if (p.fleeT <= 0) {
        p.state = 'walk';
        const t = perimeterPoint(p, rng);
        p.tx = t.x; p.ty = t.y;
      }
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 7) {
        if (rng() < 0.3) { p.bi = Math.max(0, Math.min(COLS - 1, p.bi + ((rng() * 3) | 0) - 1)); p.bj = Math.max(0, Math.min(ROWS - 1, p.bj + ((rng() * 3) | 0) - 1)); }
        const t = perimeterPoint(p, rng);
        p.tx = t.x; p.ty = t.y;
      } else {
        mvx = dx / d; mvy = dy / d;
      }
    }
    if (mvx !== 0 || mvy !== 0) {
      p.angle = Math.atan2(mvy, mvx);
      p.x += mvx * spd * dt;
      p.y += mvy * spd * dt;
      p.walkPhase += dt * (spd > 100 ? 13 : 8);
      const res = collideCircle(G.world, p.x, p.y, 9, 26);
      p.x = res.x; p.y = res.y;
    }
  }
}

export function drawPed(ctx, p, cam, tNow) {
  if (p.hidden) return;
  const x = p.x - cam.x, y = p.y - cam.y;
  if (x < -24 || y < -24 || x > cam.vw + 24 || y > cam.vh + 24) return;
  if (p.state === 'down') {
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 5.5, p.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(x + Math.cos(p.angle) * 11, y + Math.sin(p.angle) * 11, 3.8, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = 'rgba(30,25,15,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 4.5, 8.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.sin(p.walkPhase) * 1.1;
  ctx.fillStyle = p.shirt;
  ctx.beginPath();
  ctx.arc(x, y + bob * 0.3, 6.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(x, y + bob * 0.3, 3.9, 0, Math.PI * 2);
  ctx.fill();
  if (p.fare) {
    const bounce = Math.sin(tNow * 5) * 2.5;
    ctx.fillStyle = '#ffb400';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x, y - 13 + bounce);
  }
}
