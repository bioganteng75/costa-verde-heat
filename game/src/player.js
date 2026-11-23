// player.js — Rafe Solano on foot: movement, sprinting, fists and the
// gun table, health and pickups. Pedestrians live here too: they stroll
// the sidewalks, chat in pairs, and run when the day turns dangerous.
//
// v2 kit: the pistol gains a sibling — an SMG that fires three times as
// fast with a loose spread and eats ammo to match. Food stands heal for
// cash, getting hurt stamps a timer the HUD turns into a red vignette,
// and every shot reports its muzzle flash to the effects layer.

import { collideCircle, isOnRoad, isSand, isWater } from './world.js';
import { keyDown } from './input.js';
import { Sound } from './audio.js';

/** The gun table: cadence, bullet speed, damage, spread, sound. */
export const WEAPONS = {
  fists: { cd: 0.34, label: 'Fists' },
  pistol: { cd: 0.24, speed: 920, dmg: 16, spread: 0.012, label: 'Pistol' },
  smg: { cd: 0.085, speed: 990, dmg: 9, spread: 0.075, label: 'SMG' },
};

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, r: 14,
    hp: 100, maxHp: 100,
    cash: 60,
    weapon: 'fists', ammo: 0,
    car: null, dead: false,
    attackCd: 0, hurtCd: 0,
    hurtT: 99,       // seconds since the last hit, drives the vignette
    walkCycle: 0,
  };
}

export function createPedestrians(city, count, rng) {
  const peds = [];
  const shirts = ['#ef5350', '#ab47bc', '#42a5f5', '#66bb6a', '#ffa726', '#ec407a', '#8d6e63', '#26a69a', '#ffee58'];
  for (let i = 0; i < count; i++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = 120 + rng() * 3360;
      y = 120 + rng() * 2100;
      if (!isOnRoad(x, y)) break;
    }
    peds.push({
      x, y, angle: rng() * Math.PI * 2, r: 11,
      speed: 42 + rng() * 30,
      color: shirts[(rng() * shirts.length) | 0],
      skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'][(rng() * 5) | 0],
      state: 'walk', tx: x, ty: y, waitT: rng() * 3,
      fleeT: 0, dangerX: 0, dangerY: 0, down: false, downT: 0,
      walkCycle: rng() * 6,
    });
  }
  return peds;
}

export function pedestrianFlee(peds, x, y, radius) {
  for (const p of peds) {
    if (p.down) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius) {
      p.state = 'flee';
      p.fleeT = 1.6 + Math.random() * 1.2;
      p.dangerX = x;
      p.dangerY = y;
    }
  }
}

export function updatePedestrians(G, dt) {
  const city = G.city;
  for (const p of G.peds) {
    if (p.down) {
      p.downT -= dt;
      if (p.downT <= 0) { p.down = false; p.state = 'walk'; }
      continue;
    }
    p.walkCycle += dt * (p.state === 'flee' ? 13 : 7);
    if (p.state === 'flee') {
      p.fleeT -= dt;
      const a = Math.atan2(p.y - p.dangerY, p.x - p.dangerX);
      p.angle = a;
      p.x += Math.cos(a) * 165 * dt;
      p.y += Math.sin(a) * 165 * dt;
      if (p.fleeT <= 0) p.state = 'walk';
    } else {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 12 || p.waitT <= 0) {
        // Pick a new stroll target nearby, biased to pavements.
        for (let tries = 0; tries < 8; tries++) {
          const nx = p.x + (Math.random() - 0.5) * 460;
          const ny = p.y + (Math.random() - 0.5) * 460;
          if (nx > 30 && ny > 30 && ny < 2330 && !isWater(nx, ny)) { p.tx = nx; p.ty = ny; break; }
        }
        p.waitT = 4 + Math.random() * 6;
      }
      p.waitT -= dt;
      if (d >= 12) {
        p.angle = Math.atan2(dy, dx);
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
      }
    }
    const pos = { x: p.x, y: p.y };
    collideCircle(city, pos, p.r);
    p.x = pos.x; p.y = pos.y;
  }
}

export function drawPedestrian(ctx, p, cam) {
  const sx = p.x - cam.x;
  const sy = p.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  if (p.down) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(-10, -5, 20, 10);
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(13, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(p.walkCycle) * 1.6;
  ctx.fillStyle = 'rgba(40,30,10,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.fillStyle = '#37474f';
  ctx.fillRect(-6, 1 + Math.abs(bob) * 0.4, 5, 9);
  ctx.fillRect(1, 1 - Math.abs(bob) * 0.4, 5, 9);
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(0, -1, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(0, -9 + bob * 0.3, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawPlayer(ctx, player, cam, time) {
  if (player.car) return;
  const sx = player.x - cam.x;
  const sy = player.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  const bob = Math.sin(player.walkCycle) * 1.8;
  ctx.fillStyle = 'rgba(40,30,10,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 9, 11, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(player.angle + Math.PI / 2);
  // Legs in dark jeans, animated by the walk cycle.
  ctx.fillStyle = '#263238';
  ctx.fillRect(-7, 2 + Math.abs(bob) * 0.5, 6, 10);
  ctx.fillRect(1, 2 - Math.abs(bob) * 0.5, 6, 10);
  // Sunset-orange shirt: Rafe is easy to spot in a crowd.
  ctx.fillStyle = '#ff7043';
  ctx.beginPath();
  ctx.arc(0, -1, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e64a19';
  ctx.fillRect(-9.5, -3, 19, 4);
  // Head.
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(0, -10 + bob * 0.3, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#212121';
  ctx.fillRect(-6, -16 + bob * 0.3, 12, 4);
  // The aiming arm carries whatever the gun table says he holds.
  if (player.weapon === 'pistol' || player.weapon === 'smg') {
    ctx.fillStyle = '#c68642';
    ctx.fillRect(-2, -22, 4, 12);
    ctx.fillStyle = '#263238';
    if (player.weapon === 'smg') {
      ctx.fillRect(-2.6, -33, 5.2, 12);      // long body
      ctx.fillRect(-1.2, -24, 2.4, 6);       // magazine
    } else {
      ctx.fillRect(-2, -27, 4, 6);
    }
  }
  ctx.restore();
  if (player.hurtT < 0.45) {
    ctx.strokeStyle = 'rgba(255,40,40,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 20 + Math.sin(time * 20) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Melee and gunfire. Returns nothing; effects land on G directly. */
export function playerAttack(G, aimAngle) {
  const p = G.player;
  if (p.attackCd > 0 || p.car || p.dead) return;
  const gun = WEAPONS[p.weapon];
  if (gun && gun.speed && p.ammo > 0) {
    p.attackCd = gun.cd;
    p.ammo -= 1;
    if (p.weapon === 'smg') Sound.smgShot();
    else Sound.shot();
    const a = aimAngle + (Math.random() - 0.5) * 2 * gun.spread;
    const mx = p.x + Math.cos(aimAngle) * 20;
    const my = p.y + Math.sin(aimAngle) * 20;
    G.bullets.push({
      x: mx, y: my,
      vx: Math.cos(a) * gun.speed,
      vy: Math.sin(a) * gun.speed,
      dmg: gun.dmg,
      life: 0.55,
    });
    G.onMuzzle?.(mx, my, aimAngle);
    G.onCrime?.(2.2, p.x, p.y, true);
    pedestrianFlee(G.peds, p.x, p.y, 260);
    if (p.ammo === 0) p.weapon = 'fists';
    return;
  }
  // Fists.
  p.attackCd = WEAPONS.fists.cd;
  Sound.punch();
  const hx = p.x + Math.cos(aimAngle) * 30;
  const hy = p.y + Math.sin(aimAngle) * 30;
  for (const ped of G.peds) {
    if (!ped.down && Math.hypot(ped.x - hx, ped.y - hy) < 30) {
      ped.down = true;
      ped.downT = 5;
      Sound.hit();
      G.onCrime?.(2.4, p.x, p.y, true);
      pedestrianFlee(G.peds, p.x, p.y, 200);
      return;
    }
  }
  for (const car of G.cars) {
    if (Math.hypot(car.x - hx, car.y - hy) < car.w * 0.62) {
      car.health -= 6;
      Sound.hit();
      G.onSpark?.(hx, hy);
      G.onCrime?.(0.8, p.x, p.y, true);
      return;
    }
  }
}

export function updateBullets(G, dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    if (!dead) {
      for (const ped of G.peds) {
        if (!ped.down && Math.hypot(ped.x - b.x, ped.y - b.y) < 13) {
          ped.down = true;
          ped.downT = 8;
          G.onCrime?.(2.5, b.x, b.y, true);
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const car of G.cars) {
        if (Math.hypot(car.x - b.x, car.y - b.y) < car.w * 0.55) {
          car.health -= b.dmg ?? 16;
          G.onSpark?.(b.x, b.y);
          if (car.type === 'police') G.onCrime?.(2.5, b.x, b.y, true);
          if (car.health <= 0) car.wrecked = true;
          dead = true;
          break;
        }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}

export function drawBullets(ctx, G, cam) {
  ctx.strokeStyle = '#ffe082';
  ctx.lineWidth = 2.5;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - cam.x, b.y - cam.y);
    ctx.lineTo(b.x - b.vx * 0.016 - cam.x, b.y - b.vy * 0.016 - cam.y);
    ctx.stroke();
  }
}

/** On-foot movement, interactions and pickups for one frame. */
export function updatePlayerOnFoot(G, dt, aimAngle) {
  const p = G.player;
  if (p.dead) return;
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  p.hurtT += dt;

  let mx = 0;
  let my = 0;
  if (keyDown('w', 'arrowup')) my -= 1;
  if (keyDown('s', 'arrowdown')) my += 1;
  if (keyDown('a', 'arrowleft')) mx -= 1;
  if (keyDown('d', 'arrowright')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  const sprint = keyDown('shift');
  const speed = sprint ? 262 : 158;
  if (moving) {
    const len = Math.hypot(mx, my);
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.walkCycle += dt * (sprint ? 13 : 9);
    if (!keyDown('mouse')) p.angle = Math.atan2(my, mx);
    // Sprinting across the sand kicks up little puffs of it.
    if (sprint && isSand(p.x, p.y) && Math.random() < dt * 9) {
      G.onDust?.(p.x, p.y + 8, 1);
    }
  }
  // Face the mouse while a gun is drawn.
  if (p.weapon === 'pistol' || p.weapon === 'smg') p.angle = aimAngle;

  const pos = { x: p.x, y: p.y };
  collideCircle(G.city, pos, p.r);
  p.x = pos.x; p.y = pos.y;

  // Cars are solid to walk into.
  for (const car of G.cars) {
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const rr = car.w * 0.5 + p.r * 0.7;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = car.x + (dx / d) * rr;
      p.y = car.y + (dy / d) * rr;
    }
  }

  // Food stands: a hot plate for $10, if Rafe is hurt and can pay.
  for (const s of G.city.foodStands) {
    s.cd = Math.max(0, s.cd - dt);
    if (s.cd <= 0 && Math.hypot(s.x - p.x, s.y - p.y) < 34) {
      if (p.hp < p.maxHp && p.cash >= 10) {
        p.cash -= 10;
        p.hp = Math.min(p.maxHp, p.hp + 40);
        s.cd = 25;
        Sound.heal();
        G.onSparkle?.(p.x, p.y - 10, '#69f0ae');
        G.toast?.(`${s.label}: hot food, +40 health (−$10)`);
      } else if (p.hp < p.maxHp) {
        G.toast?.(`${s.label}: $10 a plate — you are short`);
        s.cd = 4;
      }
    }
  }

  // Pickups and packages.
  for (const pk of G.city.pickups) {
    if (pk.taken) continue;
    if (Math.hypot(pk.x - p.x, pk.y - p.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'pistol') {
        p.weapon = 'pistol';
        p.ammo += 24;
        G.toast?.('Pistol acquired — click to fire');
      } else if (pk.kind === 'smg') {
        p.weapon = 'smg';
        p.ammo += 90;
        G.toast?.('SMG acquired — hold click and hose');
      } else {
        p.hp = Math.min(p.maxHp, p.hp + 45);
        G.toast?.('Patched up +45');
      }
      Sound.pickup();
      G.onSparkle?.(pk.x, pk.y);
    }
  }
  for (const pkg of G.city.packages) {
    if (pkg.taken) continue;
    if (Math.hypot(pkg.x - p.x, pkg.y - p.y) < 28) {
      pkg.taken = true;
      p.cash += 50;
      G.packagesFound += 1;
      Sound.cash();
      G.onSparkle?.(pkg.x, pkg.y);
      G.toast?.(`Cash package found (${G.packagesFound}/${G.city.packages.length}) +$50`);
      G.saveGame?.();
    }
  }
}

export function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.dead || p.hurtCd > 0) return;
  p.hp -= amount;
  p.hurtCd = 0.7;
  p.hurtT = 0;
  Sound.hit();
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    G.onWasted?.();
  }
}
