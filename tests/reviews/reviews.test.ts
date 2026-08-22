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
import { addToCart } from '@/services/cart';
import { placeOrder } from '@/services/checkout';
import {
  createReview,
  deleteReview,
  getReviewEligibility,
  listReviews,
  updateReview,
} from '@/services/reviews';

/**
 * Phase 10 verification: the verified-purchase gate, the one-review-per-buyer
 * rule as a database guarantee, ownership on edits and deletes, and the rating
 * aggregate always matching the reviews underneath it.
 */

let counter = 0;
const ctx = { ip: '10.99.0.3' };

const ADDRESS: AddressInput = {
  fullName: 'Review Tester',
  phone: '9800000399',
  line1: '5 Opinion Avenue',
  line2: '',
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411001',
  country: 'India',
  type: 'HOME',
  isDefault: false,
};

async function makeUser(name = 'Review User'): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `${name} ${counter}`,
    email: `reviews-${Date.now()}-${counter}@example.com`,
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

async function makeProduct(): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Review Product ${counter}`,
    slug: `review-product-${Date.now()}-${counter}`,
    description: 'Created by the reviews test suite.',
    brand: 'Testco',
    category: 'electronics',
    subcategory: null,
    price: rupeesToPaise(500),
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
    ...{},
  };
  await products.insertOne(doc);
  return doc;
}

/** Places an order for the product and moves it to the given status. */
async function buyProduct(
  user: UserDoc,
  product: ProductDoc,
  finalStatus: 'DELIVERED' | 'CONFIRMED' | 'CANCELLED',
): Promise<void> {
  await addToCart({ userId: user._id }, product._id.toHexString(), 1);
  const placed = await placeOrder(
    user._id,
    {
      newAddress: ADDRESS,
      paymentMethod: 'COD',
      idempotencyKey: `test${new ObjectId().toHexString()}`,
    },
    ctx,
  );
  expect(placed.ok).toBe(true);
  if (!placed.ok) throw new Error('order placement failed');

  if (finalStatus !== 'CONFIRMED') {
    const orders = await ordersCollection();
    await orders.updateOne(
      { _id: new ObjectId(placed.orderId) },
      { $set: { orderStatus: finalStatus } },
    );
  }
}

const REVIEW_TEXT = {
  title: 'Does what it says',
  comment: 'Solid build quality and it arrived well packed. Happy with it so far.',
};

async function productRating(productId: ObjectId): Promise<{ rating: number; reviewCount: number }> {
  const products = await productsCollection();
  const doc = await products.findOne(
    { _id: productId },
    { projection: { rating: 1, reviewCount: 1 } },
  );
  return { rating: doc?.rating ?? -1, reviewCount: doc?.reviewCount ?? -1 };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

// ------------------------------------------------------- the purchase gate

describe('the verified-purchase gate', () => {
  it('rejects a reviewer with no order, an undelivered order, or a cancelled one', async () => {
    const product = await makeProduct();

    const stranger = await makeUser('No Order');
    const undelivered = await makeUser('Undelivered');
    const cancelled = await makeUser('Cancelled');
    await buyProduct(undelivered, product, 'CONFIRMED');
    await buyProduct(cancelled, product, 'CANCELLED');

    for (const user of [stranger, undelivered, cancelled]) {
      const result = await createReview(
        user._id,
        user.name,
        { productId: product._id.toHexString(), rating: 5, ...REVIEW_TEXT },
        ctx,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('NOT_ELIGIBLE');
      expect(await getReviewEligibility(user._id, product._id)).toBe('NOT_ELIGIBLE');
    }

    // The product's aggregate is untouched by all three refusals.
    expect(await productRating(product._id)).toEqual({ rating: 0, reviewCount: 0 });
  });

  it('accepts a delivered buyer and marks the review verified', async () => {
    const product = await makeProduct();
    const buyer = await makeUser('Delivered');
    await buyProduct(buyer, product, 'DELIVERED');

    expect(await getReviewEligibility(buyer._id, product._id)).toBe('CAN_REVIEW');

    const result = await createReview(
      buyer._id,
      buyer.name,
      { productId: product._id.toHexString(), rating: 4, ...REVIEW_TEXT },
      ctx,
    );
    expect(result.ok).toBe(true);

    const listing = await listReviews(product._id);
    expect(listing.reviews).toHaveLength(1);
    expect(listing.reviews[0]).toMatchObject({
      rating: 4,
      isVerifiedPurchase: true,
      authorName: buyer.name,
    });
    expect(await productRating(product._id)).toEqual({ rating: 4, reviewCount: 1 });
    expect(await getReviewEligibility(buyer._id, product._id)).toBe('ALREADY_REVIEWED');
  });

  it('the second review from the same buyer dies on the unique index', async () => {
    const product = await makeProduct();
    const buyer = await makeUser('Duplicate');
    await buyProduct(buyer, product, 'DELIVERED');

    const first = await createReview(
      buyer._id,
      buyer.name,
      { productId: product._id.toHexString(), rating: 5, ...REVIEW_TEXT },
      ctx,
    );
    expect(first.ok).toBe(true);

    const second = await createReview(
      buyer._id,
      buyer.name,
      { productId: product._id.toHexString(), rating: 1, ...REVIEW_TEXT },
      ctx,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('DUPLICATE');

    expect(await productRating(product._id)).toEqual({ rating: 5, reviewCount: 1 });
  });
});

// ------------------------------------------------------- editing & deleting

describe('editing and deleting', () => {
  it('edits and deletes stay with the author; the aggregate follows every change', async () => {
    const product = await makeProduct();
    const author = await makeUser('Author');
    const other = await makeUser('Other Buyer');
    await buyProduct(author, product, 'DELIVERED');
    await buyProduct(other, product, 'DELIVERED');

    await createReview(
      author._id,
      author.name,
      { productId: product._id.toHexString(), rating: 5, ...REVIEW_TEXT },
      ctx,
    );
    await createReview(
      other._id,
      other.name,
      { productId: product._id.toHexString(), rating: 1, ...REVIEW_TEXT },
      ctx,
    );

    expect(await productRating(product._id)).toEqual({ rating: 3, reviewCount: 2 });

    const listing = await listReviews(product._id, { viewerId: author._id.toHexString() });
    const own = listing.reviews.find((review) => review.isOwn);
    expect(own).toBeDefined();
    if (!own) return;

    // A stranger cannot edit or delete it -- same result as a missing id.
    const foreignEdit = await updateReview(other._id, {
      reviewId: own.id,
      rating: 5,
      title: 'Hijacked title',
      comment: 'This should never be written over someone else.',
    });
    expect(foreignEdit.ok).toBe(false);
    const foreignDelete = await deleteReview(other._id, own.id, ctx);
    expect(foreignDelete.ok).toBe(false);

    // The author edits: 5 -> 3, and the aggregate moves 3.0 -> 2.0.
    const edit = await updateReview(author._id, {
      reviewId: own.id,
      rating: 3,
      title: 'Revised after a month',
      comment: 'Held up worse than expected, knocking a couple of stars off.',
    });
    expect(edit.ok).toBe(true);
    expect(await productRating(product._id)).toEqual({ rating: 2, reviewCount: 2 });

    // The author deletes: only the other review remains, aggregate = 1.0.
    const del = await deleteReview(author._id, own.id, ctx);
    expect(del.ok).toBe(true);
    expect(await productRating(product._id)).toEqual({ rating: 1, reviewCount: 1 });

    const after = await listReviews(product._id);
    expect(after.reviews).toHaveLength(1);
    expect(after.reviews[0]?.authorName).toBe(other.name);
  });
});

// ---------------------------------------------------------------- listing

describe('listing reviews', () => {
  it('sorts, filters by stars, and reports the unfiltered breakdown', async () => {
    const product = await makeProduct();
    const ratings = [5, 4, 4, 2] as const;

    for (const rating of ratings) {
      const buyer = await makeUser(`Rater${rating}`);
      await buyProduct(buyer, product, 'DELIVERED');
      const created = await createReview(
        buyer._id,
        buyer.name,
        { productId: product._id.toHexString(), rating, ...REVIEW_TEXT },
        ctx,
      );
      expect(created.ok).toBe(true);
    }

    const highest = await listReviews(product._id, { sort: 'highest' });
    expect(highest.reviews.map((review) => review.rating)).toEqual([5, 4, 4, 2]);
    expect(highest.breakdown).toMatchObject({ total: 4, counts: [0, 1, 0, 2, 1] });
    // (5+4+4+2)/4 = 3.75 -> 3.8 at one decimal.
    expect(highest.breakdown.average).toBe(3.8);

    const lowest = await listReviews(product._id, { sort: 'lowest' });
    expect(lowest.reviews[0]?.rating).toBe(2);

    // The star filter narrows the page but never the breakdown.
    const fours = await listReviews(product._id, { stars: 4 });
    expect(fours.reviews).toHaveLength(2);
    expect(fours.reviews.every((review) => review.rating === 4)).toBe(true);
    expect(fours.breakdown.total).toBe(4);

    expect(await productRating(product._id)).toEqual({ rating: 3.8, reviewCount: 4 });
  });
});
