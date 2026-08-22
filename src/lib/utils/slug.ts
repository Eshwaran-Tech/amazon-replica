/**
 * URL slug generation and validation.
 *
 * Slugs appear in paths (`/products/auravox-pulse-anc-headphones`) and are used
 * as database filter values, so the output character set is deliberately
 * narrow: lowercase ASCII letters, digits and single hyphens. Nothing that
 * could be mistaken for a path traversal, a regex metacharacter, or a MongoDB
 * operator survives `slugify`.
 */

const MAX_SLUG_LENGTH = 96;

/** Unicode combining diacritical marks, left behind by NFKD decomposition. */
const COMBINING_MARKS = /\p{M}/gu;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim()
    // Anything not a-z0-9 collapses to a single separator.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/** The shape `slugify` produces. Used by Zod to reject anything else. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

/**
 * Appends a short suffix to resolve a collision, e.g. `blue-shirt` ->
 * `blue-shirt-2`. Keeps the result within the length limit.
 */
export function withSlugSuffix(slug: string, suffix: number | string): string {
  const tail = `-${suffix}`;
  return `${slug.slice(0, MAX_SLUG_LENGTH - tail.length)}${tail}`;
}
