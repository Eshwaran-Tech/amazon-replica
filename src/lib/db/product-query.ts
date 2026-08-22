import type { Filter, Sort } from 'mongodb';

import type { ProductDoc } from '@/models/product';
import type { ProductSearchInput, ProductSort } from '@/lib/validations/search';

/**
 * Safe query construction for the catalogue.
 *
 * Every filter object in this application is built here, field by field, from
 * values that Zod has already constrained. The forbidden pattern is:
 *
 *     collection.find(requestBody)          // never
 *     collection.find({ [userField]: v })   // never
 *
 * because a body of `{"price": {"$gt": 0}}` or `{"$where": "..."}` would then
 * become the query. Here, the only things that reach the filter are a slug that
 * matched `^[a-z0-9-]+$`, an integer number of paise, a brand string from a
 * character allow-list, and booleans. There is no code path that copies a
 * user-supplied key into a filter, so there is nothing for a `$` operator to
 * ride in on.
 */

/**
 * Sort specifications, keyed by the `z.enum` values the user may send.
 *
 * The user names a *sort option*, never a field. This prevents forcing a sort
 * on an unindexed field, which is a cheap way to make the database do
 * expensive work on every request.
 *
 * Every spec ends with `_id` as a tiebreaker. Without it, documents with equal
 * sort values have no defined order between queries, so paginating a listing
 * where 40 products share a rating can show the same item twice and skip
 * another entirely.
 */
const SORT_SPECS: Record<ProductSort, Sort> = {
  relevance: { isFeatured: -1, rating: -1, reviewCount: -1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, _id: 1 },
  discount: { discountPercentage: -1, _id: 1 },
};

/** Sort used when a text query is present and the user has not chosen one. */
const TEXT_RELEVANCE_SORT: Sort = { score: { $meta: 'textScore' }, _id: 1 };

export interface ProductQueryPlan {
  filter: Filter<ProductDoc>;
  sort: Sort;
  /** True when the query needs the `textScore` projection for sorting. */
  usesTextScore: boolean;
}

/**
 * Builds the filter and sort for a public catalogue query.
 *
 * `isActive: true` is applied unconditionally and is not derived from input --
 * a deactivated product must never surface in a public listing regardless of
 * what the URL says.
 */
export function buildProductQuery(input: ProductSearchInput): ProductQueryPlan {
  const filter: Filter<ProductDoc> = { isActive: true };

  const hasTextQuery = typeof input.q === 'string' && input.q.length > 0;
  if (hasTextQuery && input.q) {
    // `$text` takes the search string as data, not as a pattern. It cannot be
    // made to behave like `$where`, and unlike `$regex` it cannot be used to
    // mount a catastrophic-backtracking attack.
    filter.$text = { $search: input.q };
  }

  if (input.category) filter.category = input.category;
  if (input.subcategory) filter.subcategory = input.subcategory;

  if (input.brand.length > 0) {
    // Bounded to 10 entries by the schema.
    filter.brand = { $in: input.brand };
  }

  // Price filters compare against the *effective* price a customer pays, which
  // is `discountPrice` when set and `price` otherwise. Filtering on `price`
  // alone would show a product at its pre-discount price and confuse the range.
  if (input.minPrice !== undefined || input.maxPrice !== undefined) {
    const bounds: Record<string, number> = {};
    if (input.minPrice !== undefined) bounds.$gte = input.minPrice;
    if (input.maxPrice !== undefined) bounds.$lte = input.maxPrice;

    filter.$and = [
      ...((filter.$and as Filter<ProductDoc>[] | undefined) ?? []),
      {
        $or: [
          { discountPrice: { $type: 'number', ...bounds } },
          { discountPrice: null, price: bounds },
        ],
      } as Filter<ProductDoc>,
    ];
  }

  if (input.minRating !== undefined) {
    filter.rating = { $gte: input.minRating };
  }

  if (input.inStock) filter.stock = { $gt: 0 };
  if (input.prime) filter.isPrime = true;
  if (input.deals) filter.discountPercentage = { $gt: 0 };

  const usesTextScore = hasTextQuery && input.sort === 'relevance';
  const sort = usesTextScore ? TEXT_RELEVANCE_SORT : SORT_SPECS[input.sort];

  return { filter, sort, usesTextScore };
}

/**
 * Escapes regex metacharacters.
 *
 * Used only for the prefix match that powers search suggestions, where `$text`
 * cannot help because it matches whole words and a type-ahead needs partial
 * ones. Without escaping, a query of `(a+)+$` becomes a catastrophic-
 * backtracking pattern the database evaluates against every indexed name --
 * a denial of service from a single search box keystroke.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Anchored, escaped, length-capped prefix pattern for type-ahead suggestions.
 * Anchoring at the start lets the index serve it rather than scanning.
 */
export function buildSuggestionFilter(query: string): Filter<ProductDoc> {
  const safe = escapeRegex(query.slice(0, 60));
  return {
    isActive: true,
    name: { $regex: `^${safe}`, $options: 'i' },
  };
}

/**
 * Filter for "related products": same category, excluding the product itself.
 * The exclusion id comes from a document we already loaded, never from input.
 */
export function buildRelatedFilter(product: Pick<ProductDoc, '_id' | 'category'>): Filter<ProductDoc> {
  return {
    isActive: true,
    stock: { $gt: 0 },
    category: product.category,
    _id: { $ne: product._id },
  };
}
