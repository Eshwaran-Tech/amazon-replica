import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeMongoClient, getMongoClient } from '@/lib/db/client';
import { seedDatabase } from '@/lib/db/seed';
import { getDashboardMetrics } from '@/services/dashboard';

/**
 * The dashboard on a brand-new store.
 *
 * `pnpm seed` (no flags) creates the catalogue and the admin account and
 * nothing else. This suite seeds exactly that into a fresh database and checks
 * that every activity figure reads zero: no demo revenue, no demo orders, no
 * demo customers, no growth percentages conjured from nothing.
 */

const DB_NAME = `amazon_next_zero_${new ObjectId().toHexString().slice(-8)}`;

beforeAll(async () => {
  const client = await getMongoClient();
  const db = client.db(DB_NAME);
  const summary = await seedDatabase(db, {
    adminEmail: 'admin@example.com',
    adminPassword: 'TestSeedPassword2026!',
  });
  // The default seed is catalogue-only.
  expect(summary.products).toBeGreaterThan(0);
  expect(summary.categories).toBeGreaterThan(0);
  expect(summary.users).toBe(1); // the admin
  expect(summary.orders).toBe(0);
  expect(summary.reviews).toBe(0);
  expect(summary.customerEmails).toEqual([]);
}, 180_000);

afterAll(async () => {
  const client = await getMongoClient();
  await client.db(DB_NAME).dropDatabase();
  await closeMongoClient();
});

describe('dashboard on a store with no activity', () => {
  it.each([7, 30, 90])('reads zero everywhere for a %i-day window', async (days) => {
    const client = await getMongoClient();
    const m = await getDashboardMetrics(days, { db: client.db(DB_NAME) });

    expect(m.windowDays).toBe(days);

    // KPIs
    expect(m.revenue).toBe(0);
    expect(m.paidOrders).toBe(0);
    expect(m.totalOrders).toBe(0);
    expect(m.openOrders).toBe(0);
    expect(m.averageOrderValue).toBe(0);
    expect(m.customers).toBe(0);
    expect(m.registeredCustomers).toBe(0);
    expect(m.pendingOrders).toBe(0);

    // Growth: nothing now, nothing before -> 0%, never "new", never NaN.
    for (const delta of [m.revenueDelta, m.ordersDelta, m.averageOrderValueDelta, m.customersDelta]) {
      expect(delta).toEqual({ percent: 0, previous: 0 });
    }

    // Charts: one zero bucket per day, in order.
    expect(m.daily.length).toBeGreaterThanOrEqual(days);
    for (const point of m.daily) {
      expect(point.revenue).toBe(0);
      expect(point.orders).toBe(0);
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const dates = m.daily.map((point) => point.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);

    // Breakdowns and lists: empty, not fabricated.
    expect(m.ordersByStatus).toEqual([]);
    expect(m.salesByCategory).toEqual([]);
    expect(m.recentOrders).toEqual([]);
    expect(m.topProducts).toEqual([]);
    expect(m.paymentMethods).toEqual([]);
    expect(m.recentPaymentActivity).toEqual([]);
    expect(m.payments).toEqual({
      collected: 0,
      awaiting: 0,
      refunded: 0,
      codDue: 0,
      transactions: 0,
    });

    // The catalogue is real and present; it is not activity.
    expect(m.activeProducts).toBeGreaterThan(0);
  });
});
