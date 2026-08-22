import { SUBCATEGORY_TEMPLATES, type SubcategoryTemplate } from './catalog-templates';
import { SEED_CATEGORIES } from './categories';
import { SEED_PRODUCTS, type SeedProduct } from './products';

/**
 * The full seed catalogue: the hand-written flagship listings in
 * `products.ts`, topped up from `catalog-templates.ts` so every category
 * carries the same depth.
 *
 * Generation is **deterministic** -- no `Math.random()`, no dates -- so the
 * same source produces the same catalogue on every machine and every run.
 * That matters for three reasons: re-running the seed does not churn the
 * database with different products, the generated SVG artwork stays valid,
 * and the tests can assert exact counts.
 *
 * Each product is composed from its subcategory's own vocabulary, so the copy,
 * features and specifications are coherent for the thing being sold rather
 * than filler text. Names are unique by construction (a distinct
 * series/variant/type triple each time) and checked against a set as a
 * backstop, because the `products.slug` unique index would otherwise reject
 * the insert.
 */

export const PRODUCTS_PER_CATEGORY = 100;

/** FNV-1a: deterministic, well distributed, and short enough to read. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 -- a small, fast, seedable PRNG. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length) % items.length];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}

/** Deterministic in-place shuffle, so combinations are not walked in order. */
function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a === undefined || b === undefined) continue;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

function fill(template: string, values: Record<string, string>): string {
  return template
    .replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

/**
 * Rounds to a price that looks like a price.
 *
 * Retail pricing clusters on 9s, and a catalogue of values like 24,317 reads
 * as generated data at a glance. The band widens with the amount, matching how
 * real listings are priced.
 */
function tidyPrice(value: number, floor: number): number {
  const step = value >= 5000 ? 1000 : value >= 1000 ? 500 : 50;
  return Math.max(floor, Math.round(value / step) * step - 1);
}

/** Every combination of series x variant x type for a template. */
function combinations(template: SubcategoryTemplate): Array<[string, string, string]> {
  const result: Array<[string, string, string]> = [];
  for (const series of template.series) {
    for (const variant of template.variants) {
      for (const type of template.types) {
        result.push([series, variant, type]);
      }
    }
  }
  return result;
}

function buildProduct(
  template: SubcategoryTemplate,
  [series, variant, type]: [string, string, string],
  brand: string,
  random: () => number,
): SeedProduct {
  const values = { brand, series, variant, type };
  const name = fill(template.nameTemplate ?? '{brand} {series} {variant} {type}', values);

  const [minPrice, maxPrice] = template.price;
  const price = tidyPrice(minPrice + random() * (maxPrice - minPrice), minPrice);

  // Roughly half of a real catalogue is on some kind of offer.
  const hasDiscount = random() < 0.55;
  const discountPrice = hasDiscount
    ? Math.max(
        Math.round(minPrice * 0.6),
        Math.min(price - 1, tidyPrice(price * (1 - (0.1 + random() * 0.35)), 1)),
      )
    : undefined;

  // A catalogue where everything is in stock never exercises the out-of-stock
  // and low-stock paths the storefront is built to handle.
  const stockRoll = random();
  const stock =
    stockRoll < 0.06 ? 0 : stockRoll < 0.16 ? 1 + Math.floor(random() * 5) : 8 + Math.floor(random() * 230);

  const features = shuffled(template.features, random).slice(0, 4).map((feature) => fill(feature, values));
  const specifications = template.specs.map(
    ([label, pool]) => [label, fill(pick(pool, random), values)] as [string, string],
  );

  return {
    name,
    brand,
    category: template.category,
    subcategory: template.subcategory,
    price,
    ...(discountPrice !== undefined && discountPrice < price ? { discountPrice } : {}),
    stock,
    featured: random() < 0.04,
    prime: random() < 0.45,
    description: fill(pick(template.descriptions, random), values),
    features,
    specifications,
  };
}

/**
 * Tops each category up to `PRODUCTS_PER_CATEGORY`, spreading the shortfall
 * evenly across that category's subcategories.
 */
export function generateCatalogProducts(): SeedProduct[] {
  const taken = new Set<string>(SEED_PRODUCTS.map((product) => product.name.toLowerCase()));
  const generated: SeedProduct[] = [];

  for (const category of SEED_CATEGORIES) {
    const templates = SUBCATEGORY_TEMPLATES.filter(
      (template) => template.category === category.slug,
    );
    if (templates.length === 0) continue;

    const existing = SEED_PRODUCTS.filter((product) => product.category === category.slug).length;
    const shortfall = Math.max(0, PRODUCTS_PER_CATEGORY - existing);

    // Spread the shortfall evenly; the remainder goes to the first templates.
    const base = Math.floor(shortfall / templates.length);
    const remainder = shortfall % templates.length;

    templates.forEach((template, templateIndex) => {
      const wanted = base + (templateIndex < remainder ? 1 : 0);
      if (wanted === 0) return;

      const random = makeRandom(hash(`${template.category}:${template.subcategory}`));
      const combos = shuffled(combinations(template), random);

      let made = 0;
      for (let index = 0; index < combos.length && made < wanted; index += 1) {
        const combo = combos[index];
        if (!combo) continue;
        const brand = template.brands[index % template.brands.length];
        if (!brand) continue;

        const product = buildProduct(template, combo, brand, random);
        const key = product.name.toLowerCase();
        if (taken.has(key)) continue; // never risk the unique slug index

        taken.add(key);
        generated.push(product);
        made += 1;
      }

      if (made < wanted) {
        // The vocabulary lists are sized to make this unreachable; failing
        // loudly beats shipping a category that is quietly short.
        throw new Error(
          `catalog: ${template.category}/${template.subcategory} produced ${made} of ${wanted} products -- widen its vocabulary`,
        );
      }
    });
  }

  return generated;
}

/** Hand-written flagships first, then the generated depth behind them. */
export const ALL_SEED_PRODUCTS: SeedProduct[] = [...SEED_PRODUCTS, ...generateCatalogProducts()];
