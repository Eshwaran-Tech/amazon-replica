import { ObjectId, type Db } from 'mongodb';

import { getDb } from '@/lib/db/client';
import { COLLECTIONS } from '@/lib/db/collections';
import type { CategoryDoc } from '@/models/category';
import type { OrderDoc } from '@/models/order';
import { LOW_STOCK_THRESHOLD, type ProductDoc } from '@/models/product';
import type { AuditLogDoc } from '@/models/security';
import type { OrderStatus, PaymentMethod } from '@/models/types';
import type { UserDoc } from '@/models/user';

import '@/lib/server-guard';

/**
 * Admin dashboard metrics.
 *
 * Every number on the dashboard is computed here, from the live collections,
 * on every request -- nothing is hand-set, cached across requests, sampled or
 * estimated. With no orders in the database, every figure is zero.
 *
 * Definitions, so the numbers mean one thing:
 *
 *  - **Revenue** is the total of orders whose `paymentStatus` is PAID, dated
 *    by when the payment was *received* (`payment.paidAt`), not when the order
 *    was placed. An order placed on the 3rd and paid on the 5th is the 5th's
 *    revenue. A refunded order was paid once and is no longer revenue: it drops
 *    out the moment the refund is recorded.
 *  - **Orders** are dated by when they were placed (`createdAt`), whatever
 *    their status.
 *  - **Customers** is the number of distinct accounts that placed an order in
 *    the window -- unique buyers, not registrations.
 *  - **vs previous period** compares the chosen window with the window of
 *    equal length immediately before it. No baseline (previous = 0) shows as
 *    "new" when there is activity now, and as 0% when both are zero.
 *
 * Daily buckets use the store's timezone, not the server's: a store in India
 * reporting "orders per day" in UTC would split every evening's orders across
 * two days.
 */

const STORE_TIMEZONE = 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Delta {
  /**
   * Percentage change vs the previous window. `null` means "no baseline but
   * activity now" (rendered as "new"); 0 when both windows are empty.
   */
  percent: number | null;
  previous: number;
}

export interface DailyPoint {
  /** YYYY-MM-DD in the store timezone. */
  date: string;
  /** Paid revenue received that day, integer paise. */
  revenue: number;
  /** Orders placed that day. */
  orders: number;
}

export interface DashboardMetrics {
  windowDays: number;

  revenue: number;
  revenueDelta: Delta;
  paidOrders: number;

  totalOrders: number;
  ordersDelta: Delta;
  openOrders: number;

  averageOrderValue: number;
  averageOrderValueDelta: Delta;

  /** Distinct accounts that placed an order in the window. */
  customers: number;
  customersDelta: Delta;
  /** All registered customer accounts, for context. */
  registeredCustomers: number;

  daily: DailyPoint[];
  ordersByStatus: Array<{ status: OrderStatus; count: number }>;
  salesByCategory: Array<{ slug: string; name: string; revenue: number }>;

  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    total: number;
    orderStatus: OrderStatus;
    createdAt: string;
  }>;
  topProducts: Array<{
    productId: string;
    name: string;
    slug: string;
    thumbnail: string;
    units: number;
    revenue: number;
  }>;

  payments: {
    collected: number;
    awaiting: number;
    refunded: number;
    codDue: number;
    transactions: number;
  };
  paymentMethods: Array<{ method: PaymentMethod; revenue: number; count: number }>;
  recentPaymentActivity: Array<{
    userId: string;
    name: string;
    email: string;
    total: number;
    events: Array<{
      kind: 'paid' | 'failed' | 'refunded' | 'placed' | 'cancelled';
      label: string;
      orderNumber: string | null;
      amount: number | null;
      at: string;
    }>;
  }>;

  activeProducts: number;
  pendingOrders: number;
  lowStock: number;
}

/** Percentage change, with the two zero cases spelled out. */
export function computeDelta(current: number, previous: number): Delta {
  if (previous <= 0) {
    return { percent: current > 0 ? null : 0, previous: Math.max(0, previous) };
  }
  return { percent: Math.round(((current - previous) / previous) * 100), previous };
}

/** YYYY-MM-DD for `date` in the store timezone. */
function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Every day key from `since` to now, inclusive, oldest first. */
function dayKeys(since: Date, now: Date): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let t = since.getTime(); t <= now.getTime() + DAY_MS; t += DAY_MS) {
    const key = dayKey(new Date(Math.min(t, now.getTime())));
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

const ACTIVITY_LABELS = {
  'payment.succeeded': { kind: 'paid', label: 'Payment received' },
  'payment.failed': { kind: 'failed', label: 'Payment failed' },
  'payment.refunded': { kind: 'refunded', label: 'Refund issued' },
  'order.placed': { kind: 'placed', label: 'Order placed' },
  'order.cancelled': { kind: 'cancelled', label: 'Order cancelled' },
} as const;

type ActivityAction = keyof typeof ACTIVITY_LABELS;
const ACTIVITY_ACTIONS = Object.keys(ACTIVITY_LABELS) as ActivityAction[];

/** `payment.paidAt`, falling back to `createdAt` for any legacy paid order. */
const PAID_AT = { $ifNull: ['$payment.paidAt', '$createdAt'] };

export async function getDashboardMetrics(
  days: number,
  options: { db?: Db; now?: Date } = {},
): Promise<DashboardMetrics> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - days * DAY_MS);
  const previousSince = new Date(since.getTime() - days * DAY_MS);

  const db = options.db ?? (await getDb());
  const orders = db.collection<OrderDoc>(COLLECTIONS.orders);
  const products = db.collection<ProductDoc>(COLLECTIONS.products);
  const users = db.collection<UserDoc>(COLLECTIONS.users);
  const categories = db.collection<CategoryDoc>(COLLECTIONS.categories);
  const auditLogs = db.collection<AuditLogDoc>(COLLECTIONS.auditLogs);

  const period = (field: unknown) => ({
    $cond: [{ $gte: [field, since] }, 'current', 'previous'],
  });

  const [
    windowRows,
    dailyRows,
    statusRows,
    categoryRows,
    topProductRows,
    recentDocs,
    paymentRow,
    methodRows,
    activityDocs,
    registeredCustomers,
    activeProducts,
    pendingOrders,
    lowStock,
    openOrders,
  ] = await Promise.all([
    // Both windows, both clocks, one pass: orders by placement time,
    // revenue by payment time.
    orders
      .aggregate<{
        orders: Array<{ _id: string; count: number; buyers: number }>;
        revenue: Array<{ _id: string; revenue: number; count: number }>;
      }>([
        {
          $match: {
            $or: [
              { createdAt: { $gte: previousSince } },
              { 'payment.paidAt': { $gte: previousSince } },
            ],
          },
        },
        { $addFields: { paidTime: PAID_AT } },
        {
          $facet: {
            orders: [
              { $match: { createdAt: { $gte: previousSince } } },
              {
                $group: {
                  _id: period('$createdAt'),
                  count: { $sum: 1 },
                  buyers: { $addToSet: '$userId' },
                },
              },
              { $project: { count: 1, buyers: { $size: '$buyers' } } },
            ],
            revenue: [
              { $match: { paymentStatus: 'PAID', paidTime: { $gte: previousSince } } },
              {
                $group: {
                  _id: period('$paidTime'),
                  revenue: { $sum: '$total' },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ])
      .toArray(),

    // Daily buckets in the store timezone: orders by placement day, revenue
    // by payment day.
    orders
      .aggregate<{
        orders: Array<{ _id: string; count: number }>;
        revenue: Array<{ _id: string; revenue: number }>;
      }>([
        {
          $match: {
            $or: [{ createdAt: { $gte: since } }, { 'payment.paidAt': { $gte: since } }],
          },
        },
        { $addFields: { paidTime: PAID_AT } },
        {
          $facet: {
            orders: [
              { $match: { createdAt: { $gte: since } } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: STORE_TIMEZONE,
                    },
                  },
                  count: { $sum: 1 },
                },
              },
            ],
            revenue: [
              { $match: { paymentStatus: 'PAID', paidTime: { $gte: since } } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$paidTime',
                      timezone: STORE_TIMEZONE,
                    },
                  },
                  revenue: { $sum: '$total' },
                },
              },
            ],
          },
        },
      ])
      .toArray(),

    orders
      .aggregate<{ _id: OrderStatus; count: number }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),

    // Paid merchandise revenue by category: line items joined to the live
    // product's category, dated by payment time.
    orders
      .aggregate<{ _id: string; revenue: number }>([
        { $match: { paymentStatus: 'PAID' } },
        { $addFields: { paidTime: PAID_AT } },
        { $match: { paidTime: { $gte: since } } },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.productId',
            foreignField: '_id',
            as: 'product',
            pipeline: [{ $project: { category: 1 } }],
          },
        },
        { $unwind: '$product' },
        { $group: { _id: '$product.category', revenue: { $sum: '$items.lineTotal' } } },
        { $sort: { revenue: -1 } },
        { $limit: 8 },
      ])
      .toArray(),

    orders
      .aggregate<{
        _id: ObjectId;
        name: string;
        slug: string;
        thumbnail: string;
        units: number;
        revenue: number;
      }>([
        { $match: { paymentStatus: 'PAID' } },
        { $addFields: { paidTime: PAID_AT } },
        { $match: { paidTime: { $gte: since } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            slug: { $first: '$items.slug' },
            thumbnail: { $first: '$items.thumbnail' },
            units: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' },
          },
        },
        { $sort: { units: -1, revenue: -1 } },
        { $limit: 5 },
      ])
      .toArray(),

    orders
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(6)
      .project<{
        _id: ObjectId;
        orderNumber: string;
        userId: ObjectId;
        total: number;
        orderStatus: OrderStatus;
        createdAt: Date;
      }>({ orderNumber: 1, userId: 1, total: 1, orderStatus: 1, createdAt: 1 })
      .toArray(),

    // All-time money position, one pass.
    orders
      .aggregate<{
        collected: number;
        awaiting: number;
        refunded: number;
        codDue: number;
        transactions: number;
      }>([
        {
          $group: {
            _id: null,
            collected: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, '$total', 0] } },
            awaiting: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$paymentStatus', 'PENDING'] },
                      { $ne: ['$paymentMethod', 'COD'] },
                      { $ne: ['$orderStatus', 'CANCELLED'] },
                    ],
                  },
                  '$total',
                  0,
                ],
              },
            },
            refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'REFUNDED'] }, '$total', 0] } },
            codDue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$paymentStatus', 'PENDING'] },
                      { $eq: ['$paymentMethod', 'COD'] },
                      { $ne: ['$orderStatus', 'CANCELLED'] },
                    ],
                  },
                  '$total',
                  0,
                ],
              },
            },
            transactions: {
              $sum: { $cond: [{ $in: ['$paymentStatus', ['PAID', 'REFUNDED']] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),

    orders
      .aggregate<{ _id: PaymentMethod; revenue: number; count: number }>([
        { $match: { paymentStatus: 'PAID' } },
        { $addFields: { paidTime: PAID_AT } },
        { $match: { paidTime: { $gte: since } } },
        { $group: { _id: '$paymentMethod', revenue: { $sum: '$total' }, count: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
      ])
      .toArray(),

    auditLogs
      .find({ action: { $in: ACTIVITY_ACTIONS }, actorId: { $ne: null } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(40)
      .toArray(),

    users.countDocuments({ role: 'USER' }),
    products.countDocuments({ isActive: true }),
    orders.countDocuments({ orderStatus: 'PENDING' }),
    products.countDocuments({ isActive: true, stock: { $lte: LOW_STOCK_THRESHOLD } }),
    orders.countDocuments({ orderStatus: { $in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } }),
  ]);

  // ---- windows ------------------------------------------------------------
  const facet = windowRows[0];
  const pick = <T extends { _id: string }>(rows: T[] | undefined, key: string) =>
    rows?.find((row) => row._id === key);

  const ordersNow = pick(facet?.orders, 'current');
  const ordersPrev = pick(facet?.orders, 'previous');
  const revenueNow = pick(facet?.revenue, 'current');
  const revenuePrev = pick(facet?.revenue, 'previous');

  const revenue = revenueNow?.revenue ?? 0;
  const paidOrders = revenueNow?.count ?? 0;
  const previousRevenue = revenuePrev?.revenue ?? 0;
  const previousPaid = revenuePrev?.count ?? 0;

  const totalOrders = ordersNow?.count ?? 0;
  const previousOrders = ordersPrev?.count ?? 0;
  const customers = ordersNow?.buyers ?? 0;
  const previousCustomers = ordersPrev?.buyers ?? 0;

  const averageOrderValue = paidOrders > 0 ? Math.round(revenue / paidOrders) : 0;
  const previousAov = previousPaid > 0 ? Math.round(previousRevenue / previousPaid) : 0;

  // ---- daily series, zero-filled ------------------------------------------
  const dailyFacet = dailyRows[0];
  const ordersByDay = new Map((dailyFacet?.orders ?? []).map((row) => [row._id, row.count]));
  const revenueByDay = new Map((dailyFacet?.revenue ?? []).map((row) => [row._id, row.revenue]));
  const daily: DailyPoint[] = dayKeys(since, now).map((date) => ({
    date,
    revenue: revenueByDay.get(date) ?? 0,
    orders: ordersByDay.get(date) ?? 0,
  }));

  // ---- categories: slug -> display name -----------------------------------
  const categoryDocs =
    categoryRows.length > 0
      ? await categories
          .find({ slug: { $in: categoryRows.map((row) => row._id) } })
          .project<{ slug: string; name: string }>({ slug: 1, name: 1 })
          .toArray()
      : [];
  const categoryName = new Map(categoryDocs.map((doc) => [doc.slug, doc.name]));

  // ---- names for recent orders and activity --------------------------------
  const activityActorIds = activityDocs
    .map((doc) => doc.actorId)
    .filter((id): id is ObjectId => id instanceof ObjectId);
  const nameIds = [...recentDocs.map((doc) => doc.userId), ...activityActorIds];
  const nameDocs =
    nameIds.length > 0
      ? await users
          .find({ _id: { $in: nameIds } })
          .project<{ _id: ObjectId; name: string; email: string }>({ name: 1, email: 1 })
          .toArray()
      : [];
  const userById = new Map(nameDocs.map((doc) => [doc._id.toHexString(), doc]));

  // ---- recent payment activity, grouped by actor ----------------------------
  const activityByUser = new Map<string, DashboardMetrics['recentPaymentActivity'][number]>();
  for (const doc of activityDocs) {
    if (!(doc.actorId instanceof ObjectId)) continue;
    const key = doc.actorId.toHexString();
    const user = userById.get(key);
    if (!user) continue;

    const spec = ACTIVITY_LABELS[doc.action as ActivityAction];
    if (!spec) continue;

    const metadata = doc.metadata ?? {};
    const rawAmount = metadata.amount ?? metadata.total;
    const amount = typeof rawAmount === 'number' ? rawAmount : null;

    let entry = activityByUser.get(key);
    if (!entry) {
      if (activityByUser.size >= 3) continue;
      entry = { userId: key, name: user.name, email: user.email, total: 0, events: [] };
      activityByUser.set(key, entry);
    }
    if (entry.events.length >= 4) continue;

    entry.events.push({
      kind: spec.kind,
      label: spec.label,
      orderNumber: typeof metadata.orderNumber === 'string' ? metadata.orderNumber : null,
      amount,
      at: doc.createdAt.toISOString(),
    });
    if (spec.kind === 'paid' && amount) entry.total += amount;
    if (spec.kind === 'refunded' && amount) entry.total -= amount;
  }

  const paymentTotals = paymentRow[0];

  return {
    windowDays: days,

    revenue,
    revenueDelta: computeDelta(revenue, previousRevenue),
    paidOrders,

    totalOrders,
    ordersDelta: computeDelta(totalOrders, previousOrders),
    openOrders,

    averageOrderValue,
    averageOrderValueDelta: computeDelta(averageOrderValue, previousAov),

    customers,
    customersDelta: computeDelta(customers, previousCustomers),
    registeredCustomers,

    daily,
    ordersByStatus: statusRows.map((row) => ({ status: row._id, count: row.count })),
    salesByCategory: categoryRows.map((row) => ({
      slug: row._id,
      name: categoryName.get(row._id) ?? row._id,
      revenue: row.revenue,
    })),

    recentOrders: recentDocs.map((doc) => ({
      id: doc._id.toHexString(),
      orderNumber: doc.orderNumber,
      customerName: userById.get(doc.userId.toHexString())?.name ?? 'Deleted account',
      total: doc.total,
      orderStatus: doc.orderStatus,
      createdAt: doc.createdAt.toISOString(),
    })),
    topProducts: topProductRows.map((row) => ({
      productId: row._id.toHexString(),
      name: row.name,
      slug: row.slug,
      thumbnail: row.thumbnail,
      units: row.units,
      revenue: row.revenue,
    })),

    payments: {
      collected: paymentTotals?.collected ?? 0,
      awaiting: paymentTotals?.awaiting ?? 0,
      refunded: paymentTotals?.refunded ?? 0,
      codDue: paymentTotals?.codDue ?? 0,
      transactions: paymentTotals?.transactions ?? 0,
    },
    paymentMethods: methodRows.map((row) => ({
      method: row._id,
      revenue: row.revenue,
      count: row.count,
    })),
    recentPaymentActivity: [...activityByUser.values()],

    activeProducts,
    pendingOrders,
    lowStock,
  };
}
