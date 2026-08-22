import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { productsCollection, usersCollection, walletEntriesCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { UserDoc } from '@/models/user';
import type { AddressInput } from '@/lib/validations/user';
import { addToCart } from '@/services/cart';
import { cashbackFor, CASHBACK_TIERS, nextTier } from '@/services/cashback';
import { placeOrder } from '@/services/checkout';
import { cancelOrder } from '@/services/orders';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Order cashback.
 *
 * The Now store draws these tiers as coins, so the thing worth testing is that
 * the coin and the ledger agree: an order that clears a threshold is actually
 * credited, one tier and not two, and a cancelled order gives it back.
 */

let counter = 0;
const ctx = { ip: '10.99.0.14' };

const ADDRESS: AddressInput = {
  fullName: 'Cashback Tester',
  phone: '9800000202',
  line1: '3 Coin Street',
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
    name: `Cashback Buyer ${counter}`,
    email: `cashback-${Date.now()}-${counter}@example.com`,
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

async function makeProduct(rupees: number): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Cashback Product ${counter}`,
    slug: `cashback-product-${Date.now()}-${counter}`,
    description: 'Created by the cashback test suite.',
    brand: 'Testco',
    category: 'grocery',
    subcategory: null,
    price: rupeesToPaise(rupees),
    discountPrice: null,
    discountPercentage: 0,
    images: ['/products/t-1.svg'],
    thumbnail: '/products/t-1.svg',
    stock: 40,
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

describe('cashback: the tier table', () => {
  it('pays nothing below the first threshold', () => {
    expect(cashbackFor(rupeesToPaise(498), false).reward).toBe(0);
    expect(cashbackFor(0, false).reward).toBe(0);
  });

  it('pays the tier an order clears, and only one', () => {
    expect(cashbackFor(rupeesToPaise(499), false).reward).toBe(rupeesToPaise(50));
    expect(cashbackFor(rupeesToPaise(898), false).reward).toBe(rupeesToPaise(50));
    // Not 50 + 100: the tiers do not stack.
    expect(cashbackFor(rupeesToPaise(899), false).reward).toBe(rupeesToPaise(100));
    expect(cashbackFor(rupeesToPaise(5000), false).reward).toBe(rupeesToPaise(100));
  });

  it('keeps the Prime tier away from everyone else', () => {
    const big = rupeesToPaise(1499);
    expect(cashbackFor(big, false).reward).toBe(rupeesToPaise(100));
    expect(cashbackFor(big, true).reward).toBe(rupeesToPaise(200));
  });

  it('names the next tier up, and stops at the top', () => {
    expect(nextTier(rupeesToPaise(100), false)?.tier.reward).toBe(rupeesToPaise(50));
    expect(nextTier(rupeesToPaise(100), false)?.shortfall).toBe(rupeesToPaise(399));
    expect(nextTier(rupeesToPaise(600), false)?.tier.reward).toBe(rupeesToPaise(100));
    expect(nextTier(rupeesToPaise(5000), false)).toBeNull();
    expect(nextTier(rupeesToPaise(5000), true)).toBeNull();
  });

  it('advertises tiers in ascending order, so the panel reads correctly', () => {
    const thresholds = CASHBACK_TIERS.map((tier) => tier.minOrder);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
  });
});

describe('cashback: crediting a real order', () => {
  it('credits the wallet when the order clears a tier', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const before = (await getWalletSummary(id)).balance;
    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    // ₹600 subtotal clears the ₹499 tier, so ₹50 lands in the wallet.
    expect((await getWalletSummary(id)).balance - before).toBe(rupeesToPaise(50));

    const entries = await walletEntriesCollection();
    const credited = await entries.findOne({ userId: user._id, type: 'CASHBACK' });
    expect(credited?.direction).toBe('CREDIT');
    expect(credited?.reference).toBe(`${result.orderNumber}-CB`);
  });

  it('credits nothing for a basket below the first tier', async () => {
    const user = await makeUser();
    const product = await makeProduct(100);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );

    const entries = await walletEntriesCollection();
    expect(await entries.countDocuments({ userId: user._id, type: 'CASHBACK' })).toBe(0);
  });

  it('credits once when the same submit is replayed', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const idempotencyKey = key();
    await placeOrder(user._id, { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey }, ctx);
    const afterFirst = (await getWalletSummary(id)).balance;
    await placeOrder(user._id, { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey }, ctx);

    expect((await getWalletSummary(id)).balance).toBe(afterFirst);
  });

  it('takes the cashback back when the order is cancelled', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const before = (await getWalletSummary(id)).balance;
    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');
    expect((await getWalletSummary(id)).balance).toBe(before + rupeesToPaise(50));

    await cancelOrder(user._id, result.orderId, ctx);

    expect((await getWalletSummary(id)).balance).toBe(before);

    const entries = await walletEntriesCollection();
    const reversal = await entries.findOne({
      userId: user._id,
      reference: `${result.orderNumber}-CBR`,
    });
    expect(reversal?.direction).toBe('DEBIT');
  });

  it('reverses once, however many times cancellation is attempted', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    await cancelOrder(user._id, result.orderId, ctx);
    const afterFirst = (await getWalletSummary(id)).balance;
    await cancelOrder(user._id, result.orderId, ctx);

    expect((await getWalletSummary(id)).balance).toBe(afterFirst);

    const entries = await walletEntriesCollection();
    expect(
      await entries.countDocuments({ userId: user._id, type: 'CASHBACK', direction: 'DEBIT' }),
    ).toBe(1);
  });

  it('leaves the wallet whole when a wallet-paid order is cancelled', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    const product = await makeProduct(600);
    await addToCart({ userId: user._id }, product._id.toHexString(), 1);

    const funded = (await getWalletSummary(id)).balance;
    const result = await placeOrder(
      user._id,
      { newAddress: ADDRESS, paymentMethod: 'WALLET', idempotencyKey: key() },
      ctx,
    );
    if (!result.ok) throw new Error('order refused');

    await cancelOrder(user._id, result.orderId, ctx);

    // Order refunded and cashback reversed: exactly back where it started.
    expect((await getWalletSummary(id)).balance).toBe(funded);
  });
});
