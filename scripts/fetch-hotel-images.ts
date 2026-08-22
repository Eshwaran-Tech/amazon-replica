/**
 * Fetches the hotel photography pool from Wikimedia Commons.
 *
 * Commons is used here rather than Openverse (which the category and product
 * fetchers use) for a plain reason: Openverse now sits behind a bot challenge
 * and answers the API with a 429. Commons has an open API, needs no key, and
 * carries an explicit licence on every file -- and architecture is one subject
 * it is genuinely strong on, which was not true of the product photography an
 * earlier attempt tried to pull from it.
 *
 * What this pool is NOT: photographs of the properties this store lists. Those
 * are generated and do not exist. These are generic modern buildings, houses,
 * resorts and hotel interiors, assigned to a listing deterministically so a
 * property looks the same on every reload -- and every page carrying one says
 * so in as many words.
 *
 * Licence handling:
 *  - Public-domain and CC0 files are preferred: no attribution burden.
 *  - CC BY / CC BY-SA are accepted and recorded in
 *    `public/hotels/ATTRIBUTION.md`. Those licences *require* credit, so
 *    writing that file is part of complying with them.
 *  - NonCommercial, NoDerivatives, "fair use" and anything unrecognised are
 *    rejected outright. An unknown licence is not a permissive one.
 *
 * Run: pnpm tsx scripts/fetch-hotel-images.ts
 *      pnpm tsx scripts/fetch-hotel-images.ts --force
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'hotels');

/**
 * The manifest lives in `src/data`, not beside the images.
 *
 * `public/` is served verbatim to anyone who asks; it is not a place to import
 * build-time data from. Which slots have a photograph and which fall back to a
 * drawn scene is source, so it belongs in source.
 */
const MANIFEST_PATH = join(process.cwd(), 'src', 'data', 'hotel-photos.json');
const API = 'https://commons.wikimedia.org/w/api.php';

// Wikimedia's policy asks for a descriptive agent that identifies the client.
const USER_AGENT = 'amazonNext-dev/1.0 (local learning project; hotel artwork pool)';

/** Must match `PHOTO_POOL_SIZE` in `services/hotels.ts`. */
const POOL_SIZE = 24;

/**
 * How long to wait between calls.
 *
 * Wikimedia asks clients to make requests serially and at a civil rate, and it
 * enforces it: firing the whole source list back to back got "You are making
 * too many requests to the API" from the fifth source onwards. Because that
 * arrives as a non-JSON body rather than an error status, an earlier version
 * swallowed it and looked like a too-strict filter -- the pool came back with
 * eight photos and no explanation.
 */
const API_PAUSE_MS = 500;
const DOWNLOAD_PAUSE_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One request, with a single patient retry when the API pushes back. */
async function politeFetch(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (response.ok) return response;
      // 429 and 503 are "slow down", not "go away".
      if (response.status !== 429 && response.status !== 503) return null;
    } catch {
      // A transport failure is worth one retry too.
    }
    await sleep(1_500);
  }
  return null;
}

/**
 * Where the pool is drawn from.
 *
 * Two kinds of source. A **category** is Commons' own classification, so its
 * members are on-topic by construction -- but most of the obvious names
 * ("Hotels", "Resorts") are container categories holding only subcategories,
 * so only the leaves that actually hold files are listed. A **search** fills
 * the rest, and is where the subject guards below earn their place.
 *
 * An earlier version also demanded that the file *name* mention the subject.
 * That was too strict against Commons' naming: it cut a forty-result query to
 * two, and the two that survived were 1910s archival plates. The guards now
 * work the other way round -- reject what is provably wrong rather than
 * require a particular wording.
 */
const SOURCES: Array<{ kind: 'category' | 'search'; value: string }> = [
  { kind: 'category', value: 'Hotel rooms' },
  { kind: 'category', value: 'Hotel lobbies' },
  { kind: 'category', value: 'Apartment buildings' },
  { kind: 'category', value: 'Hotels in India' },
  { kind: 'search', value: 'modern hotel building' },
  { kind: 'search', value: 'hotel facade' },
  { kind: 'search', value: 'resort hotel' },
  { kind: 'search', value: 'modern house exterior' },
  { kind: 'search', value: 'villa house exterior' },
  { kind: 'search', value: 'hotel swimming pool' },
  { kind: 'search', value: 'hotel room bed' },
  { kind: 'search', value: 'apartment building facade' },
  { kind: 'search', value: 'beach resort building' },
  { kind: 'search', value: 'residential building modern' },
  { kind: 'search', value: 'hotel terrace' },
  { kind: 'search', value: 'hotel restaurant interior' },
  { kind: 'search', value: 'guesthouse exterior' },
  { kind: 'search', value: 'holiday resort' },
  { kind: 'search', value: 'apartment tower' },
  { kind: 'search', value: 'hotel suite interior' },
];

/**
 * A photograph old enough to look like a museum plate is not what anybody
 * pictures when they book a room, so anything dated before this is dropped.
 */
const EARLIEST_YEAR = 2000;

/** Words that mean the file is not a usable photograph of a modern place. */
const AVOID = [
  'map',
  'plan',
  'diagram',
  'logo',
  'coat of arms',
  'engraving',
  'drawing',
  'sketch',
  'postcard',
  'stamp',
  'banknote',
  'matchbook',
  'ruins',
  'demolition',
  'fire',
  'damaged',
  'abandoned',
  'derelict',
  'construction site',
  'blueprint',
  'signage',
  'sign',
  'plaque',
  'graph',
  'chart',
  'historic',
  'vintage',
  'antique',
  'archival',
  'black and white',
  'b&w',
  'lithograph',
  'illustration',
  'painting',
  'model of',
  // Named archival collections. Their scans carry no year in the file name,
  // so the date guard above never sees them -- and a 1920s colonial plate is
  // not what anybody pictures when they book a room.
  'kitlv',
  'tropenmuseum',
  'nationaal archief',
  'bundesarchiv',
  'library of congress',
  'state library',
  'collectie',
  'miniature',
];

/**
 * Words that mean the file really is a place somebody could stay.
 *
 * Checked against the title, the description *and* the Commons categories,
 * because Commons names files after their subject and not after their topic:
 * "Brussel (14379540130).jpg" is a hotel facade and says so nowhere in its
 * name.
 */
const SUBJECT = [
  'hotel',
  'resort',
  'motel',
  'inn',
  'guest house',
  'guesthouse',
  'lodge',
  'house',
  'villa',
  'bungalow',
  'building',
  'apartment',
  'residence',
  'residential',
  'architecture',
  'facade',
  'room',
  'bedroom',
  'suite',
  'lobby',
  'reception',
  'pool',
  'terrace',
  'restaurant',
  'interior',
];

/**
 * Subjects that are emphatically not a place to stay.
 *
 * "modern villa" returned a photograph of a footballer named Villa. A subject
 * word matching by accident is exactly what this list is for.
 */
const NOT_A_PLACE = [
  'footballer',
  'football',
  'player',
  'portrait',
  'actor',
  'actress',
  'singer',
  'musician',
  'politician',
  'stadium',
  'aircraft',
  'airplane',
  'locomotive',
  'railway',
  'ship',
  'boat',
  'car',
  'automobile',
  'church',
  'cathedral',
  'temple',
  'mosque',
  'synagogue',
  'museum',
  'monument',
  'statue',
  'flower',
  'animal',
  'bird',
  'insect',
  'food',
  'dish',
];

/**
 * Files rejected by eye, after a run.
 *
 * The automated guards keep out whole categories -- maps, engravings, dated
 * plates. These three got through them and still should not be here, so the
 * judgement is written down rather than applied by hand and forgotten:
 *
 *  - a corridor so dark it reads as a fault rather than a room;
 *  - a portrait of a named member of staff, whose face is not this store's to
 *    put beside an invented hotel;
 *  - a 1920s colonial archive scan whose file name carries no year, so the
 *    date guard never saw it.
 */
const EXCLUDED_TITLES = [
  'Brussel (14379540130).jpg',
  'Port au Prince - hotel Olofson.JPG',
  'Hotel Centrum, Fort de Kock, A modern building, KITLV 1402158.tiff',
];

interface Candidate {
  title: string;
  url: string;
  width: number;
  height: number;
  licence: string;
  artist: string;
  descriptionUrl: string;
  needsAttribution: boolean;
  /** Title, description and categories, lowercased, for the subject guards. */
  haystack: string;
}

/** Strips the HTML Commons puts in `Artist` and `ImageDescription`. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a licence permits commercial use and modification.
 *
 * Allow-list, not a deny-list: an unrecognised licence string is treated as
 * unusable. Getting this backwards is how a NonCommercial photo ends up on a
 * storefront.
 */
function licenceVerdict(short: string): { ok: boolean; needsAttribution: boolean } {
  const value = short.toLowerCase();

  if (/\bnc\b|noncommercial|non-commercial/.test(value))
    return { ok: false, needsAttribution: true };
  if (/\bnd\b|noderiv/.test(value)) return { ok: false, needsAttribution: true };
  if (/fair use|copyright|all rights/.test(value)) return { ok: false, needsAttribution: true };

  if (/cc0|public domain|pd-|^pd$/.test(value)) return { ok: true, needsAttribution: false };
  if (/cc by-sa|cc-by-sa/.test(value)) return { ok: true, needsAttribution: true };
  if (/cc by|cc-by/.test(value)) return { ok: true, needsAttribution: true };

  return { ok: false, needsAttribution: true };
}

interface CommonsPage {
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    width?: number;
    height?: number;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: unknown }>;
  }>;
}

/**
 * Whole-word matching.
 *
 * Substring matching looked equivalent and was not: "plan" fired on
 * *Esplanade*, "fire" on *fireplace*, "map" on *Mapusa*, and between them they
 * threw out most of a perfectly good result set. A reject list has to be
 * precise or it quietly becomes the thing deciding the pool.
 */
function mentions(haystack: string, terms: readonly string[]): boolean {
  return terms.some((term) => {
    const escaped = term
      .trim()
      .replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\/** True when a title carries a year that predates modern photography of note. */',
      );
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  });
}

/** True when a title carries a year that predates modern photography of note. */
function looksArchival(title: string): boolean {
  const years = title.match(/\b(1[6-9]\d{2}|20\d{2})\b/g);
  if (!years) return false;
  // Any year at all in the name, and none of them recent, reads as archival.
  return years.every((year) => Number(year) < EARLIEST_YEAR);
}

async function fetchFrom(source: {
  kind: 'category' | 'search';
  value: string;
}): Promise<Candidate[]> {
  const params = new URLSearchParams(
    source.kind === 'category'
      ? {
          action: 'query',
          format: 'json',
          generator: 'categorymembers',
          gcmtitle: `Category:${source.value}`,
          gcmtype: 'file',
          gcmlimit: '50',
          prop: 'imageinfo',
          iiprop: 'url|size|extmetadata',
          iiurlwidth: '1280',
        }
      : {
          action: 'query',
          format: 'json',
          generator: 'search',
          gsrsearch: source.value,
          // Namespace 6 is File:. Anything else is an article about a hotel.
          gsrnamespace: '6',
          gsrlimit: '40',
          prop: 'imageinfo',
          iiprop: 'url|size|extmetadata',
          iiurlwidth: '1280',
        },
  );

  const response = await politeFetch(`${API}?${params.toString()}`);
  if (!response) {
    console.log(`  ! ${source.kind} "${source.value}" — the API declined; skipping.`);
    return [];
  }

  // A throttle notice arrives as plain text with a 200, so the parse has to be
  // guarded rather than trusted.
  let payload: { query?: { pages?: Record<string, CommonsPage> } };
  try {
    payload = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  } catch {
    console.log(
      `  ! ${source.kind} "${source.value}" — the API answered with something that was not JSON.`,
    );
    return [];
  }

  const pages = Object.values(payload.query?.pages ?? {});

  return pages
    .map((page): Candidate | null => {
      const info = page.imageinfo?.[0];
      if (!info) return null;

      const meta = info.extmetadata ?? {};
      const licence = plain(String(meta.LicenseShortName?.value ?? ''));
      const verdict = licenceVerdict(licence);
      if (!verdict.ok) return null;

      const url = info.thumburl ?? info.url;
      if (!url) return null;

      const title = String(page.title ?? '').replace(/^File:/, '');
      const description = plain(String(meta.ImageDescription?.value ?? ''));
      const categories = plain(String(meta.Categories?.value ?? '')).replace(/\|/g, ' ');

      return {
        title,
        url,
        width: Number(info.width ?? 0),
        height: Number(info.height ?? 0),
        licence: licence || 'Unknown',
        artist: plain(String(meta.Artist?.value ?? 'Unknown')).slice(0, 80) || 'Unknown',
        descriptionUrl: String(info.descriptionurl ?? ''),
        needsAttribution: verdict.needsAttribution,
        haystack: `${title} ${description} ${categories}`.toLowerCase(),
      };
    })
    .filter((candidate): candidate is Candidate => candidate !== null)
    .filter((candidate) => {
      if (EXCLUDED_TITLES.includes(candidate.title)) return false;
      if (mentions(candidate.title, AVOID)) return false;
      if (looksArchival(candidate.title)) return false;
      // It has to be a place: checked across title, description and categories,
      // because Commons names files after their subject, not their topic.
      if (!mentions(candidate.haystack, SUBJECT)) return false;
      // And it has to not be one of the things that merely shares a word with
      // one. Checked against the title alone -- a Commons category list is long
      // enough that some unrelated word almost always appears in it.
      if (mentions(candidate.title, NOT_A_PLACE)) return false;
      // A card renders about 320px wide; below this it looks soft at 2x.
      if (candidate.width > 0 && candidate.width < 900) return false;
      // Portrait shots crop badly into a 4:3 card.
      if (candidate.width > 0 && candidate.height > 0 && candidate.height > candidate.width) {
        return false;
      }
      return true;
    });
}

async function download(url: string): Promise<{ bytes: Buffer; extension: string } | null> {
  const response = await politeFetch(url);
  if (!response) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  // Below this it is a placeholder or an error page, not a usable photo.
  if (bytes.length < 20_000) return null;

  // Trust the bytes, not the URL: a .jpg URL can serve a PNG or an HTML error.
  const isPng = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpg) return null;

  return { bytes, extension: isPng ? 'png' : 'jpg' };
}

interface ManifestEntry {
  slot: number;
  file: string;
  title: string;
  licence: string;
  credit: string | null;
  source: string;
}

/**
 * Persist after every photograph, not at the end.
 *
 * An earlier version wrote the manifest once, after the whole source list. A
 * run that got eighteen of twenty-four photos and then stalled on the API's
 * rate limit left eighteen files on disk that nothing knew about -- all of the
 * work and none of the benefit. Writing as we go means an interrupted run is
 * still a usable run.
 */
function persist(manifest: ManifestEntry[], attributions: string[]): void {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  writeFileSync(
    join(OUT_DIR, 'ATTRIBUTION.md'),
    [
      '# Hotel photography',
      '',
      'Freely licensed photographs of buildings, rooms and resorts from',
      '[Wikimedia Commons](https://commons.wikimedia.org), used as a shared pool across',
      'the generated listings.',
      '',
      '**These are not photographs of the properties this store lists.** Those properties',
      'are generated and do not exist; the photographs are generic architecture standing',
      'in for them, and every page that shows one says so.',
      '',
      'Slots with no photograph fall back to the drawn scenes written by',
      '`scripts/generate-hotel-art.ts`.',
      '',
      'Public-domain and CC0 files are not listed below; they require no credit.',
      '',
      ...(attributions.length > 0
        ? attributions
        : ['_Every file in this pool is public domain or CC0._']),
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const force = process.argv.includes('--force');
  const existing = readdirSync(OUT_DIR).filter((name) => /^hotel-\d+\.(jpg|png)$/.test(name));

  if (existing.length >= POOL_SIZE && !force) {
    console.log(`${existing.length} photos already in public/hotels. Pass --force to replace.`);
    return;
  }

  // Only files this script owns: never touch anything it did not write. The
  // drawn `.svg` scenes stay put -- they are the fallback if a slot is empty.
  if (force) {
    for (const name of existing) unlinkSync(join(OUT_DIR, name));
  }

  const manifest: ManifestEntry[] = [];
  const attributions: string[] = [];
  // A duplicate photo across two "different" hotels is the tell that the pool
  // is thin, so the same bytes are never saved twice.
  const seen = new Set<string>();
  let slot = 0;

  for (const source of SOURCES) {
    if (slot >= POOL_SIZE) break;

    await sleep(API_PAUSE_MS);

    // Attribution-free licences first: less to get wrong later.
    const candidates = (await fetchFrom(source)).sort(
      (a, b) => Number(a.needsAttribution) - Number(b.needsAttribution),
    );

    if (candidates.length === 0) {
      console.log(`  - ${source.kind} "${source.value}" — nothing usable.`);
    }

    // At most four per source, so the pool is not ten pictures of one lobby.
    let takenHere = 0;

    for (const candidate of candidates) {
      if (slot >= POOL_SIZE || takenHere >= 4) break;

      await sleep(DOWNLOAD_PAUSE_MS);
      const file = await download(candidate.url);
      if (!file) continue;

      const digest = createHash('sha1').update(file.bytes).digest('hex');
      if (seen.has(digest)) continue;
      seen.add(digest);

      const name = `hotel-${String(slot).padStart(2, '0')}.${file.extension}`;
      writeFileSync(join(OUT_DIR, name), file.bytes);

      console.log(
        `${name.padEnd(14)} ${(file.bytes.length / 1024).toFixed(0).padStart(5)} KB  ` +
          `${candidate.licence.padEnd(16)} ${candidate.title.slice(0, 44)}`,
      );

      manifest.push({
        slot,
        file: name,
        title: candidate.title,
        licence: candidate.licence,
        credit: candidate.needsAttribution ? candidate.artist : null,
        source: candidate.descriptionUrl,
      });

      if (candidate.needsAttribution) {
        attributions.push(
          `- **${name}** — [${candidate.title}](${candidate.descriptionUrl}) ` +
            `by ${candidate.artist}, ${candidate.licence}`,
        );
      }

      slot += 1;
      takenHere += 1;
      persist(manifest, attributions);
    }
  }

  persist(manifest, attributions);

  console.log(`\n${slot} photos in public/hotels, ${attributions.length} needing credit.`);
  if (slot < POOL_SIZE) {
    console.log(
      `Short of the ${POOL_SIZE} the pool expects; the remaining slots fall back to the drawn scenes.`,
    );
  }

  // The drawn scenes are kept as the fallback for any slot with no photograph.
  const missing = Array.from({ length: POOL_SIZE }, (_, index) => index).filter(
    (index) => !manifest.some((entry) => entry.slot === index),
  );
  const withoutArt = missing.filter(
    (index) => !existsSync(join(OUT_DIR, `hotel-${String(index).padStart(2, '0')}.svg`)),
  );
  if (withoutArt.length > 0) {
    console.log(
      `Run 'pnpm tsx scripts/generate-hotel-art.ts' to fill slots ${withoutArt.join(', ')}.`,
    );
  }
}

void main();
