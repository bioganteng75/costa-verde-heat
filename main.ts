// Costa Verde Heat — hand-in program for the gta6-01 entry (Node 22,
// standard library only).
//
// The game itself is the static site in game/: plain HTML, CSS-free
// canvas rendering and ES modules, no build step and no network calls.
// This program packages it for the judges — it copies game/ and
// screenshots/ into the output directory and writes dossier.json, the
// machine-readable summary, using the vendored make.fun helper.
//
// Run it the way the grader does:
//   node main.ts                          (writes to /output)
// or locally:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// To play instead of packaging: `node serve.ts`, then open
// http://localhost:8080 in a desktop browser.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the grader's own limits: at most 4 screenshots
// of 256 KiB each, at most 993 files / 48 MiB under game/, any single
// game path at most 1000 bytes, and the dossier's text fields capped
// at 163840 bytes in total.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
