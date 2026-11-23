// Costa Verde Heat 3D — hand-in program for the gta6-01 bounty.
//
// The game itself is the static site in game/ (open game/index.html in a
// desktop browser; it needs no server and makes no network requests — the
// Three.js build it uses is vendored at game/vendor/three.min.js).
// This program copies game/ and screenshots/ into the output directory and
// writes dossier.json there with the vendored make.fun library, so the
// judge receives exactly the caps the scorer enforces.
//
//   node serve.ts                                  → play at http://localhost:8080
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   → hand-in rehearsal

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const part of ['game', 'screenshots']) {
  if (!existsSync(join(root, part))) {
    throw new Error(`cannot hand in: ${part}/ is missing beside main.ts`);
  }
}

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Costa Verde Heat 3D handed in at ${outDir} (game/, screenshots/, dossier.json)`);
