import { cache } from 'react';
import type { Filter, ObjectId } from 'mongodb';

import { categoriesCollection, ordersCollection, productsCollection } from '@/lib/db/collections';
import {
  buildProductQuery,
  buildRelatedFilter,
  buildSuggestionFilter,
} from '@/lib/db/product-query';
import type { ProductSearchInput } from '@/lib/validations/search';
import { toSkipLimit } from '@/lib/validations/common';
import {
  toProductDetail,
  toProductSummary,
  type ProductDetail,
  type ProductDoc,
  type ProductSummary,
} from '@/models/product';
import { buildCategoryTree, toCategoryView, type CategoryTreeNode } from '@/models/category';
import type { Paise } from '@/lib/utils/money';

import '@/lib/server-guard';

/**
 * Catalogue reads.
 *
 * Every query here goes through `buildProductQuery`, so no user-supplied key
 * ever reaches a filter, and `isActive: true` is unconditional on public reads.
 *
 * `cache()` is React's per-request memoisation, not an HTTP cache. The header
 * and the page body both need the category tree; without it that is two
 * identical round trips on every render. It does not persist between requests,
 * which matters -- caching personalised data across requests is how one
 * customer sees another's cart.
 */

export interface ProductFacets {
  brands: Array<{ name: string; count: number }>;
  priceRange: { min: Paise; max: Paise } | null;
}

export interface ProductListResult {
  items: ProductSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: ProductFacets;
}

interface FacetAggregate {
  items: ProductDoc[];
  total: Array<{ count: number }>;
  brands: Array<{ _id: string; count: number }>;
  priceRange: Array<{ _id: null; min: number; max: number }>;
}

/**
 * Paginated listing with facets, in a single round trip.
 *
 * `$facet` computes the page, the total count and the filter sidebar together.
 * Three separate queries would mean three index traversals of the same working
 * set, and -- worse -- a count taken at a different instant from the page,
 * which shows up as "142 results" above a grid that paginates to 141.
 */
export async function listProducts(input: ProductSearchInput): Promise<ProductListResult> {
  const products = await productsCollection();
  const { filter, sort, usesTextScore } = buildProductQuery(input);
  const { skip, limit } = toSkipLimit({ page: input.page, limit: input.limit });

  // Brand facets are computed *without* the brand constraint, so the sidebar
  // still lists the other brands after one is ticked. Filtering the facet by
  // itself would collapse the list to the single selected brand.
  const facetFilter: Filter<ProductDoc> = { ...filter };
  delete facetFilter.brand;

  const pipeline: Record<string, unknown>[] = [{ $match: filter }];

  // A text search must be able to sort by relevance, which requires projecting
  // the score before the sort stage.
  if (usesTextScore) {
    pipeline.push({ $addFields: { score: { $meta: 'textScore' } } });
  }

  pipeline.push({
    $facet: {
      items: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
      total: [{ $count: 'count' }],
      brands: [
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        // Bounded: an unbounded facet on a large catalogue is its own problem.
        { $limit: 20 },
      ],
      priceRange: [
        {
          $group: {
            _id: null,
            min: { $min: { $ifNull: ['$discountPrice', '$price'] } },
            max: { $max: { $ifNull: ['$discountPrice', '$price'] } },
          },
        },
      ],
    },
  });

  const [result] = await products
    .aggregate<FacetAggregate>(pipeline, { allowDiskUse: false })
    .toArray();

  const total = result?.total[0]?.count ?? 0;
  const range = result?.priceRange[0];

  // The brand facet needs the un-branded filter; run it only when a brand is
  // actually selected, so the common case stays at one round trip.
  let brands = (result?.brands ?? []).map((entry) => ({ name: entry._id, count: entry.count }));

  if (input.brand.length > 0) {
    brands = await products
      .aggregate<{ _id: string; count: number }>([
        { $match: facetFilter },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 20 },
      ])
      .toArray()
      .then((entries) => entries.map((entry) => ({ name: entry._id, count: entry.count })));
  }

  return {
    items: (result?.items ?? []).map(toProductSummary),
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.max(1, Math.ceil(total / input.limit)),
    facets: {
      brands,
      priceRange: range ? { min: range.min, max: range.max } : null,
    },
  };
}

export const getProductBySlug = cache(async (slug: string): Promise<ProductDetail | null> => {
  const products = await productsCollection();
  // `isActive` is part of the lookup, not a post-filter: a deactivated product
  // must 404 rather than render with a hidden flag.
  const doc = await products.findOne({ slug, isActive: true });
  return doc ? toProductDetail(doc) : null;
});

/** Raw document, for internal callers that need `_id` or exact stock. */
export const getProductDocBySlug = cache(async (slug: string): Promise<ProductDoc | null> => {
  const products = await productsCollection();
  return products.findOne({ slug, isActive: true });
});

export async function getRelatedProducts(
  product: Pick<ProductDoc, '_id' | 'category'>,
  limit = 12,
): Promise<ProductSummary[]> {
  const products = await productsCollection();
  const docs = await products
    .find(buildRelatedFilter(product))
    .sort({ rating: -1, reviewCount: -1, _id: 1 })
    .limit(limit)
    .toArray();

  return docs.map(toProductSummary);
}

async function findSummaries(
  filter: Filter<ProductDoc>,
  sort: Record<string, 1 | -1>,
  limit: number,
): Promise<ProductSummary[]> {
  const products = await productsCollection();
  const docs = await products.find(filter).sort(sort).limit(limit).toArray();
  return docs.map(toProductSummary);
}

export const getFeaturedProducts = cache(async (limit = 12): Promise<ProductSummary[]> =>
  findSummaries({ isActive: true, isFeatured: true }, { rating: -1, _id: 1 }, limit),
);

export const getNewArrivals = cache(async (limit = 12): Promise<ProductSummary[]> =>
  findSummaries({ isActive: true }, { createdAt: -1, _id: 1 }, limit),
);

export const getTodaysDeals = cache(async (limit = 12): Promise<ProductSummary[]> =>
  findSummaries(
    { isActive: true, discountPercentage: { $gte: 20 }, stock: { $gt: 0 } },
    { discountPercentage: -1, _id: 1 },
    limit,
  ),
);

/**
 * Best sellers, derived from actual paid orders rather than from a hand-set
 * flag. A "best seller" badge that does not track sales is just a lie with a
 * nicer font.
 */
/**
 * Products in one subcategory, for the themed storefronts (`/fresh`,
 * `/fresh/meat`, `/now`). Served by the existing
 * `products_active_category_price` index rather than a collection scan.
 */
export const getBySubcategory = cache(
  async (subcategory: string, limit = 12, sort: Record<string, 1 | -1> = { rating: -1, _id: 1 }) =>
    findSummaries({ isActive: true, subcategory }, sort, limit),
);

/** Discounted products within one top-level category. */
export const getCategoryDeals = cache(async (category: string, limit = 12) =>
  findSummaries(
    { isActive: true, category, discountPercentage: { $gte: 10 }, stock: { $gt: 0 } },
    { discountPercentage: -1, _id: 1 },
    limit,
  ),
);

/** Everything in one top-level category, best rated first. */
export const getByCategory = cache(async (category: string, limit = 12) =>
  findSummaries({ isActive: true, category }, { rating: -1, _id: 1 }, limit),
);

export const getBestSellers = cache(async (limit = 12): Promise<ProductSummary[]> => {
  const orders = await ordersCollection();

  const ranked = await orders
    .aggregate<{ _id: ObjectId; sold: number }>([
      { $match: { paymentStatus: 'PAID' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', sold: { $sum: '$items.quantity' } } },
      { $sort: { sold: -1, _id: 1 } },
      { $limit: limit },
    ])
    .toArray();

  if (ranked.length === 0) return [];

  const products = await productsCollection();
  const docs = await products
    .find({ _id: { $in: ranked.map((entry) => entry._id) }, isActive: true })
    .toArray();

  // Preserve the sales ranking, which the `$in` lookup does not.
  const order = new Map(ranked.map((entry, index) => [entry._id.toHexString(), index]));
  return docs
    .sort((a, b) => (order.get(a._id.toHexString()) ?? 0) - (order.get(b._id.toHexString()) ?? 0))
    .map(toProductSummary);
});

/** Type-ahead suggestions. Escaped prefix regex -- see `escapeRegex`. */
export async function getSearchSuggestions(
  query: string,
  limit = 8,
): Promise<Array<{ name: string; slug: string; category: string }>> {
  const products = await productsCollection();
  const docs = await products
    .find(buildSuggestionFilter(query), {
      projection: { name: 1, slug: 1, category: 1 },
    })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({ name: doc.name, slug: doc.slug, category: doc.category }));
}

// ----------------------------------------------------------------- categories

export const getCategoryTree = cache(async (): Promise<CategoryTreeNode[]> => {
  const categories = await categoriesCollection();
  const docs = await categories
    .find({ isActive: true })
    .sort({ parentSlug: 1, displayOrder: 1 })
    .toArray();

  return buildCategoryTree(docs);
});

export const getCategoryBySlug = cache(async (slug: string) => {
  const categories = await categoriesCollection();
  const doc = await categories.findOne({ slug, isActive: true });
  return doc ? toCategoryView(doc) : null;
});

/** Top-level categories only, for the home page tiles. */
export const getTopLevelCategories = cache(async () => {
  const categories = await categoriesCollection();
  const docs = await categories
    .find({ isActive: true, parentSlug: null })
    .sort({ displayOrder: 1 })
    .toArray();

  return docs.map(toCategoryView);
});

/** Every product slug, for the sitemap. Projected to keep the payload small. */
export async function getAllProductSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const products = await productsCollection();
  return products
    .find({ isActive: true }, { projection: { slug: 1, updatedAt: 1 } })
    .limit(5000)
    .toArray()
    .then((docs) => docs.map((doc) => ({ slug: doc.slug, updatedAt: doc.updatedAt })));
}
