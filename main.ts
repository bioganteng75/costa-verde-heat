// Costa Verde Heat — make.fun gta6-01 entry point.
// Builds the submission dossier from the game tree and copies the game and
// screenshots beside it in the output directory.
import { buildDossier } from './vendor/makefun-game.ts';
import { mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outDir, { recursive: true });

const dossier = buildDossier('.', {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
cpSync('game', join(outDir, 'game'), { recursive: true });
cpSync('screenshots', join(outDir, 'screenshots'), { recursive: true });
console.log('dossier.json written:', dossier.length, 'bytes ->', outDir);
