/**
 * Slices a "Shop by Category" sheet image into per-category tiles.
 *
 * Input:  `public/categories/_sheet.png` (or .jpg/.jpeg/.webp) -- a single
 *         composite image containing all twelve category cards laid out as
 *         8 cards in the top row and 4 centred in the bottom row.
 * Output: `public/categories/<slug>.png`, one per category, which the
 *         storefront's `categoryImageIfPresent` lookup then picks up
 *         automatically on the next server start.
 *
 * Each crop takes the **artwork area** of its card -- the gradient background
 * and the product render on its podium -- and excludes the card's baked-in
 * icon and label strip at the bottom. The section renders its own label over
 * every tile, so keeping the baked one would print each category name twice.
 *
 * Coordinates are fractions of the sheet's dimensions, so any export size of
 * the same layout works. If a crop lands slightly off, adjust the numbers in
 * `ROW1` / `ROW2` below and re-run with `--force`.
 *
 * Safety: this script only ever writes `<slug>.png` files. It deletes nothing,
 * touches no other directory, and skips categories that already have an image
 * unless `--force` is passed.
 *
 * Run:  pnpm categories:slice           (skips slugs that already have a tile)
 *       pnpm categories:slice --force   (replaces existing tiles)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

const DIR = join(process.cwd(), 'public', 'categories');
const SHEET_CANDIDATES = ['_sheet.png', '_sheet.jpg', '_sheet.jpeg', '_sheet.webp'];

/** Output tile size. 4:5 portrait, matching the card aspect used in the UI. */
const TILE_WIDTH = 640;
const TILE_HEIGHT = 800;

/**
 * Card layout as fractions of the sheet: [left, top, width, height] of the
 * full card. The artwork crop is the top portion of that box (see ART_PORTION).
 */
const ROW1 = { top: 0.2695, height: 0.3379, left: 0.0159, width: 0.117, step: 0.1233 };
const ROW2 = { top: 0.625, height: 0.3027, left: 0.1493, width: 0.1665, step: 0.1795 };

/** How much of the card, from the top, is artwork rather than label strip. */
const ART_PORTION = 0.74;

const ROW1_SLUGS = [
  'electronics',
  'computers',
  'mobiles',
  'fashion',
  'home',
  'kitchen',
  'books',
  'beauty',
] as const;
const ROW2_SLUGS = ['sports', 'toys', 'grocery', 'automotive'] as const;

interface CropBox {
  slug: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function cropBoxes(sheetWidth: number, sheetHeight: number): CropBox[] {
  const boxes: CropBox[] = [];

  ROW1_SLUGS.forEach((slug, index) => {
    boxes.push({
      slug,
      left: Math.round((ROW1.left + index * ROW1.step) * sheetWidth),
      top: Math.round(ROW1.top * sheetHeight),
      width: Math.round(ROW1.width * sheetWidth),
      height: Math.round(ROW1.height * ART_PORTION * sheetHeight),
    });
  });

  ROW2_SLUGS.forEach((slug, index) => {
    boxes.push({
      slug,
      left: Math.round((ROW2.left + index * ROW2.step) * sheetWidth),
      top: Math.round(ROW2.top * sheetHeight),
      width: Math.round(ROW2.width * sheetWidth),
      height: Math.round(ROW2.height * ART_PORTION * sheetHeight),
    });
  });

  return boxes;
}

async function main(): Promise<void> {
  const sheetName = SHEET_CANDIDATES.find((name) => existsSync(join(DIR, name)));

  if (!sheetName) {
    console.error(
      'No sheet found. Save the category template image as\n' +
        '  public/categories/_sheet.png\n' +
        'then re-run: pnpm categories:slice',
    );
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const sheet = sharp(join(DIR, sheetName));
  const meta = await sheet.metadata();
  const { width, height } = meta;

  if (!width || !height) {
    console.error('Could not read sheet dimensions.');
    process.exit(1);
  }

  console.log(`Sheet: ${sheetName} (${width}x${height})\n`);

  let written = 0;
  let skipped = 0;

  for (const box of cropBoxes(width, height)) {
    const outPath = join(DIR, `${box.slug}.png`);
    const alreadyThere = ['png', 'jpg', 'jpeg', 'webp', 'avif'].some((extension) =>
      existsSync(join(DIR, `${box.slug}.${extension}`)),
    );

    if (alreadyThere && !force) {
      console.log(`${box.slug.padEnd(12)} skip (image exists; --force to replace)`);
      skipped += 1;
      continue;
    }

    // Clamp to the sheet bounds so a slightly-off fraction cannot throw.
    const left = Math.max(0, Math.min(box.left, width - 2));
    const top = Math.max(0, Math.min(box.top, height - 2));
    const cropWidth = Math.min(box.width, width - left);
    const cropHeight = Math.min(box.height, height - top);

    await sharp(join(DIR, sheetName))
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(TILE_WIDTH, TILE_HEIGHT, { fit: 'cover', position: 'centre' })
      .png({ quality: 90 })
      .toFile(outPath);

    console.log(
      `${box.slug.padEnd(12)} ${String(cropWidth).padStart(4)}x${String(cropHeight).padEnd(4)} -> ${box.slug}.png`,
    );
    written += 1;
  }

  console.log(`\n${written} tile(s) written, ${skipped} skipped.`);
  console.log('Restart the dev server to pick them up.');
}

main().catch((error: unknown) => {
  console.error('Slice failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
