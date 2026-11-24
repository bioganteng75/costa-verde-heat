# Costa Verde Heat — Third-Person 3D Open World

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bioganteng75/costa-verde-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bioganteng75/costa-verde-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Costa Verde Heat** is an original third-person 3D open-world crime game that runs
entirely in the browser. Cruise a fictional coastal city — avenues, a marina, a sandy
beach and a pier — as a runner for fixer **Marisol Vega**. Take her 6 story jobs, run
taxi fares, dodge a 0–5 star police heat system with pursuit AI and a bust meter, find
14 hidden cash packages, and watch the city roll from day into a neon dusk.

Built with Three.js (vendored, no network needed at runtime) and plain JavaScript —
no build step, no server-side code.

## Run it

Open the game in any modern desktop browser:

- Easiest: serve the `game/` folder with any static file server, e.g.
  `npx serve game` or `python3 -m http.server -d game`, then open the page.
- Or open `game/index.html` directly from disk.

Click **NEW GAME**, then click the game once to capture the mouse for look controls.

## What's in the city

- Third-person character with procedural walk animation; orbit camera on foot,
  chase camera in vehicles, pointer-lock mouse look
- 6 vehicle types (sedan, coupe, taxi, van, motorcycle, police cruiser) with
  traffic AI, parked cars, carjacking and a working Pay 'n Spray
- Police system: heat and 0–5 stars, pursuit cruisers, bust meter, BUSTED/WASTED
  respawns, and heat that only cools when no cruiser is in contact range
- 6 story jobs (pickup/delivery, a coupe steal, a timed downtown dash, a marina
  deal that draws heat, a mercy run, and a final score at the pier) ending with
  a proper ending screen — then free roam
- Taxi fares, healing food stands, pistol & SMG pickups, hidden cash packages
- HUD with a live rotating-compass minimap, a ~7-minute day→dusk cycle, WebAudio
  synth sound, and a localStorage save (CONTINUE on the title screen)
- A living title screen: the menu floats over the simulated city at golden hour

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move / drive (A/D steer and strafe) |
| Mouse (click game) | Look around |
| E | Enter / exit vehicle |
| F | Punch / fire weapon |
| M | Sound on/off |
| P | Pause (also auto-pauses if pointer lock is lost) |

## About this entry

Built for the make.fun gta6-01 bounty — referral code rd8zvqpf.
Bounty page: https://make.fun/bounty/gta6-01

`main.ts` (run with Node) assembles the submission dossier into the output
directory using the kit's `buildDossier`; `serve.ts` is the kit's local
play server.
