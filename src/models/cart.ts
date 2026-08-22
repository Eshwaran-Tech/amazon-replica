import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A cart line as stored.
 *
 * Note what is **not** here: any price. A cart holds a product reference and a
 * quantity, nothing else. Prices are read from the `products` collection every
 * time the cart is displayed or checked out.
 *
 * This is structural rather than defensive. There is no field for a client to
 * tamper with, no stale price to honour, and no code path where a stored price
 * could be trusted over the catalogue -- because the price was never stored.
 */
export interface CartItemDoc {
  productId: ObjectId;
  quantity: number;
  addedAt: Date;
}

export interface CartDoc {
  _id: ObjectId;
  /** Set for a signed-in cart. Exactly one of userId/guestId is non-null. */
  userId: ObjectId | null;
  /** Opaque random id in a cookie, for carts created before sign-in. */
  guestId: string | null;
  items: CartItemDoc[];
  createdAt: Date;
  updatedAt: Date;
}

/** A cart line after prices and stock have been resolved from the catalogue. */
export interface CartLineView {
  productId: string;
  name: string;
  slug: string;
  brand: string;
  thumbnail: string;
  /** Current list price, from the database. */
  listPrice: Paise;
  /** Current charged price, from the database. */
  unitPrice: Paise;
  quantity: number;
  lineTotal: Paise;
  /** Live stock, so the UI can cap the quantity selector. */
  availableStock: number;
  /** True when the requested quantity had to be reduced to match stock. */
  quantityAdjusted: boolean;
  isActive: boolean;
}

export interface CartTotals {
  subtotal: Paise;
  discount: Paise;
  shipping: Paise;
  tax: Paise;
  total: Paise;
  itemCount: number;
}

export interface CartView {
  lines: CartLineView[];
  totals: CartTotals;
  /** Lines dropped because the product was deleted or deactivated. */
  removedLines: string[];
}

export const MAX_QUANTITY_PER_LINE = 10;
export const MAX_LINES_PER_CART = 50;
