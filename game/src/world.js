// world.js — the city of Costa Verde: seeded generation, drawing and
// collision for a sun-soaked coastal grid of avenues, pastel blocks,
// palm-lined sidewalks and a beach that runs along the south edge.
//
// Layout (world units are pixels):
//   * six north-south avenues and five east-west streets make the grid;
//   * every block between roads is pavement with pastel buildings on it;
//   * the south strip is sand, then open water no one can enter.

export const WORLD_W = 3600;
export const WORLD_H = 2700;
export const ROAD_W = 120;
export const AVENUES = [300, 900, 1500, 2100, 2700, 3300];
export const STREETS = [300, 850, 1400, 1950, 2280];
export const SAND_Y = 2380;
export const WATER_Y = 2540;

/** Deterministic RNG (mulberry32) so a seed always builds the same city. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUILDING_COLORS = [
  '#f2e3c9', '#f7d9b0', '#fbc4a6', '#f9e2e0', '#d9ecf5', '#cfe8d8',
  '#f6efc0', '#e8d7f0', '#ffd9a0', '#c9e4f2', '#f3c6b8', '#e2efd9',
];
const ROOF_COLORS = ['#c96f4a', '#b85c48', '#d18a5a', '#9db8c4', '#c4a15a', '#a8bf9a'];
const LABELS = [
  'Hotel Brisa', 'Café Sol', 'Banco Verde', 'Marina Mall', 'Mercado Central',
  'Torre Palmera', 'Bar Azul', 'Cine Litoral', 'Gym Ola', 'Farmacia Mar',
  'Oficinas Norte', 'Hotel Coral', 'Panadería Luz', 'Taller Ruiz', 'Joyas Mar',
];

export function isOnRoad(x, y) {
  if (y >= WATER_Y) return false;
  for (const ax of AVENUES) if (Math.abs(x - ax) <= ROAD_W / 2) return true;
  for (const sy of STREETS) if (Math.abs(y - sy) <= ROAD_W / 2) return true;
  return false;
}

export function isWater(x, y) {
  return y >= WATER_Y;
}

export function isSand(x, y) {
  return y >= SAND_Y && y < WATER_Y;
}

/** Intersection centres: the nodes of the traffic network. */
export function intersections() {
  const nodes = [];
  for (const ax of AVENUES) {
    for (const sy of STREETS) nodes.push({ x: ax, y: sy });
  }
  return nodes;
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const n of intersections()) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

export function generateCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const lamps = [];

  const xEdges = [-40, ...AVENUES.flatMap((a) => [a - ROAD_W / 2, a + ROAD_W / 2]), WORLD_W + 40];
  const yEdges = [-40, ...STREETS.flatMap((s) => [s - ROAD_W / 2, s + ROAD_W / 2]), SAND_Y];

  let labelIdx = 0;
  for (let xi = 0; xi < xEdges.length - 1; xi += 2) {
    for (let yi = 0; yi < yEdges.length - 1; yi += 2) {
      const bx = xEdges[xi] + 660 - 660; // block left (edges already inset by road half-width)
      const blockX = xEdges[xi];
      const blockY = yEdges[yi];
      const blockW = xEdges[xi + 1] - xEdges[xi];
      const blockH = yEdges[yi + 1] - yEdges[yi];
      void bx;
      if (blockW < 160 || blockH < 160) continue;
      const inset = 30;
      const innerX = blockX + inset;
      const innerY = blockY + inset;
      const innerW = blockW - inset * 2;
      const innerH = blockH - inset * 2;
      const park = rng() < 0.14;
      if (park) {
        buildings.push({
          x: innerX, y: innerY, w: innerW, h: innerH,
          color: '#79b657', roof: '#79b657', label: 'Parque', park: true, h: 0,
        });
        for (let i = 0; i < 7; i++) {
          palms.push({ x: innerX + rng() * innerW, y: innerY + rng() * innerH, s: 0.8 + rng() * 0.5 });
        }
        continue;
      }
      const cols = innerW > 380 ? 2 : 1;
      const rows = innerH > 300 ? 2 : 1;
      const gap = 26;
      const cellW = (innerW - gap * (cols - 1)) / cols;
      const cellH = (innerH - gap * (rows - 1)) / rows;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          if (rng() < 0.1) continue;
          const w = cellW * (0.82 + rng() * 0.16);
          const h = cellH * (0.82 + rng() * 0.16);
          const x = innerX + c * (cellW + gap) + (cellW - w) / 2;
          const y = innerY + r * (cellH + gap) + (cellH - h) / 2;
          const label = rng() < 0.34 ? LABELS[labelIdx++ % LABELS.length] : null;
          buildings.push({
            x, y, w, h,
            color: BUILDING_COLORS[(rng() * BUILDING_COLORS.length) | 0],
            roof: ROOF_COLORS[(rng() * ROOF_COLORS.length) | 0],
            label, park: false, h: 14 + rng() * 30,
          });
        }
      }
    }
  }

  // Landmarks with fixed jobs: the story and the systems point at these.
  const landmarks = {
    safehouse: { x: 330, y: 2330, label: 'Casa de Rafe' },
    policeHQ: { x: 1500, y: 760, label: 'Policía Municipal' },
    hospital: { x: 900, y: 1490, label: 'Clínica Vida' },
    marina: { x: 3150, y: 2440, label: 'Marina Azul' },
    fixer: { x: 2130, y: 330, label: 'Taller Vega' },
  };
  buildings.push({ x: 1430, y: 690, w: 150, h: 90, color: '#cfd8dc', roof: '#607d8b', label: 'Policía Municipal', park: false, h: 22 });
  buildings.push({ x: 830, y: 1420, w: 150, h: 90, color: '#ffffff', roof: '#e57373', label: 'Clínica Vida', park: false, h: 22 });

  // Palms line the beach and sprinkle the sidewalks.
  for (let x = 60; x < WORLD_W; x += 90 + rng() * 90) {
    palms.push({ x, y: SAND_Y + 26 + rng() * 60, s: 0.9 + rng() * 0.6 });
  }
  for (let i = 0; i < 90; i++) {
    const x = rng() * WORLD_W;
    const y = rng() * (SAND_Y - 60);
    if (!isOnRoad(x, y)) palms.push({ x, y, s: 0.7 + rng() * 0.5 });
  }
  for (const ax of AVENUES) {
    for (let y = 90; y < SAND_Y - 80; y += 210) {
      lamps.push({ x: ax - ROAD_W / 2 - 12, y });
      lamps.push({ x: ax + ROAD_W / 2 + 12, y: y + 105 });
    }
  }

  // Parking spots hug the kerbs: {x, y, angle} the car rests at.
  const parkSpots = [];
  for (const ax of AVENUES) {
    for (let y = 480; y < 2250; y += 300) {
      parkSpots.push({ x: ax - ROAD_W / 2 + 20, y, angle: -Math.PI / 2 });
      parkSpots.push({ x: ax + ROAD_W / 2 - 20, y: y + 150, angle: Math.PI / 2 });
    }
  }
  for (const sy of STREETS) {
    for (let x = 480; x < 3500; x += 340) {
      parkSpots.push({ x, y: sy - ROAD_W / 2 + 20, angle: 0 });
      parkSpots.push({ x: x + 170, y: sy + ROAD_W / 2 - 20, angle: Math.PI });
    }
  }

  // Hidden cash packages tucked into alleys, parks and the pier.
  const packages = [];
  const pkgSpots = [
    [640, 620], [1240, 1080], [1840, 560], [2440, 1620], [3040, 1080],
    [640, 2180], [1560, 2180], [2760, 2180], [3360, 620], [330, 1100],
  ];
  pkgSpots.forEach(([x, y], i) => packages.push({ id: i, x, y, taken: false }));

  const pickups = [
    { kind: 'pistol', x: 2160, y: 420, taken: false, label: 'Pistol' },
    { kind: 'health', x: 905, y: 1560, taken: false, label: 'First aid' },
    { kind: 'health', x: 2760, y: 620, taken: false, label: 'First aid' },
  ];

  return { buildings, palms, lamps, parkSpots, packages, pickups, landmarks, rng };
}

/** Push a circle out of every building and the water; returns true on any hit. */
export function collideCircle(city, pos, r) {
  let hit = false;
  if (pos.x < r) { pos.x = r; hit = true; }
  if (pos.y < r) { pos.y = r; hit = true; }
  if (pos.x > WORLD_W - r) { pos.x = WORLD_W - r; hit = true; }
  if (pos.y > WATER_Y + 30 - r) { pos.y = WATER_Y + 30 - r; hit = true; }
  for (const b of city.buildings) {
    if (b.park) continue;
    const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - nx;
    const dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * r;
      pos.y = ny + (dy / d) * r;
    } else {
      // Centre inside the rect: leave by the shortest side.
      const left = pos.x - b.x;
      const right = b.x + b.w - pos.x;
      const top = pos.y - b.y;
      const bottom = b.y + b.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.x - r;
      else if (m === right) pos.x = b.x + b.w + r;
      else if (m === top) pos.y = b.y - r;
      else pos.y = b.y + b.h + r;
    }
  }
  return hit;
}

function drawPalm(ctx, x, y, s) {
  ctx.strokeStyle = '#8a6b42';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 4 * s, y - 14 * s, x + 8 * s, y - 22 * s);
  ctx.stroke();
  ctx.strokeStyle = '#3f9e4d';
  ctx.lineWidth = 3 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x + 8 * s, y - 22 * s);
    ctx.quadraticCurveTo(
      x + 8 * s + Math.cos(a) * 13 * s, y - 22 * s + Math.sin(a) * 8 * s - 4 * s,
      x + 8 * s + Math.cos(a) * 20 * s, y - 22 * s + Math.sin(a) * 13 * s + 3 * s,
    );
    ctx.stroke();
  }
}

export function drawWorld(ctx, city, cam, vw, vh, time) {
  const x0 = Math.max(0, cam.x - 40);
  const y0 = Math.max(0, cam.y - 40);
  const x1 = Math.min(WORLD_W, cam.x + vw + 40);
  const y1 = Math.min(WORLD_H, cam.y + vh + 40);

  // Base ground: warm pavement blocks.
  ctx.fillStyle = '#cbb99b';
  ctx.fillRect(x0 - cam.x, y0 - cam.y, x1 - x0, y1 - y0);

  // Beach and animated water along the south edge.
  if (y1 > SAND_Y) {
    ctx.fillStyle = '#eed9a0';
    ctx.fillRect(x0 - cam.x, Math.max(y0, SAND_Y) - cam.y, x1 - x0, Math.min(y1, WATER_Y) - Math.max(y0, SAND_Y));
    const grad = ctx.createLinearGradient(0, WATER_Y - cam.y, 0, WORLD_H - cam.y);
    grad.addColorStop(0, '#39a7cc');
    grad.addColorStop(1, '#1668a0');
    ctx.fillStyle = grad;
    ctx.fillRect(x0 - cam.x, Math.max(y0, WATER_Y) - cam.y, x1 - x0, y1 - Math.max(y0, WATER_Y));
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const wx = ((i * 173 + ((time * 30) % 173)) % WORLD_W);
      const wy = WATER_Y + 24 + ((i * 67) % 120);
      if (wx < x0 - 60 || wx > x1 + 60 || wy < y0 || wy > y1) continue;
      ctx.beginPath();
      ctx.moveTo(wx - cam.x, wy - cam.y);
      ctx.lineTo(wx - cam.x + 34, wy - cam.y);
      ctx.stroke();
    }
    // Marina docks.
    ctx.fillStyle = '#9a7b52';
    for (let dx = 2980; dx < 3420; dx += 110) {
      ctx.fillRect(dx - cam.x, WATER_Y - cam.y, 16, 120);
    }
  }

  // Sidewalk aprons around each block, then the roads themselves.
  ctx.fillStyle = '#ddd3bd';
  for (const ax of AVENUES) ctx.fillRect(ax - ROAD_W / 2 - 14 - cam.x, y0 - cam.y, ROAD_W + 28, Math.min(y1, SAND_Y) - y0);
  for (const sy of STREETS) ctx.fillRect(x0 - cam.x, sy - ROAD_W / 2 - 14 - cam.y, x1 - x0, ROAD_W + 28);

  ctx.fillStyle = '#43464d';
  for (const ax of AVENUES) {
    if (ax + ROAD_W / 2 < x0 || ax - ROAD_W / 2 > x1) continue;
    ctx.fillRect(ax - ROAD_W / 2 - cam.x, y0 - cam.y, ROAD_W, Math.min(y1, SAND_Y + 10) - y0);
  }
  for (const sy of STREETS) {
    if (sy + ROAD_W / 2 < y0 || sy - ROAD_W / 2 > y1) continue;
    ctx.fillRect(x0 - cam.x, sy - ROAD_W / 2 - cam.y, x1 - x0, ROAD_W);
  }
  // Lane dashes.
  ctx.fillStyle = '#f5d76e';
  for (const ax of AVENUES) {
    for (let y = 20; y < SAND_Y; y += 46) {
      if (y < y0 - 30 || y > y1 + 30) continue;
      ctx.fillRect(ax - 2 - cam.x, y - cam.y, 4, 24);
    }
  }
  for (const sy of STREETS) {
    for (let x = 20; x < WORLD_W; x += 46) {
      if (x < x0 - 30 || x > x1 + 30) continue;
      ctx.fillRect(x - cam.x, sy - 2 - cam.y, 24, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const ax of AVENUES) {
    for (const sy of STREETS) {
      if (ax < x0 - 90 || ax > x1 + 90 || sy < y0 - 90 || sy > y1 + 90) continue;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(ax - ROAD_W / 2 + 6 - cam.x, sy + i * 20 - 5 - cam.y, 14, 10);
        ctx.fillRect(ax + ROAD_W / 2 - 20 - cam.x, sy + i * 20 - 5 - cam.y, 14, 10);
      }
    }
  }

  // Buildings: shadow, walls, roof, label.
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    const sx = b.x - cam.x;
    const sy = b.y - cam.y;
    if (b.park) {
      ctx.fillStyle = '#79b657';
      ctx.fillRect(sx, sy, b.w, b.h);
      ctx.fillStyle = '#8fc973';
      ctx.fillRect(sx + 8, sy + 8, b.w - 16, b.h - 16);
      continue;
    }
    ctx.fillStyle = 'rgba(60,40,20,0.25)';
    ctx.fillRect(sx + 7, sy + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(sx, sy, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(sx + 7, sy + 7, b.w - 14, b.h - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(sx + 14, sy + 14, b.w - 28, 10);
    if (b.label && b.w > 110) {
      ctx.fillStyle = 'rgba(30,30,40,0.75)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label, sx + b.w / 2, sy + b.h / 2 + 4);
    }
  }

  // Street lamps: small posts with a warm head.
  ctx.fillStyle = '#5a5f66';
  for (const l of city.lamps) {
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
    ctx.fillRect(l.x - cam.x - 2, l.y - cam.y - 2, 4, 4);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(l.x - cam.x - 3, l.y - cam.y - 3, 6, 2);
    ctx.fillStyle = '#5a5f66';
  }

  for (const p of city.palms) {
    if (p.x < x0 - 30 || p.x > x1 + 30 || p.y < y0 - 30 || p.y > y1 + 30) continue;
    drawPalm(ctx, p.x - cam.x, p.y - cam.y, p.s);
  }

  // Cash packages pulse gold; pickups sit on coloured pads.
  for (const pkg of city.packages) {
    if (pkg.taken) continue;
    const px = pkg.x - cam.x;
    const py = pkg.y - cam.y;
    if (px < -30 || py < -30 || px > vw + 30 || py > vh + 30) continue;
    const pulse = 1 + Math.sin(time * 4 + pkg.id) * 0.15;
    ctx.fillStyle = '#ffd83d';
    ctx.beginPath();
    ctx.arc(px, py, 11 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5b00';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', px, py + 5);
  }
  for (const pk of city.pickups) {
    if (pk.taken) continue;
    const px = pk.x - cam.x;
    const py = pk.y - cam.y;
    if (px < -30 || py < -30 || px > vw + 30 || py > vh + 30) continue;
    ctx.fillStyle = pk.kind === 'pistol' ? '#ef5350' : '#66bb6a';
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'pistol' ? 'P' : '+', px, py + 4);
  }
}
