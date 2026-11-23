// hud.js — everything drawn over the world: cash and health, the wanted
// stars, the objective banner, the speedometer, the minimap with its
// blips, and the full-screen menus (start, pause, busted, wasted).
//
// v2 polish: an arrow at the screen edge chases off-screen objectives,
// the wanted stars pulse with the heat, a red vignette blooms when Rafe
// is hurt, and the minimap knows the city's services — the Pay 'n Spray,
// the food stands and the race rings.

import { WORLD_W, WORLD_H, AVENUES, STREETS, WATER_Y } from './world.js';
import { currentObjective, raceInfo, STORY, RACES } from './missions.js';
import { carDisplayName } from './vehicles.js';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(12,18,28,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,213,79,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawMinimap(ctx, G, x, y, w, h) {
  panel(ctx, x, y, w, h, 0.62);
  const sx = (v) => x + 6 + (v / WORLD_W) * (w - 12);
  const sy = (v) => y + 6 + (v / WORLD_H) * (h - 12);
  // Water and sand at the bottom of the map.
  ctx.fillStyle = '#2d86ad';
  ctx.fillRect(sx(0), sy(WATER_Y), (w - 12), (WORLD_H - WATER_Y) / WORLD_H * (h - 12));
  // Roads.
  ctx.strokeStyle = 'rgba(240,240,230,0.75)';
  ctx.lineWidth = 1.4;
  for (const ax of AVENUES) {
    ctx.beginPath(); ctx.moveTo(sx(ax), sy(0)); ctx.lineTo(sx(ax), sy(WORLD_H)); ctx.stroke();
  }
  for (const syV of STREETS) {
    ctx.beginPath(); ctx.moveTo(sx(0), sy(syV)); ctx.lineTo(sx(WORLD_W), sy(syV)); ctx.stroke();
  }
  // Services: the spray shop in magenta, food stands in green.
  const ps = G.city.landmarks.paynspray;
  ctx.fillStyle = '#ec407a';
  ctx.fillRect(sx(ps.x) - 3, sy(ps.y) - 3, 6, 6);
  ctx.fillStyle = '#69f0ae';
  for (const s of G.city.foodStands) {
    ctx.beginPath();
    ctx.arc(sx(s.x), sy(s.y), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Race ring in cyan, objective in gold, taxi in blue.
  const ri = raceInfo(G);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(sx(ri.x), sy(ri.y), 4.4, 0, Math.PI * 2);
  ctx.stroke();
  const obj = currentObjective(G);
  if (obj.x !== null && obj.x !== undefined) {
    ctx.fillStyle = '#ffd54f';
    const ox = sx(obj.x);
    const oy = sy(obj.y);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  }
  if (G.missions.taxi) {
    ctx.fillStyle = '#42a5f5';
    ctx.beginPath();
    ctx.arc(sx(G.missions.taxi.x), sy(G.missions.taxi.y), 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police blips flash red/blue.
  const flash = Math.floor(G.time * 3) % 2 === 0;
  for (const cop of G.police) {
    if (cop.wrecked) continue;
    ctx.fillStyle = flash ? '#ff5252' : '#82b1ff';
    ctx.beginPath();
    ctx.arc(sx(cop.x), sy(cop.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Roadblocks sit on the map as red squares.
  ctx.fillStyle = '#ff1744';
  for (const rb of G.roadblocks ?? []) {
    ctx.fillRect(sx(rb.x) - 3, sy(rb.y) - 3, 6, 6);
  }
  // Player arrow.
  const p = G.player;
  const px = sx(p.car ? p.car.x : p.x);
  const py = sy(p.car ? p.car.y : p.y);
  const ang = p.car ? p.car.angle : p.angle;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.6);
  ctx.lineTo(-5, 4.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A gold arrow pinned to the screen edge while the objective is off-screen. */
export function drawObjectiveArrow(ctx, G, vw, vh) {
  const obj = currentObjective(G);
  if (obj.x === null || obj.x === undefined) return;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const sx = obj.x - G.cam.x;
  const sy = obj.y - G.cam.y;
  const margin = 46;
  if (sx > margin && sx < vw - margin && sy > margin && sy < vh - margin) return;
  const cx = vw / 2;
  const cy = vh / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const ex = Math.max(margin, Math.min(vw - margin, sx));
  const ey = Math.max(margin, Math.min(vh - margin, sy));
  const dist = Math.round(Math.hypot(obj.x - px, obj.y - py) / 10);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ang);
  ctx.fillStyle = '#ffd54f';
  ctx.strokeStyle = 'rgba(20,16,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(17, 0);
  ctx.lineTo(-9, -11);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-9, 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#ffd54f';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  // Pinned to the top edge, the label goes above the arrow instead of
  // colliding with the objective banner that lives up there.
  ctx.fillText(`${dist}m`, ex, ey <= margin + 2 ? ey - 24 : ey + 30);
}

function drawDamageVignette(ctx, G, vw, vh) {
  const p = G.player;
  const fresh = Math.max(0, 1 - p.hurtT / 1.1);         // bloom right after a hit
  const low = p.hp < 35 ? 0.35 + 0.12 * Math.sin(G.time * 5) : 0; // low-health pulse
  const a = Math.min(0.55, fresh * 0.5 + low);
  if (a <= 0.01 || p.dead) return;
  const grad = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.36, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
  grad.addColorStop(0, 'rgba(200,20,20,0)');
  grad.addColorStop(1, `rgba(200,20,20,${a})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
}

export function drawHUD(ctx, G, vw, vh) {
  const p = G.player;
  drawDamageVignette(ctx, G, vw, vh);
  // Cash + health, top-left.
  panel(ctx, 14, 14, 218, 64);
  ctx.fillStyle = '#69f0ae';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`$${p.cash}`, 26, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`packages ${G.packagesFound}/${G.city.packages.length} · races ${G.missions.racesWon}/${RACES.length}`, 26, 66);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(118, 30, 100, 12);
  ctx.fillStyle = p.hp > 35 ? '#66bb6a' : '#ef5350';
  ctx.fillRect(118, 30, Math.max(0, p.hp), 12);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('HEALTH', 118, 58);

  // Wanted stars above the minimap, pulsing with the heat.
  const stars = G.wanted.stars;
  if (stars > 0) {
    ctx.textAlign = 'left';
    for (let i = 0; i < 5; i++) {
      const lit = i < stars;
      const scale = lit ? 1 + 0.13 * Math.sin(G.time * 6 - i * 0.7) : 1;
      ctx.save();
      ctx.translate(vw - 146 + i * 27, 34);
      ctx.scale(scale, scale);
      ctx.font = '26px system-ui, sans-serif';
      ctx.fillStyle = lit ? '#ffd54f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', -12, 9);
      ctx.restore();
    }
    if (G.wanted.bustMeter > 0.02) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(vw - 224, 50, 130, 9);
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(vw - 224, 50, 130 * Math.min(1, G.wanted.bustMeter), 9);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('BUSTED?', vw - 94, 59);
    }
  }

  drawMinimap(ctx, G, vw - 224, 66, 210, 158);
  drawObjectiveArrow(ctx, G, vw, vh);

  // Objective banner, top-centre, with the job's progress under it.
  const obj = currentObjective(G);
  const label = obj.timer !== null && obj.timer !== undefined
    ? `${obj.text}  —  ${Math.max(0, Math.ceil(obj.timer))}s`
    : obj.text;
  ctx.font = 'bold 16px system-ui, sans-serif';
  const tw = ctx.measureText(label).width;
  panel(ctx, (vw - tw) / 2 - 16, 14, tw + 32, 38, 0.6);
  ctx.fillStyle = '#ffd54f';
  ctx.textAlign = 'center';
  ctx.fillText(label, vw / 2, 39);
  const M = G.missions;
  let progress = null;
  if (M.race) progress = `Race series — ${M.racesWon}/${RACES.length} won`;
  else if (M.active) progress = `Job ${M.storyIndex + 1}/${STORY.length} · "${M.active.def.title}" · step ${M.active.stepIndex + 1}/${M.active.def.steps.length}`;
  else if (M.storyIndex < STORY.length) progress = `Story: ${M.storyIndex}/${STORY.length} jobs done`;
  if (progress) {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(progress, vw / 2, 68);
  }

  // Phone toast from Marisol, bottom-left.
  if (G.missions.phone) {
    const text = G.missions.phone.text;
    ctx.font = '14px system-ui, sans-serif';
    const lines = wrapText(ctx, text, 400);
    panel(ctx, 14, vh - 96 - lines.length * 19, 428, 26 + lines.length * 19, 0.66);
    ctx.fillStyle = '#90caf9';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📱 MARISOL VEGA', 26, vh - 76 - lines.length * 19);
    ctx.fillStyle = '#fff';
    ctx.font = '14px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 26, vh - 56 - (lines.length - 1 - i) * 19));
  }
  // Short centre toasts.
  if (G.toastMsg && G.toastT > 0) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const tw2 = ctx.measureText(G.toastMsg).width;
    panel(ctx, (vw - tw2) / 2 - 14, vh - 120, tw2 + 28, 34, 0.6);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.toastMsg, vw / 2, vh - 97);
  }

  // Weapon / ammo, bottom-left corner.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const wlabel = p.weapon === 'pistol' ? `🔫 Pistol · ${p.ammo}` : p.weapon === 'smg' ? `🔫 SMG · ${p.ammo}` : '👊 Fists';
  ctx.fillText(wlabel, 16, vh - 14);

  // Speedometer while driving, with the vehicle's name.
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
    panel(ctx, vw - 168, vh - 92, 154, 76);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(kmh), vw - 91, vh - 50);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('km/h', vw - 91, vh - 32);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = '#90caf9';
    ctx.fillText(carDisplayName(p.car).toUpperCase(), vw - 91, vh - 76);
    // Car health pip.
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(vw - 156, vh - 106, 130, 6);
    ctx.fillStyle = p.car.health > 35 ? '#69f0ae' : '#ef5350';
    ctx.fillRect(vw - 156, vh - 106, Math.max(0, p.car.health) * (130 / (p.car.maxHealth || 100)), 6);
  }

  if (G.muted) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('🔇 muted (M)', vw - 16, vh - 14);
  }
}

export function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(trial).width > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else cur = trial;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawButton(ctx, G, id, x, y, w, h, label, primary) {
  ctx.fillStyle = primary ? '#ff7043' : 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 19px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 7);
  G.buttons.push({ id, x, y, w, h });
}

function skyline(ctx, vw, vh) {
  const grad = ctx.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, '#2d1b4e');
  grad.addColorStop(0.45, '#b23a6d');
  grad.addColorStop(0.75, '#ff8a5c');
  grad.addColorStop(1, '#ffd98a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, vh);
  // Sun.
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath();
  ctx.arc(vw * 0.72, vh * 0.52, 52, 0, Math.PI * 2);
  ctx.fill();
  // Silhouette buildings and palms.
  ctx.fillStyle = 'rgba(24,12,38,0.9)';
  const base = vh * 0.86;
  const widths = [90, 60, 120, 70, 100, 55, 130, 80, 95, 65, 110, 75];
  let x = -10;
  widths.forEach((w, i) => {
    const h = 90 + ((i * 53) % 130);
    ctx.fillRect(x, base - h, w, h);
    x += w + 14;
  });
  ctx.fillRect(0, base, vw, vh - base);
  ctx.fillStyle = '#0d2f45';
  ctx.fillRect(0, vh * 0.93, vw, vh * 0.07);
}

export function drawMenu(ctx, G, vw, vh) {
  skyline(ctx, vw, vh);
  G.buttons.length = 0;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 14;
  ctx.fillText('COSTA VERDE', vw / 2, vh * 0.3);
  ctx.fillStyle = '#ffd54f';
  ctx.fillText('H E A T', vw / 2, vh * 0.3 + 62);
  ctx.shadowBlur = 0;
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const story = [
    'Rafe Solano came home to Costa Verde with empty pockets and a loud shirt.',
    'Fixer Marisol Vega has seven jobs: packages, races and one sunset getaway.',
    'Drive anything — cars, trucks, a motorcycle — dodge the Policía, get paid.',
  ];
  story.forEach((line, i) => ctx.fillText(line, vw / 2, vh * 0.52 + i * 24));
  const bw = 240;
  const bx = vw / 2 - bw / 2;
  drawButton(ctx, G, 'new', bx, vh * 0.64, bw, 52, '▶  NEW GAME', true);
  if (G.hasSave) drawButton(ctx, G, 'continue', bx, vh * 0.64 + 66, bw, 52, '↻  CONTINUE', false);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const controls = 'WASD / Arrows — move & drive · Shift — sprint · F — enter / steal car · Space — handbrake';
  const controls2 = 'Mouse — aim · Click — attack / hold for the SMG · P / Esc — pause · M — mute';
  const controls3 = "Cyan rings start street races · the Pay 'n Spray clears your heat · food stands heal";
  ctx.fillText(controls, vw / 2, vh * 0.88);
  ctx.fillText(controls2, vw / 2, vh * 0.88 + 21);
  ctx.fillText(controls3, vw / 2, vh * 0.88 + 42);
}

export function drawPause(ctx, G, vw, vh) {
  ctx.fillStyle = 'rgba(8,10,18,0.66)';
  ctx.fillRect(0, 0, vw, vh);
  G.buttons.length = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', vw / 2, vh * 0.36);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Cash $${G.player.cash} · Story jobs done: ${G.missions.storyIndex}/${STORY.length} · Packages ${G.packagesFound}/${G.city.packages.length}`, vw / 2, vh * 0.36 + 36);
  ctx.fillText(`Races won: ${G.missions.racesWon}/${RACES.length} · Weapon: ${G.player.weapon}${G.player.weapon !== 'fists' ? ` (${G.player.ammo})` : ''}`, vw / 2, vh * 0.36 + 60);
  const bw = 230;
  const bx = vw / 2 - bw / 2;
  drawButton(ctx, G, 'resume', bx, vh * 0.48, bw, 50, 'RESUME', true);
  drawButton(ctx, G, 'savequit', bx, vh * 0.48 + 62, bw, 50, 'SAVE & TITLE', false);
}

export function drawEndScreen(ctx, G, vw, vh, kind) {
  ctx.fillStyle = kind === 'busted' ? 'rgba(10,16,40,0.72)' : 'rgba(50,6,6,0.72)';
  ctx.fillRect(0, 0, vw, vh);
  G.buttons.length = 0;
  ctx.textAlign = 'center';
  ctx.font = '900 68px system-ui, sans-serif';
  ctx.fillStyle = kind === 'busted' ? '#82b1ff' : '#ef9a9a';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', vw / 2, vh * 0.42);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(
    kind === 'busted'
      ? `The Policía impound your ride and fine you $${G.lastFine}. You walk out of the station at dawn.`
      : `You wake up at Clínica Vida. The bill comes to $${G.lastFine}. Costa Verde keeps spinning.`,
    vw / 2, vh * 0.42 + 38,
  );
  const bw = 230;
  drawButton(ctx, G, 'respawn', vw / 2 - bw / 2, vh * 0.56, bw, 52, 'RESPAWN', true);
}
