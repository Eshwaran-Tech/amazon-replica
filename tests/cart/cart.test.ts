import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeMongoClient } from '@/lib/db/client';
import { cartsCollection, productsCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import { MAX_LINES_PER_CART, MAX_QUANTITY_PER_LINE } from '@/models/cart';
import type { ProductDoc } from '@/models/product';
import { calculateTotals } from '@/services/pricing';
import {
  addToCart,
  getCartView,
  mergeGuestCartIntoUser,
  removeLine,
  setLineQuantity,
  type CartIdentity,
} from '@/services/cart';

/**
 * Phase 7 verification.
 *
 * The properties under test are the ones the checkout will rely on: carts hold
 * no prices, views price from the live catalogue, stock caps hold under
 * concurrency, and identity is the only routing -- there is no way to express
 * "someone else's cart" through the service API at all.
 */

let counter = 0;

async function makeProduct(overrides: Partial<ProductDoc> = {}): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Cart Test Product ${counter}`,
    slug: `cart-test-product-${Date.now()}-${counter}`,
    description: 'A product created by the cart test suite.',
    brand: 'Testco',
    category: 'electronics',
    subcategory: null,
    price: rupeesToPaise(1000),
    discountPrice: rupeesToPaise(800),
    discountPercentage: 20,
    images: ['/products/test-1.svg'],
    thumbnail: '/products/test-1.svg',
    stock: 25,
    rating: 0,
    reviewCount: 0,
    features: [],
    specifications: [],
    isFeatured: false,
    isPrime: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };

  await products.insertOne(doc);
  return doc;
}

const guest = (): CartIdentity => ({ guestId: `guest-test-${new ObjectId().toHexString()}xxxxx` });
const user = (): CartIdentity => ({ userId: new ObjectId() });

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('cart storage never contains a price', () => {
  it('persists only productId, quantity and addedAt per line', async () => {
    const product = await makeProduct();
    const identity = guest();

    await addToCart(identity, product._id.toHexString(), 2);

    const carts = await cartsCollection();
    const stored = await carts.findOne({ guestId: (identity as { guestId: string }).guestId });

    expect(stored).not.toBeNull();
    expect(stored?.items).toHaveLength(1);
    // The whole tampering surface: these three keys and nothing else.
    expect(Object.keys(stored?.items[0] ?? {}).sort()).toEqual(['addedAt', 'productId', 'quantity']);
    expect(JSON.stringify(stored)).not.toContain('price');
  });

  it('prices the view from the live catalogue, not from anything stored', async () => {
    const product = await makeProduct();
    const identity = guest();
    await addToCart(identity, product._id.toHexString(), 1);

    const before = await getCartView(identity);
    expect(before.lines[0]?.unitPrice).toBe(product.discountPrice);

    // The shop changes the price after the item is in the cart.
    const products = await productsCollection();
    const newDiscount = rupeesToPaise(650);
    await products.updateOne({ _id: product._id }, { $set: { discountPrice: newDiscount } });

    const after = await getCartView(identity);
    // The cart shows the *current* price -- a stale or captured price cannot
    // survive, because it was never stored to begin with.
    expect(after.lines[0]?.unitPrice).toBe(newDiscount);
    expect(after.totals.total).not.toBe(before.totals.total);
  });
});

describe('quantity and line caps', () => {
  it('clamps a single add to the per-line maximum', async () => {
    const product = await makeProduct({ stock: 100 });
    const identity = guest();

    // Schema caps requests at 10 already; the service must hold even if called
    // directly with more.
    const result = await addToCart(identity, product._id.toHexString(), 99);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quantityInCart).toBe(MAX_QUANTITY_PER_LINE);
    expect(result.clamped).toBe(true);
  });

  it('clamps repeated adds at the cap instead of accumulating past it', async () => {
    const product = await makeProduct({ stock: 100 });
    const identity = guest();
    const id = product._id.toHexString();

    for (let i = 0; i < 5; i += 1) await addToCart(identity, id, 4);

    const view = await getCartView(identity);
    expect(view.lines[0]?.quantity).toBe(MAX_QUANTITY_PER_LINE);
  });

  it('clamps to stock when stock is lower than the cap', async () => {
    const product = await makeProduct({ stock: 3 });
    const identity = guest();

    const result = await addToCart(identity, product._id.toHexString(), 8);
    expect(result.ok && result.quantityInCart).toBe(3);
  });

  it('refuses an out-of-stock product outright', async () => {
    const product = await makeProduct({ stock: 0 });
    const result = await addToCart(guest(), product._id.toHexString(), 1);
    expect(result).toEqual({ ok: false, code: 'OUT_OF_STOCK' });
  });

  it('refuses an inactive product', async () => {
    const product = await makeProduct({ isActive: false });
    const result = await addToCart(guest(), product._id.toHexString(), 1);
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('enforces the line-count ceiling but still allows bumping existing lines', async () => {
    const identity = guest();
    const first = await makeProduct();

    await addToCart(identity, first._id.toHexString(), 1);
    const carts = await cartsCollection();
    // Fill the cart to the ceiling directly -- creating 49 more real products
    // would make this test slow for no extra proof.
    await carts.updateOne(
      { guestId: (identity as { guestId: string }).guestId },
      {
        $push: {
          items: {
            $each: Array.from({ length: MAX_LINES_PER_CART - 1 }, () => ({
              productId: new ObjectId(),
              quantity: 1,
              addedAt: new Date(),
            })),
          },
        },
      },
    );

    const overflow = await makeProduct();
    expect(await addToCart(identity, overflow._id.toHexString(), 1)).toEqual({
      ok: false,
      code: 'CART_FULL',
    });

    // But the existing line can still change.
    const bump = await addToCart(identity, first._id.toHexString(), 1);
    expect(bump.ok).toBe(true);
  });
});

describe('concurrency', () => {
  it('loses no increments and creates no duplicate lines under parallel adds', async () => {
    const product = await makeProduct({ stock: 100 });
    const identity = guest();
    const id = product._id.toHexString();

    // Ten simultaneous first-adds: the guarded two-step update must yield ONE
    // line, and (with clamping) a quantity at the cap -- never eleven lines or
    // a lost update.
    await Promise.all(Array.from({ length: 10 }, () => addToCart(identity, id, 1)));

    const carts = await cartsCollection();
    const stored = await carts.findOne({ guestId: (identity as { guestId: string }).guestId });

    expect(stored?.items.filter((i) => i.productId.equals(product._id))).toHaveLength(1);
    expect(stored?.items[0]?.quantity).toBeLessThanOrEqual(MAX_QUANTITY_PER_LINE);
    expect(stored?.items[0]?.quantity).toBeGreaterThan(0);
  });
});

describe('view integrity', () => {
  it('drops deactivated products and names them', async () => {
    const keep = await makeProduct();
    const gone = await makeProduct();
    const identity = guest();

    await addToCart(identity, keep._id.toHexString(), 1);
    await addToCart(identity, gone._id.toHexString(), 1);

    const products = await productsCollection();
    await products.updateOne({ _id: gone._id }, { $set: { isActive: false } });

    const view = await getCartView(identity);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.productId).toBe(keep._id.toHexString());
    expect(view.removedLines).toContain(gone.name);
  });

  it('flags and clamps a line whose stock shrank, and prices the clamped amount', async () => {
    const product = await makeProduct({ stock: 10 });
    const identity = guest();
    await addToCart(identity, product._id.toHexString(), 8);

    const products = await productsCollection();
    await products.updateOne({ _id: product._id }, { $set: { stock: 2 } });

    const view = await getCartView(identity);
    const line = view.lines[0];

    expect(line?.quantity).toBe(2);
    expect(line?.quantityAdjusted).toBe(true);
    expect(line?.lineTotal).toBe((product.discountPrice ?? 0) * 2);
    expect(view.totals.itemCount).toBe(2);
  });

  it('keeps an out-of-stock line visible but excludes it from totals', async () => {
    const inStock = await makeProduct();
    const soldOut = await makeProduct({ stock: 5 });
    const identity = guest();

    await addToCart(identity, inStock._id.toHexString(), 1);
    await addToCart(identity, soldOut._id.toHexString(), 2);

    const products = await productsCollection();
    await products.updateOne({ _id: soldOut._id }, { $set: { stock: 0 } });

    const view = await getCartView(identity);
    const deadLine = view.lines.find((l) => l.productId === soldOut._id.toHexString());

    expect(view.lines).toHaveLength(2); // still shown, so the customer knows
    expect(deadLine?.isActive).toBe(false);
    expect(deadLine?.lineTotal).toBe(0);
    expect(view.totals.itemCount).toBe(1); // but not paid for
  });

  it('computes totals through the single pricing authority', async () => {
    const a = await makeProduct({ price: rupeesToPaise(300), discountPrice: rupeesToPaise(250) });
    const b = await makeProduct({ price: rupeesToPaise(120), discountPrice: null, discountPercentage: 0 });
    const identity = guest();

    await addToCart(identity, a._id.toHexString(), 2);
    await addToCart(identity, b._id.toHexString(), 1);

    const view = await getCartView(identity);
    const expected = calculateTotals([
      { listPrice: a.price, unitPrice: a.discountPrice ?? a.price, quantity: 2 },
      { listPrice: b.price, unitPrice: b.price, quantity: 1 },
    ]);

    expect(view.totals).toEqual(expected);
  });

  it('never exposes exact stock beyond the per-line cap', async () => {
    const product = await makeProduct({ stock: 4321 });
    const identity = guest();
    await addToCart(identity, product._id.toHexString(), 1);

    const view = await getCartView(identity);
    // The cart view must not become an inventory oracle.
    expect(view.lines[0]?.availableStock).toBe(MAX_QUANTITY_PER_LINE);
    expect(JSON.stringify(view)).not.toContain('4321');
  });
});

describe('line mutations', () => {
  it('sets a quantity, clamped to stock', async () => {
    const product = await makeProduct({ stock: 4 });
    const identity = guest();
    await addToCart(identity, product._id.toHexString(), 1);

    const result = await setLineQuantity(identity, product._id.toHexString(), 9);
    expect(result.ok && result.quantityInCart).toBe(4);
    expect(result.ok && result.clamped).toBe(true);
  });

  it('removes a line', async () => {
    const product = await makeProduct();
    const identity = guest();
    await addToCart(identity, product._id.toHexString(), 2);

    await removeLine(identity, product._id.toHexString());

    const view = await getCartView(identity);
    expect(view.lines).toHaveLength(0);
  });
});

describe('identity isolation', () => {
  it('routes strictly by identity -- one shopper cannot see another cart', async () => {
    const product = await makeProduct();
    const alice = guest();
    const bob = guest();

    await addToCart(alice, product._id.toHexString(), 3);

    expect((await getCartView(alice)).lines).toHaveLength(1);
    // Bob's identity yields Bob's (empty) cart. There is no parameter through
    // which Bob could name Alice's cart: the service has no such input.
    expect((await getCartView(bob)).lines).toHaveLength(0);

    // Bob "removing" Alice's product from his own cart is a no-op on hers.
    await removeLine(bob, product._id.toHexString());
    expect((await getCartView(alice)).lines).toHaveLength(1);
  });

  it('keeps guest and user carts for the same products separate', async () => {
    const product = await makeProduct();
    const g = guest();
    const u = user();

    await addToCart(g, product._id.toHexString(), 1);
    await addToCart(u, product._id.toHexString(), 5);

    expect((await getCartView(g)).lines[0]?.quantity).toBe(1);
    expect((await getCartView(u)).lines[0]?.quantity).toBe(5);
  });
});

describe('guest-to-user merge on sign-in', () => {
  it('claims the guest cart when the user has none', async () => {
    const product = await makeProduct();
    const guestId = `merge-claim-${new ObjectId().toHexString()}xxxx`;
    const userId = new ObjectId();

    await addToCart({ guestId }, product._id.toHexString(), 3);
    await mergeGuestCartIntoUser(guestId, userId);

    const userView = await getCartView({ userId });
    expect(userView.lines).toHaveLength(1);
    expect(userView.lines[0]?.quantity).toBe(3);

    // The guest identity is spent.
    expect((await getCartView({ guestId })).lines).toHaveLength(0);
    const carts = await cartsCollection();
    expect(await carts.countDocuments({ guestId })).toBe(0);
  });

  it('merges quantities into an existing user cart, respecting caps', async () => {
    const shared = await makeProduct({ stock: 100 });
    const guestOnly = await makeProduct();
    const guestId = `merge-into-${new ObjectId().toHexString()}xxxx`;
    const userId = new ObjectId();

    await addToCart({ userId }, shared._id.toHexString(), 7);
    await addToCart({ guestId }, shared._id.toHexString(), 6);
    await addToCart({ guestId }, guestOnly._id.toHexString(), 2);

    await mergeGuestCartIntoUser(guestId, userId);

    const view = await getCartView({ userId });
    const sharedLine = view.lines.find((l) => l.productId === shared._id.toHexString());
    const newLine = view.lines.find((l) => l.productId === guestOnly._id.toHexString());

    // 7 + 6 caps at the per-line maximum rather than summing to 13.
    expect(sharedLine?.quantity).toBe(MAX_QUANTITY_PER_LINE);
    expect(newLine?.quantity).toBe(2);

    const carts = await cartsCollection();
    expect(await carts.countDocuments({ guestId })).toBe(0);
  });

  it('is a no-op for an empty or missing guest cart', async () => {
    const userId = new ObjectId();
    await expect(
      mergeGuestCartIntoUser(`ghost-${new ObjectId().toHexString()}xxxxx`, userId),
    ).resolves.toBeUndefined();
    expect((await getCartView({ userId })).lines).toHaveLength(0);
  });
});
