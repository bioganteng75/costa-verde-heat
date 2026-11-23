// Hand-in program for the gta6-01 entry "Costa Verde Heat" v2 (Node 22,
// standard library only). The game itself is the static site in game/ —
// open game/index.html in a desktop browser and it runs fully offline.
// This program's whole job is delivery: copy game/ and screenshots/
// into the output directory and write dossier.json there, the
// machine-readable summary the judge reads, using the vendored
// make.fun library. Before it writes anything it checks the two
// folders it promises to ship actually exist, and when it is done it
// prints a one-line receipt so a human can see what went out.
//
// Try it locally: `node serve.ts` serves the game at
// http://localhost:8080. To rehearse the hand-in outside the grader's
// container, point MAKEFUN_OUTPUT_DIR at a scratch folder:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoDir, 'game');
const shotsDir = join(repoDir, 'screenshots');

if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing — there is no game to hand in');
}
if (!existsSync(shotsDir) || readdirSync(shotsDir).length === 0) {
  throw new Error('screenshots/ is missing or empty — the entry needs its pictures');
}

// Ship the game exactly as it sits in the repo.
mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });

// Screenshots ride along in their own folder (created even if empty so
// the output layout is always the same).
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

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

// A receipt for the log: how many game files, how many shots, how big.
function countFiles(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      const sub = countFiles(path);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}
const gameCount = countFiles(join(outputDir, 'game'));
const shotCount = countFiles(join(outputDir, 'screenshots'));
console.log(
  `Costa Verde Heat v2 handed in: ${gameCount.files} game files (${gameCount.bytes} bytes), `
  + `${shotCount.files} screenshots (${shotCount.bytes} bytes), dossier.json ${dossier.length} bytes.`,
);
