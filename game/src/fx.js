// fx.js — the juice of Costa Verde Heat v2: a tiny particle pool, tyre
// skid marks that persist on the asphalt, muzzle flashes and the screen
// shake that ties big moments together. Nothing here knows about game
// rules; modules report events ("a crash happened here", "a gun fired")
// and fx turns them into things the eye can feel.
//
// Particles are world-space points with a kind:
//   dust   — soft tan puffs, grow and fade (off-road, beach, landings)
//   spark  — hot yellow streaks with gravity (collisions, gun hits)
//   smoke  — grey risers from dying engines
//   glow   — additive sparkles (pickups, cash, spray booths)
//   flash  — a one-frame muzzle star, drawn rotated toward the shot

export function createFx() {
  return {
    particles: [],
    skids: [],      // {x, y, ang, a} — a is alpha strength 0..0.55
    shake: 0,       // current screen-shake magnitude in pixels
    time: 0,
  };
}

const MAX_PARTICLES = 420;
const MAX_SKIDS = 1100;

function push(fx, p) {
  if (fx.particles.length >= MAX_PARTICLES) fx.particles.shift();
  fx.particles.push(p);
}

export function spawnDust(fx, x, y, n = 3, spread = 26) {
  for (let i = 0; i < n; i++) {
    push(fx, {
      kind: 'dust',
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread * 0.6,
      vx: (Math.random() - 0.5) * 36,
      vy: -12 - Math.random() * 26,
      life: 0.55 + Math.random() * 0.5,
      maxLife: 1.05,
      size: 5 + Math.random() * 8,
    });
  }
}

export function spawnSparks(fx, x, y, n = 10, baseAngle = null) {
  for (let i = 0; i < n; i++) {
    const a = baseAngle === null
      ? Math.random() * Math.PI * 2
      : baseAngle + (Math.random() - 0.5) * 1.7;
    const sp = 90 + Math.random() * 260;
    push(fx, {
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0.28 + Math.random() * 0.3,
      maxLife: 0.58,
      size: 2 + Math.random() * 2,
    });
  }
}

export function spawnSmoke(fx, x, y, n = 2) {
  for (let i = 0; i < n; i++) {
    push(fx, {
      kind: 'smoke',
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 14,
      vy: -34 - Math.random() * 22,
      life: 0.9 + Math.random() * 0.6,
      maxLife: 1.5,
      size: 6 + Math.random() * 7,
    });
  }
}

export function spawnSparkle(fx, x, y, n = 8, color = '#ffd83d') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    push(fx, {
      kind: 'glow',
      x, y,
      vx: Math.cos(a) * (26 + Math.random() * 30),
      vy: Math.sin(a) * (26 + Math.random() * 30) - 14,
      life: 0.45 + Math.random() * 0.3,
      maxLife: 0.75,
      size: 2.5 + Math.random() * 2.5,
      color,
    });
  }
}

/** A muzzle flash: one bright star at the barrel plus a few sparks. */
export function spawnMuzzle(fx, x, y, angle) {
  push(fx, {
    kind: 'flash',
    x: x + Math.cos(angle) * 8,
    y: y + Math.sin(angle) * 8,
    vx: 0, vy: 0,
    angle,
    life: 0.055,
    maxLife: 0.055,
    size: 15 + Math.random() * 6,
  });
  spawnSparks(fx, x + Math.cos(angle) * 12, y + Math.sin(angle) * 12, 2, angle);
}

/** Lay one segment of tyre mark. Called per rear wheel while sliding. */
export function addSkid(fx, x, y, ang, strength = 0.5) {
  fx.skids.push({ x, y, ang, a: Math.min(0.55, strength) });
  if (fx.skids.length > MAX_SKIDS) fx.skids.splice(0, fx.skids.length - MAX_SKIDS);
}

/** Register a jolt: crashes and explosions shake the camera. */
export function addShake(fx, amount) {
  fx.shake = Math.min(16, Math.max(fx.shake, amount));
}

export function updateFx(fx, dt) {
  fx.time += dt;
  fx.shake = Math.max(0, fx.shake - dt * 26);
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
    if (p.kind === 'spark') {
      p.vy += 620 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    } else if (p.kind === 'dust' || p.kind === 'smoke') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += dt * 15;
    } else if (p.kind === 'glow') {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - dt * 2.4);
      p.vy *= (1 - dt * 2.4);
    }
  }
}

/** Skid marks live under the cars, so they get their own early pass. */
export function drawSkids(ctx, fx, cam) {
  ctx.fillStyle = '#17181c';
  for (const s of fx.skids) {
    const sx = s.x - cam.x;
    const sy = s.y - cam.y;
    if (sx < -20 || sy < -20 || sx > cam.vw + 20 || sy > cam.vh + 20) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(s.ang);
    ctx.globalAlpha = s.a;
    ctx.fillRect(-7, -2.6, 14, 5.2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Particles and flashes draw over the world and its vehicles. */
export function drawParticles(ctx, fx, cam) {
  for (const p of fx.particles) {
    const sx = p.x - cam.x;
    const sy = p.y - cam.y;
    if (sx < -30 || sy < -30 || sx > cam.vw + 30 || sy > cam.vh + 30) continue;
    const t = Math.max(0, p.life / p.maxLife);
    if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(216,190,140,${0.34 * t})`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'smoke') {
      ctx.fillStyle = `rgba(70,70,78,${0.4 * t})`;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = `rgba(255,${180 + ((t * 60) | 0)},60,${t})`;
      ctx.lineWidth = p.size * 0.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - p.vx * 0.03, sy - p.vy * 0.03);
      ctx.stroke();
    } else if (p.kind === 'glow') {
      ctx.fillStyle = p.color || '#ffd83d';
      ctx.globalAlpha = t;
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * t + 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.kind === 'flash') {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(255,214,90,0.95)';
      ctx.beginPath();
      ctx.moveTo(p.size, 0);
      ctx.lineTo(p.size * 0.3, -p.size * 0.32);
      ctx.lineTo(p.size * 0.62, 0);
      ctx.lineTo(p.size * 0.3, p.size * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Random per-frame camera offset for the current shake magnitude. */
export function shakeOffset(fx) {
  if (fx.shake <= 0.2) return { x: 0, y: 0 };
  return {
    x: (Math.random() - 0.5) * 2 * fx.shake,
    y: (Math.random() - 0.5) * 2 * fx.shake,
  };
}
