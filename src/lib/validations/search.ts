import { z } from 'zod';

import { MAX_PAISE } from '@/lib/utils/money';

import { limitSchema, pageSchema, slugSchema } from './common';

/**
 * Catalogue search, filtering, sorting and pagination.
 *
 * This is where attacker-controlled URL parameters become database queries, so
 * everything here is an allow-list:
 *
 *  - `sort` is a `z.enum`, mapped server-side to a fixed sort specification.
 *    A user cannot name the field to sort on, so they cannot force a sort on an
 *    unindexed field (a cheap way to make the database do expensive work).
 *  - `limit` and `page` are hard-capped, so `?limit=999999999` is impossible.
 *  - Prices arrive as rupees and become integer paise here.
 *  - `brand` is capped in both count and length before it reaches an `$in`.
 *
 * Nothing in this file produces a MongoDB operator. The filter object is built
 * field by field in `src/lib/db/product-query.ts` from these validated values.
 */

export const PRODUCT_SORT_OPTIONS = [
  'relevance',
  'newest',
  'price-asc',
  'price-desc',
  'rating',
  'discount',
] as const;

export type ProductSort = (typeof PRODUCT_SORT_OPTIONS)[number];

/**
 * A checkbox arriving from a URL query string, where everything is a string.
 * Absent means "not filtered", which is not the same as `false`.
 */
const booleanParam = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === 'true' || value === '1' || value === 'on');

/** A brand name as it appears in the catalogue. Charset kept deliberately narrow. */
const brandNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9 &'.-]+$/, 'Invalid brand filter');

/**
 * `?brand=Volta&brand=Orbix` arrives as an array; a single value arrives as a
 * string. Normalise both, cap the count, and drop anything invalid rather than
 * failing the whole page load over one bad filter chip.
 */
const brandListSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .catch(undefined)
  .transform((value): string[] => {
    if (value === undefined) return [];

    // Bound the work before validating each entry: `getAll` on a crafted URL
    // can return thousands of values, and we should not spend CPU parsing them
    // all just to discard them.
    const raw = (Array.isArray(value) ? value : [value]).slice(0, 50);

    const parsed = raw
      .map((entry) => brandNameSchema.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data);

    // Drop invalid chips rather than failing the page: a shared URL with a
    // stale filter should still render a listing. Cap the `$in` list so a
    // single URL cannot build an arbitrarily large query.
    return Array.from(new Set(parsed)).slice(0, 10);
  });

/** Rupees in the URL, integer paise out. `.catch` keeps a junk value from 500ing. */
const priceParam = z.coerce
  .number()
  .min(0)
  .max(MAX_PAISE / 100)
  .transform((rupees) => Math.round(rupees * 100))
  .optional()
  .catch(undefined);

export const productSearchSchema = z
  .object({
    /**
     * Free-text query. Length-capped because it goes to a MongoDB `$text`
     * search, and an enormous term list is expensive to evaluate.
     */
    q: z.string().trim().max(80).optional().catch(undefined),

    category: slugSchema.optional().catch(undefined),
    subcategory: slugSchema.optional().catch(undefined),
    brand: brandListSchema,

    minPrice: priceParam,
    maxPrice: priceParam,

    minRating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),

    inStock: booleanParam,
    prime: booleanParam,
    deals: booleanParam,

    // `.catch` rather than a hard failure: a stale or hand-edited sort value
    // should render the default listing, not an error page.
    sort: z.enum(PRODUCT_SORT_OPTIONS).catch('relevance').default('relevance'),

    page: pageSchema,
    limit: limitSchema,
  })
  .transform((value) => {
    // An inverted range would silently match nothing; swapping is what the user
    // meant and avoids a confusing empty results page.
    if (
      value.minPrice !== undefined &&
      value.maxPrice !== undefined &&
      value.minPrice > value.maxPrice
    ) {
      return { ...value, minPrice: value.maxPrice, maxPrice: value.minPrice };
    }
    return value;
  });

export type ProductSearchInput = z.infer<typeof productSearchSchema>;

/**
 * Search suggestions (type-ahead). Separate, tighter schema: this endpoint is
 * called on every keystroke, so it gets a shorter query cap and a small fixed
 * result count.
 */
export const searchSuggestSchema = z.strictObject({
  q: z.string().trim().min(1).max(60),
  limit: z.coerce.number().int().min(1).max(10).catch(8).default(8),
});

export type SearchSuggestInput = z.infer<typeof searchSuggestSchema>;

/**
 * Turns `URLSearchParams` (or Next's `searchParams` object) into a plain object
 * where repeated keys become arrays.
 *
 * `Object.create(null)` matters: a query string containing `__proto__` or
 * `constructor` would otherwise write to the object's prototype chain. With a
 * null-prototype object there is no prototype to pollute.
 */
export function normaliseSearchParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string | string[]> {
  const output: Record<string, string | string[]> = Object.create(null) as Record<
    string,
    string | string[]
  >;

  if (params instanceof URLSearchParams) {
    for (const key of new Set(params.keys())) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const values = params.getAll(key);
      const first = values[0];
      if (values.length > 1) {
        output[key] = values;
      } else if (first !== undefined) {
        output[key] = first;
      }
    }
    return output;
  }

  for (const [key, value] of Object.entries(params)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (value !== undefined) output[key] = value;
  }

  return output;
}
