// Hand-in program for the gta6-01 entry "Costa Verde Heat" (Node 22,
// standard library only). The game itself is the static site in game/ —
// open game/index.html in a desktop browser and it runs fully offline.
// This program's whole job is delivery: copy game/ and screenshots/ into
// the output directory and write dossier.json there, the machine-readable
// summary the judge reads, using the vendored make.fun library.
//
// Try it locally: `node serve.ts` serves the game at
// http://localhost:8080. To rehearse the hand-in outside the grader's
// container, point MAKEFUN_OUTPUT_DIR at a scratch folder:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Ship the game exactly as it sits in the repo.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots ride along in their own folder (created even if empty so
// the output layout is always the same).
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// The dossier, built under the scorer's published caps: the text budget
// shapes the JSON itself, while the rest simply refuse anything the
// scorer would refuse anyway — at most 4 screenshots of 256 KiB each,
// at most 993 game files totalling 48 MiB, and no game path longer
// than 1000 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
