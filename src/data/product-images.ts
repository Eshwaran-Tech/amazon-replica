import manifest from './product-image-manifest.json';

/**
 * Maps a product to its gallery images.
 *
 * Real photography is fetched per product *type* by
 * `pnpm products:fetch-images` -- "Trail Camera", "Cast Iron Skillet" -- since
 * the catalogue's product names are invented and cannot be searched for. A
 * product is matched to its type by looking for that type's words in its own
 * name, which is where the generator put them.
 *
 * Matching is longest-type-first, so "Bookshelf Speaker Pair" wins over
 * "Speaker" for a product whose name contains both.
 *
 * The starting offset is derived from the product's own slug, so two products
 * of the same type do not show an identical thumbnail side by side in a grid.
 *
 * A type with no usable photography falls back to that product's generated SVG
 * artwork, which always exists (`pnpm art` writes one per product). Nothing
 * here can produce a path that does not resolve.
 */

export interface ProductImageCredit {
  path: string;
  title: string;
  license: string;
  needsAttribution: boolean;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
}

const IMAGE_MANIFEST = manifest as Record<string, ProductImageCredit[]>;

/** Marks entries sourced from the DummyJSON demo catalogue, not from search. */
const CATALOGUE_LICENSE = 'DummyJSON demo catalogue';

const IMAGES_PER_PRODUCT = 3;

/** True when a type's photography is studio catalogue work rather than search. */
function isCatalogueBacked(key: string): boolean {
  return IMAGE_MANIFEST[key]?.[0]?.license === CATALOGUE_LICENSE;
}

/** FNV-1a, matching `catalog.ts` -- deterministic across machines and runs. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function generatedArt(slug: string): string[] {
  return [1, 2, 3].map((n) => `/products/${slug}-${n}.svg`);
}

/** Manifest keys grouped by subcategory, longest type first. */
const KEYS_BY_SUBCATEGORY = (() => {
  const grouped = new Map<string, Array<{ type: string; words: string[]; key: string }>>();
  for (const key of Object.keys(IMAGE_MANIFEST)) {
    const separator = key.lastIndexOf('/');
    const subcategoryKey = key.slice(0, separator);
    const type = key.slice(separator + 1).toLowerCase();
    const list = grouped.get(subcategoryKey) ?? [];
    list.push({
      type,
      words: type.split(/[^a-z0-9]+/).filter((word) => word.length >= 3),
      key,
    });
    grouped.set(subcategoryKey, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => b.type.length - a.type.length);
  return grouped;
})();

/**
 * Scores how well a product name matches a type, by counting the type's own
 * words that appear in the name.
 *
 * A plain substring test is not enough: "Havenly Aldridge Fabric Two-Seater
 * Sofa" does not contain the literal string "fabric sofa", so it fell through
 * to whichever type happened to sort first in `home/furniture` and was given a
 * photo of a desk. Counting words matches it on "fabric" and "sofa" instead.
 */
function matchScore(lowerName: string, candidate: { type: string; words: string[] }): number {
  if (lowerName.includes(candidate.type)) return 1000; // exact phrase always wins
  return candidate.words.filter((word) => lowerName.includes(word)).length;
}

export function resolveProductImages(
  name: string,
  slug: string,
  category: string,
  subcategory: string | null | undefined,
): string[] {
  const candidates = subcategory ? KEYS_BY_SUBCATEGORY.get(`${category}/${subcategory}`) : undefined;
  if (!candidates || candidates.length === 0) return generatedArt(slug);

  const lowerName = name.toLowerCase();
  let matched = candidates[0];
  let best = -1;
  for (const candidate of candidates) {
    // Ties and no-match cases go to a catalogue-backed type. A product the
    // vocabulary has no word for ("12-Cup Food Processor" in an appliances
    // list with no processor) then lands on a studio shot of a nearby
    // appliance rather than on whichever type happened to sort first.
    const score = matchScore(lowerName, candidate) * 2 + (isCatalogueBacked(candidate.key) ? 1 : 0);
    if (score > best) {
      best = score;
      matched = candidate;
    }
  }
  // A name that matches nothing (a hand-written flagship worded differently)
  // still gets a photo from its own subcategory rather than dropping to art.
  const photos = IMAGE_MANIFEST[matched?.key ?? ''];
  if (!photos || photos.length === 0) return generatedArt(slug);

  // Never ask for more photos than the type actually has. Walking the ring
  // IMAGES_PER_PRODUCT times regardless meant a type with one photo produced a
  // three-thumbnail gallery of the same picture, which reads as a broken page
  // rather than as a short gallery.
  const offset = hash(slug) % photos.length;
  const count = Math.min(IMAGES_PER_PRODUCT, photos.length);
  return Array.from({ length: count }, (_, index) => {
    const photo = photos[(offset + index) % photos.length];
    return photo ? photo.path : '';
  }).filter(Boolean);
}

/** Every credit that its licence actually obliges the site to display. */
export function requiredAttributions(): Array<{ subcategory: string; credit: ProductImageCredit }> {
  return Object.entries(IMAGE_MANIFEST)
    .flatMap(([subcategory, credits]) => credits.map((credit) => ({ subcategory, credit })))
    .filter((entry) => entry.credit.needsAttribution)
    .sort((a, b) => a.subcategory.localeCompare(b.subcategory));
}
