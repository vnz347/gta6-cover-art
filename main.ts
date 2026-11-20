// Heatwave Cover Studio: the entrypoint for make.fun's gta6-cover-art-01.
// The app itself is the app/ folder beside this file — plain static files a
// desktop browser loads offline (app/index.html and its ES modules, no
// library, no network request). Running this program hands the entry in: it
// copies app/ and screenshots/ into the output directory and writes
// dossier.json there, the summary the judge reads, using the vendored
// make.fun library.
//
// The app is a GTA-style multi-panel cover maker: upload photos, place them
// in up to nine panels of seven layouts, crop each by dragging, grade them
// with a Vice City sunset or neon wash, set a bold caption, and export a PNG
// in 1080 x 1080, 1080 x 1350, 1920 x 1080, or 1080 x 1920. Its four sample
// photos (app/samples/) were made with an image model and are free to use;
// the two display fonts (app/fonts/) are under the SIL Open Font License.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// dossier's bytes; the others refuse an entry the scorer would refuse (more
// than 4 screenshots or one over 256 KiB; more than 993 files in app/ or
// 48 MiB of app files, in all, or a path under app/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
