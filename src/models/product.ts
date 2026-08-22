import type { ObjectId } from 'mongodb';

import { discountPercentage, type Paise } from '@/lib/utils/money';

/** An ordered specification row. An array, not a `Record`, so display order is
 *  stable and we never build an object from user-controlled keys. */
export interface Specification {
  label: string;
  value: string;
}

/**
 * A product as stored in MongoDB.
 *
 * `description` and every string here is **plain text**. This application
 * accepts no HTML from anyone, including admins -- see SECURITY.md. React
 * escapes text nodes by default, so plain-text storage plus zero
 * `dangerouslySetInnerHTML` (ESLint-enforced) removes stored XSS as a category
 * rather than relying on a sanitiser staying correct.
 */
export interface ProductDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  description: string;
  brand: string;
  /** Category slug. */
  category: string;
  /** Subcategory slug, if the product sits in one. */
  subcategory?: string | null;

  /** Integer paise. See `src/lib/utils/money.ts`. */
  price: Paise;
  /** Integer paise. Absent means no active discount. */
  discountPrice?: Paise | null;
  /** Derived from the two above on every write; stored for sorting/filtering. */
  discountPercentage: number;

  images: string[];
  thumbnail: string;

  /** Never allowed below zero; the checkout decrement is conditional on it. */
  stock: number;

  /** Denormalised aggregate, recomputed when reviews change. 0-5, one decimal. */
  rating: number;
  reviewCount: number;

  features: string[];
  specifications: Specification[];

  isFeatured: boolean;
  isPrime: boolean;
  /** Soft delete. Inactive products stay queryable for existing orders. */
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/** Card view: everything a grid tile needs and nothing more. */
export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  brand: string;
  category: string;
  price: Paise;
  discountPrice: Paise | null;
  discountPercentage: number;
  effectivePrice: Paise;
  thumbnail: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  isPrime: boolean;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  subcategory: string | null;
  images: string[];
  features: string[];
  specifications: Specification[];
  /** Coarse banding, not the exact count -- see note below. */
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  /** Exact remaining units, only when low, to create genuine urgency honestly. */
  unitsLeft: number | null;
  isFeatured: boolean;
  createdAt: string;
}

/** Below this, we show the exact count ("Only 3 left"). */
export const LOW_STOCK_THRESHOLD = 5;

/** The price actually charged: the discount when present, else list price. */
export function effectivePrice(doc: Pick<ProductDoc, 'price' | 'discountPrice'>): Paise {
  return doc.discountPrice && doc.discountPrice > 0 && doc.discountPrice < doc.price
    ? doc.discountPrice
    : doc.price;
}

export function stockStatus(stock: number): ProductDetail['stockStatus'] {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= LOW_STOCK_THRESHOLD) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function toProductSummary(doc: ProductDoc): ProductSummary {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    brand: doc.brand,
    category: doc.category,
    price: doc.price,
    discountPrice: doc.discountPrice ?? null,
    discountPercentage: doc.discountPercentage,
    effectivePrice: effectivePrice(doc),
    thumbnail: doc.thumbnail,
    rating: doc.rating,
    reviewCount: doc.reviewCount,
    inStock: doc.stock > 0,
    isPrime: doc.isPrime,
  };
}

/**
 * Note what is *not* exposed: the exact `stock` figure above the low-stock
 * threshold. Publishing precise inventory to anonymous visitors hands
 * competitors a live sales feed (poll the number, watch it drop) and helps an
 * attacker size a stock-exhaustion attack. Below the threshold we do publish
 * the count, because "Only 3 left" is useful to the customer and no longer
 * secret in any meaningful sense.
 */
export function toProductDetail(doc: ProductDoc): ProductDetail {
  const status = stockStatus(doc.stock);

  return {
    ...toProductSummary(doc),
    description: doc.description,
    subcategory: doc.subcategory ?? null,
    images: doc.images,
    features: doc.features,
    specifications: doc.specifications,
    stockStatus: status,
    unitsLeft: status === 'LOW_STOCK' ? doc.stock : null,
    isFeatured: doc.isFeatured,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Admin view: the real numbers, for people authorised to see them. */
export interface AdminProductView extends ProductSummary {
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  subcategory: string | null;
  updatedAt: string;
}

export function toAdminProductView(doc: ProductDoc): AdminProductView {
  return {
    ...toProductSummary(doc),
    stock: doc.stock,
    isActive: doc.isActive,
    isFeatured: doc.isFeatured,
    subcategory: doc.subcategory ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Recomputes the stored discount percentage. Call on every product write. */
export function computeDiscountPercentage(price: Paise, discount?: Paise | null): number {
  if (!discount || discount <= 0 || discount >= price) return 0;
  return discountPercentage(price, discount);
}
