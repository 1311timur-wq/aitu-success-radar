// Media pipeline for My DU (Assignment 4, Part B2): apps/student/media-src -> apps/student/public/assets.
// Raster images become WebP at 2x their CSS display size; app icons stay PNG (iOS/PWA require PNG)
// but are palette-quantised. Own-work SVG illustrations are rasterised to WebP.
// Run: npm run media      (needs the `sharp` devDependency)
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../apps/student/media-src/', import.meta.url));
const OUT = fileURLToPath(new URL('../apps/student/public/assets/', import.meta.url));

// [source, output, width, height?, options]. Width = CSS display width x 2 (retina), see styles.css.
const JOBS = [
  ['logo-white.png', 'logo-white.webp', 304, null, { quality: 90, alphaQuality: 100 }], // .welcome .logo 152px
  ['dew-wink.png', 'dew-wink.webp', 412, null, { quality: 80 }],                       // .welcome .dew 206px
  ['dew-wave.png', 'dew-wave.webp', 256, null, { quality: 80 }],                       // .login .dew 128px
  ['dew-head.png', 'dew-head.webp', 76, null, { quality: 85 }],                        // .hdr .fox 38px
  ['story-merch.svg', 'story-merch.webp', 720, 1280, { quality: 78 }],                 // full-screen story viewer
  ['story-reg.svg', 'story-reg.webp', 720, 1280, { quality: 78 }],
  ['story-merch.svg', 'story-merch-thumb.webp', 200, 200, { quality: 75 }],            // .story 100px thumbnail
  ['story-reg.svg', 'story-reg-thumb.webp', 200, 200, { quality: 75 }],
];
const ICONS = [
  ['icon-192.png', 'icon-192.png', 192], ['icon-512.png', 'icon-512.png', 512],
  ['apple-touch-icon.png', 'apple-touch-icon.png', 180], ['icon-192.png', 'favicon-48.png', 48],
];

const kb = (f) => (statSync(f).size / 1024).toFixed(1).padStart(7) + ' KB';
for (const [src, out, w, h, opt] of JOBS) {
  const img = sharp(SRC + src, { density: 144 });
  await (h ? img.resize(w, h, { fit: 'cover', position: 'centre' }) : img.resize({ width: w, withoutEnlargement: true }))
    .webp({ effort: 6, ...opt }).toFile(OUT + out);
  console.log(`${kb(SRC + src)} -> ${kb(OUT + out)}  ${out}`);
}
for (const [src, out, w] of ICONS) {
  await sharp(SRC + src).resize(w, w).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toFile(OUT + out);
  console.log(`${kb(SRC + src)} -> ${kb(OUT + out)}  ${out}`);
}
