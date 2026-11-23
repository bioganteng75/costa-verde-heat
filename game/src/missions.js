// missions.js — the work of Costa Verde: a seven-job story chain for
// the fixer Marisol Vega, a three-race street series for pure cash, and
// taxi fares between story beats. Every mission is a list of steps;
// each step knows its objective text, its map marker, its optional
// timer and the test that completes it.

import { Sound } from './audio.js';

export const FIXER_NAME = 'Marisol Vega';

export const STORY = [
  {
    title: 'First Wheels',
    intro: 'Marisol: "Rafe, mi amor, a client left a package at the Marina. Fetch it, then bring the car to my taller. Simple money."',
    reward: 150,
    steps: [
      { kind: 'goto', text: 'Go to the Marina Azul pickup', x: 3150, y: 2440, r: 70 },
      { kind: 'gotoCar', text: 'Drive the package to Taller Vega', x: 2130, y: 330, r: 80 },
    ],
  },
  {
    title: 'Hot Package',
    intro: 'Marisol: "This one is warm, cariño. Ninety seconds across town, no stops, no dents in my reputation."',
    reward: 250,
    steps: [
      { kind: 'goto', text: 'Pick up the hot package at Hotel Brisa', x: 940, y: 330, r: 70 },
      { kind: 'timed', text: 'Deliver to the Marina — fast!', x: 3150, y: 2440, r: 80, time: 95 },
    ],
  },
  {
    title: 'Heat Check',
    intro: 'Marisol: "The Policía doubt you still have it. Show them some heat — two stars — then vanish like sea mist."',
    reward: 300,
    steps: [
      { kind: 'reachWanted', text: 'Make some noise: reach 2 wanted stars', stars: 2 },
      { kind: 'escape', text: 'Lose the police completely' },
    ],
  },
  {
    title: 'Marina Run',
    intro: 'Marisol: "A street kid with a stopwatch says nobody can run my checkpoints in time. Prove the kid wrong."',
    reward: 400,
    steps: [
      { kind: 'checkpoints', text: 'Run every checkpoint before the clock dies', time: 110, points: [[330, 330], [1560, 880], [2760, 330], [3360, 1980], [2130, 330]] },
    ],
  },
  {
    title: 'The Big Getaway',
    intro: 'Marisol: "The marina safe, Rafe. Every cop in Costa Verde will want a word — give them the view of your taillights."',
    reward: 800,
    steps: [
      { kind: 'goto', text: 'Crack the marina safe', x: 3150, y: 2440, r: 70, alarm: 3 },
      { kind: 'gotoCar', text: 'Escape to Casa de Rafe with the money', x: 330, y: 2330, r: 85 },
    ],
  },
  {
    title: 'Marina Pickup Run',
    intro: 'Marisol: "One more boat came in, and its cargo is already missed by dangerous people. Off the dock, across town, no questions."',
    reward: 650,
    steps: [
      { kind: 'goto', text: 'Grab the cargo at the Marina docks', x: 3150, y: 2440, r: 70, alarm: 1 },
      { kind: 'timed', text: 'Deliver the cargo to Hotel Coral', x: 2760, y: 360, r: 85, time: 105 },
    ],
  },
  {
    title: 'Verde Sunset',
    intro: 'Marisol: "Last job, the real one. We empty the marina vault at sunset, run my escape line, and then — only then — we disappear. ¿Listo?"',
    reward: 1400,
    steps: [
      { kind: 'goto', text: 'Empty the marina vault', x: 3150, y: 2440, r: 70, alarm: 4 },
      { kind: 'checkpoints', text: 'Run the escape line', time: 125, points: [[2700, 1400], [1500, 1950], [900, 850]] },
      { kind: 'escape', text: 'Shake the heat before you come home' },
      { kind: 'gotoCar', text: 'Bring it home to Casa de Rafe', x: 330, y: 2330, r: 85 },
    ],
  },
];

/** The street-race series: three checkpoint courses, run in order. */
export const RACES = [
  {
    name: 'Bahía Sprint',
    time: 95, reward: 300,
    points: [[330, 850], [900, 1400], [1500, 850], [2130, 1400], [2700, 850]],
  },
  {
    name: 'Palmera Loop',
    time: 135, reward: 450,
    points: [[2700, 330], [3300, 1400], [2700, 2280], [900, 1950], [330, 850]],
  },
  {
    name: 'Costa a Costa',
    time: 155, reward: 650,
    points: [[330, 330], [3300, 330], [3300, 2280], [330, 2280], [1560, 1400]],
  },
];

export function createMissionState() {
  return {
    storyIndex: 0,       // next story mission to offer
    active: null,        // { def, stepIndex, stepT, cpIndex }
    phone: null,         // { text, t } toast from the fixer
    taxi: null,          // { phase: 'pickup'|'dropoff', x, y, fareT }
    taxiCd: 8,
    race: null,          // { def, cpIndex, t } while a race is running
    raceIndex: 0,        // next race in the series to offer
    racesWon: 0,
    done: false,
  };
}

function phone(G, text, t = 6) {
  G.missions.phone = { text, t };
  Sound.pickup();
}

export function startStoryMission(G) {
  const M = G.missions;
  if (M.active || M.storyIndex >= STORY.length) return false;
  const def = STORY[M.storyIndex];
  M.active = { def, stepIndex: 0, stepT: 0, cpIndex: 0 };
  phone(G, def.intro, 8);
  return true;
}

export function currentObjective(G) {
  const M = G.missions;
  if (M.race) {
    const [x, y] = M.race.def.points[M.race.cpIndex];
    return {
      text: `${M.race.def.name} — checkpoint ${M.race.cpIndex + 1}/${M.race.def.points.length}`,
      x, y, timer: M.race.def.time - M.race.t,
    };
  }
  if (M.taxi) {
    return M.taxi.phase === 'pickup'
      ? { text: 'Taxi: pick up your passenger', x: M.taxi.x, y: M.taxi.y }
      : { text: 'Taxi: drop your passenger off', x: M.taxi.x, y: M.taxi.y };
  }
  if (!M.active) {
    if (M.storyIndex < STORY.length) {
      const lm = G.city.landmarks.fixer;
      return { text: `Visit Marisol at Taller Vega — "${STORY[M.storyIndex].title}"`, x: lm.x, y: lm.y };
    }
    return { text: 'Costa Verde is yours. Races, fares and packages still pay.', x: null, y: null };
  }
  const step = M.active.def.steps[M.active.stepIndex];
  if (step.kind === 'checkpoints') {
    const [x, y] = step.points[M.active.cpIndex];
    return { text: `${step.text} (${M.active.cpIndex + 1}/${step.points.length})`, x, y, timer: step.time - M.active.stepT };
  }
  return {
    text: step.text,
    x: step.x ?? null,
    y: step.y ?? null,
    timer: step.kind === 'timed' ? step.time - M.active.stepT : null,
  };
}

/** Where the race series wants the player: live checkpoint or next start. */
export function raceInfo(G) {
  const M = G.missions;
  if (M.race) {
    const [x, y] = M.race.def.points[M.race.cpIndex];
    return { x, y, active: true };
  }
  const def = RACES[M.raceIndex % RACES.length];
  return { x: def.points[0][0], y: def.points[0][1], active: false };
}

function completeStep(G) {
  const M = G.missions;
  const a = M.active;
  Sound.missionDone();
  a.stepIndex += 1;
  a.stepT = 0;
  a.cpIndex = 0;
  if (a.stepIndex >= a.def.steps.length) {
    const reward = a.def.reward;
    G.player.cash += reward;
    phone(G, `Marisol: "Beautiful work. $${reward} wired, plus my respect."`, 6);
    G.toast?.(`Job done — "${a.def.title}" (${M.storyIndex + 1}/${STORY.length})`);
    M.active = null;
    M.storyIndex += 1;
    if (M.storyIndex >= STORY.length) {
      M.done = true;
      phone(G, 'Marisol: "That is the last of it, Rafe. Costa Verde is ours. The races still run, if your foot gets itchy."', 9);
    }
    G.saveGame?.();
  } else {
    const next = a.def.steps[a.stepIndex];
    if (next.alarm) G.onCrime?.(next.alarm + 1.2, G.player.x, G.player.y, true);
    phone(G, `Marisol: "Good. Now — ${next.text.toLowerCase()}."`, 5);
  }
}

function failStep(G, why) {
  const M = G.missions;
  if (!M.active) return;
  phone(G, `Marisol: "${why} The job resets — come back to my taller and we try again."`, 7);
  M.active = null;
  Sound.bustedJingle();
}

function startRace(G, def) {
  G.missions.race = { def, cpIndex: 1, t: 0 };
  Sound.beep(false);
  G.toast?.(`${def.name} — GO! Beat ${def.time}s for $${def.reward}`);
}

function finishRace(G) {
  const M = G.missions;
  const def = M.race.def;
  G.player.cash += def.reward;
  M.racesWon += 1;
  M.raceIndex = Math.min(RACES.length - 1, M.raceIndex + 1);
  M.race = null;
  Sound.missionDone();
  G.toast?.(`${def.name} won! +$${def.reward} (${M.racesWon} race${M.racesWon > 1 ? 's' : ''} won)`);
  G.saveGame?.();
}

function updateRace(G, dt) {
  const M = G.missions;
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  if (!M.race) {
    // The start ring arms itself for any driver who rolls through it.
    if (M.active || !p.car || G.wanted.stars > 0) return;
    const def = RACES[M.raceIndex % RACES.length];
    const [sx, sy] = def.points[0];
    if (Math.hypot(sx - px, sy - py) < 80 && Math.abs(p.car.speed) > 40) startRace(G, def);
    return;
  }
  const race = M.race;
  race.t += dt;
  if (!p.car) {
    M.race = null;
    G.toast?.('Race abandoned — you left the car');
    return;
  }
  const [cx, cy] = race.def.points[race.cpIndex];
  if (Math.hypot(cx - px, cy - py) < 90) {
    Sound.cash();
    race.cpIndex += 1;
    if (race.cpIndex >= race.def.points.length) { finishRace(G); return; }
  }
  if (race.t > race.def.time) {
    G.toast?.(`${race.def.name} — out of time. The ring is still there.`);
    M.race = null;
    Sound.bustedJingle();
  }
}

export function updateMissions(G, dt) {
  const M = G.missions;
  if (M.phone) {
    M.phone.t -= dt;
    if (M.phone.t <= 0) M.phone = null;
  }
  const p = G.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;

  // Walking into the fixer's marker offers the next story job.
  if (!M.active && M.storyIndex < STORY.length && !p.car) {
    const lm = G.city.landmarks.fixer;
    if (Math.hypot(lm.x - p.x, lm.y - p.y) < 75) startStoryMission(G);
  }

  updateRace(G, dt);

  // Taxi work: passengers appear while Rafe is driving anything with wheels.
  M.taxiCd -= dt;
  if (!M.taxi && !M.race && p.car && M.taxiCd <= 0 && G.wanted.stars === 0) {
    const nodes = G.nodes;
    const n = nodes[(Math.random() * nodes.length) | 0];
    M.taxi = { phase: 'pickup', x: n.x + 46, y: n.y + 30, fareT: 0 };
    phone(G, 'A passenger is hailing you — follow the blue marker.', 5);
  }
  if (M.taxi) {
    const t = M.taxi;
    if (t.phase === 'pickup') {
      if (p.car && Math.hypot(t.x - px, t.y - py) < 55 && Math.abs(p.car.speed) < 30) {
        const nodes = G.nodes;
        let dest = nodes[(Math.random() * nodes.length) | 0];
        if (Math.hypot(dest.x - t.x, dest.y - t.y) < 500) dest = nodes[(Math.random() * nodes.length) | 0];
        t.phase = 'dropoff';
        t.x = dest.x + 46;
        t.y = dest.y + 30;
        t.fareT = 0;
        Sound.pickup();
        G.toast?.('Passenger in — drive!');
      } else if (!p.car) {
        M.taxi = null;
        M.taxiCd = 14;
      }
    } else {
      t.fareT += dt;
      if (Math.hypot(t.x - px, t.y - py) < 60) {
        const fare = Math.max(25, 90 - Math.floor(t.fareT));
        p.cash += fare;
        Sound.cash();
        G.toast?.(`Fare paid +$${fare}`);
        M.taxi = null;
        M.taxiCd = 16 + Math.random() * 14;
        G.saveGame?.();
      }
    }
  }

  if (!M.active) return;
  const a = M.active;
  const step = a.def.steps[a.stepIndex];
  a.stepT += dt;

  switch (step.kind) {
    case 'goto':
      if (Math.hypot(step.x - px, step.y - py) < step.r) {
        if (step.alarm) G.onCrime?.(step.alarm + 1.4, px, py, true);
        completeStep(G);
      }
      break;
    case 'gotoCar':
      if (!p.car) {
        if (a.stepT > 1 && Math.hypot(step.x - px, step.y - py) < step.r) {
          G.toast?.('You need a car for this leg');
        }
      } else if (Math.hypot(step.x - px, step.y - py) < step.r) {
        completeStep(G);
      }
      break;
    case 'timed':
      if (Math.hypot(step.x - px, step.y - py) < step.r) completeStep(G);
      else if (a.stepT > step.time) failStep(G, 'Too slow, the trail went cold.');
      break;
    case 'reachWanted':
      if (G.wanted.stars >= step.stars) completeStep(G);
      break;
    case 'escape':
      if (G.wanted.stars <= 0 && G.wanted.heat < 0.4) completeStep(G);
      break;
    case 'checkpoints': {
      const [cx, cy] = step.points[a.cpIndex];
      if (Math.hypot(cx - px, cy - py) < 85) {
        Sound.cash();
        a.cpIndex += 1;
        if (a.cpIndex >= step.points.length) { completeStep(G); break; }
      }
      if (a.stepT > step.time) failStep(G, 'The stopwatch wins this round.');
      break;
    }
    default:
      break;
  }
}

/** The tall gold pillar that marks the current objective in the world. */
export function drawObjectiveMarker(ctx, G, cam, time) {
  const obj = currentObjective(G);
  if (obj.x === null || obj.x === undefined) return;
  const sx = obj.x - cam.x;
  const sy = obj.y - cam.y;
  if (sx < -80 || sy < -80 || sx > cam.vw + 80 || sy > cam.vh + 80) return;
  const bob = Math.sin(time * 3) * 6;
  const grad = ctx.createLinearGradient(0, sy - 190, 0, sy);
  grad.addColorStop(0, 'rgba(255,213,79,0)');
  grad.addColorStop(1, 'rgba(255,213,79,0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(sx - 13, sy - 190, 26, 190);
  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 34, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.moveTo(sx, sy - 46 + bob);
  ctx.lineTo(sx - 13, sy - 70 + bob);
  ctx.lineTo(sx + 13, sy - 70 + bob);
  ctx.closePath();
  ctx.fill();
}

/** The cyan ring of the race series: a start line or a live checkpoint. */
export function drawRaceMarker(ctx, G, cam, time) {
  const info = raceInfo(G);
  const sx = info.x - cam.x;
  const sy = info.y - cam.y;
  if (sx < -90 || sy < -90 || sx > cam.vw + 90 || sy > cam.vh + 90) return;
  const pulse = 1 + Math.sin(time * 4) * 0.1;
  ctx.strokeStyle = info.active ? '#00e5ff' : 'rgba(0,229,255,0.65)';
  ctx.lineWidth = info.active ? 4 : 3;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 52 * pulse, 20 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#00e5ff';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(info.active ? 'CHECKPOINT' : 'RACE START', sx, sy - 34 + Math.sin(time * 3) * 3);
}

export function drawTaxiMarker(ctx, G, cam, time) {
  const t = G.missions.taxi;
  if (!t) return;
  const sx = t.x - cam.x;
  const sy = t.y - cam.y;
  if (sx < -40 || sy < -40 || sx > cam.vw + 40 || sy > cam.vh + 40) return;
  const bob = Math.sin(time * 3.4) * 5;
  ctx.fillStyle = '#42a5f5';
  ctx.beginPath();
  ctx.arc(sx, sy - 34 + bob, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t.phase === 'pickup' ? 'P' : 'D', sx, sy - 29 + bob);
  ctx.strokeStyle = '#42a5f5';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(sx, sy, 24, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
}
