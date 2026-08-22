import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  ordersCollection,
  productsCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { UserDoc } from '@/models/user';
import type { AddressInput } from '@/lib/validations/user';
import { addToCart } from '@/services/cart';
import { cashbackFor } from '@/services/cashback';
import { placeOrder } from '@/services/checkout';
import { cancelOrder } from '@/services/orders';
import { ensurePaymentIntent } from '@/services/payment';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Paying for an order from the Amazon Pay balance.
 *
 * The point of this method is that the money and the order move together, so
 * the assertions are against the ledger and the order document rather than
 * against what `placeOrder` returned.
 */

let counter = 0;
const ctx = { ip: '10.99.0.13' };

const ADDRESS: AddressInput = {
  fullName: 'Wallet Tester',
  phone: '9800000200',
  line1: '9 Ledger Street',
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
    name: `Wallet Buyer ${counter}`,
    email: `wallet-buyer-${Date.now()}-${counter}@example.com`,
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

async function makeProduct(rupees: number, stock = 20): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Wallet Product ${counter}`,
    slug: `wallet-product-${Date.now()}-${counter}`,
    description: 'Created by the wallet-payment test suite.',
    brand: 'Testco',
    category: 'electronics',
    subcategory: null,
    price: rupeesToPaise(rupees),
    discountPrice: null,
    discountPercentage: 0,
    images: ['/products/t-1.svg'],
    thumbnail: '/products/t-1.svg',
    stock,
    rating: 0,
    reviewCount: 0,
    features: [],
    specifications: [],
    isFeatured: false,
    isPrime: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await products.insertOne(doc);
  return doc;
}

async function fundWallet(userId: string, rupees: number): Promise<void> {
  const topUp = await createTopUp(userId, rupeesToPaise(rupees));
  if (!topUp.ok) throw new Error('top-up refused');
  await completeTopUp(userId, topUp.entryId, MOCK_TEST_CARDS.success, {
    ip: ctx.ip,
    userAgent: 'vitest',
  });
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

describe('checkout: paying from the wallet', () => {
  it('debits exactly the order total and marks the order paid', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    const product = await makeProduct(500);
    await addToCart({ userId: user._id }, product._id.toHexString(), 2);

    const before = (await getWalletSummary(id)).balance;
    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(result.orderId) });
    if (!order) throw new Error('order not written');

    expect(order.paymentStatus).toBe('PAID');
    expect(order.orderStatus).toBe('CONFIRMED');
    expect(order.payment.provider).toBe('wallet');
    expect(order.payment.paidAt).not.toBeNull();

    // The order total leaves, and the cashback the same order earned comes
    // straight back -- both are wallet entries, so the net is what to assert.
    const { reward } = cashbackFor(order.total, false);
    expect(before - (await getWalletSummary(id)).balance).toBe(order.total - reward);
  });

  it('writes one ledger entry, referenced by the order number', async () => {
    const user = await makeUser();
    await fundWallet(user._id.toHexString(), 5000);
    const product = await makeProduct(300);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    const entries = await walletEntriesCollection();
    const debits = await entries.find({ userId: user._id, type: 'ORDER' }).toArray();

    expect(debits).toHaveLength(1);
    expect(debits[0]?.direction).toBe('DEBIT');
    expect(debits[0]?.status).toBe('COMPLETED');
    expect(debits[0]?.reference).toBe(result.orderNumber);
  });

  it('refuses when the balance cannot cover the total, and charges nothing', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 100);
    const product = await makeProduct(5000);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('INSUFFICIENT_BALANCE');
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(100));

    const orders = await ordersCollection();
    expect(await orders.countDocuments({ userId: user._id })).toBe(0);
  });

  it('leaves the stock alone when the balance is short', async () => {
    const user = await makeUser();
    await fundWallet(user._id.toHexString(), 100);
    const product = await makeProduct(5000, 7);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );

    // The abort must roll the decrement back with everything else.
    const products = await productsCollection();
    expect((await products.findOne({ _id: product._id }))?.stock).toBe(7);
  });

  it('keeps the cart when the balance is short, so the customer can top up', async () => {
    const user = await makeUser();
    await fundWallet(user._id.toHexString(), 100);
    const product = await makeProduct(5000);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );

    const { getCartView } = await import('@/services/cart');
    expect((await getCartView({ userId: user._id })).lines).toHaveLength(1);
  });

  it('charges once when the same submit is replayed', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    const product = await makeProduct(400);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const idempotencyKey = key();
    const first = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey },
      ctx,
    );
    const afterFirst = (await getWalletSummary(id)).balance;

    const second = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey },
      ctx,
    );

    expect(first.ok && second.ok).toBe(true);
    expect(second.ok === true && second.alreadyPlaced).toBe(true);
    expect((await getWalletSummary(id)).balance).toBe(afterFirst);
  });

  it('has no gateway step: the pay screen refuses a wallet order', async () => {
    const user = await makeUser();
    await fundWallet(user._id.toHexString(), 5000);
    const product = await makeProduct(400);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    const intent = await ensurePaymentIntent(user._id, result.orderId);
    // Already paid, so there is nothing to create -- and never an intent id.
    expect(intent.ok).toBe(true);
    expect(intent.ok === true && intent.status).toBe('ALREADY_PAID');
    expect(intent.intentId).toBeUndefined();
  });
});

describe('checkout: cancelling a wallet-paid order', () => {
  it('puts the money back and marks the order refunded', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 2);

    const funded = (await getWalletSummary(id)).balance;
    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    const cancelled = await cancelOrder(user._id, result.orderId, ctx);
    expect(cancelled.ok).toBe(true);
    expect(cancelled.ok === true && cancelled.refund).toBe('REFUNDED');

    expect((await getWalletSummary(id)).balance).toBe(funded);

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(result.orderId) });
    expect(order?.paymentStatus).toBe('REFUNDED');
    expect(order?.orderStatus).toBe('CANCELLED');
  });

  it('refunds once, however many times cancellation is attempted', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    await cancelOrder(user._id, result.orderId, ctx);
    const afterFirst = (await getWalletSummary(id)).balance;

    const second = await cancelOrder(user._id, result.orderId, ctx);

    expect(second.ok).toBe(false);
    expect((await getWalletSummary(id)).balance).toBe(afterFirst);

    const entries = await walletEntriesCollection();
    const refunds = await entries.find({ userId: user._id, type: 'REFUND' }).toArray();
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.reference).toBe(`${result.orderNumber}-R`);
  });

  it('does not refund a cash-on-delivery order, which was never charged', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    const cancelled = await cancelOrder(user._id, result.orderId, ctx);
    expect(cancelled.ok === true && cancelled.refund).toBe('NONE');

    // No refund is written, because nothing was charged. The cashback the
    // order earned is still taken back -- that is a separate credit, and it
    // belongs to an order that is no longer happening.
    const entries = await walletEntriesCollection();
    expect(await entries.countDocuments({ userId: user._id, type: 'REFUND' })).toBe(0);
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(5000));
  });
});
