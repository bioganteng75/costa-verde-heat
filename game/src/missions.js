// missions.js — work in Costa Verde.
// A seven-job story chain for fixer Marisol Vega (gold M marker at the
// safehouse), taxi fares flagged by pedestrians, and a three-race
// street series with checkpoint rings. Owns the objective logic the
// HUD displays: story stage first, then race, then taxi, then Marisol.

import { vRoadX, hRoadY, blockX, blockY, BLOCK, ROAD_W, CYCLE, COLS, ROWS } from './world.js';
import { createVehicle } from './vehicles.js';
import { setStars } from './police.js';

function inter(i, j) { return { x: vRoadX(i), y: hRoadY(j) }; }
function corner(i, j, c) {
  const bx = blockX(i), by = blockY(j);
  return { x: c % 2 === 0 ? bx + 10 : bx + BLOCK - 10, y: c < 2 ? by + 10 : by + BLOCK - 10 };
}

function storyDefs(G) {
  const S = G.world.services;
  const marina = { x: S.marina.x, y: S.marina.y - 20 };
  const spray = { x: S.paynspray.x + S.paynspray.w / 2, y: S.paynspray.y + S.paynspray.h / 2 };
  return [
    {
      name: 'First Run', reward: 400,
      intro: 'Marisol: "Simple start, driver. Pick up the package downtown, drop it at the marina. No drama."',
      stages: [
        { type: 'goto', ...corner(4, 2, 0), text: 'Pick up the package' },
        { type: 'goto', ...marina, text: 'Deliver to the marina' },
      ],
    },
    {
      name: 'Hot Lunch', reward: 600,
      intro: 'Marisol: "A very impatient man at Hotel Sol wants his lunch. It stays hot for ninety seconds."',
      stages: [
        { type: 'goto', x: G.world.stands[2].x, y: G.world.stands[2].y, text: 'Collect the delivery' },
        { type: 'goto', ...inter(8, 2), text: 'Deliver to Hotel Sol — fast!', time: 95 },
      ],
    },
    {
      name: 'Three Drops', reward: 900,
      intro: 'Marisol: "Three drops, three corners of my city. Quiet work — try not to make the news."',
      stages: [
        { type: 'goto', ...corner(2, 2, 3), text: 'Drop 1 of 3' },
        { type: 'goto', ...corner(7, 4, 0), text: 'Drop 2 of 3' },
        { type: 'goto', ...corner(3, 6, 1), text: 'Drop 3 of 3' },
      ],
    },
    {
      name: 'Borrowed Wheels', reward: 1200,
      intro: 'Marisol: "A red sport coupe near the south avenue. Borrow it. Bring it to the spray shop in one piece."',
      stages: [
        {
          type: 'steal', ...inter(7, 5), text: 'Steal the sport coupe',
          onStart(m, stage) {
            const car = createVehicle('sport', stage.x + 14, stage.y - 14, Math.PI / 2, { parked: true, color: '#e83e2e' });
            car.missionCar = true;
            G.vehicles.push(car);
            stage.car = car;
          },
        },
        { type: 'goto', ...spray, text: 'Deliver it to the Pay \'n Spray', needsCar: true },
      ],
    },
    {
      name: 'Coastal Circuit', reward: 1500, timeLimit: 150,
      intro: 'Marisol: "My friends bet on lap times now. Six gates, coast and downtown. Show them something."',
      stages: [
        { type: 'goto', ...inter(8, 6), text: 'Gate 1 — south coast' },
        { type: 'goto', ...inter(8, 3), text: 'Gate 2 — mid coast' },
        { type: 'goto', ...inter(8, 0), text: 'Gate 3 — north coast' },
        { type: 'goto', ...inter(5, 0), text: 'Gate 4 — north avenue' },
        { type: 'goto', ...inter(2, 1), text: 'Gate 5 — old town' },
        { type: 'goto', ...inter(4, 3), text: 'Final gate — the bank' },
      ],
    },
    {
      name: 'Marina Heat', reward: 2000,
      intro: 'Marisol: "The marina pickup will trip an alarm. Take the heat, lose nobody, deliver to the bank."',
      stages: [
        { type: 'goto', ...marina, text: 'Pick up at the marina' },
        {
          type: 'goto', x: S.bank.x, y: S.bank.y, text: 'Deliver to Banco Verde',
          onStart() { setStars(G, 3); G.toast('Alarm tripped — the marina job is hot!', '#ff9a8a'); },
        },
      ],
    },
    {
      name: 'The Vault', reward: 5000, timeLimit: 420,
      intro: 'Marisol: "One last score, driver. The vault at Banco Verde. Then you disappear — that is the job."',
      stages: [
        { type: 'goto', x: S.bank.x, y: S.bank.y, text: 'Reach Banco Verde' },
        {
          type: 'goto', ...inter(2, 3), text: 'Escape — checkpoint 1',
          onStart() { setStars(G, 4); G.toast('Vault cracked — RUN!', '#ff9a8a'); },
        },
        { type: 'goto', ...inter(1, 5), text: 'Escape — checkpoint 2' },
        { type: 'goto', ...inter(6, 6), text: 'Escape — checkpoint 3' },
        { type: 'shake', text: 'Shake the heat completely' },
        { type: 'goto', x: S.safehouse.x - 40, y: S.safehouse.y + 30, text: 'Get home to the safehouse' },
      ],
    },
  ];
}

function raceDefs() {
  return [
    { name: 'Palms Sprint', purse: 800, par: 95, start: inter(8, 6), cps: [inter(8, 4), inter(8, 2), inter(8, 0), inter(6, 0)] },
    { name: 'Downtown Dash', purse: 1200, par: 120, start: inter(2, 1), cps: [inter(4, 1), inter(4, 3), inter(2, 3), inter(2, 5), inter(4, 5)] },
    { name: 'Grand Verde Tour', purse: 1800, par: 170, start: inter(1, 6), cps: [inter(4, 6), inter(7, 5), inter(8, 3), inter(6, 1), inter(3, 0), inter(1, 2)] },
  ];
}

export function createMissions(G) {
  const M = {
    defs: storyDefs(G),
    races: raceDefs(),
    active: null,      // { def, idx, stages, timeLeft }
    taxi: { phase: 'none', ped: null, dest: null, t: 0, base: 0, offerT: 0 },
    taxiT: 9,
    race: null,        // { def, idx, t }
  };

  function anchor() { return G.player.vehicle || G.player; }
  function distTo(x, y) { const a = anchor(); return Math.hypot(a.x - x, a.y - y); }

  // Directly begin a story job (used by the screenshot scenes).
  M.startAt = function (idx) {
    G.save.missionIndex = idx;
    startMission(idx);
  };

  function startMission(idx) {
    const def = M.defs[idx];
    const stages = def.stages.map((s) => ({ ...s }));
    M.active = { def, idx: 0, stages, timeLeft: def.timeLimit || null };
    G.toast(def.name, '#ffd76a', 3.2);
    G.toast(def.intro, '#ffffff', 5.5);
    const st = stages[0];
    if (st.onStart) st.onStart(M, st);
    G.audio.start();
  }

  function completeMission() {
    const { def } = M.active;
    M.active = null;
    G.save.missionIndex++;
    G.addCash(def.reward, `Job done: ${def.name}`);
    G.toast('Marisol: "Good work, driver."', '#7dff9a', 4);
    G.persist();
  }

  function failMission(why) {
    G.toast(`Job failed — ${why}`, '#ff9a8a', 4);
    G.audio.fail();
    if (M.active) {
      const st = M.active.stages[M.active.idx];
      if (st && st.car && st.car.missionCar) {
        const gi = G.vehicles.indexOf(st.car);
        if (gi >= 0 && G.player.vehicle !== st.car) G.vehicles.splice(gi, 1);
      }
    }
    M.active = null;
  }

  M.update = function (dt) {
    const S = G.world.services;
    // --- story ------------------------------------------------------------
    if (!M.active) {
      if (G.save.missionIndex < M.defs.length && distTo(S.marisol.x, S.marisol.y) < 48) {
        startMission(G.save.missionIndex);
      }
    } else {
      const A = M.active;
      if (A.timeLeft !== null) {
        A.timeLeft -= dt;
        if (A.timeLeft <= 0) { failMission('out of time'); return; }
      }
      const st = A.stages[A.idx];
      if (st.time !== undefined && st.timeLeft === undefined) st.timeLeft = st.time;
      if (st.timeLeft !== undefined) {
        st.timeLeft -= dt;
        if (st.timeLeft <= 0) { failMission('out of time'); return; }
      }
      let done = false;
      if (st.type === 'goto') {
        if (st.needsCar) {
          // Must arrive in the car stolen during the previous stage,
          // and it has to be in decent shape.
          const prev = A.stages[A.idx - 1];
          done = !!(prev && prev.car && G.player.vehicle === prev.car && distTo(st.x, st.y) < 60);
          if (done && prev.car.hp < prev.car.maxHp * 0.4) { failMission('the coupe is wrecked'); return; }
        } else {
          done = distTo(st.x, st.y) < 56;
        }
      } else if (st.type === 'steal') {
        done = !!(st.car && G.player.vehicle === st.car);
      } else if (st.type === 'shake') {
        done = G.police.stars === 0;
      }
      if (done) {
        A.idx++;
        G.audio.pickup();
        if (A.idx >= A.stages.length) { completeMission(); return; }
        const nx = A.stages[A.idx];
        if (nx.onStart) nx.onStart(M, nx);
        if (nx.text) G.toast(nx.text, '#ffd76a', 3);
      }
    }

    // --- street races -------------------------------------------------------
    if (!M.race && !M.active) {
      for (const r of M.races) {
        if (G.player.vehicle && Math.abs(G.player.vehicle.speed) < 34 && distTo(r.start.x, r.start.y) < 44) {
          M.race = { def: r, idx: 0, t: 0 };
          G.toast(`Race: ${r.name} — beat ${r.par}s for $${r.purse}`, '#8ad2ff', 4.5);
          G.audio.start();
          break;
        }
      }
    } else if (M.race) {
      const R = M.race;
      R.t += dt;
      if (!G.player.vehicle) {
        G.toast('Race abandoned', '#ff9a8a', 2.5);
        M.race = null;
      } else {
        const cp = R.def.cps[R.idx];
        if (distTo(cp.x, cp.y) < 60) {
          R.idx++;
          G.audio.pickup();
          G.fx.sparkle(cp.x, cp.y, 16);
          if (R.idx >= R.def.cps.length) {
            if (R.t <= R.def.par) {
              G.addCash(R.def.purse, `${R.def.name} won in ${R.t.toFixed(1)}s`);
              if (!G.save.racesWon.includes(R.def.name)) { G.save.racesWon.push(R.def.name); G.persist(); }
            } else {
              G.toast(`Finished in ${R.t.toFixed(1)}s — too slow for the purse`, '#ffd76a', 4);
            }
            M.race = null;
          }
        }
      }
    }

    // --- taxi fares -----------------------------------------------------------
    const T = M.taxi;
    if (T.phase === 'none' && !M.active) {
      M.taxiT -= dt;
      if (M.taxiT <= 0) {
        M.taxiT = 16 + Math.random() * 10;
        let best = null, bd = 520;
        for (const p of G.peds) {
          if (p.state !== 'walk' || p.fare || p.hidden) continue;
          const d = Math.hypot(p.x - G.player.x, p.y - G.player.y);
          if (d < bd) { bd = d; best = p; }
        }
        if (best) { best.fare = true; T.ped = best; T.phase = 'offer'; T.offerT = 26; }
      }
    } else if (T.phase === 'offer') {
      T.offerT -= dt;
      if (T.offerT <= 0 || !T.ped || T.ped.state !== 'walk') {
        if (T.ped) T.ped.fare = false;
        T.phase = 'none'; T.ped = null;
      } else if (G.player.vehicle && Math.abs(G.player.vehicle.speed) < 22 && distTo(T.ped.x, T.ped.y) < 46) {
        const dest = { x: 0, y: 0 };
        let guard = 0;
        do {
          const pt = inter((Math.random() * (COLS + 1)) | 0, (Math.random() * (ROWS + 1)) | 0);
          dest.x = pt.x; dest.y = pt.y;
          guard++;
        } while (Math.hypot(dest.x - T.ped.x, dest.y - T.ped.y) < 650 && guard < 12);
        T.dest = dest;
        T.base = Math.round(Math.hypot(dest.x - T.ped.x, dest.y - T.ped.y) / 8);
        T.t = 0;
        T.ped.hidden = true;
        T.ped.fare = false;
        T.phase = 'ride';
        G.toast('Fare picked up — follow the gold marker', '#8ad2ff', 3.5);
        G.audio.ui();
      }
    } else if (T.phase === 'ride') {
      T.t += dt;
      if (!G.player.vehicle) {
        // Passenger bails where the player stopped.
        T.ped.hidden = false;
        T.ped.x = G.player.x + 18; T.ped.y = G.player.y + 6;
        T.ped.state = 'walk';
        G.toast('Fare bailed out', '#ff9a8a', 2.5);
        T.phase = 'none'; T.ped = null;
      } else if (distTo(T.dest.x, T.dest.y) < 56) {
        // Tip shrinks the longer the ride takes.
        const tip = Math.max(5, Math.round(T.base * 0.6 - T.t * 0.55));
        G.addCash(T.base + Math.max(0, tip), 'Taxi fare');
        T.ped.hidden = false;
        T.ped.x = T.dest.x + 16; T.ped.y = T.dest.y + 10;
        T.ped.bi = Math.max(0, Math.min(COLS - 1, Math.floor((T.dest.x - ROAD_W) / CYCLE)));
        T.ped.bj = Math.max(0, Math.min(ROWS - 1, Math.floor((T.dest.y - ROAD_W) / CYCLE)));
        T.ped.state = 'walk';
        T.phase = 'none'; T.ped = null;
      }
    }
  };

  // The single objective the HUD should show right now.
  M.objective = function () {
    if (M.active) {
      const A = M.active;
      const st = A.stages[A.idx];
      const timer = st.timeLeft !== undefined ? st.timeLeft : A.timeLeft;
      if (st.type === 'shake') return { x: null, y: null, text: st.text, timer };
      return { x: st.x, y: st.y, text: `${A.def.name}: ${st.text}`, timer };
    }
    if (M.race) {
      const R = M.race;
      const cp = R.def.cps[R.idx];
      return { x: cp.x, y: cp.y, text: `${R.def.name} — gate ${R.idx + 1}/${R.def.cps.length}`, timer: -R.t, par: R.def.par };
    }
    if (M.taxi.phase === 'ride') {
      return { x: M.taxi.dest.x, y: M.taxi.dest.y, text: 'Taxi: drop off your fare', timer: null };
    }
    if (G.save.missionIndex < M.defs.length) {
      const S = G.world.services;
      return { x: S.marisol.x, y: S.marisol.y, text: `See Marisol Vega — job ${G.save.missionIndex + 1}: ${M.defs[G.save.missionIndex].name}`, timer: null };
    }
    return { x: null, y: null, text: 'Costa Verde is yours — races, fares and packages remain', timer: null };
  };

  // World-space markers the renderer should draw (rings at targets).
  M.markers = function () {
    const out = [];
    const obj = M.objective();
    if (obj && obj.x !== null && M.active) out.push({ x: obj.x, y: obj.y, color: '#ffd23e', label: 'M' });
    else if (obj && obj.x !== null && M.race) out.push({ x: obj.x, y: obj.y, color: '#57b6ff', label: '»' });
    else if (obj && obj.x !== null && M.taxi.phase === 'ride') out.push({ x: obj.x, y: obj.y, color: '#ffd23e', label: '$' });
    else if (obj && obj.x !== null) out.push({ x: obj.x, y: obj.y, color: '#ffd23e', label: 'M' });
    if (!M.race && !M.active && !G.shotMode) {
      for (const r of M.races) out.push({ x: r.start.x, y: r.start.y, color: '#57b6ff', label: 'R', ringOnly: true });
    }
    return out;
  };

  return M;
}
