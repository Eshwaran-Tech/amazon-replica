import { existsSync } from 'node:fs';
import { join } from 'node:path';

import '@/lib/server-guard';

/**
 * Resolves hero backdrop assets that actually exist on disk.
 *
 * Without this, every slide would reference files that are not there yet: each
 * one 404s, the network panel fills with errors, and on a slow connection the
 * browser spends time on requests that can only fail. Checking once means the
 * carousel silently falls back to the generated scene until a real asset
 * appears.
 *
 * Evaluated lazily and memoised, so it costs one `existsSync` per file per
 * server start -- not per request. Drop a file into `public/hero/` and restart
 * to pick it up.
 */

const HERO_DIR = join(process.cwd(), 'public', 'hero');

/** MP4 first: H.264 is universal. WebM is smaller where supported. */
const VIDEO_EXTENSIONS = ['mp4', 'webm'] as const;

/**
 * Raster only, and `svg` is deliberately excluded: the generated `.svg`
 * backdrops are always present, so including it here would mean a real photo
 * could never take precedence over the placeholder.
 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'] as const;

const videoCache = new Map<string, string | undefined>();
const imageCache = new Map<string, string | undefined>();

function findAsset(
  slideId: string,
  extensions: readonly string[],
  cache: Map<string, string | undefined>,
): string | undefined {
  if (cache.has(slideId)) return cache.get(slideId);

  // `slideId` comes from our own static slide config, never from a request.
  // Guarded anyway so this can never become a path traversal.
  if (!/^[a-z0-9-]+$/.test(slideId)) {
    cache.set(slideId, undefined);
    return undefined;
  }

  for (const extension of extensions) {
    if (existsSync(join(HERO_DIR, `${slideId}.${extension}`))) {
      const relative = `/hero/${slideId}.${extension}`;
      cache.set(slideId, relative);
      return relative;
    }
  }

  cache.set(slideId, undefined);
  return undefined;
}

export function heroVideoIfPresent(slideId: string): string | undefined {
  return findAsset(slideId, VIDEO_EXTENSIONS, videoCache);
}

export function heroImageIfPresent(slideId: string): string | undefined {
  return findAsset(slideId, IMAGE_EXTENSIONS, imageCache);
}

// ------------------------------------------------------------- categories

const CATEGORY_DIR = join(process.cwd(), 'public', 'categories');
const categoryCache = new Map<string, string | undefined>();

/**
 * A real category photo, when one has been added.
 *
 * Resolved at render time rather than baked into the seed, so dropping
 * `public/categories/electronics.jpg` in takes effect on the next server start
 * without re-seeding the database. Falls back to the generated `.svg` glyph the
 * seed stored on the category record.
 *
 * `.svg` is excluded from the lookup on purpose: the generated glyphs always
 * exist under that extension, so including it would mean a real photo could
 * never win.
 */
export function categoryImageIfPresent(slug: string): string | undefined {
  if (categoryCache.has(slug)) return categoryCache.get(slug);

  if (!/^[a-z0-9-]+$/.test(slug)) {
    categoryCache.set(slug, undefined);
    return undefined;
  }

  for (const extension of IMAGE_EXTENSIONS) {
    if (existsSync(join(CATEGORY_DIR, `${slug}.${extension}`))) {
      const relative = `/categories/${slug}.${extension}`;
      categoryCache.set(slug, relative);
      return relative;
    }
  }

  categoryCache.set(slug, undefined);
  return undefined;
}

// ---------------------------------------------------------------- banners

const BANNER_DIR = join(process.cwd(), 'public', 'banners');
const bannerCache = new Map<string, string | undefined>();

/**
 * A promotional banner image, when one has been downloaded.
 *
 * Populated by `pnpm banners:fetch`. Resolved the same lazy way as the hero
 * and category art, so the home page renders only the banners whose file is
 * actually on disk -- a failed or skipped download shows fewer banners rather
 * than a row of broken images.
 */
export function bannerImageIfPresent(name: string): string | undefined {
  if (bannerCache.has(name)) return bannerCache.get(name);

  if (!/^[a-z0-9-]+$/.test(name)) {
    bannerCache.set(name, undefined);
    return undefined;
  }

  for (const extension of IMAGE_EXTENSIONS) {
    if (existsSync(join(BANNER_DIR, `${name}.${extension}`))) {
      const relative = `/banners/${name}.${extension}`;
      bannerCache.set(name, relative);
      return relative;
    }
  }

  bannerCache.set(name, undefined);
  return undefined;
}
