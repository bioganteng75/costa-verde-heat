// fx.js — particles, skid marks and screen shake for Costa Verde Heat.
// One pooled particle list, a capped list of fading skid segments left
// by tyres, floating text popups, and a trauma-based camera shake.

const MAX_PARTICLES = 900;
const MAX_SKIDS = 900;

export function createFX() {
  const parts = [];
  const skids = [];
  const texts = [];
  let trauma = 0;

  function push(p) {
    if (parts.length >= MAX_PARTICLES) parts.shift();
    parts.push(p);
  }

  function burst(x, y, n, opt) {
    for (let i = 0; i < n; i++) {
      const a = opt.ang !== undefined ? opt.ang + (Math.random() - 0.5) * (opt.spread || 1.4) : Math.random() * Math.PI * 2;
      const sp = (opt.speed || 60) * (0.35 + Math.random() * 0.85);
      const life = (opt.life || 0.5) * (0.6 + Math.random() * 0.7);
      push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life, maxLife: life,
        size: (opt.size || 3) * (0.6 + Math.random() * 0.8),
        color: opt.colors[(Math.random() * opt.colors.length) | 0],
        drag: opt.drag !== undefined ? opt.drag : 2.2,
        grav: opt.grav || 0,
        shrink: opt.shrink !== undefined ? opt.shrink : true,
        glow: !!opt.glow,
      });
    }
  }

  return {
    dust(x, y, n = 6) {
      burst(x, y, n, { colors: ['#c9b18c', '#b39d77', '#d8c49c'], speed: 55, life: 0.55, size: 4 });
    },
    sparks(x, y, ang, n = 10) {
      burst(x, y, n, { colors: ['#ffd76a', '#ffb347', '#fff3c4'], speed: 260, life: 0.32, size: 2.2, ang, spread: 1.8, drag: 3.5, glow: true });
    },
    smoke(x, y, n = 5, dark = false) {
      burst(x, y, n, {
        colors: dark ? ['#3a3a40', '#4c4c52', '#2e2e33'] : ['#cfd4d8', '#b9bfc4', '#e3e7ea'],
        speed: 26, life: 1.15, size: 7, drag: 0.7, grav: -22, shrink: false,
      });
    },
    sparkle(x, y, n = 12) {
      burst(x, y, n, { colors: ['#7dff9a', '#d2ffd9', '#37e08b'], speed: 90, life: 0.5, size: 2.6, drag: 2.6, glow: true });
    },
    muzzle(x, y, ang) {
      burst(x, y, 3, { colors: ['#ffe27a', '#ffb347'], speed: 40, life: 0.07, size: 4.5, ang, spread: 0.7, glow: true });
    },
    puff(x, y) {
      burst(x, y, 7, { colors: ['#e8e3d8', '#d5cfc0'], speed: 80, life: 0.3, size: 3.4 });
    },
    skid(x, y) {
      if (skids.length >= MAX_SKIDS) skids.shift();
      skids.push({ x, y, life: 26 });
    },
    // A short pre-laid trail of skid marks, used by the screenshot scenes.
    skidTrail(x, y, ang, len, step = 14) {
      for (let d = 0; d < len; d += step) {
        this.skid(x - Math.cos(ang) * d, y - Math.sin(ang) * d);
      }
    },
    text(x, y, str, color = '#ffffff') {
      texts.push({ x, y, str, color, life: 1.25, maxLife: 1.25 });
    },
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    shakeOffset() {
      const s = trauma * trauma * 15;
      return { x: (Math.random() * 2 - 1) * s, y: (Math.random() * 2 - 1) * s };
    },
    update(dt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d;
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = skids.length - 1; i >= 0; i--) {
        skids[i].life -= dt;
        if (skids[i].life <= 0) skids.splice(i, 1);
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life -= dt;
        t.y -= 34 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
    },
    drawSkids(ctx, cam) {
      ctx.fillStyle = '#26262a';
      for (const s of skids) {
        const sx = s.x - cam.x, sy = s.y - cam.y;
        if (sx < -10 || sy < -10 || sx > cam.vw + 10 || sy > cam.vh + 10) continue;
        ctx.globalAlpha = Math.min(0.5, s.life * 0.06);
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
    },
    drawParts(ctx, cam) {
      for (const p of parts) {
        const sx = p.x - cam.x, sy = p.y - cam.y;
        if (sx < -16 || sy < -16 || sx > cam.vw + 16 || sy > cam.vh + 16) continue;
        const f = p.life / p.maxLife;
        ctx.globalAlpha = Math.min(1, f * 1.4);
        ctx.fillStyle = p.color;
        const sz = p.shrink ? p.size * f : p.size * (1.6 - f * 0.6);
        if (p.glow) {
          ctx.beginPath();
          ctx.arc(sx, sy, sz * 1.9, 0, Math.PI * 2);
          ctx.globalAlpha = f * 0.25;
          ctx.fill();
          ctx.globalAlpha = Math.min(1, f * 1.4);
        }
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.4, sz), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px system-ui, sans-serif';
      for (const t of texts) {
        const sx = t.x - cam.x, sy = t.y - cam.y;
        ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 1.6);
        ctx.fillStyle = '#101418';
        ctx.fillText(t.str, sx + 1, sy + 1);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, sx, sy);
      }
      ctx.globalAlpha = 1;
    },
  };
}
