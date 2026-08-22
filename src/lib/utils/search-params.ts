import type { ProductSearchInput } from '@/lib/validations/search';

/**
 * Builds catalogue URLs from the *validated* search state.
 *
 * Filters are rendered as ordinary links rather than as a JavaScript-driven
 * control. That means the listing works before hydration and with JavaScript
 * off, every filter combination is a shareable and bookmarkable URL, and the
 * back button behaves the way people expect.
 *
 * The input is the parsed `ProductSearchInput`, never the raw query string, so
 * a hostile parameter cannot survive a round trip through a filter link -- it
 * was dropped by Zod before it ever reached here.
 */

export type FilterPatch = Partial<{
  q: string | undefined;
  category: string | undefined;
  subcategory: string | undefined;
  brand: string[];
  minPrice: number | undefined;
  maxPrice: number | undefined;
  minRating: number | undefined;
  inStock: boolean;
  prime: boolean;
  deals: boolean;
  sort: ProductSearchInput['sort'];
  page: number;
}>;

/** Paise back to whole rupees for the URL, which is what a human reads. */
function paiseToRupeeParam(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  return String(Math.round(value / 100));
}

export function buildCatalogUrl(
  basePath: string,
  current: ProductSearchInput,
  patch: FilterPatch = {},
): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();

  if (merged.q) params.set('q', merged.q);
  if (merged.category) params.set('category', merged.category);
  if (merged.subcategory) params.set('subcategory', merged.subcategory);

  for (const brand of merged.brand ?? []) params.append('brand', brand);

  const min = paiseToRupeeParam(merged.minPrice);
  const max = paiseToRupeeParam(merged.maxPrice);
  if (min !== undefined) params.set('minPrice', min);
  if (max !== undefined) params.set('maxPrice', max);

  if (merged.minRating !== undefined) params.set('minRating', String(merged.minRating));
  if (merged.inStock) params.set('inStock', 'true');
  if (merged.prime) params.set('prime', 'true');
  if (merged.deals) params.set('deals', 'true');
  if (merged.sort && merged.sort !== 'relevance') params.set('sort', merged.sort);

  // Any filter change resets to page 1 unless the caller is explicitly paging.
  // Otherwise ticking a brand on page 7 lands on an empty page 7 of 2 results.
  const page = patch.page ?? 1;
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Toggles one brand chip on or off. */
export function toggleBrand(current: readonly string[], brand: string): string[] {
  return current.includes(brand)
    ? current.filter((entry) => entry !== brand)
    : [...current, brand];
}

/** True when anything other than sort/pagination is applied. */
export function hasActiveFilters(input: ProductSearchInput): boolean {
  return Boolean(
    input.category ||
      input.subcategory ||
      input.brand.length > 0 ||
      input.minPrice !== undefined ||
      input.maxPrice !== undefined ||
      input.minRating !== undefined ||
      input.inStock ||
      input.prime ||
      input.deals,
  );
}
