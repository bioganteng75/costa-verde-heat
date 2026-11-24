# Costa Verde Heat — Third-Person 3D Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bioganteng75/costa-verde-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bioganteng75/costa-verde-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original third-person 3D open-world crime game set in the fictional coastal
city of Costa Verde, built on Three.js. Work six story jobs for fixer
**Marisol Vega**, outrun a 0–5 star police force with pursuit AI and a bust
meter, drive six vehicle types (including a motorcycle) through live traffic,
run taxi fares, respray at the Pay 'n Spray, heal at food stands, hunt 14
hidden cash packages, and watch the city roll from day to dusk on a 7-minute
cycle. The title screen floats over the living, simulated city; the minimap
compass arrow turns with your heading; progress saves locally.

Entry for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

## Run it

The game is fully static — no build step, no network:

- Open `game/index.html` in desktop Chrome, **or**
- serve the `game/` folder with any static file server and visit it.

`main.ts` is the make.fun entry point: it builds the submission dossier from
the game tree. It resolves every path from its own location, so it runs
correctly no matter which working directory it is launched from:

```sh
node main.ts            # writes dossier.json, game/ and screenshots/ to /output
```

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | Move on foot, drive (A–D strafe & steer) |
| Mouse (click to lock) | Orbit camera / look |
| Shift | Run |
| F | Enter / exit vehicle |
| E | Talk to Marisol, eat at stands, interact |
| T | Start taxi work |
| Mouse click (locked) | Shoot, once you hold a weapon |
| M | Sound on / off |
| P / Esc | Pause (losing pointer lock auto-pauses) |

## Layout

- `game/index.html` — the game shell, HUD, menus
- `game/src/*.js` — engine and gameplay modules (world, vehicles, police,
  missions, pedestrians, player, HUD/minimap, audio synth, safe storage)
- `game/vendor/three.min.js` — vendored Three.js 0.147.0
- `screenshots/` — four renders of the game (the first is the cover)
- `vendor/makefun-game.ts` — the kit's dossier builder used by `main.ts`

---

Built for the make.fun gta6-01 bounty — referral code rd8zvqpf
