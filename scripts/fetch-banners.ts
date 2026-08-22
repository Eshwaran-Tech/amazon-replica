/**
 * Downloads the promotional banner artwork used by the home page.
 *
 * Source: SceneSKU's free banner pack (https://scenesku.com/banners), which
 * publishes 16:9 storefront banners as "free to use, no attribution needed".
 * They are fetched once and stored under `public/banners/` rather than hot-
 * linked, because `next.config.ts` keeps `remotePatterns` empty on purpose --
 * an open remote-image allowlist turns `/_next/image` into an SSRF vector.
 *
 * The artwork is deliberately composed with empty space on the left so a
 * headline and call to action can sit over it, which is how
 * `components/home/promo-banners.tsx` lays the text out.
 *
 * Only ever writes the files listed in `BANNERS`; it deletes nothing, so
 * anything you drop into `public/banners/` yourself is left alone.
 *
 * Run: pnpm banners:fetch          (skips banners already downloaded)
 *      pnpm banners:fetch --force  (re-downloads everything)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'banners');
const CDN = 'https://cdn.scenesku.com/resources';
const USER_AGENT = 'amazonNext-dev/1.0 (local learning project)';

/** Local name -> SceneSKU resource file. */
const BANNERS: Record<string, string> = {
  'deals-festive': 'holiday_specials_hero_banner_tech_and_gifts.webp',
  electronics: 'electronics_gaming_hero_banner_modern_tech_setup.webp',
  fashion: 'fashion_store_hero_banner_womens_accessories.webp',
  beauty: 'beauty_skincare_hero_banner_floral_luxury.webp',
  home: 'furniture_hero_banner_modern_living_room.webp',
  grocery: 'grocery_food_hero_banner_fresh_market.webp',
  sports: 'sports_fitness_hero_banner_gym_essentials.webp',
};

/** Wide enough for a full-bleed banner on a 2x desktop display. */
const WIDTH = 1600;

/** Kept in step with `bannerImageIfPresent` in `lib/media/hero-media.ts`. */
const EXTENSIONS = ['webp', 'jpg', 'png'] as const;

interface Downloaded {
  bytes: Buffer;
  extension: 'webp' | 'jpg' | 'png';
}

async function download(resource: string): Promise<Downloaded | null> {
  // Asking for a width makes the CDN re-encode, and it answers with JPEG
  // rather than the WebP original -- hence sniffing for all three below.
  const url = `${CDN}/${resource}?w=${WIDTH}&q=90`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
  if (bytes.length < 10_000) return null; // an error page, not artwork

  // Trust the bytes rather than the URL or the Content-Type header.
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { bytes, extension: 'webp' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, extension: 'jpg' };
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { bytes, extension: 'png' };
  return null;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const force = process.argv.includes('--force');

  let written = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const [name, resource] of Object.entries(BANNERS)) {
    const alreadyHave = EXTENSIONS.some((extension) => existsSync(join(OUT_DIR, `${name}.${extension}`)));
    if (!force && alreadyHave) {
      skipped += 1;
      continue;
    }

    const file = await download(resource);
    if (!file) {
      failed.push(name);
      console.warn(`  ! ${name.padEnd(16)} could not be downloaded`);
      continue;
    }

    writeFileSync(join(OUT_DIR, `${name}.${file.extension}`), file.bytes);
    written += 1;
    console.log(`  ${name.padEnd(16)} ${file.extension.padEnd(4)} ${(file.bytes.length / 1024).toFixed(0)} KB`);
  }

  console.log(`\n${written} downloaded, ${skipped} already present, ${failed.length} failed.`);
  if (failed.length > 0) {
    // The home page only renders banners whose file exists, so a failure here
    // shows fewer banners rather than a broken image.
    console.log(`Missing: ${failed.join(', ')} -- those banners will not render.`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('Banner fetch failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
