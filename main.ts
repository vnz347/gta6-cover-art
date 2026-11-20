// Heatwave Cover Studio: the entrypoint for make.fun's gta6-cover-art-01.
//
// The app itself is the app/ folder beside this file — plain static files a
// desktop browser loads offline (app/index.html and its ES modules, no
// library, no network request). Running this program hands the entry in: it
// copies app/ and screenshots/ into the output directory and writes
// dossier.json there, the summary the judge reads, using the vendored
// make.fun library.
//
// The app is a GTA-style multi-panel cover maker: upload photos, place them
// in up to nine panels across eight layouts, crop each by dragging, grade
// them with a Vice City sunset or neon wash, set a bold caption, and export
// a PNG in 1080 x 1080, 1080 x 1350, 1920 x 1080, or 1080 x 1920. Its four
// sample photos (app/samples/) were made with an image model and are free to
// use; the two display fonts (app/fonts/) ship under the SIL Open Font
// License.
//
// Try it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outDir, 'app'), { recursive: true });
// Screenshots only when the repository has them: an empty screenshots/
// directory in the output would count against the platform's entry cap.
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The gate's caps (reference/gate.json): only text_max_bytes shapes the
// dossier's bytes; the others refuse an entry the scorer would refuse (more
// than 4 screenshots or one over 256 KiB; more than 993 files in app/ or
// 48 MiB of app files in all, or a path under app/ over 1000 bytes).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
