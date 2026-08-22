/**
 * Generates original SVG artwork for the seed catalogue.
 *
 * Why generated art rather than stock photography:
 *  - No third-party imagery, so no licensing or trademark question.
 *  - Every asset is local, so `img-src 'self'` in the CSP stays honest and
 *    `next.config.ts` needs no remote image allowlist (which would turn
 *    `/_next/image` into an open image proxy -- an SSRF primitive).
 *  - Deterministic: the same slug always produces the same art, so re-running
 *    the seed does not churn the working tree.
 *
 * These SVGs are rendered through `<Image unoptimized>`, which emits a plain
 * `<img>`. Browsers script-sandbox SVG loaded via `<img>`, so this is safe even
 * though `dangerouslyAllowSVG` is off in `next.config.ts`.
 *
 * Run: pnpm art
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SEED_CATEGORIES } from '../src/data/categories';
import { ALL_SEED_PRODUCTS } from '../src/data/catalog';
import { slugify } from '../src/lib/utils/slug';
import { generateHeroArt } from './generate-hero-art';

const PUBLIC_DIR = join(process.cwd(), 'public');
const PRODUCT_DIR = join(PUBLIC_DIR, 'products');
const CATEGORY_DIR = join(PUBLIC_DIR, 'categories');

const IMAGES_PER_PRODUCT = 3;

/** FNV-1a. Deterministic, well distributed, and short enough to read. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Category glyphs, drawn on a 0-100 grid and scaled at use.
 *
 * Each one has to be unmistakable *for its label* at tile size. Several
 * earlier picks were ambiguous and were replaced:
 *
 *   kitchen    was a coffee cup, which reads as a cafe -> now a lidded pot
 *              with steam, which reads as cooking
 *   grocery    was a generic shopping bag, which reads as "shopping" in the
 *              abstract -> now a basket with produce
 *   beauty     was a plain bottle that could be water -> now a pump bottle
 *              beside a lipstick
 *   home       was a house, which reads as property -> now a sofa and lamp,
 *              which reads as homeware
 *   mobiles    was a lone phone -> now a phone beside a tablet, matching the
 *              "Mobiles" department covering both
 */
const CATEGORY_GLYPHS: Record<string, string> = {
  // Over-ear headphones.
  electronics:
    'M20 58v-8a30 30 0 0 1 60 0v8M20 56h10a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V60a4 4 0 0 1 4-4Zm50 0h10a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H70a4 4 0 0 1-4-4V60a4 4 0 0 1 4-4Z',

  // Laptop, with a keyboard lip so it does not read as a plain monitor.
  computers:
    'M22 26h56a4 4 0 0 1 4 4v32H18V30a4 4 0 0 1 4-4Zm-12 40h80l-5 9H15l-5-9Zm32 4h16',

  // Phone beside a tablet.
  mobiles:
    'M16 26h26a5 5 0 0 1 5 5v42a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5Zm9 44h8M58 20h26a5 5 0 0 1 5 5v54a5 5 0 0 1-5 5H58a5 5 0 0 1-5-5V25a5 5 0 0 1 5-5Zm11 56h4',

  // T-shirt on a hanger.
  fashion:
    'M50 16a5 5 0 0 1 5 5M36 26 20 36l6 16 8-4v34h32V48l8 4 6-16-16-10-8 7h-12l-8-7Z',

  // Sofa: backrest, arms, seat cushions, legs. The previous version paired a
  // flat couch with a floor lamp, and the lamp's cone-on-a-pole read as an
  // up-arrow rather than a light.
  home: 'M24 42h52a8 8 0 0 1 8 8v8H16v-8a8 8 0 0 1 8-8Zm-8 16a7 7 0 0 1 14 0v4h40v-4a7 7 0 0 1 14 0v20H16V58Zm14 4h40M26 78v7m48-7v7',

  // Lidded pot with steam.
  kitchen:
    'M20 46h60v20a16 16 0 0 1-16 16H36a16 16 0 0 1-16-16V46Zm-6 0h72M44 40h12M36 24c0 6 6 6 6 12M50 20c0 6 6 6 6 12M64 24c0 6 6 6 6 12',

  // Open book.
  books:
    'M18 20h26a8 8 0 0 1 8 8v54a8 8 0 0 0-8-8H18V20Zm64 0H56a8 8 0 0 0-8 8v54a8 8 0 0 1 8-8h26V20Z',

  // Pump bottle beside a lipstick.
  beauty:
    'M30 40h20v6l4 8v26a6 6 0 0 1-6 6H32a6 6 0 0 1-6-6V54l4-8v-6Zm5 0V26h10v14M36 20h8M30 62h20M64 56h14v28H64zM66 56V42a5 5 0 0 1 10 0v14',

  // Dumbbell.
  sports: 'M14 40h8v20h-8zM78 40h8v20h-8zM26 32h10v36H26zM64 32h10v36H64zM36 48h28',

  // Stacked building blocks with studs.
  toys: 'M20 30h26v22H20zM54 30h26v22H54zM37 56h26v22H37zM28 24v6m10-6v6m24-6v6m10-6v6m-25 26v6m10-6v6',

  // Basket with produce and a woven front.
  grocery:
    'M16 38h68l-9 40a6 6 0 0 1-6 5H31a6 6 0 0 1-6-5l-9-40Zm18 0 8-20m24 20-8-20M35 52l4 26m11-26v26m11-26-4 26',

  // Car with wheels and a window line.
  automotive:
    'M14 58l6-20a8 8 0 0 1 8-6h44a8 8 0 0 1 8 6l6 20v14H14V58Zm0 0h72M30 38h40M28 72v6h12v-6m20 0v6h12v-6',
};

interface Palette {
  from: string;
  to: string;
  glyph: string;
  accent: string;
}

/** Builds a palette from the slug hash, kept in a tasteful lightness range. */
function palette(seed: number, variant: number): Palette {
  const hue = (seed + variant * 24) % 360;
  const complement = (hue + 42) % 360;

  return {
    from: `hsl(${hue} 62% 93%)`,
    to: `hsl(${complement} 55% 84%)`,
    glyph: `hsl(${hue} 48% 28%)`,
    accent: `hsl(${complement} 62% 52%)`,
  };
}

function productSvg(slug: string, category: string, variant: number): string {
  const seed = hash(slug);
  const colors = palette(seed, variant);
  const glyph = CATEGORY_GLYPHS[category] ?? CATEGORY_GLYPHS.electronics;

  // Deterministic per-variant composition: scale, offset and accent placement.
  const scale = [6.4, 5.2, 7.0][variant] ?? 6;
  const offsetY = [40, 70, 20][variant] ?? 40;
  const angle = [135, 45, 90][variant] ?? 135;
  // Unsigned shifts. `>>` coerces to int32 first, so any hash above 2^31 would
  // go negative and yield a negative radius or an off-canvas centre.
  const dotR = 26 + ((seed >>> (variant * 3)) % 40);
  const dotX = 120 + ((seed >>> 4) % 180);
  const dotY = 620 + ((seed >>> 7) % 140);

  const glyphSize = 100 * scale;
  const glyphX = (800 - glyphSize) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${colors.from}"/>
      <stop offset="100%" stop-color="${colors.to}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="${colors.accent}" opacity="0.18"/>
  <circle cx="${800 - dotX}" cy="${180 + (seed % 90)}" r="${dotR * 1.6}" fill="${colors.accent}" opacity="0.12"/>
  <g transform="translate(${glyphX} ${offsetY}) scale(${scale})" fill="none" stroke="${colors.glyph}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
    <path d="${glyph}"/>
  </g>
</svg>
`;
}

function categorySvg(slug: string, name: string): string {
  const seed = hash(slug);
  const colors = palette(seed, 0);
  const glyph = CATEGORY_GLYPHS[slug] ?? CATEGORY_GLYPHS.electronics;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="${name}">
  <defs>
    <linearGradient id="bg" gradientTransform="rotate(135)">
      <stop offset="0%" stop-color="${colors.from}"/>
      <stop offset="100%" stop-color="${colors.to}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="12" fill="url(#bg)"/>
  <g transform="translate(100 100) scale(2)" fill="none" stroke="${colors.glyph}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.88">
    <path d="${glyph}"/>
  </g>
</svg>
`;
}

/**
 * Removes generated `.svg` files that no longer correspond to a seed entry.
 *
 * Only `.svg` and only orphans -- these directories are shared with
 * user-supplied photography (`public/categories/<slug>.jpg` replaces a glyph;
 * `public/hero` holds uploaded banners), and this script must never touch a
 * file it did not generate. An earlier version `rmSync`'d whole directories
 * for determinism and destroyed user uploads as a side effect. The lookup
 * helpers deliberately exclude `.svg`, so owning that one extension is safe.
 */
function pruneOrphanedSvgs(dir: string, expected: Set<string>): void {
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.svg') && !expected.has(file)) {
      rmSync(join(dir, file));
    }
  }
}

function main(): void {
  mkdirSync(PRODUCT_DIR, { recursive: true });
  mkdirSync(CATEGORY_DIR, { recursive: true });

  let productFiles = 0;
  const expectedProductSvgs = new Set<string>();
  const expectedCategorySvgs = new Set<string>();

  for (const product of ALL_SEED_PRODUCTS) {
    const slug = slugify(product.name);
    for (let variant = 0; variant < IMAGES_PER_PRODUCT; variant += 1) {
      const name = `${slug}-${variant + 1}.svg`;
      expectedProductSvgs.add(name);
      writeFileSync(join(PRODUCT_DIR, name), productSvg(slug, product.category, variant), 'utf8');
      productFiles += 1;
    }
  }

  for (const category of SEED_CATEGORIES) {
    const name = `${category.slug}.svg`;
    expectedCategorySvgs.add(name);
    writeFileSync(join(CATEGORY_DIR, name), categorySvg(category.slug, category.name), 'utf8');
  }

  pruneOrphanedSvgs(PRODUCT_DIR, expectedProductSvgs);
  pruneOrphanedSvgs(CATEGORY_DIR, expectedCategorySvgs);

  const heroCount = generateHeroArt();

  console.log(`Generated ${productFiles} product images in public/products/`);
  console.log(`Generated ${SEED_CATEGORIES.length} category tiles in public/categories/`);
  console.log(`Generated ${heroCount} hero backdrops in public/hero/`);
}

main();
