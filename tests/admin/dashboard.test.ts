import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { ordersCollection, productsCollection, usersCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { UserDoc } from '@/models/user';
import type { AddressInput } from '@/lib/validations/user';
import { addToCart } from '@/services/cart';
import { placeOrder } from '@/services/checkout';
import { computeDelta, getDashboardMetrics } from '@/services/dashboard';
import { cancelOrder } from '@/services/orders';
import { processMockCardPayment } from '@/services/payment';
import { calculateTotals } from '@/services/pricing';

/**
 * The dashboard's numbers are derived, never typed in. This suite places a
 * real order and checks that every panel reflects it.
 *
 * The database is shared with suites running concurrently, so assertions come
 * in two strengths: **exact** where only this suite's order can move the
 * figure (a fresh product, a fresh category slug, a fresh buyer, and the
 * NETBANKING method no other suite uses), and **at least** for store-wide
 * totals another suite may also have grown in the same instant.
 */

let counter = 0;
const ctx = { ip: '10.99.0.6' };

const ADDRESS: AddressInput = {
  fullName: 'Dashboard Tester',
  phone: '9800000699',
  line1: '9 Metrics Lane',
  line2: '',
  city: 'Kolkata',
  state: 'West Bengal',
  postalCode: '700001',
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
    name: `Dashboard Buyer ${counter}`,
    email: `dashboard-${Date.now()}-${counter}@example.com`,
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

async function makeProduct(price: number, category: string): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;
  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Dashboard Product ${counter}`,
    slug: `dashboard-product-${Date.now()}-${counter}`,
    description: 'Created by the dashboard test suite.',
    brand: 'Testco',
    category,
    subcategory: null,
    price,
    discountPrice: null,
    discountPercentage: 0,
    images: ['/products/t-1.svg'],
    thumbnail: '/products/t-1.svg',
    stock: 50,
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

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('dashboard metrics', () => {
  it('every panel reflects a real paid order, and its refund', async () => {
    const before = await getDashboardMetrics(30);

    // A category slug nobody else writes to, so its revenue is exactly ours.
    const category = `dash-cat-${new ObjectId().toHexString()}`;
    const buyer = await makeUser();
    const product = await makeProduct(rupeesToPaise(2000), category);
    const quantity = 3;
    const productId = product._id.toHexString();

    await addToCart({ userId: buyer._id }, productId, quantity);
    const placed = await placeOrder(
      buyer._id,
      {
        newAddress: ADDRESS,
        paymentMethod: 'NETBANKING',
        idempotencyKey: `test${new ObjectId().toHexString()}`,
      },
      ctx,
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const expected = calculateTotals([
      { listPrice: product.price, unitPrice: product.price, quantity },
    ]);
    const lineTotal = product.price * quantity;

    // ---- unpaid: an order, but not revenue ---------------------------------
    const unpaid = await getDashboardMetrics(30);
    expect(unpaid.totalOrders - before.totalOrders).toBeGreaterThanOrEqual(1);
    expect(unpaid.pendingOrders - before.pendingOrders).toBeGreaterThanOrEqual(1);
    // Exact: nothing paid, so our product cannot appear in the paid-only panels.
    expect(unpaid.topProducts.some((row) => row.productId === productId)).toBe(false);
    expect(unpaid.salesByCategory.some((row) => row.slug === category)).toBe(false);
    // Exact: it is in the order list, attributed to the buyer, awaiting payment.
    expect(unpaid.recentOrders.find((row) => row.orderNumber === placed.orderNumber)).toMatchObject(
      {
        customerName: buyer.name,
        total: expected.total,
        orderStatus: 'PENDING',
      },
    );

    // ---- paid ----------------------------------------------------------------
    const paid = await processMockCardPayment(
      buyer._id,
      placed.orderId,
      MOCK_TEST_CARDS.success,
      ctx,
    );
    expect(paid).toMatchObject({ ok: true, status: 'PAID' });

    const after = await getDashboardMetrics(30);

    // Store-wide totals: grew by at least what our order accounts for.
    expect(after.revenue - before.revenue).toBeGreaterThanOrEqual(expected.total);
    expect(after.paidOrders - before.paidOrders).toBeGreaterThanOrEqual(1);
    expect(after.customers - before.customers).toBeGreaterThanOrEqual(1);
    expect(after.payments.collected - before.payments.collected).toBeGreaterThanOrEqual(
      expected.total,
    );
    expect(after.payments.transactions - before.payments.transactions).toBeGreaterThanOrEqual(1);
    const sumRevenue = (points: typeof after.daily) =>
      points.reduce((sum, p) => sum + p.revenue, 0);
    expect(sumRevenue(after.daily) - sumRevenue(before.daily)).toBeGreaterThanOrEqual(
      expected.total,
    );
    expect(after.daily.length).toBeGreaterThanOrEqual(30);
    // The daily series and the KPI are the same money, bucketed.
    expect(sumRevenue(after.daily)).toBe(after.revenue);

    // Top products is a top-5 by units. Either our product is listed with
    // exactly our units and line total, or every product that *is* listed
    // outsold it -- there is no third possibility.
    const topRow = after.topProducts.find((row) => row.productId === productId);
    if (topRow) {
      expect(topRow).toMatchObject({ name: product.name, units: quantity, revenue: lineTotal });
    } else {
      expect(after.topProducts).toHaveLength(5);
      for (const row of after.topProducts) expect(row.units).toBeGreaterThanOrEqual(quantity);
    }

    // Same rule for the top-8 category ranking: our private category carries
    // exactly our line total, or was outranked by categories that earned more.
    const categoryRow = after.salesByCategory.find((row) => row.slug === category);
    if (categoryRow) {
      expect(categoryRow.revenue).toBe(lineTotal);
    } else {
      expect(after.salesByCategory).toHaveLength(8);
      for (const row of after.salesByCategory)
        expect(row.revenue).toBeGreaterThanOrEqual(lineTotal);
    }

    // Exact: NETBANKING revenue grew by exactly our order total (no other suite
    // pays by net banking).
    const netbanking = (metrics: typeof after) =>
      metrics.paymentMethods.find((row) => row.method === 'NETBANKING')?.revenue ?? 0;
    expect(netbanking(after) - netbanking(before)).toBe(expected.total);

    // Exact: the order row flipped to CONFIRMED.
    expect(after.recentOrders.find((row) => row.orderNumber === placed.orderNumber)).toMatchObject({
      customerName: buyer.name,
      orderStatus: 'CONFIRMED',
    });

    // Exact: the buyer's activity card shows the payment received.
    const activity = after.recentPaymentActivity.find(
      (group) => group.userId === buyer._id.toHexString(),
    );
    expect(activity).toBeDefined();
    expect(
      activity?.events.some((event) => event.kind === 'paid' && event.amount === expected.total),
    ).toBe(true);
    expect(activity?.total).toBe(expected.total);

    // ---- cancelled with refund -----------------------------------------------
    const cancelled = await cancelOrder(buyer._id, placed.orderId, ctx);
    expect(cancelled).toMatchObject({ ok: true, refund: 'REFUNDED' });

    const refunded = await getDashboardMetrics(30);
    // Exact: refunded money is no longer revenue, so the paid-only panels drop it.
    expect(refunded.topProducts.some((row) => row.productId === productId)).toBe(false);
    expect(refunded.salesByCategory.some((row) => row.slug === category)).toBe(false);
    expect(netbanking(refunded)).toBe(netbanking(before));
    // Store-wide: refunded grew by at least our total.
    expect(refunded.payments.refunded - before.payments.refunded).toBeGreaterThanOrEqual(
      expected.total,
    );
    // Exact: the buyer's card nets to zero -- paid, then refunded.
    const activityAfter = refunded.recentPaymentActivity.find(
      (group) => group.userId === buyer._id.toHexString(),
    );
    expect(activityAfter?.events.some((event) => event.kind === 'refunded')).toBe(true);
    expect(activityAfter?.total).toBe(0);
  });

  it('previous-period growth: exact maths, "new" without a baseline, 0% when both are empty', () => {
    expect(computeDelta(150, 100)).toEqual({ percent: 50, previous: 100 });
    expect(computeDelta(50, 100)).toEqual({ percent: -50, previous: 100 });
    expect(computeDelta(100, 100)).toEqual({ percent: 0, previous: 100 });
    expect(computeDelta(1234, 0)).toEqual({ percent: null, previous: 0 }); // "new"
    expect(computeDelta(0, 0)).toEqual({ percent: 0, previous: 0 }); // nothing either side
    expect(computeDelta(0, 80)).toEqual({ percent: -100, previous: 80 });
  });

  it('a window carries one bucket per store-local day, in order, and the series sums to the KPIs', async () => {
    const metrics = await getDashboardMetrics(7);
    expect(metrics.windowDays).toBe(7);
    // 7 days yields 7 or 8 buckets depending on where "now" falls in the day.
    expect(metrics.daily.length).toBeGreaterThanOrEqual(7);
    expect(metrics.daily.length).toBeLessThanOrEqual(9);
    const dates = metrics.daily.map((point) => point.date);
    expect([...dates].sort()).toEqual(dates);
    // The chart and the KPI are the same numbers, bucketed.
    expect(metrics.daily.reduce((sum, p) => sum + p.revenue, 0)).toBe(metrics.revenue);
    expect(metrics.daily.reduce((sum, p) => sum + p.orders, 0)).toBe(metrics.totalOrders);
    // Nothing is negative, ever.
    for (const value of [
      metrics.revenue,
      metrics.averageOrderValue,
      metrics.customers,
      metrics.totalOrders,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('revenue is dated by when it was paid, not when the order was placed', async () => {
    // An order placed 40 days ago but paid today belongs to today's revenue
    // and to the 30-day window -- and NOT to the 30-day order count.
    const buyer = await makeUser();
    const product = await makeProduct(
      rupeesToPaise(1000),
      `dash-late-${new ObjectId().toHexString()}`,
    );
    await addToCart({ userId: buyer._id }, product._id.toHexString(), 1);
    const placed = await placeOrder(
      buyer._id,
      {
        newAddress: ADDRESS,
        paymentMethod: 'UPI',
        idempotencyKey: `test${new ObjectId().toHexString()}`,
      },
      ctx,
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const orders = await ordersCollection();
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await orders.updateOne(
      { _id: new ObjectId(placed.orderId) },
      { $set: { createdAt: fortyDaysAgo } },
    );

    const before = await getDashboardMetrics(30);
    const paid = await processMockCardPayment(
      buyer._id,
      placed.orderId,
      MOCK_TEST_CARDS.success,
      ctx,
    );
    expect(paid).toMatchObject({ ok: true, status: 'PAID' });
    const after = await getDashboardMetrics(30);

    const expected = calculateTotals([
      { listPrice: product.price, unitPrice: product.price, quantity: 1 },
    ]);
    // Revenue moved into the window (paidAt is now); the order itself did not
    // (createdAt is 40 days ago) -- unique buyers in-window therefore also
    // excludes this buyer.
    expect(after.revenue - before.revenue).toBeGreaterThanOrEqual(expected.total);
    const upi = (metrics: typeof after) =>
      metrics.paymentMethods.find((row) => row.method === 'UPI')?.revenue ?? 0;
    expect(upi(after) - upi(before)).toBe(expected.total);
    const today = after.daily[after.daily.length - 1];
    const todayBefore = before.daily[before.daily.length - 1];
    expect((today?.revenue ?? 0) - (todayBefore?.revenue ?? 0)).toBeGreaterThanOrEqual(
      expected.total,
    );
    // ...and the order itself stays outside the 30-day count, because that is
    // dated by createdAt.
    expect(after.totalOrders - before.totalOrders).toBe(0);

    // "Recent orders" is by placement date, so the backdated order can only
    // appear once everything newer has been listed. Asserting it is absent
    // outright would only hold in a database that happens to have six newer
    // orders in it, which is a property of the fixture, not of the code.
    const dates = after.recentOrders.map((row) => new Date(row.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});
