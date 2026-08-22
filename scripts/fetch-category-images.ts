/**
 * Fetches category tile photography from Openverse.
 *
 * Openverse (openverse.org) indexes Creative-Commons and public-domain images
 * from Flickr, Wikimedia, museums and other sources, and exposes an API that
 * needs no key. It is used here rather than a general web image search because
 * every result carries an explicit reuse licence -- images from a search engine
 * are copyrighted by default, and putting those on a storefront that takes
 * addresses and runs a checkout is exactly the use a licence governs.
 *
 * (An earlier version queried Wikimedia Commons directly. Commons is an
 * encyclopedia media archive, not a stock library: "laptop computer" returned
 * a photograph of a RAM module, and nine of twelve categories found nothing
 * usable at all. Openverse aggregates Commons *and* photo sources, so the
 * results are actual product photography.)
 *
 * Licence handling:
 *  - CC0 and public-domain files are requested first: no attribution burden.
 *  - CC BY / CC BY-SA are accepted as a fallback and recorded in
 *    `public/categories/ATTRIBUTION.md`. Those licences *require* credit, so
 *    writing that file is part of complying with them.
 *  - `license_type=commercial` excludes NonCommercial outright.
 *
 * Run: pnpm categories:fetch          (skips categories that already have one)
 *      pnpm categories:fetch --force  (replaces existing files)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'categories');
const API = 'https://api.openverse.org/v1/images/';
const USER_AGENT = 'amazonNext-dev/1.0 (local learning project)';

/**
 * Search terms and a relevance guard per category.
 *
 * `mustMatch` is not belt-and-braces -- it is the fix for a real failure. An
 * earlier run accepted whatever the API returned first and produced "Rusty
 * Bath Water" for kitchen, an insect specimen for books, and a foggy
 * windscreen for automotive. Requiring the title to actually mention the
 * subject makes an off-topic result impossible rather than unlikely.
 */
const CATEGORIES: Record<string, { queries: string[]; mustMatch: string[] }> = {
  electronics: {
    queries: ['headphones', 'headphone', 'bluetooth speaker'],
    mustMatch: ['headphone', 'earbud', 'speaker', 'earphone'],
  },
  computers: {
    queries: ['laptop computer', 'laptop', 'computer keyboard'],
    mustMatch: ['laptop', 'computer', 'keyboard', 'macbook', 'notebook'],
  },
  mobiles: {
    queries: ['smartphone', 'mobile phone', 'tablet computer'],
    mustMatch: ['smartphone', 'phone', 'mobile', 'tablet', 'iphone', 'android'],
  },
  fashion: {
    queries: ['clothing', 'clothes shop', 'fashion clothing'],
    mustMatch: ['cloth', 'fashion', 'shirt', 'dress', 'apparel', 'wardrobe'],
  },
  home: {
    queries: ['sofa', 'living room furniture', 'couch'],
    mustMatch: ['sofa', 'couch', 'furniture', 'living room', 'armchair'],
  },
  kitchen: {
    queries: ['cookware', 'kitchen utensils', 'cooking pots'],
    mustMatch: ['kitchen', 'cookware', 'cooking', 'pot', 'pan', 'utensil'],
  },
  books: {
    queries: ['books', 'stack of books', 'bookshelf'],
    mustMatch: ['book', 'library', 'bookshelf', 'reading'],
  },
  beauty: {
    queries: ['cosmetics', 'makeup cosmetics', 'perfume bottle'],
    mustMatch: ['cosmetic', 'makeup', 'perfume', 'lipstick', 'beauty', 'skincare'],
  },
  sports: {
    queries: ['dumbbells', 'gym equipment', 'fitness weights'],
    mustMatch: ['dumbbell', 'gym', 'fitness', 'weight', 'barbell', 'exercise'],
  },
  toys: {
    queries: ['toys', 'toy blocks', 'children toys'],
    mustMatch: ['toy', 'lego', 'doll', 'teddy', 'playground'],
  },
  grocery: {
    queries: ['fresh vegetables', 'vegetables market', 'groceries'],
    mustMatch: ['vegetable', 'grocer', 'fruit', 'produce', 'market', 'food'],
  },
  automotive: {
    queries: ['car', 'automobile', 'sports car'],
    mustMatch: ['car', 'automobile', 'vehicle', 'auto'],
  },
};

interface Candidate {
  title: string;
  imageUrl: string;
  license: string;
  rawLicense: string;
  creator: string;
  sourceUrl: string;
  width: number;
  needsAttribution: boolean;
}

/** CC0 / public domain carry no attribution requirement. */
function needsAttribution(license: string): boolean {
  return !/^(cc0|pdm)$/i.test(license);
}

async function search(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    q: query,
    // Commercial use only -- this excludes NonCommercial licences.
    license_type: 'commercial',
    page_size: '20',
    // No aspect_ratio or size filter. Constraining those shrank the candidate
    // pool so far that relevance collapsed: the API started returning whatever
    // matched the filters rather than the query.
  });

  let response: Response;
  try {
    response = await fetch(`${API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
  } catch {
    return [];
  }

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    results?: Array<Record<string, unknown>>;
  };

  return (payload.results ?? [])
    .map((result) => {
      const license = String(result.license ?? '');
      return {
        title: String(result.title ?? 'Untitled').slice(0, 80),
        imageUrl: String(result.thumbnail ?? result.url ?? ''),
        license: `${license.toUpperCase()} ${String(result.license_version ?? '')}`.trim(),
        rawLicense: license,
        creator: String(result.creator ?? 'Unknown').slice(0, 80),
        sourceUrl: String(result.foreign_landing_url ?? ''),
        width: Number(result.width ?? 0),
        needsAttribution: needsAttribution(license),
      };
    })
    .filter((candidate) => {
      if (!candidate.imageUrl) return false;
      // NoDerivatives forbids the crop the square tile applies.
      if (/nd/i.test(candidate.rawLicense)) return false;
      // Anything smaller than this looks soft in a 140px tile on a 2x display.
      if (candidate.width > 0 && candidate.width < 480) return false;
      return true;
    });
}

/** True when the title actually mentions the subject we searched for. */
function isRelevant(title: string, mustMatch: string[]): boolean {
  const lower = title.toLowerCase();
  return mustMatch.some((term) => lower.includes(term));
}

async function download(url: string): Promise<{ bytes: Buffer; extension: string } | null> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  // Below this it is a placeholder or an error page, not a usable photo.
  if (bytes.length < 8_000) return null;

  // Trust the bytes, not the URL: a .jpg URL can serve a PNG or an HTML error.
  const isPng = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpg) return null;

  return { bytes, extension: isPng ? 'png' : 'jpg' };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const force = process.argv.includes('--force');
  const attributions: string[] = [];
  let fetched = 0;

  for (const [slug, { queries, mustMatch }] of Object.entries(CATEGORIES)) {
    const existing = ['jpg', 'jpeg', 'png', 'webp', 'avif'].find((extension) =>
      existsSync(join(OUT_DIR, `${slug}.${extension}`)),
    );

    if (existing && !force) {
      console.log(`${slug.padEnd(12)} skip (have ${slug}.${existing})`);
      continue;
    }

    let saved = false;

    for (const query of queries) {
      const candidates = (await search(query))
        // Relevance guard first, then attribution-free licences preferred.
        .filter((candidate) => isRelevant(candidate.title, mustMatch))
        .sort((a, b) => Number(a.needsAttribution) - Number(b.needsAttribution));

      for (const candidate of candidates) {
        const file = await download(candidate.imageUrl);
        if (!file) continue;

        writeFileSync(join(OUT_DIR, `${slug}.${file.extension}`), file.bytes);
        console.log(
          `${slug.padEnd(12)} ${(file.bytes.length / 1024).toFixed(0).padStart(4)} KB  ` +
            `${candidate.license.padEnd(10)} ${candidate.title.slice(0, 44)}`,
        );

        if (candidate.needsAttribution) {
          attributions.push(
            `- **${slug}** — [${candidate.title}](${candidate.sourceUrl}) ` +
              `by ${candidate.creator}, ${candidate.license}`,
          );
        }

        saved = true;
        fetched += 1;
        break;
      }

      if (saved) break;
    }

    if (!saved) console.warn(`${slug.padEnd(12)} no relevant result (keeping generated glyph)`);
  }

  // CC BY and CC BY-SA require credit; writing this is part of the licence.
  writeFileSync(
    join(OUT_DIR, 'ATTRIBUTION.md'),
    [
      '# Category image attribution',
      '',
      'Photography fetched from [Openverse](https://openverse.org) by',
      '`pnpm categories:fetch`. Files not listed below are CC0 or public domain',
      'and need no attribution.',
      '',
      'The entries here are licensed CC BY or CC BY-SA and **must** keep this',
      'credit wherever the images are published.',
      '',
      ...(attributions.length > 0
        ? attributions
        : ['_None — every image is CC0 or public domain._']),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\n${fetched} image(s) fetched.`);
  console.log('Attribution: public/categories/ATTRIBUTION.md');
  console.log('Restart the dev server to pick them up.');
}

main().catch((error: unknown) => {
  console.error('Fetch failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
