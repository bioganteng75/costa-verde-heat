// world.js — the seeded city of Costa Verde.
// A road grid of avenues and streets, city blocks whose buildings are
// drawn pseudo-3D (shadow, shaded faces, offset rooftop, lit windows),
// a sandy beach with animated surf, and the water beyond. Also owns
// collision (circle vs buildings / shoreline) and every fixed service
// point: Pay 'n Spray, food stands, the safehouse, hospital, station,
// marina, weapon pickups and the hidden cash packages.

export const ROAD_W = 72;
export const BLOCK = 216;
export const COLS = 9;
export const ROWS = 7;
export const CYCLE = ROAD_W + BLOCK;
export const CITY_W = (COLS + 1) * ROAD_W + COLS * BLOCK; // 2664
export const CITY_H = (ROWS + 1) * ROAD_W + ROWS * BLOCK; // 2088
export const SAND_W = 300;
export const WATER_W = 780;
export const WORLD_W = CITY_W + SAND_W + WATER_W;
export const WORLD_H = CITY_H;

export function vRoadX(i) { return ROAD_W / 2 + i * CYCLE; }
export function hRoadY(j) { return ROAD_W / 2 + j * CYCLE; }
export function blockX(i) { return ROAD_W + i * CYCLE; }
export function blockY(j) { return ROAD_W + j * CYCLE; }

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

const PALETTE = ['#e8d8b0', '#dfc9a0', '#e6b98a', '#d9a066', '#cfe0e8', '#e8e2d4', '#dba7a0', '#b8d0c0', '#f0e0bc', '#cdbbdd', '#a8c8d8', '#e5cfa8'];
const LABELS = ['CAFÉ MAR', 'GYM', 'HOTEL SOL', 'MART', 'TACOS', 'SURF SHOP', 'LIBROS', 'FARMACIA', 'CINE', 'PANADERÍA', 'BAR OLA', 'DENTISTA'];

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const palms = [];
  const lamps = [];
  const stands = [];
  const packages = [];
  const pickups = [];

  const pick = (arr) => arr[(rng() * arr.length) | 0];

  function addBuilding(x, y, w, h, height, label) {
    buildings.push({ x, y, w, h, height, color: pick(PALETTE), label: label || null, seed: rng() * 10 });
  }

  // --- city blocks -------------------------------------------------------
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const bx = blockX(i), by = blockY(j);
      const distC = Math.max(Math.abs(i - 4), Math.abs(j - 3)); // 0 = downtown core
      const beachCol = i === COLS - 1;
      const hBase = beachCol ? 12 + rng() * 16 : distC === 0 ? 95 + rng() * 70 : distC === 1 ? 55 + rng() * 55 : distC === 2 ? 30 + rng() * 35 : 16 + rng() * 26;
      const special = (i === 5 && j === 2) ? 'garage' : null;
      const roll = rng();
      if (special === 'garage') {
        // One building on the north half; the south half is the spray lot.
        addBuilding(bx + 14, by + 12, BLOCK - 28, 84, 26, 'TALLER');
      } else if (distC <= 1 && roll < 0.55) {
        addBuilding(bx + 14, by + 14, BLOCK - 28, BLOCK - 28, hBase, rng() < 0.4 ? pick(LABELS) : null);
      } else if (roll < 0.45) {
        const pw = (BLOCK - 42) / 2, ph = (BLOCK - 42) / 2;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          if (rng() < 0.12) continue;
          addBuilding(bx + 12 + a * (pw + 18), by + 12 + b * (ph + 18), pw, ph, hBase * (0.7 + rng() * 0.6), rng() < 0.16 ? pick(LABELS) : null);
        }
      } else if (roll < 0.75) {
        addBuilding(bx + 14, by + 14, BLOCK - 28, (BLOCK - 40) / 2, hBase, rng() < 0.3 ? pick(LABELS) : null);
        addBuilding(bx + 14, by + 14 + (BLOCK - 40) / 2 + 12, BLOCK - 28, (BLOCK - 40) / 2, hBase * 0.8, null);
      } else {
        addBuilding(bx + 16, by + 16, BLOCK - 32, BLOCK - 32, hBase, rng() < 0.3 ? pick(LABELS) : null);
      }
    }
  }

  // Landmark buildings get their names (drawn on the rooftop).
  function labelBlock(i, j, label) {
    const bx = blockX(i), by = blockY(j);
    let best = null, bd = 1e9;
    for (const b of buildings) {
      const d = Math.abs(b.x + b.w / 2 - (bx + BLOCK / 2)) + Math.abs(b.y + b.h / 2 - (by + BLOCK / 2));
      if (d < bd) { bd = d; best = b; }
    }
    if (best) best.label = label;
    return best;
  }
  labelBlock(4, 3, 'BANCO VERDE');
  labelBlock(2, 5, 'HOSPITAL');
  labelBlock(6, 1, 'POLICE');
  labelBlock(8, 2, 'HOTEL SOL');
  labelBlock(1, 1, 'MERCADO');

  // Safehouse: a beach bungalow standing on the sand.
  const safehouse = { x: CITY_W + 66, y: hRoadY(4) - 30 };
  buildings.push({ x: safehouse.x - 34, y: safehouse.y - 26, w: 76, h: 56, height: 14, color: '#ffe9b8', label: 'SAFEHOUSE', seed: 3 });
  const marisol = { x: CITY_W + 30, y: hRoadY(4) + 44 };

  const services = {
    paynspray: { x: blockX(5) + 8, y: blockY(2) + BLOCK - 92, w: 120, h: 84 },
    safehouse,
    marisol,
    hospital: { x: vRoadX(2), y: blockY(5) + BLOCK / 2 },
    station: { x: vRoadX(6), y: blockY(1) + BLOCK / 2 },
    bank: { x: blockX(4) + BLOCK / 2, y: blockY(3) + BLOCK / 2 },
    marina: { x: CITY_W + 130, y: CITY_H - 240 },
  };

  // --- food stands on intersection corners -------------------------------
  const standSpots = [[1, 1], [7, 1], [3, 4], [6, 5], [8, 3]];
  for (const [i, j] of standSpots) {
    stands.push({ x: vRoadX(i) + ROAD_W / 2 + 15, y: hRoadY(j) + ROAD_W / 2 + 15 });
  }

  // --- palms: coastal avenue, beach, and a few inland --------------------
  for (let y = 40; y < CITY_H - 30; y += 96 + rng() * 50) {
    palms.push({ x: CITY_W + 18 + rng() * 30, y, phase: rng() * 6.28, s: 0.9 + rng() * 0.35 });
    if (rng() < 0.7) palms.push({ x: CITY_W - ROAD_W - 12, y: y + 40, phase: rng() * 6.28, s: 0.85 + rng() * 0.3 });
  }
  for (let k = 0; k < 26; k++) {
    palms.push({ x: CITY_W + 30 + rng() * (SAND_W - 60), y: rng() * CITY_H, phase: rng() * 6.28, s: 0.8 + rng() * 0.45 });
  }
  for (let k = 0; k < 14; k++) {
    const i = (rng() * COLS) | 0, j = (rng() * ROWS) | 0;
    palms.push({ x: blockX(i) + 8, y: blockY(j) + 8, phase: rng() * 6.28, s: 0.75 + rng() * 0.25 });
  }

  // --- street lamps at every other intersection ---------------------------
  for (let i = 0; i <= COLS; i++) {
    for (let j = 0; j <= ROWS; j++) {
      if ((i + j) % 2 === 0) lamps.push({ x: vRoadX(i) + ROAD_W / 2 + 5, y: hRoadY(j) + ROAD_W / 2 + 5 });
    }
  }

  // --- hidden cash packages on block corners ------------------------------
  const usedCorners = new Set();
  while (packages.length < 18) {
    const i = (rng() * COLS) | 0, j = (rng() * ROWS) | 0, c = (rng() * 4) | 0;
    const key = `${i},${j},${c}`;
    if (usedCorners.has(key)) continue;
    usedCorners.add(key);
    const bx = blockX(i), by = blockY(j);
    const x = c % 2 === 0 ? bx + 7 : bx + BLOCK - 7;
    const y = c < 2 ? by + 7 : by + BLOCK - 7;
    packages.push({ id: packages.length, x, y, taken: false });
  }

  // --- weapon pickups -------------------------------------------------------
  pickups.push({ kind: 'pistol', x: blockX(4) + 7, y: blockY(2) + 7, taken: false });
  pickups.push({ kind: 'pistol', x: blockX(6) + BLOCK - 7, y: blockY(1) + BLOCK - 7, taken: false });
  pickups.push({ kind: 'smg', x: CITY_W + 96, y: CITY_H - 330, taken: false });
  pickups.push({ kind: 'smg', x: blockX(3) + 7, y: blockY(0) + BLOCK - 7, taken: false });

  return { seed, buildings, palms, lamps, stands, packages, pickups, services };
}

export function isRoad(x, y) {
  if (x < 0 || y < 0 || x >= CITY_W || y >= CITY_H) return false;
  return (x % CYCLE) < ROAD_W || (y % CYCLE) < ROAD_W;
}

export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    const i = (rng() * (COLS + 1)) | 0;
    return { x: vRoadX(i), y: rng() * CITY_H };
  }
  const j = (rng() * (ROWS + 1)) | 0;
  return { x: rng() * CITY_W, y: hRoadY(j) };
}

// Push a circle out of every building and keep it inside the world and
// out of the sea. waterLimit is how far past the sand a body may go.
export function collideCircle(world, x, y, r, waterLimit = 24) {
  let hit = false;
  const maxX = CITY_W + SAND_W + waterLimit;
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > maxX - r) { x = maxX - r; hit = true; }
  if (y > WORLD_H - r) { y = WORLD_H - r; hit = true; }
  for (const b of world.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 < 0.0001) {
      // Centre inside the rect: push out along the smallest penetration.
      const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
      const m = Math.min(left, right, top, bot);
      if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r; else y = b.y + b.h + r;
    } else {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      y = cy + (dy / d) * r;
    }
  }
  return { x, y, hit };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export function drawGround(ctx, world, cam, tNow) {
  const vx0 = cam.x, vy0 = cam.y, vx1 = cam.x + cam.vw, vy1 = cam.y + cam.vh;

  // Sea (background everywhere east).
  const sea = ctx.createLinearGradient(0, 0, 0, cam.vh);
  sea.addColorStop(0, '#2e7fb8');
  sea.addColorStop(1, '#1d5f96');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, cam.vw, cam.vh);

  // Water sparkle + animated surf lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  const shoreX = CITY_W + SAND_W;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    const baseX = shoreX + 8 + k * 26 + Math.sin(tNow * 0.9 + k * 1.7) * 7 - vx0;
    for (let y = Math.max(0, vy0 - 20); y <= Math.min(WORLD_H, vy1 + 20); y += 34) {
      const sx = baseX + Math.sin(y * 0.02 + tNow * 1.3 + k) * 6;
      const sy = y - vy0;
      if (y === Math.max(0, vy0 - 20)) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  // Sand.
  ctx.fillStyle = '#ecd29a';
  ctx.fillRect(CITY_W - vx0, -vy0, SAND_W, WORLD_H);
  ctx.fillStyle = 'rgba(190,160,100,0.35)';
  for (let i = 0; i < 40; i++) {
    const px = CITY_W + ((i * 173) % SAND_W) - vx0;
    const py = ((i * 389) % WORLD_H) - vy0;
    if (px > -8 && py > -8 && px < cam.vw + 8 && py < cam.vh + 8) ctx.fillRect(px, py, 5, 3);
  }
  // Wet sand sheen at the waterline.
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fillRect(shoreX - 12 - vx0, -vy0, 14, WORLD_H);

  // City base + block pavement.
  ctx.fillStyle = '#b3a284';
  ctx.fillRect(-vx0, -vy0, CITY_W, CITY_H);
  const i0 = Math.max(0, Math.floor((vx0 - ROAD_W) / CYCLE)), i1 = Math.min(COLS - 1, Math.floor(vx1 / CYCLE));
  const j0 = Math.max(0, Math.floor((vy0 - ROAD_W) / CYCLE)), j1 = Math.min(ROWS - 1, Math.floor(vy1 / CYCLE));
  ctx.fillStyle = '#c0af8f';
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    ctx.fillRect(blockX(i) - vx0, blockY(j) - vy0, BLOCK, BLOCK);
  }

  // Asphalt.
  ctx.fillStyle = '#40454a';
  for (let i = 0; i <= COLS; i++) {
    const x = vRoadX(i) - ROAD_W / 2 - vx0;
    if (x + ROAD_W < 0 || x > cam.vw) continue;
    ctx.fillRect(x, -vy0, ROAD_W, CITY_H);
  }
  for (let j = 0; j <= ROWS; j++) {
    const y = hRoadY(j) - ROAD_W / 2 - vy0;
    if (y + ROAD_W < 0 || y > cam.vh) continue;
    ctx.fillRect(-vx0, y, CITY_W, ROAD_W);
  }

  // Lane dashes.
  ctx.fillStyle = 'rgba(240,235,200,0.75)';
  for (let i = 0; i <= COLS; i++) {
    const x = vRoadX(i) - vx0 - 2;
    if (x < -6 || x > cam.vw + 6) continue;
    for (let y = -((vy0 % 48 + 48) % 48); y < cam.vh; y += 48) ctx.fillRect(x, y, 4, 26);
  }
  for (let j = 0; j <= ROWS; j++) {
    const y = hRoadY(j) - vy0 - 2;
    if (y < -6 || y > cam.vh + 6) continue;
    for (let x = -((vx0 % 48 + 48) % 48); x < cam.vw; x += 48) ctx.fillRect(x, y, 26, 4);
  }

  // Crosswalks + stop bars at visible intersections.
  ctx.fillStyle = 'rgba(245,245,240,0.55)';
  for (let i = 0; i <= COLS; i++) {
    for (let j = 0; j <= ROWS; j++) {
      const cx = vRoadX(i) - vx0, cy = hRoadY(j) - vy0;
      if (cx < -90 || cy < -90 || cx > cam.vw + 90 || cy > cam.vh + 90) continue;
      for (let s = -30; s <= 30; s += 12) {
        ctx.fillRect(cx + s - 4, cy - ROAD_W / 2 - 12, 8, 9);
        ctx.fillRect(cx + s - 4, cy + ROAD_W / 2 + 3, 8, 9);
        ctx.fillRect(cx - ROAD_W / 2 - 12, cy + s - 4, 9, 8);
        ctx.fillRect(cx + ROAD_W / 2 + 3, cy + s - 4, 9, 8);
      }
    }
  }

  // Pay 'n Spray lot.
  const ps = world.services.paynspray;
  ctx.fillStyle = '#8f97a3';
  ctx.fillRect(ps.x - vx0, ps.y - vy0, ps.w, ps.h);
  ctx.strokeStyle = '#37e08b';
  ctx.lineWidth = 3;
  ctx.strokeRect(ps.x - vx0 + 2, ps.y - vy0 + 2, ps.w - 4, ps.h - 4);
  ctx.fillStyle = '#10331f';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("PAY 'N SPRAY", ps.x + ps.w / 2 - vx0, ps.y + ps.h / 2 + 4 - vy0);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('$150 · clears heat', ps.x + ps.w / 2 - vx0, ps.y + ps.h / 2 + 20 - vy0);

  // Marina pier + bobbing boats.
  const m = world.services.marina;
  ctx.fillStyle = '#8a6b45';
  ctx.fillRect(m.x - vx0, m.y - vy0, 210, 16);
  for (let k = 0; k < 4; k++) ctx.fillRect(m.x + 16 + k * 52 - vx0, m.y - 6 - vy0, 6, 28);
  for (let k = 0; k < 3; k++) {
    const bx2 = m.x + 40 + k * 62 - vx0;
    const by2 = m.y + 34 + Math.sin(tNow * 1.2 + k * 2.1) * 3 - vy0;
    ctx.fillStyle = ['#e8e2d4', '#d96a4a', '#4a90c2'][k];
    ctx.beginPath();
    ctx.ellipse(bx2, by2, 17, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(bx2 - 1, by2 - 15, 2, 15);
  }
}

export function drawBuilding(ctx, b, cam, dark) {
  const x = b.x - cam.x, y = b.y - cam.y;
  const ox = -b.height * 0.16, oy = -b.height * 0.30;
  if (x + b.w + ox > cam.vw + 190 || y + b.h + oy > cam.vh + 190 || x + ox < -190 || y + oy < -190) return;

  // Ground shadow.
  ctx.fillStyle = 'rgba(40,30,10,0.20)';
  ctx.fillRect(x + 9, y + 11, b.w, b.h);

  // South face.
  ctx.fillStyle = shade(b.color, 0.68);
  ctx.beginPath();
  ctx.moveTo(x, y + b.h);
  ctx.lineTo(x + b.w, y + b.h);
  ctx.lineTo(x + b.w + ox, y + b.h + oy);
  ctx.lineTo(x + ox, y + b.h + oy);
  ctx.closePath();
  ctx.fill();
  // East face.
  ctx.fillStyle = shade(b.color, 0.84);
  ctx.beginPath();
  ctx.moveTo(x + b.w, y);
  ctx.lineTo(x + b.w, y + b.h);
  ctx.lineTo(x + b.w + ox, y + b.h + oy);
  ctx.lineTo(x + b.w + ox, y + oy);
  ctx.closePath();
  ctx.fill();

  // Windows on the south face: bands that light up at dusk. The face is
  // a parallelogram, so row t sits at (x + ox*t, y + b.h + oy*t).
  const rows = Math.max(1, Math.floor(b.height / 16));
  const cols = Math.max(2, Math.floor(b.w / 22));
  for (let rIdx = 0; rIdx < rows; rIdx++) {
    const t = (rIdx + 1) / (rows + 1);
    const fx0 = x + ox * t, fy0 = y + b.h + oy * t;
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      const wx = fx0 + 6 + cIdx * ((b.w - 10) / cols);
      const lit = Math.sin(b.seed * 40 + rIdx * 7.3 + cIdx * 3.1) > 0.25;
      if (dark > 0.25 && lit) ctx.fillStyle = `rgba(255,205,100,${0.35 + dark * 0.6})`;
      else ctx.fillStyle = 'rgba(40,55,75,0.35)';
      ctx.fillRect(wx, fy0 - 4, 9, 5);
    }
  }

  // Rooftop.
  ctx.fillStyle = shade(b.color, 1.14);
  ctx.fillRect(x + ox, y + oy, b.w, b.h);
  ctx.strokeStyle = 'rgba(60,50,30,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + ox + 3, y + oy + 3, b.w - 6, b.h - 6);
  if (b.height > 55) {
    ctx.fillStyle = 'rgba(90,85,75,0.5)';
    ctx.fillRect(x + ox + b.w * 0.18, y + oy + b.h * 0.2, 16, 12);
    ctx.fillRect(x + ox + b.w * 0.62, y + oy + b.h * 0.55, 12, 10);
  }
  if (b.label) {
    ctx.fillStyle = 'rgba(25,28,38,0.78)';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, x + ox + b.w / 2, y + oy + b.h / 2 + 4);
  }
}

export function drawPalm(ctx, p, cam, tNow) {
  const x = p.x - cam.x, y = p.y - cam.y;
  if (x < -60 || y < -60 || x > cam.vw + 60 || y > cam.vh + 60) return;
  const sway = Math.sin(tNow * 1.1 + p.phase) * 3;
  ctx.fillStyle = 'rgba(40,30,10,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + 8, y + 5, 13 * p.s, 5 * p.s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6b45';
  ctx.lineWidth = 4 * p.s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 3, y - 12 * p.s, x + sway, y - 21 * p.s);
  ctx.stroke();
  ctx.strokeStyle = '#3f9e4d';
  ctx.lineWidth = 2.4 * p.s;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + p.phase;
    ctx.beginPath();
    ctx.moveTo(x + sway, y - 21 * p.s);
    ctx.quadraticCurveTo(
      x + sway + Math.cos(a) * 10 * p.s, y - 21 * p.s + Math.sin(a) * 4 - 3,
      x + sway + Math.cos(a) * 16 * p.s, y - 21 * p.s + Math.sin(a) * 6 + 4
    );
    ctx.stroke();
  }
}

export function drawLampGlow(ctx, world, cam, dark) {
  if (dark <= 0.04) return;
  for (const l of world.lamps) {
    const x = l.x - cam.x, y = l.y - cam.y;
    if (x < -60 || y < -60 || x > cam.vw + 60 || y > cam.vh + 60) continue;
    const g = ctx.createRadialGradient(x, y, 2, x, y, 48);
    g.addColorStop(0, `rgba(255,214,120,${0.30 * dark})`);
    g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,230,160,${0.85 * dark})`;
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPickups(ctx, world, cam, tNow) {
  for (const pk of world.packages) {
    if (pk.taken) continue;
    const x = pk.x - cam.x, y = pk.y - cam.y;
    if (x < -20 || y < -20 || x > cam.vw + 20 || y > cam.vh + 20) continue;
    const bob = Math.sin(tNow * 2.4 + pk.id) * 2;
    ctx.fillStyle = 'rgba(55,224,139,0.25)';
    ctx.beginPath();
    ctx.arc(x, y + bob, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d7a4a';
    ctx.fillRect(x - 7, y - 5 + bob, 14, 10);
    ctx.fillStyle = '#7dff9a';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', x, y + 3 + bob);
  }
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    const x = pk.x - cam.x, y = pk.y - cam.y;
    if (x < -20 || y < -20 || x > cam.vw + 20 || y > cam.vh + 20) continue;
    const bob = Math.sin(tNow * 3 + pk.x) * 2;
    ctx.fillStyle = 'rgba(255,120,90,0.28)';
    ctx.beginPath();
    ctx.arc(x, y + bob, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242a';
    if (pk.kind === 'pistol') {
      ctx.fillRect(x - 9, y - 2 + bob, 15, 4);
      ctx.fillRect(x + 2, y + 1 + bob, 4, 7);
    } else {
      ctx.fillRect(x - 12, y - 2 + bob, 22, 4);
      ctx.fillRect(x - 2, y + 1 + bob, 4, 8);
      ctx.fillRect(x + 6, y - 4 + bob, 3, 3);
    }
    ctx.fillStyle = '#ffd9d0';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind.toUpperCase(), x, y + 16 + bob);
  }
  // Food stands: striped umbrella + counter.
  for (const s of world.stands) {
    const x = s.x - cam.x, y = s.y - cam.y;
    if (x < -30 || y < -30 || x > cam.vw + 30 || y > cam.vh + 30) continue;
    ctx.fillStyle = 'rgba(40,30,10,0.18)';
    ctx.fillRect(x - 12, y + 6, 26, 6);
    ctx.fillStyle = '#c96f3f';
    ctx.fillRect(x - 11, y - 2, 24, 10);
    ctx.fillStyle = '#e8e2d4';
    for (let k = 0; k < 4; k++) ctx.fillRect(x - 14 + k * 8, y - 12, 4, 8);
    ctx.fillStyle = '#d94f3f';
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 10 + k * 8, y - 12, 4, 8);
    ctx.fillStyle = '#3a2c1c';
    ctx.fillRect(x - 1, y - 4, 2, 6);
  }
}
