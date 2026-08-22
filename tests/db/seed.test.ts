import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeMongoClient, getMongoClient, isLoopbackUri } from '@/lib/db/client';
import { seedDatabase, type SeedSummary } from '@/lib/db/seed';
import { INDEX_DEFINITIONS } from '@/lib/db/indexes';
import { calculateTotals } from '@/services/pricing';
import { isValidSlug } from '@/lib/utils/slug';
import { MAX_PAISE } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { OrderDoc } from '@/models/order';
import type { ReviewDoc } from '@/models/review';
import type { UserDoc } from '@/models/user';
import type { CategoryDoc } from '@/models/category';

/**
 * Phase 2 verification.
 *
 * These are integrity assertions, not smoke tests: they check the invariants
 * the rest of the application is entitled to assume -- that money is always an
 * integer, that every order total equals what the pricing engine would compute,
 * that no review exists without a delivered order behind it, and that the
 * unique indexes actually reject duplicates.
 */

let summary: SeedSummary;

/**
 * Its own database, not the shared one.
 *
 * This suite asserts on the whole contents of a seeded database -- "exactly one
 * admin", "every password is bcrypt" -- which is only meaningful if the seed
 * put everything there. It used to get that for free because the seed emptied
 * `users` on the way in, taking other suites' fixtures with it; the seed
 * deliberately no longer does that, so the isolation has to be explicit.
 */
const DB_NAME = `amazon_next_seed_${new ObjectId().toHexString().slice(-8)}`;

async function scopedDb() {
  return (await getMongoClient()).db(DB_NAME);
}

beforeAll(async () => {
  const db = await scopedDb();
  // This suite verifies the *demo* fixture end to end (orders, reviews, and
  // the invariants between them), so it opts in explicitly.
  summary = await seedDatabase(db, {
    adminEmail: 'admin@example.com',
    adminPassword: 'TestSeedPassword2026!',
    demo: true,
  });
}, 180_000);

afterAll(async () => {
  await (await getMongoClient()).db(DB_NAME).dropDatabase();
  await closeMongoClient();
});

describe('seed: shape', () => {
  it('creates the full catalogue', () => {
    expect(summary.categories).toBe(53); // 12 top-level + 41 subcategories
    expect(summary.products).toBe(1200); // 100 in each of the 12 categories
    expect(summary.users).toBeGreaterThanOrEqual(4);
    expect(summary.orders).toBeGreaterThan(0);
    expect(summary.reviews).toBeGreaterThan(0);
  });

  it('gives most products review coverage, so the storefront is not empty', async () => {
    const db = await scopedDb();
    const rated = await db
      .collection<ProductDoc>('products')
      .countDocuments({ reviewCount: { $gt: 0 } });
    expect(rated).toBeGreaterThanOrEqual(20);
  });
});

describe('seed: money is always integer paise', () => {
  it('stores no fractional or negative product prices', async () => {
    const db = await scopedDb();
    const products = await db.collection<ProductDoc>('products').find({}).toArray();

    for (const product of products) {
      expect(Number.isSafeInteger(product.price), `${product.slug} price`).toBe(true);
      expect(product.price).toBeGreaterThan(0);
      expect(product.price).toBeLessThanOrEqual(MAX_PAISE);

      if (product.discountPrice !== null && product.discountPrice !== undefined) {
        expect(Number.isSafeInteger(product.discountPrice), `${product.slug} discount`).toBe(true);
        // A "discount" above list price would compute a negative saving.
        expect(product.discountPrice).toBeLessThan(product.price);
        expect(product.discountPrice).toBeGreaterThan(0);
      }
    }
  });

  it('stores no fractional amounts anywhere on an order', async () => {
    const db = await scopedDb();
    const orders = await db.collection<OrderDoc>('orders').find({}).toArray();

    for (const order of orders) {
      for (const field of ['subtotal', 'discount', 'shipping', 'tax', 'total'] as const) {
        expect(Number.isSafeInteger(order[field]), `${order.orderNumber}.${field}`).toBe(true);
        expect(order[field]).toBeGreaterThanOrEqual(0);
      }
      for (const item of order.items) {
        expect(Number.isSafeInteger(item.unitPrice)).toBe(true);
        expect(Number.isSafeInteger(item.lineTotal)).toBe(true);
        expect(item.lineTotal).toBe(item.unitPrice * item.quantity);
      }
    }
  });
});

describe('seed: order totals match the pricing authority', () => {
  it('recomputes every stored total identically', async () => {
    const db = await scopedDb();
    const orders = await db.collection<OrderDoc>('orders').find({}).toArray();
    expect(orders.length).toBeGreaterThan(0);

    for (const order of orders) {
      const recomputed = calculateTotals(
        order.items.map((item) => ({
          listPrice: item.listPrice,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
      );

      expect(order.subtotal, `${order.orderNumber} subtotal`).toBe(recomputed.subtotal);
      expect(order.discount, `${order.orderNumber} discount`).toBe(recomputed.discount);
      expect(order.shipping, `${order.orderNumber} shipping`).toBe(recomputed.shipping);
      expect(order.tax, `${order.orderNumber} tax`).toBe(recomputed.tax);
      expect(order.total, `${order.orderNumber} total`).toBe(recomputed.total);
    }
  });

  it('keeps the total additively consistent with its parts', async () => {
    const db = await scopedDb();
    const orders = await db.collection<OrderDoc>('orders').find({}).toArray();

    for (const order of orders) {
      expect(order.total).toBe(order.subtotal - order.discount + order.shipping + order.tax);
    }
  });
});

describe('seed: referential integrity', () => {
  it('backs every review with a delivered order the reviewer placed', async () => {
    const db = await scopedDb();
    const reviews = await db.collection<ReviewDoc>('reviews').find({}).toArray();
    expect(reviews.length).toBeGreaterThan(0);

    for (const review of reviews) {
      const order = await db.collection<OrderDoc>('orders').findOne({ _id: review.orderId });

      expect(order, `review ${review._id.toHexString()} has no order`).not.toBeNull();
      expect(order?.userId.toHexString()).toBe(review.userId.toHexString());
      expect(order?.orderStatus).toBe('DELIVERED');
      expect(
        order?.items.some((item) => item.productId.equals(review.productId)),
        'reviewed product is not in the order',
      ).toBe(true);
    }
  });

  it('points every product at a category that exists', async () => {
    const db = await scopedDb();
    const categories = await db.collection<CategoryDoc>('categories').find({}).toArray();
    const slugs = new Set(categories.map((category) => category.slug));

    const products = await db.collection<ProductDoc>('products').find({}).toArray();
    for (const product of products) {
      expect(slugs.has(product.category), `${product.slug} -> ${product.category}`).toBe(true);
      if (product.subcategory) {
        expect(slugs.has(product.subcategory), `${product.slug} -> ${product.subcategory}`).toBe(
          true,
        );
      }
    }
  });

  it('derives rating aggregates from the reviews that actually exist', async () => {
    const db = await scopedDb();
    const products = await db
      .collection<ProductDoc>('products')
      .find({ reviewCount: { $gt: 0 } })
      .toArray();

    for (const product of products) {
      const reviews = await db
        .collection<ReviewDoc>('reviews')
        .find({ productId: product._id })
        .toArray();

      expect(product.reviewCount, `${product.slug} count`).toBe(reviews.length);

      const average = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      expect(product.rating, `${product.slug} rating`).toBe(Math.round(average * 10) / 10);
      expect(product.rating).toBeGreaterThanOrEqual(1);
      expect(product.rating).toBeLessThanOrEqual(5);
    }
  });

  it('ships an image file for every product image reference', async () => {
    const db = await scopedDb();
    const products = await db.collection<ProductDoc>('products').find({}).toArray();

    for (const product of products) {
      expect(product.images.length).toBeGreaterThan(0);
      for (const image of [...product.images, product.thumbnail]) {
        const path = join(process.cwd(), 'public', image.replace(/^\//, ''));
        expect(existsSync(path), `missing asset ${image}`).toBe(true);
      }
    }
  });

  it('uses URL-safe slugs everywhere', async () => {
    const db = await scopedDb();
    const products = await db.collection<ProductDoc>('products').find({}).toArray();
    for (const product of products) {
      expect(isValidSlug(product.slug), product.slug).toBe(true);
    }

    const categories = await db.collection<CategoryDoc>('categories').find({}).toArray();
    for (const category of categories) {
      expect(isValidSlug(category.slug), category.slug).toBe(true);
    }
  });
});

describe('seed: never stores a password in the clear', () => {
  it('hashes every password with bcrypt', async () => {
    const db = await scopedDb();
    const users = await db.collection<UserDoc>('users').find({}).toArray();
    expect(users.length).toBeGreaterThan(0);

    for (const user of users) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      // Cost factor must be at least 12.
      expect(Number(user.passwordHash.split('$')[2])).toBeGreaterThanOrEqual(12);
      expect(user.passwordHash).not.toContain('TestSeedPassword2026!');
      expect(user.passwordHash).not.toContain('Customer!Demo2026');
    }
  });

  it('creates exactly one admin', async () => {
    const db = await scopedDb();
    const admins = await db.collection<UserDoc>('users').find({ role: 'ADMIN' }).toArray();
    expect(admins).toHaveLength(1);
    expect(admins[0]?.email).toBe('admin@example.com');
  });
});

describe('indexes', () => {
  it('creates every declared index', async () => {
    const db = await scopedDb();

    const byCollection = new Map<string, Set<string>>();
    for (const definition of INDEX_DEFINITIONS) {
      const names = byCollection.get(definition.collection) ?? new Set<string>();
      const name = definition.options.name;
      if (name) names.add(name);
      byCollection.set(definition.collection, names);
    }

    for (const [collection, expectedNames] of byCollection) {
      const actual = await db.collection(collection).indexes();
      const actualNames = new Set(actual.map((index) => index.name));

      for (const name of expectedNames) {
        expect(actualNames.has(name), `${collection} missing index ${name}`).toBe(true);
      }
    }
  });

  it('enforces one account per email address', async () => {
    const db = await scopedDb();
    const existing = await db.collection<UserDoc>('users').findOne({ role: 'ADMIN' });
    expect(existing).not.toBeNull();

    // The database must reject this even though no application code is involved.
    await expect(db.collection('users').insertOne({ ...existing, _id: undefined })).rejects.toThrow(
      /duplicate key/i,
    );
  });

  it('enforces one review per user per product', async () => {
    const db = await scopedDb();
    const review = await db.collection<ReviewDoc>('reviews').findOne({});
    expect(review).not.toBeNull();

    await expect(db.collection('reviews').insertOne({ ...review, _id: undefined })).rejects.toThrow(
      /duplicate key/i,
    );
  });

  it('enforces unique order numbers', async () => {
    const db = await scopedDb();
    const order = await db.collection<OrderDoc>('orders').findOne({});
    expect(order).not.toBeNull();

    await expect(db.collection('orders').insertOne({ ...order, _id: undefined })).rejects.toThrow(
      /duplicate key/i,
    );
  });
});

describe('connection: TLS policy', () => {
  it('treats loopback hosts as not requiring TLS', () => {
    expect(isLoopbackUri('mongodb://127.0.0.1:27017/')).toBe(true);
    expect(isLoopbackUri('mongodb://localhost:27018/?replicaSet=x')).toBe(true);
    expect(isLoopbackUri('mongodb://user:pass@127.0.0.1:27017/db')).toBe(true);
  });

  it('treats remote hosts as requiring TLS', () => {
    expect(isLoopbackUri('mongodb+srv://user:pass@cluster0.abcd.mongodb.net/?appName=x')).toBe(
      false,
    );
    expect(isLoopbackUri('mongodb://db.internal.example:27017/')).toBe(false);
    // A hostname that merely starts with "localhost" is not loopback.
    expect(isLoopbackUri('mongodb://localhost.evil.com:27017/')).toBe(false);
  });
});
