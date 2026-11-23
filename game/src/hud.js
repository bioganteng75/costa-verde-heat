// hud.js — everything drawn over the world: HUD (cash, health, weapon,
// wanted stars, objective banner, speedometer, bust meter), the
// minimap, off-screen objective arrow, toasts, world markers, and the
// menu / pause / busted / wasted screens.

import { WORLD_W, WORLD_H, CITY_W, SAND_W, vRoadX, hRoadY, COLS, ROWS } from './world.js';
import { TYPES } from './vehicles.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Pulsing rings at objective locations, drawn in world space.
export function drawMarkers(ctx, G, cam) {
  for (const mk of G.missions.markers()) {
    const x = mk.x - cam.x, y = mk.y - cam.y;
    if (x < -80 || y < -80 || x > cam.vw + 80 || y > cam.vh + 80) continue;
    const pulse = 30 + Math.sin(G.tNow * 4) * 5;
    ctx.strokeStyle = mk.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(x, y, pulse, 0, Math.PI * 2);
    ctx.fillStyle = mk.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    // Light pillar so the target reads from far away.
    if (!mk.ringOnly) {
      const grad = ctx.createLinearGradient(0, y - 130, 0, y);
      grad.addColorStop(0, 'rgba(255,210,62,0)');
      grad.addColorStop(1, 'rgba(255,210,62,0.30)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 3, y - 130, 6, 130);
    }
    ctx.fillStyle = '#101418';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mk.label, x, y + 5);
  }
  // Marisol herself, standing by the safehouse.
  const mz = G.world.services.marisol;
  const x = mz.x - cam.x, y = mz.y - cam.y;
  if (x > -30 && y > -30 && x < cam.vw + 30 && y < cam.vh + 30) {
    ctx.fillStyle = 'rgba(30,25,15,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 4.5, 8.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c22e6e';
    ctx.beginPath(); ctx.arc(x, y, 6.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a34';
    ctx.beginPath(); ctx.arc(x, y, 3.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MARISOL', x, y - 13);
  }
}

function drawMinimap(ctx, G) {
  const w = 198, h = 152, x0 = 14, y0 = G.viewH - h - 14;
  const s = Math.min(w / WORLD_W, h / WORLD_H);
  const mw = WORLD_W * s, mh = WORLD_H * s;
  ctx.fillStyle = 'rgba(10,16,22,0.72)';
  rr(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8, 8); ctx.fill();
  ctx.fillStyle = '#1d5f96';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = '#d9bd85';
  ctx.fillRect(x0 + CITY_W * s, y0, SAND_W * s, mh);
  ctx.fillStyle = '#8f8672';
  ctx.fillRect(x0, y0, CITY_W * s, mh);
  ctx.strokeStyle = 'rgba(230,230,220,0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= COLS; i++) {
    ctx.beginPath();
    ctx.moveTo(x0 + vRoadX(i) * s, y0);
    ctx.lineTo(x0 + vRoadX(i) * s, y0 + mh);
    ctx.stroke();
  }
  for (let j = 0; j <= ROWS; j++) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + hRoadY(j) * s);
    ctx.lineTo(x0 + CITY_W * s, y0 + hRoadY(j) * s);
    ctx.stroke();
  }
  const dot = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + wx * s, y0 + wy * s, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const S = G.world.services;
  dot(S.paynspray.x + S.paynspray.w / 2, S.paynspray.y + S.paynspray.h / 2, '#37e08b', 3.4);
  for (const st of G.world.stands) dot(st.x, st.y, '#ffb35c', 2.2);
  dot(S.safehouse.x, S.safehouse.y, '#ffffff', 2.6);
  // Race starts.
  if (!G.missions.race && !G.missions.active) {
    for (const r of G.missions.races) dot(r.start.x, r.start.y, '#57b6ff', 2.8);
  }
  // Police blips flash red/blue.
  const flash = Math.sin(G.tNow * 10) > 0;
  for (const v of G.vehicles) {
    if (v.type === 'police') dot(v.x, v.y, flash ? '#ff5040' : '#4a9eff', 3);
  }
  // Objective.
  const obj = G.objectiveOverride || G.missions.objective();
  if (obj && obj.x !== null && Math.sin(G.tNow * 5) > -0.4) dot(obj.x, obj.y, '#ffd23e', 4);
  // Player arrow.
  const a = G.player.vehicle || G.player;
  const px = x0 + a.x * s, py = y0 + a.y * s;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(a.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  rr(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8, 8); ctx.stroke();
}

export function drawHUD(ctx, G) {
  const W = G.viewW, H = G.viewH;
  const p = G.player;

  // Hurt vignette + low health pulse.
  if (p.hurtT > 0 || p.hp < 30) {
    const a = Math.max(p.hurtT * 0.4, p.hp < 30 ? 0.16 + Math.sin(G.tNow * 6) * 0.06 : 0);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.36, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(200,30,20,0)');
    g.addColorStop(1, `rgba(200,30,20,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // --- top-left cluster ----------------------------------------------------
  ctx.fillStyle = 'rgba(10,16,22,0.55)';
  rr(ctx, 12, 12, 218, 86, 10); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7dff9a';
  ctx.font = 'bold 25px system-ui, sans-serif';
  ctx.fillText(`$${G.save.cash.toLocaleString('en-US')}`, 24, 42);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  rr(ctx, 24, 52, 150, 11, 5); ctx.fill();
  ctx.fillStyle = p.hp > 45 ? '#37e08b' : p.hp > 22 ? '#ffb400' : '#ff5040';
  rr(ctx, 24, 52, Math.max(0, 150 * (p.hp / p.maxHp)), 11, 5); ctx.fill();
  ctx.fillStyle = '#e8eef2';
  ctx.font = '12.5px system-ui, sans-serif';
  const weaponName = p.weapon === 'fists' ? 'Fists' : p.weapon === 'pistol' ? 'Pistol' : 'SMG';
  ctx.fillText(`${weaponName}   ·   ▣ ${G.save.packages.length}/18`, 24, 82);

  // --- wanted stars, top-right ----------------------------------------------
  const P = G.police;
  const scale = 1 + (P.starFlash > 0 ? Math.sin(Math.min(1, P.starFlash) * Math.PI) * 0.3 : 0);
  for (let i = 0; i < 5; i++) {
    const cx = W - 34 - (4 - i) * 34, cy = 34;
    starPath(ctx, cx, cy, 13 * scale);
    if (i < P.stars) {
      ctx.fillStyle = '#ffd23e';
      ctx.fill();
      ctx.strokeStyle = '#8a6d00';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(16,20,26,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  if (P.stars > 0) {
    ctx.textAlign = 'right';
    ctx.font = '11.5px system-ui, sans-serif';
    ctx.fillStyle = P.lastSeenT > 3.5 ? '#9fe8ff' : 'rgba(255,255,255,0.65)';
    ctx.fillText(P.lastSeenT > 3.5 ? 'UNSEEN — heat is cooling' : 'POLICE HAVE EYES ON YOU', W - 18, 62);
  }

  // --- objective banner, top-center -------------------------------------------
  const obj = G.objectiveOverride || G.missions.objective();
  if (obj) {
    ctx.font = 'bold 15.5px system-ui, sans-serif';
    const dist = obj.x !== null ? Math.round(Math.hypot((p.vehicle || p).x - obj.x, (p.vehicle || p).y - obj.y) / 9) : null;
    let label = obj.text;
    if (dist !== null) label += `   ·   ${dist}m`;
    let timerTxt = '';
    if (obj.timer !== null && obj.timer !== undefined) {
      if (obj.timer >= 0) timerTxt = `   ·   ${fmtTime(obj.timer)}`;
      else timerTxt = `   ·   ${fmtTime(-obj.timer)} / ${fmtTime(obj.par)}`;
    }
    const wdt = Math.min(W - 480, ctx.measureText(label + timerTxt).width + 44);
    const bx = (W - wdt) / 2;
    ctx.fillStyle = 'rgba(10,16,22,0.62)';
    rr(ctx, bx, 12, Math.max(240, wdt), 40, 10); ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.arc(bx + 20, 32, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#101418';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◎', bx + 20, 36);
    ctx.font = 'bold 15.5px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(label, bx + 36, 38);
    if (timerTxt) {
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = obj.timer >= 0 && obj.timer < 12 ? '#ff6a5e' : '#ffd76a';
      ctx.fillText(timerTxt, bx + 36 + tw, 38);
    }
    // Off-screen arrow.
    if (obj.x !== null) {
      const sx = obj.x - G.cam.x, sy = obj.y - G.cam.y;
      if (sx < 30 || sy < 30 || sx > W - 30 || sy > H - 30) {
        const cx = Math.max(44, Math.min(W - 44, sx));
        const cy = Math.max(70, Math.min(H - 44, sy));
        const ang = Math.atan2(sy - cy, sx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd23e';
        ctx.beginPath();
        ctx.moveTo(15, 0); ctx.lineTo(-9, -9); ctx.lineTo(-9, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${dist}m`, cx, cy + 26);
      }
    }
  }

  // --- speedometer, bottom-right ------------------------------------------------
  if (p.vehicle) {
    const v = p.vehicle;
    const kmh = Math.round(Math.abs(v.speed) * 0.45);
    ctx.fillStyle = 'rgba(10,16,22,0.55)';
    rr(ctx, W - 168, H - 96, 154, 82, 10); ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(`${kmh}`, W - 44, H - 48);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#9fb4c4';
    ctx.fillText('km/h', W - 18, H - 48);
    ctx.font = '12.5px system-ui, sans-serif';
    ctx.fillStyle = '#e8eef2';
    ctx.fillText(TYPES[v.type].name, W - 18, H - 24);
    // Integrity bar under the speedo.
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, W - 154, H - 20, 100, 5, 2.5); ctx.fill();
    ctx.fillStyle = v.hp > v.maxHp * 0.4 ? '#37e08b' : '#ff5040';
    rr(ctx, W - 154, H - 20, Math.max(0, 100 * (v.hp / v.maxHp)), 5, 2.5); ctx.fill();
  }

  // --- bust meter ------------------------------------------------------------------
  if (P.bust > 0.02) {
    const bw = 260, bx = (W - bw) / 2, by = H - 128;
    ctx.fillStyle = 'rgba(10,16,22,0.6)';
    rr(ctx, bx - 8, by - 24, bw + 16, 46, 9); ctx.fill();
    ctx.fillStyle = '#ff6a5e';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', W / 2, by - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    rr(ctx, bx, by, bw, 10, 5); ctx.fill();
    ctx.fillStyle = '#ff3b30';
    rr(ctx, bx, by, bw * P.bust, 10, 5); ctx.fill();
  }

  drawMinimap(ctx, G);

  // --- toasts ----------------------------------------------------------------------
  let ty = 66;
  ctx.textAlign = 'center';
  for (const t of G.toasts) {
    const a = Math.min(1, t.t / 0.5, (t.max - t.t) / 0.4 + 0.2);
    ctx.font = 'bold 15px system-ui, sans-serif';
    // Word-wrap long lines (mission intros) so the pill stays on screen.
    const maxW = Math.min(560, W - 260);
    const lines = [''];
    for (const word of t.text.split(' ')) {
      const trial = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + word : word;
      if (ctx.measureText(trial).width > maxW && lines[lines.length - 1]) lines.push(word);
      else lines[lines.length - 1] = trial;
    }
    const wdt = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 34;
    const hgt = lines.length * 19 + 11;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = 'rgba(10,16,22,0.68)';
    rr(ctx, (W - wdt) / 2, ty, wdt, hgt, 8); ctx.fill();
    ctx.fillStyle = t.color;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, ty + 20 + i * 19));
    ctx.globalAlpha = 1;
    ty += hgt + 8;
  }

  // Context hint at the bottom-center.
  ctx.font = '12.5px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center';
  const hint = G.contextHint;
  if (hint) ctx.fillText(hint, W / 2, H - 16);
}

// --- full screens --------------------------------------------------------------------

export function drawMenu(ctx, G) {
  const W = G.viewW, H = G.viewH;
  const grad = ctx.createLinearGradient(0, 0, W * 0.7, 0);
  grad.addColorStop(0, 'rgba(12,14,26,0.88)');
  grad.addColorStop(1, 'rgba(12,14,26,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 21px system-ui, sans-serif';
  ctx.fillText('M A K E . F U N   P R E S E N T S', 56, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.fillText('COSTA VERDE', 52, 172);
  ctx.fillStyle = '#ff5e3a';
  ctx.fillText('HEAT', 52, 252);
  ctx.fillStyle = '#e8eef2';
  ctx.font = '16.5px system-ui, sans-serif';
  const story = [
    'Costa Verde, a sun-soaked coastal city that runs on favours.',
    'You are the new driver. Fixer Marisol Vega has work — packages,',
    'borrowed cars, vault scores — and the whole police force to dodge.',
    'Run her seven jobs, race the coast, work the taxi rank, and',
    'whatever you do: do not get busted.',
  ];
  story.forEach((line, i) => ctx.fillText(line, 56, 300 + i * 24));

  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText('CONTROLS', 56, 452);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ea';
  const controls = [
    'WASD / arrows — move & drive        Shift — sprint',
    'Mouse — aim · Click / Space — attack or fire',
    'F — enter / exit car (stealing is a crime)',
    'E — eat at a food stand ($25, heals)',
    'Esc — pause · M — mute · Enter — start',
  ];
  controls.forEach((line, i) => ctx.fillText(line, 56, 478 + i * 22));

  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.fillStyle = '#7dff9a';
  ctx.fillText('▶  ENTER — New Game', 56, 622);
  if (G.hasSave) {
    ctx.fillStyle = '#8ad2ff';
    ctx.fillText(`▶  C — Continue  (job ${Math.min(7, G.save.missionIndex + 1)}, $${G.save.cash.toLocaleString('en-US')})`, 56, 652);
  }
  ctx.font = '12.5px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('An original open-world crime game · built by an AI agent for the make.fun “Make GTA 6” bounty', 56, H - 22);
}

export function drawPause(ctx, G) {
  const W = G.viewW, H = G.viewH;
  ctx.fillStyle = 'rgba(8,10,18,0.66)';
  ctx.fillRect(0, 0, W, H);
  const pw = 380, ph = 300, px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.fillStyle = 'rgba(16,22,30,0.95)';
  rr(ctx, px, py, pw, ph, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,106,0.5)';
  ctx.lineWidth = 2;
  rr(ctx, px, py, pw, ph, 14); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 38px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, py + 58);
  ctx.font = '15.5px system-ui, sans-serif';
  ctx.fillStyle = '#cfe0ea';
  const lines = [
    `Cash  $${G.save.cash.toLocaleString('en-US')}`,
    `Jobs done  ${G.save.missionIndex} / 7`,
    `Races won  ${G.save.racesWon.length} / 3`,
    `Packages  ${G.save.packages.length} / 18`,
    '',
    'ESC — resume',
    'S — save game',
    'M — mute',
    'Q — quit to menu',
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, py + 102 + i * 22));
}

export function drawEndScreen(ctx, G) {
  const W = G.viewW, H = G.viewH;
  const info = G.endInfo || { title: '', color: '#ffffff', lines: [] };
  ctx.fillStyle = 'rgba(8,8,14,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = info.color;
  ctx.font = '900 92px system-ui, sans-serif';
  ctx.fillText(info.title, W / 2, H / 2 - 40);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = '#e8eef2';
  info.lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 + 16 + i * 26));
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillStyle = '#7dff9a';
  ctx.fillText('ENTER — back on the street', W / 2, H / 2 + 16 + info.lines.length * 26 + 22);
}
