import { ObjectId } from 'mongodb';

import { cartsCollection, productsCollection } from '@/lib/db/collections';
import { isPrimeMember } from '@/services/prime';
import { calculateTotals } from '@/services/pricing';
import { effectivePrice, type ProductDoc } from '@/models/product';
import {
  MAX_LINES_PER_CART,
  MAX_QUANTITY_PER_LINE,
  type CartDoc,
  type CartLineView,
  type CartView,
} from '@/models/cart';

import '@/lib/server-guard';

/**
 * Cart business logic.
 *
 * **Ownership is the identity, not a parameter.** Every function takes a
 * `CartIdentity` that callers derive from the session or the HttpOnly guest
 * cookie -- never from a request body. There is no function in this module
 * that accepts "whose cart" as client data, so a cart IDOR has no entry point:
 * the classic `{ userId: "someone-else" }` payload has nothing to bind to.
 *
 * **Carts store references, prices do not exist here.** A cart line is a
 * product id and a quantity (see `CartItemDoc`). Every price shown or charged
 * is read from the `products` collection at view/checkout time, so a stale or
 * tampered price cannot flow out of the cart because none ever flows in.
 */

export type CartIdentity = { userId: ObjectId } | { guestId: string };

function identityFilter(identity: CartIdentity) {
  return 'userId' in identity ? { userId: identity.userId } : { guestId: identity.guestId };
}

async function findCart(identity: CartIdentity): Promise<CartDoc | null> {
  const carts = await cartsCollection();
  return carts.findOne(identityFilter(identity));
}

/**
 * Upserts the cart for an identity.
 *
 * The unique partial indexes on `userId` / `guestId` make concurrent upserts
 * safe: two simultaneous first-adds race the insert, exactly one wins, and the
 * loser's duplicate-key error is resolved by re-reading.
 */
async function getOrCreateCart(identity: CartIdentity): Promise<CartDoc> {
  const existing = await findCart(identity);
  if (existing) return existing;

  const carts = await cartsCollection();
  const now = new Date();

  const doc: CartDoc = {
    _id: new ObjectId(),
    userId: 'userId' in identity ? identity.userId : null,
    guestId: 'guestId' in identity ? identity.guestId : null,
    items: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await carts.insertOne(doc);
    return doc;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const won = await findCart(identity);
      if (won) return won;
    }
    throw error;
  }
}

export type CartMutationResult =
  | { ok: true; quantityInCart: number; clamped: boolean }
  | { ok: false; code: 'NOT_FOUND' | 'OUT_OF_STOCK' | 'CART_FULL' };

/**
 * Adds a product (or increases its quantity).
 *
 * Two-step guarded update rather than read-modify-write, so concurrent adds
 * cannot lose increments or create duplicate lines:
 *
 *  1. `$inc` the quantity of an existing line, matched in the filter;
 *  2. if nothing matched, `$push` a new line -- with the *absence* of the line
 *     in the filter, so two racing first-adds cannot both push.
 *
 * The quantity is then clamped to `min(stock, MAX_QUANTITY_PER_LINE)` in a
 * third atomic update. The clamp re-runs at view- and checkout-time anyway, so
 * a race here can only ever leave a number that later steps correct.
 */
export async function addToCart(
  identity: CartIdentity,
  productId: string,
  quantity: number,
): Promise<CartMutationResult> {
  const products = await productsCollection();
  const product = await products.findOne({ _id: new ObjectId(productId), isActive: true });

  if (!product) return { ok: false, code: 'NOT_FOUND' };
  if (product.stock <= 0) return { ok: false, code: 'OUT_OF_STOCK' };

  const cart = await getOrCreateCart(identity);
  if (cart.items.length >= MAX_LINES_PER_CART && !cart.items.some((i) => i.productId.equals(product._id))) {
    return { ok: false, code: 'CART_FULL' };
  }

  const carts = await cartsCollection();
  const now = new Date();
  const maxForLine = Math.min(product.stock, MAX_QUANTITY_PER_LINE);

  // Step 1: bump an existing line.
  const bumped = await carts.updateOne(
    { _id: cart._id, 'items.productId': product._id },
    { $inc: { 'items.$.quantity': quantity }, $set: { updatedAt: now } },
  );

  if (bumped.matchedCount === 0) {
    // Step 2: no line yet -- push one, guarded against a concurrent push.
    await carts.updateOne(
      { _id: cart._id, 'items.productId': { $ne: product._id } },
      {
        $push: { items: { productId: product._id, quantity, addedAt: now } },
        $set: { updatedAt: now },
      },
    );
  }

  // Step 3: clamp to the per-line ceiling. `updatedAt` also feeds the guest
  // cart TTL index, so every mutation refreshes the 30-day window.
  await carts.updateOne(
    { _id: cart._id },
    { $set: { 'items.$[line].quantity': maxForLine, updatedAt: now } },
    { arrayFilters: [{ 'line.productId': product._id, 'line.quantity': { $gt: maxForLine } }] },
  );

  const after = await findCart(identity);
  const line = after?.items.find((i) => i.productId.equals(product._id));
  const quantityInCart = line?.quantity ?? quantity;

  // Clamped means "you asked for more than you got": previous quantity plus
  // this increment, versus what actually ended up on the line.
  const previous = cart.items.find((i) => i.productId.equals(product._id))?.quantity ?? 0;
  return { ok: true, quantityInCart, clamped: quantityInCart < previous + quantity };
}

/** Sets a line's quantity outright (the cart page selector). */
export async function setLineQuantity(
  identity: CartIdentity,
  productId: string,
  quantity: number,
): Promise<CartMutationResult> {
  const products = await productsCollection();
  const product = await products.findOne({ _id: new ObjectId(productId), isActive: true });
  if (!product) return { ok: false, code: 'NOT_FOUND' };

  const target = Math.min(quantity, product.stock, MAX_QUANTITY_PER_LINE);
  if (target <= 0) return { ok: false, code: 'OUT_OF_STOCK' };

  const carts = await cartsCollection();
  await carts.updateOne(
    { ...identityFilter(identity), 'items.productId': product._id },
    { $set: { 'items.$.quantity': target, updatedAt: new Date() } },
  );

  return { ok: true, quantityInCart: target, clamped: target < quantity };
}

export async function removeLine(identity: CartIdentity, productId: string): Promise<void> {
  const carts = await cartsCollection();
  await carts.updateOne(identityFilter(identity), {
    $pull: { items: { productId: new ObjectId(productId) } },
    $set: { updatedAt: new Date() },
  });
}

/**
 * Builds the display/checkout view by resolving every line against the *live*
 * catalogue: current price, current stock, current active flag.
 *
 * Policy decisions, in one place:
 *  - deleted or deactivated products drop off the cart, named in
 *    `removedLines` so the customer is told rather than gaslit;
 *  - a line whose stock shrank below its quantity is clamped and flagged
 *    (`quantityAdjusted`), and totals use the clamped number;
 *  - out-of-stock lines stay visible but contribute nothing to totals;
 *  - `availableStock` is capped at the per-line maximum so the cart view is
 *    not an exact-inventory oracle -- the same reasoning as the product page.
 *
 * Reads never write: the stored cart is left untouched, and the clamp is
 * re-applied wherever it matters (here, and again at checkout).
 */
export async function getCartView(identity: CartIdentity | null): Promise<CartView> {
  const empty: CartView = {
    lines: [],
    totals: { subtotal: 0, discount: 0, shipping: 0, tax: 0, total: 0, itemCount: 0 },
    removedLines: [],
  };

  if (!identity) return empty;

  const cart = await findCart(identity);
  if (!cart || cart.items.length === 0) return empty;

  const products = await productsCollection();
  const docs = await products
    .find({ _id: { $in: cart.items.map((item) => item.productId) } })
    .toArray();
  const byId = new Map<string, ProductDoc>(docs.map((doc) => [doc._id.toHexString(), doc]));

  const lines: CartLineView[] = [];
  const removedLines: string[] = [];

  for (const item of cart.items) {
    const product = byId.get(item.productId.toHexString());

    if (!product || !product.isActive) {
      removedLines.push(product ? product.name : 'An item that is no longer sold');
      continue;
    }

    const unitPrice = effectivePrice(product);
    const cappedQuantity = Math.min(item.quantity, product.stock, MAX_QUANTITY_PER_LINE);
    const purchasable = cappedQuantity > 0;

    lines.push({
      productId: product._id.toHexString(),
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      thumbnail: product.thumbnail,
      listPrice: product.price,
      unitPrice,
      quantity: purchasable ? cappedQuantity : item.quantity,
      lineTotal: purchasable ? unitPrice * cappedQuantity : 0,
      availableStock: Math.min(product.stock, MAX_QUANTITY_PER_LINE),
      quantityAdjusted: purchasable && cappedQuantity < item.quantity,
      isActive: purchasable,
    });
  }

  // A member's benefit has to be visible in the cart, not only applied at the
  // last step -- otherwise the delivery fee appears and then vanishes.
  const primeMember =
    identity && 'userId' in identity ? await isPrimeMember(identity.userId.toHexString()) : false;

  const totals = calculateTotals(
    lines
      .filter((line) => line.isActive)
      .map((line) => ({ listPrice: line.listPrice, unitPrice: line.unitPrice, quantity: line.quantity })),
    { freeShipping: primeMember },
  );

  return { lines, totals, removedLines };
}

/**
 * Merges a guest cart into a signed-in user's cart. Called on login and
 * registration, then the guest cookie is cleared.
 *
 * Fast path: if the user has no cart yet, the guest cart is *claimed* -- one
 * update flips its identity, no copying. The unique index on `userId` turns a
 * race with a concurrent cart creation into a duplicate-key error, which falls
 * back to the line-by-line merge.
 */
export async function mergeGuestCartIntoUser(guestId: string, userId: ObjectId): Promise<void> {
  const carts = await cartsCollection();

  const guestCart = await carts.findOne({ guestId });
  if (!guestCart || guestCart.items.length === 0) {
    if (guestCart) await carts.deleteOne({ _id: guestCart._id });
    return;
  }

  const userCart = await carts.findOne({ userId });

  if (!userCart) {
    try {
      await carts.updateOne(
        { _id: guestCart._id, guestId },
        { $set: { userId, guestId: null, updatedAt: new Date() } },
      );
      return;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // A user cart appeared mid-claim; merge instead.
    }
  }

  for (const item of guestCart.items) {
    await addToCart({ userId }, item.productId.toHexString(), item.quantity);
  }

  await carts.deleteOne({ _id: guestCart._id });
}
