// Costa Verde Heat — make.fun gta6-01 entry point.
// Builds the submission dossier from the game tree and copies the game and
// screenshots beside it in the output directory.
//
// Every path below is resolved from THIS FILE's own location, never from the
// process working directory: the grader runs `node /bot/main.ts` from an
// arbitrary cwd, and a cwd-relative '.' makes buildDossier look for game/
// and screenshots/ in the wrong place and the run exits 1.
import { buildDossier } from './vendor/makefun-game.ts';
import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outDir, { recursive: true });

const dossier = buildDossier(root, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
console.log('dossier.json written:', dossier.length, 'bytes ->', outDir);
