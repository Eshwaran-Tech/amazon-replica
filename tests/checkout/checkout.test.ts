import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  cartsCollection,
  ordersCollection,
  productsCollection,
  usersCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import {
  MOCK_TEST_CARDS,
  parseMockWebhookWithSecret,
  signMockWebhook,
} from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { UserDoc } from '@/models/user';
import { addToCart } from '@/services/cart';
import { placeOrder } from '@/services/checkout';
import {
  ensurePaymentIntent,
  processMockCardPayment,
  recordPaymentResult,
} from '@/services/payment';
import { calculateTotals } from '@/services/pricing';
import type { AddressInput } from '@/lib/validations/user';

/**
 * Phase 8 verification: the checkout's money and concurrency guarantees, and
 * the two §71 scenarios -- client-supplied prices are ignored, and the last
 * unit of stock goes to exactly one of two racing buyers.
 */

let counter = 0;
const ctx = { ip: '10.99.0.1' };

const NEW_ADDRESS: AddressInput = {
  fullName: 'Checkout Tester',
  phone: '9800000199',
  line1: '42 Test Lane',
  line2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
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
    name: `Checkout User ${counter}`,
    email: `checkout-${Date.now()}-${counter}@example.com`,
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
    name: `Checkout Product ${counter}`,
    slug: `checkout-product-${Date.now()}-${counter}`,
    description: 'Created by the checkout test suite.',
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

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('placing an order', () => {
  it('snapshots items and computes totals from the live catalogue', async () => {
    const user = await makeUser();
    const product = await makeProduct({
      price: rupeesToPaise(1000),
      discountPrice: rupeesToPaise(750),
      discountPercentage: 25,
    });

    await addToCart({ userId: user._id }, product._id.toHexString(), 2);

    const result = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(result.orderId) });

    expect(order?.items[0]?.unitPrice).toBe(rupeesToPaise(750));
    expect(order?.items[0]?.listPrice).toBe(rupeesToPaise(1000));

    const expected = calculateTotals([
      { listPrice: rupeesToPaise(1000), unitPrice: rupeesToPaise(750), quantity: 2 },
    ]);
    expect(order?.subtotal).toBe(expected.subtotal);
    expect(order?.discount).toBe(expected.discount);
    expect(order?.tax).toBe(expected.tax);
    expect(order?.total).toBe(expected.total);
    expect(order?.orderNumber).toMatch(/^NK-[0-9A-F]{8}$/);
    expect(order?.stockCommitted).toBe(true);
  });

  it('decrements stock and clears the cart atomically with the order', async () => {
    const user = await makeUser();
    const product = await makeProduct({ stock: 10 });

    await addToCart({ userId: user._id }, product._id.toHexString(), 3);
    const result = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    expect(result.ok).toBe(true);

    const products = await productsCollection();
    expect((await products.findOne({ _id: product._id }))?.stock).toBe(7);

    const carts = await cartsCollection();
    expect((await carts.findOne({ userId: user._id }))?.items).toHaveLength(0);
  });

  it('§71: a client-supplied price cannot reach the order', async () => {
    // The schema rejects price fields outright (proven in the validation
    // suite). This proves the deeper property: even the *cart page the user
    // saw* has no authority. The price changes between viewing and placing --
    // the order uses the price at placement, read inside the transaction.
    const user = await makeUser();
    const product = await makeProduct({ price: rupeesToPaise(50_000) });

    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    // "Client saw ₹50,000"; the shop then reprices to ₹60,000.
    const products = await productsCollection();
    await products.updateOne({ _id: product._id }, { $set: { price: rupeesToPaise(60_000) } });

    const result = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(result.orderId) });
    expect(order?.items[0]?.unitPrice).toBe(rupeesToPaise(60_000));
  });

  it('§26: two buyers race the last unit -- exactly one succeeds', async () => {
    const product = await makeProduct({ stock: 1 });
    const [alice, bob] = await Promise.all([makeUser(), makeUser()]);

    await addToCart({ userId: alice._id }, product._id.toHexString(), 1);
    await addToCart({ userId: bob._id }, product._id.toHexString(), 1);

    const [a, b] = await Promise.all([
      placeOrder(alice._id, { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() }, ctx),
      placeOrder(bob._id, { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() }, ctx),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);

    const products = await productsCollection();
    const after = await products.findOne({ _id: product._id });
    // Never negative, never double-sold.
    expect(after?.stock).toBe(0);
  });

  it('rolls back every decrement when any line is short (all-or-nothing)', async () => {
    const user = await makeUser();
    const plenty = await makeProduct({ stock: 10 });
    const scarce = await makeProduct({ stock: 1 });

    await addToCart({ userId: user._id }, plenty._id.toHexString(), 2);
    await addToCart({ userId: user._id }, scarce._id.toHexString(), 1);

    // Someone else takes the scarce unit first.
    const products = await productsCollection();
    await products.updateOne({ _id: scarce._id }, { $set: { stock: 0 } });

    const result = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INSUFFICIENT_STOCK');
    expect(result.shortages).toContain(scarce.name);

    // The abort rolled back the decrement on the plentiful item too.
    expect((await products.findOne({ _id: plenty._id }))?.stock).toBe(10);
    // And the cart survives for the customer to adjust.
    const carts = await cartsCollection();
    expect((await carts.findOne({ userId: user._id }))?.items).toHaveLength(2);
  });

  it('replays of the same idempotency key return the original order', async () => {
    const user = await makeUser();
    const product = await makeProduct();
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const sharedKey = key();
    const first = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: sharedKey },
      ctx,
    );
    const replay = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: sharedKey },
      ctx,
    );

    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(replay.orderId).toBe(first.orderId);
    expect(replay.alreadyPlaced).toBe(true);

    const orders = await ordersCollection();
    expect(await orders.countDocuments({ userId: user._id })).toBe(1);
  });

  it("rejects an address id from someone else's address book", async () => {
    const owner = await makeUser();
    const users = await usersCollection();
    const foreignAddressId = new ObjectId().toHexString();
    await users.updateOne(
      { _id: owner._id },
      { $push: { addresses: { ...NEW_ADDRESS, line2: undefined, id: foreignAddressId, isDefault: true } } },
    );

    const attacker = await makeUser();
    const product = await makeProduct();
    await addToCart({ userId: attacker._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      attacker._id,
      { addressId: foreignAddressId, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ADDRESS_NOT_FOUND');
  });

  it('order snapshots survive later catalogue edits', async () => {
    const user = await makeUser();
    const product = await makeProduct({ name: 'Original Name', price: rupeesToPaise(900) });
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const products = await productsCollection();
    await products.updateOne(
      { _id: product._id },
      { $set: { name: 'Renamed Later', price: rupeesToPaise(9) } },
    );

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(result.orderId) });
    // The invoice is history, not a live join.
    expect(order?.items[0]?.name).toBe('Original Name');
    expect(order?.items[0]?.unitPrice).toBe(rupeesToPaise(900));
  });
});

describe('payment', () => {
  async function placedOrder(method: 'CARD' | 'UPI' = 'CARD') {
    const user = await makeUser();
    const product = await makeProduct({ price: rupeesToPaise(1200) });
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);
    const result = await placeOrder(
      user._id,
      { newAddress: NEW_ADDRESS, paymentMethod: method, idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('setup order failed');
    return { user, orderId: result.orderId };
  }

  it('marks an order paid through the mock gateway success card', async () => {
    const { user, orderId } = await placedOrder();

    const result = await processMockCardPayment(user._id, orderId, MOCK_TEST_CARDS.success, ctx);
    expect(result.ok && result.status).toBe('PAID');

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.paymentStatus).toBe('PAID');
    expect(order?.orderStatus).toBe('CONFIRMED');
    expect(order?.payment.paidAt).toBeInstanceOf(Date);
  });

  it('records a decline and leaves the order payable', async () => {
    const { user, orderId } = await placedOrder();

    const result = await processMockCardPayment(user._id, orderId, MOCK_TEST_CARDS.declined, ctx);
    expect(result.ok && result.status).toBe('FAILED');

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.paymentStatus).toBe('PENDING');
    expect(order?.payment.failureReason).toBe('card_declined');
  });

  it('rejects unrecognised card numbers rather than defaulting to success', async () => {
    const { user, orderId } = await placedOrder();
    const result = await processMockCardPayment(user._id, orderId, '4111111111111111', ctx);
    expect(result.ok && result.status).toBe('FAILED');
  });

  it("cannot pay someone else's order", async () => {
    const { orderId } = await placedOrder();
    const stranger = await makeUser();

    const result = await processMockCardPayment(
      stranger._id,
      orderId,
      MOCK_TEST_CARDS.success,
      ctx,
    );
    // Safe 404: indistinguishable from a nonexistent order.
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('is idempotent: a duplicate success event changes nothing', async () => {
    const { user, orderId } = await placedOrder();
    const intent = await ensurePaymentIntent(user._id, orderId);
    if (!intent.ok || !intent.intentId) throw new Error('intent setup failed');

    const first = await recordPaymentResult(
      { intentId: intent.intentId, outcome: 'succeeded', amount: intent.total },
      { ip: ctx.ip, via: 'webhook' },
    );
    const second = await recordPaymentResult(
      { intentId: intent.intentId, outcome: 'succeeded', amount: intent.total },
      { ip: ctx.ip, via: 'webhook' },
    );

    expect(first.ok && first.status).toBe('PAID');
    expect(second.ok && second.status).toBe('ALREADY_PAID');

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    // Exactly one "Payment received" entry despite two deliveries.
    expect(order?.statusHistory.filter((h) => h.note === 'Payment received')).toHaveLength(1);
  });

  it('refuses to mark paid when the settled amount mismatches the order', async () => {
    const { user, orderId } = await placedOrder();
    const intent = await ensurePaymentIntent(user._id, orderId);
    if (!intent.ok || !intent.intentId || !intent.total) throw new Error('intent setup failed');

    const result = await recordPaymentResult(
      { intentId: intent.intentId, outcome: 'succeeded', amount: intent.total - 100 },
      { ip: ctx.ip, via: 'webhook' },
    );

    expect(result).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' });

    const orders = await ordersCollection();
    expect((await orders.findOne({ _id: new ObjectId(orderId) }))?.paymentStatus).toBe('PENDING');
  });
});

describe('webhook signature verification', () => {
  const secret = 'test-webhook-secret-value';

  function bodyFor(intentId: string, type = 'payment_intent.succeeded'): string {
    return JSON.stringify({ id: 'evt_1', type, data: { object: { id: intentId, amount: 1000 } } });
  }

  function headersWith(signature: string | null): Headers {
    const headers = new Headers();
    if (signature !== null) headers.set('x-webhook-signature', signature);
    return headers;
  }

  it('accepts a correctly signed body', () => {
    const body = bodyFor('mock_pi_x');
    const event = parseMockWebhookWithSecret(body, headersWith(signMockWebhook(body, secret)), secret);
    expect(event).toMatchObject({ intentId: 'mock_pi_x', outcome: 'succeeded', amount: 1000 });
  });

  it('rejects a tampered body, a wrong signature, and a missing header', () => {
    const body = bodyFor('mock_pi_x');
    const signature = signMockWebhook(body, secret);

    // Body altered after signing -- e.g. the amount inflated in transit.
    const tampered = body.replace('1000', '1');
    expect(parseMockWebhookWithSecret(tampered, headersWith(signature), secret)).toBeNull();
    expect(parseMockWebhookWithSecret(body, headersWith('deadbeef'), secret)).toBeNull();
    expect(parseMockWebhookWithSecret(body, headersWith(null), secret)).toBeNull();
  });

  it('treats an unconfigured secret as a closed surface, not an open one', () => {
    const body = bodyFor('mock_pi_x');
    expect(
      parseMockWebhookWithSecret(body, headersWith(signMockWebhook(body, 'anything')), ''),
    ).toBeNull();
  });
});
