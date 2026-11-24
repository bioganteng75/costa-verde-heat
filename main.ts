// Costa Verde Heat 3D — the hand-in program (Node 22, standard library only).
//
// The game itself is the static site under game/ (open game/index.html in a
// desktop browser, no network needed). This program delivers it: it copies
// game/ and screenshots/ into the output directory and writes dossier.json
// there with the vendored make.fun library, under the competition's caps.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps: at most 4 screenshots of 256 KiB each, at most 993 game
// files / 48 MiB / 1000-byte paths, and 160 KiB of source text in the dossier.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log('Costa Verde Heat 3D handed in — dossier is', dossier.length, 'bytes.');
