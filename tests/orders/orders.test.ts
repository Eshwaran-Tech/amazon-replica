import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { ordersCollection, productsCollection, usersCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { UserDoc } from '@/models/user';
import type { AddressInput } from '@/lib/validations/user';
import {
  addAddress,
  deleteAddress,
  listAddresses,
  MAX_ADDRESSES,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from '@/services/account';
import { addToCart } from '@/services/cart';
import { placeOrder } from '@/services/checkout';
import { cancelOrder, getOrderForUser, listOrdersForUser } from '@/services/orders';
import { ensurePaymentIntent, processMockCardPayment, recordPaymentResult } from '@/services/payment';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';

/**
 * Phase 9 verification: cancellation as an inventory and money operation, the
 * ownership boundary on order reads, and the address book's default-address
 * invariants.
 */

let counter = 0;
const ctx = { ip: '10.99.0.2' };

const BASE_ADDRESS: AddressInput = {
  fullName: 'Orders Tester',
  phone: '9800000299',
  line1: '7 History Row',
  line2: '',
  city: 'Chennai',
  state: 'Tamil Nadu',
  postalCode: '600001',
  country: 'India',
  type: 'HOME',
  isDefault: false,
};

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Orders User ${counter}`,
    email: `orders-${Date.now()}-${counter}@example.com`,
    passwordHash: await hashPassword('ValidPass123'),
    phone: null,
    hasPassword: true,
    role: 'USER',
    emailVerified: true,
    emailVerifiedAt: now,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(user);
  return user;
}

async function makeProduct(overrides: Partial<ProductDoc> = {}): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Orders Product ${counter}`,
    slug: `orders-product-${Date.now()}-${counter}`,
    description: 'Created by the orders test suite.',
    brand: 'Testco',
    category: 'electronics',
    subcategory: null,
    price: rupeesToPaise(500),
    discountPrice: null,
    discountPercentage: 0,
    images: ['/products/t-1.svg'],
    thumbnail: '/products/t-1.svg',
    stock: 20,
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

function key(): string {
  return `test${new ObjectId().toHexString()}`;
}

/** Places a COD order for `quantity` of `product` and returns its id. */
async function placeCodOrder(user: UserDoc, product: ProductDoc, quantity = 1): Promise<string> {
  await addToCart({ userId: user._id }, product._id.toHexString(), quantity);
  const result = await placeOrder(
    user._id,
    { newAddress: BASE_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
    ctx,
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('order placement failed');
  return result.orderId;
}

async function stockOf(productId: ObjectId): Promise<number> {
  const products = await productsCollection();
  const doc = await products.findOne({ _id: productId }, { projection: { stock: 1 } });
  return doc?.stock ?? -1;
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

// ---------------------------------------------------------------- cancelling

describe('cancelling an order', () => {
  it('releases the stock, flips the status, and records history -- exactly once', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 20 });
    const orderId = await placeCodOrder(user, product, 3);

    expect(await stockOf(product._id)).toBe(17);

    const result = await cancelOrder(user._id, orderId, ctx);
    expect(result).toMatchObject({ ok: true, refund: 'NONE' });

    expect(await stockOf(product._id)).toBe(20);

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.orderStatus).toBe('CANCELLED');
    expect(order?.stockCommitted).toBe(false);
    expect(order?.statusHistory.at(-1)).toMatchObject({
      status: 'CANCELLED',
      note: 'Cancelled by customer',
    });

    // The second cancel must not restock again.
    const again = await cancelOrder(user._id, orderId, ctx);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('NOT_CANCELLABLE');
    expect(await stockOf(product._id)).toBe(20);
  });

  it("refuses to cancel someone else's order, indistinguishably from a missing one", async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    const product = await makeProduct();
    const orderId = await placeCodOrder(owner, product, 2);

    const result = await cancelOrder(attacker._id, orderId, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');

    // Same shape as a genuinely nonexistent id.
    const missing = await cancelOrder(attacker._id, new ObjectId().toHexString(), ctx);
    expect(missing).toEqual(result);

    // Nothing moved: the order is intact and the stock still reserved.
    expect(await stockOf(product._id)).toBe(18);
    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.orderStatus).toBe('CONFIRMED');
  });

  it('refuses once the order has shipped', async () => {
    const user = await makeUser();
    const product = await makeProduct();
    const orderId = await placeCodOrder(user, product);

    const orders = await ordersCollection();
    await orders.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { orderStatus: 'SHIPPED' } },
    );

    const result = await cancelOrder(user._id, orderId, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_CANCELLABLE');
    expect(await stockOf(product._id)).toBe(19);
  });

  it('refunds a paid order through the provider and marks it REFUNDED', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 5 });

    await addToCart({ userId: user._id }, product._id.toHexString(), 1);
    const placed = await placeOrder(
      user._id,
      { newAddress: BASE_ADDRESS, paymentMethod: 'CARD', idempotencyKey: key() },
      ctx,
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const paid = await processMockCardPayment(
      user._id,
      placed.orderId,
      MOCK_TEST_CARDS.success,
      ctx,
    );
    expect(paid).toMatchObject({ ok: true, status: 'PAID' });

    const result = await cancelOrder(user._id, placed.orderId, ctx);
    expect(result).toMatchObject({ ok: true, refund: 'REFUNDED' });

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(placed.orderId) });
    expect(order?.paymentStatus).toBe('REFUNDED');
    expect(order?.orderStatus).toBe('CANCELLED');
    expect(await stockOf(product._id)).toBe(5);
  });

  it('a payment settling after cancellation cannot resurrect the order', async () => {
    const user = await makeUser();
    const product = await makeProduct();

    await addToCart({ userId: user._id }, product._id.toHexString(), 1);
    const placed = await placeOrder(
      user._id,
      { newAddress: BASE_ADDRESS, paymentMethod: 'CARD', idempotencyKey: key() },
      ctx,
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    // Intent exists, but the customer cancels before paying...
    const intent = await ensurePaymentIntent(user._id, placed.orderId);
    expect(intent.ok).toBe(true);
    if (!intent.ok || !intent.intentId) return;

    const cancelled = await cancelOrder(user._id, placed.orderId, ctx);
    expect(cancelled.ok).toBe(true);

    // ...and the provider's success webhook arrives late.
    const late = await recordPaymentResult(
      { intentId: intent.intentId, outcome: 'succeeded', amount: intent.total },
      { ip: ctx.ip, via: 'webhook' },
    );

    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.code).toBe('NOT_PAYABLE');

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(placed.orderId) });
    expect(order?.orderStatus).toBe('CANCELLED');
    expect(order?.paymentStatus).not.toBe('PAID');
  });
});

// ------------------------------------------------------------------- reading

describe('reading orders', () => {
  it("lists only the caller's orders, newest first, with working pagination", async () => {
    const user = await makeUser();
    const stranger = await makeUser();
    const product = await makeProduct({ stock: 100 });

    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.push(await placeCodOrder(user, product));
    }
    await placeCodOrder(stranger, product);

    const history = await listOrdersForUser(user._id, 1);
    expect(history.orders).toHaveLength(3);
    expect(history.hasMore).toBe(false);
    // Newest first: the last order placed leads the list.
    expect(history.orders[0]?.id).toBe(ids[2]);
    // Nothing that belongs to someone else.
    const own = new Set(ids);
    for (const order of history.orders) expect(own.has(order.id)).toBe(true);

    // An absurd page clamps rather than scanning the collection.
    const clamped = await listOrdersForUser(user._id, 99999999);
    expect(clamped.page).toBe(1);
  });

  it('order detail is ownership-filtered: foreign and malformed ids read as null', async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    const product = await makeProduct();
    const orderId = await placeCodOrder(owner, product);

    expect(await getOrderForUser(owner._id, orderId)).not.toBeNull();
    expect(await getOrderForUser(attacker._id, orderId)).toBeNull();
    expect(await getOrderForUser(attacker._id, 'not-an-object-id')).toBeNull();
  });
});

// -------------------------------------------------------------- address book

describe('the address book', () => {
  it('makes the first address the default and keeps exactly one default thereafter', async () => {
    const user = await makeUser();

    // First address: default regardless of the checkbox.
    await addAddress(user._id, { ...BASE_ADDRESS, isDefault: false });
    let addresses = await listAddresses(user._id);
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.isDefault).toBe(true);

    // Second address claiming default: takes it over, exactly one default.
    await addAddress(user._id, { ...BASE_ADDRESS, fullName: 'Second Entry', isDefault: true });
    addresses = await listAddresses(user._id);
    expect(addresses).toHaveLength(2);
    expect(addresses.filter((address) => address.isDefault)).toHaveLength(1);
    expect(addresses.find((address) => address.isDefault)?.fullName).toBe('Second Entry');

    // Explicitly setting the first one back.
    const first = addresses.find((address) => address.fullName === BASE_ADDRESS.fullName);
    expect(first).toBeDefined();
    if (!first) return;
    const set = await setDefaultAddress(user._id, first.id);
    expect(set.ok).toBe(true);
    addresses = await listAddresses(user._id);
    expect(addresses.filter((address) => address.isDefault)).toHaveLength(1);
    expect(addresses.find((address) => address.isDefault)?.id).toBe(first.id);

    // An unknown id changes nothing -- including the current default.
    const bogus = await setDefaultAddress(user._id, new ObjectId().toHexString());
    expect(bogus.ok).toBe(false);
    addresses = await listAddresses(user._id);
    expect(addresses.find((address) => address.isDefault)?.id).toBe(first.id);
  });

  it('promotes the oldest remaining address when the default is deleted', async () => {
    const user = await makeUser();
    await addAddress(user._id, { ...BASE_ADDRESS, fullName: 'Keep Me', isDefault: false });
    await addAddress(user._id, { ...BASE_ADDRESS, fullName: 'Delete Me', isDefault: true });

    const addresses = await listAddresses(user._id);
    const doomed = addresses.find((address) => address.fullName === 'Delete Me');
    expect(doomed?.isDefault).toBe(true);
    if (!doomed) return;

    const result = await deleteAddress(user._id, doomed.id);
    expect(result.ok).toBe(true);

    const remaining = await listAddresses(user._id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.fullName).toBe('Keep Me');
    expect(remaining[0]?.isDefault).toBe(true);
  });

  it('caps the book at the maximum and rejects the overflow', async () => {
    const user = await makeUser();

    for (let i = 0; i < MAX_ADDRESSES; i += 1) {
      const result = await addAddress(user._id, { ...BASE_ADDRESS, fullName: `Entry ${i}` });
      expect(result.ok).toBe(true);
    }

    const overflow = await addAddress(user._id, { ...BASE_ADDRESS, fullName: 'One Too Many' });
    expect(overflow.ok).toBe(false);
    expect(await listAddresses(user._id)).toHaveLength(MAX_ADDRESSES);
  });

  it("edits stay inside the caller's own book", async () => {
    const owner = await makeUser();
    const attacker = await makeUser();
    await addAddress(owner._id, BASE_ADDRESS);
    const [address] = await listAddresses(owner._id);
    expect(address).toBeDefined();
    if (!address) return;

    // The attacker "knows" the owner's address id; it selects nothing in
    // *their* document.
    const foreignEdit = await updateAddress(attacker._id, address.id, {
      ...BASE_ADDRESS,
      fullName: 'Hijacked',
    });
    expect(foreignEdit.ok).toBe(false);

    const foreignDelete = await deleteAddress(attacker._id, address.id);
    expect(foreignDelete.ok).toBe(false);

    // The owner's edit works and preserves the id and default flag.
    const ownEdit = await updateAddress(owner._id, address.id, {
      ...BASE_ADDRESS,
      fullName: 'Renamed Properly',
    });
    expect(ownEdit.ok).toBe(true);

    const [updated] = await listAddresses(owner._id);
    expect(updated?.fullName).toBe('Renamed Properly');
    expect(updated?.id).toBe(address.id);
    expect(updated?.isDefault).toBe(true);
  });
});

// ------------------------------------------------------------------- profile

describe('profile updates', () => {
  it('updates the display name and nothing else', async () => {
    const user = await makeUser();
    const result = await updateProfile(user._id, { name: 'Renamed User' });
    expect(result.ok).toBe(true);

    const users = await usersCollection();
    const doc = await users.findOne({ _id: user._id });
    expect(doc?.name).toBe('Renamed User');
    expect(doc?.email).toBe(user.email);
    expect(doc?.role).toBe('USER');
  });
});
