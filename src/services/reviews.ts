import { ObjectId } from 'mongodb';

import { ordersCollection, productsCollection, reviewsCollection } from '@/lib/db/collections';
import { recordAudit } from '@/lib/security/audit';
import {
  emptyRatingBreakdown,
  toReviewView,
  type RatingBreakdown,
  type ReviewDoc,
  type ReviewView,
} from '@/models/review';
import type { CreateReviewInput, ReviewSort, UpdateReviewInput } from '@/lib/validations/review';

import '@/lib/server-guard';

/**
 * Reviews: verified purchases only.
 *
 * The rule this module enforces end to end: **a review exists only where a
 * delivered order exists.** Eligibility is answered by the
 * `orders_user_productId` index, the review stores the `orderId` that proved
 * it, and the unique `(productId, userId)` index makes duplicates a database
 * impossibility rather than an application promise.
 *
 * The product card's `rating` / `reviewCount` are always *recomputed from the
 * reviews collection* after every write -- never incremented in place, so a
 * retried request or a crashed handler cannot drift the aggregate away from
 * the reviews a customer can actually read.
 */

export const REVIEWS_PAGE_SIZE = 10;

export type ReviewMutationResult =
  | { ok: true; productSlug: string }
  | {
      ok: false;
      code: 'NOT_ELIGIBLE' | 'DUPLICATE' | 'NOT_FOUND' | 'PRODUCT_NOT_FOUND';
      message: string;
    };

/**
 * The order that makes `userId` eligible to review `productId`, or null.
 *
 * DELIVERED only: a paid order that has not arrived yet can still be cancelled
 * or lost, and "verified purchase" on this storefront means the customer has
 * the item in hand. Resolved entirely by index -- no order history scan.
 */
async function findQualifyingOrder(
  userId: ObjectId,
  productId: ObjectId,
): Promise<ObjectId | null> {
  const orders = await ordersCollection();
  const order = await orders.findOne(
    { userId, 'items.productId': productId, orderStatus: 'DELIVERED' },
    { projection: { _id: 1 } },
  );
  return order?._id ?? null;
}

/** Recomputes a product's rating aggregate from its reviews. */
async function recomputeProductRating(productId: ObjectId): Promise<void> {
  const reviews = await reviewsCollection();
  const [aggregate] = await reviews
    .aggregate<{ average: number; count: number }>([
      { $match: { productId } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ])
    .toArray();

  const products = await productsCollection();
  await products.updateOne(
    { _id: productId },
    {
      $set: {
        rating: aggregate ? Math.round(aggregate.average * 10) / 10 : 0,
        reviewCount: aggregate?.count ?? 0,
        updatedAt: new Date(),
      },
    },
  );
}

// ------------------------------------------------------------------ writing

export async function createReview(
  userId: ObjectId,
  userName: string,
  input: CreateReviewInput,
  context: { ip: string },
): Promise<ReviewMutationResult> {
  const productId = new ObjectId(input.productId);

  const products = await productsCollection();
  const product = await products.findOne(
    { _id: productId, isActive: true },
    { projection: { slug: 1 } },
  );
  if (!product) {
    return { ok: false, code: 'PRODUCT_NOT_FOUND', message: 'We could not find that product.' };
  }

  const orderId = await findQualifyingOrder(userId, productId);
  if (!orderId) {
    return {
      ok: false,
      code: 'NOT_ELIGIBLE',
      message: 'Reviews are open to customers whose order containing this item has been delivered.',
    };
  }

  const now = new Date();
  const review: ReviewDoc = {
    _id: new ObjectId(),
    productId,
    userId,
    orderId,
    userName,
    rating: input.rating,
    title: input.title,
    comment: input.comment,
    isVerifiedPurchase: true,
    createdAt: now,
    updatedAt: now,
  };

  const reviews = await reviewsCollection();
  try {
    await reviews.insertOne(review);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      // The unique index spoke: this user already reviewed this product. The
      // application-level "have they reviewed it" check is the UI's concern;
      // this is the enforcement.
      return {
        ok: false,
        code: 'DUPLICATE',
        message: 'You have already reviewed this product. You can edit your existing review.',
      };
    }
    throw error;
  }

  await recomputeProductRating(productId);

  await recordAudit({
    action: 'review.created',
    actorId: userId,
    targetType: 'review',
    targetId: review._id.toHexString(),
    ip: context.ip,
    metadata: { productId: productId.toHexString(), rating: input.rating },
  });

  return { ok: true, productSlug: product.slug };
}

export async function updateReview(
  userId: ObjectId,
  input: UpdateReviewInput,
): Promise<ReviewMutationResult> {
  const reviews = await reviewsCollection();

  // Ownership in the query. There is no admin override here: an admin removes
  // abusive reviews through the admin surface, they do not edit customers'
  // words in place.
  const updated = await reviews.findOneAndUpdate(
    { _id: new ObjectId(input.reviewId), userId },
    {
      $set: {
        rating: input.rating,
        title: input.title,
        comment: input.comment,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' },
  );

  if (!updated) {
    return { ok: false, code: 'NOT_FOUND', message: 'We could not find that review.' };
  }

  await recomputeProductRating(updated.productId);

  const products = await productsCollection();
  const product = await products.findOne({ _id: updated.productId }, { projection: { slug: 1 } });

  return { ok: true, productSlug: product?.slug ?? '' };
}

export async function deleteReview(
  userId: ObjectId,
  reviewId: string,
  context: { ip: string },
): Promise<ReviewMutationResult> {
  if (!ObjectId.isValid(reviewId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'We could not find that review.' };
  }

  const reviews = await reviewsCollection();
  const deleted = await reviews.findOneAndDelete({ _id: new ObjectId(reviewId), userId });

  if (!deleted) {
    return { ok: false, code: 'NOT_FOUND', message: 'We could not find that review.' };
  }

  await recomputeProductRating(deleted.productId);

  await recordAudit({
    action: 'review.deleted',
    actorId: userId,
    targetType: 'review',
    targetId: reviewId,
    ip: context.ip,
    metadata: { productId: deleted.productId.toHexString() },
  });

  const products = await productsCollection();
  const product = await products.findOne({ _id: deleted.productId }, { projection: { slug: 1 } });

  return { ok: true, productSlug: product?.slug ?? '' };
}

// ------------------------------------------------------------------ reading

const SORTS: Record<ReviewSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 },
};

export interface ReviewListing {
  reviews: ReviewView[];
  breakdown: RatingBreakdown;
  page: number;
  hasMore: boolean;
  sort: ReviewSort;
  starsFilter: number | null;
}

export interface ListReviewOptions {
  viewerId?: string | null;
  sort?: ReviewSort;
  stars?: number | null;
  page?: number;
}

export async function listReviews(
  productId: ObjectId,
  options: ListReviewOptions = {},
): Promise<ReviewListing> {
  const sort: ReviewSort = options.sort ?? 'newest';
  const stars =
    options.stars && Number.isInteger(options.stars) && options.stars >= 1 && options.stars <= 5
      ? options.stars
      : null;
  const page =
    options.page && Number.isInteger(options.page) && options.page >= 1 && options.page <= 1000
      ? options.page
      : 1;

  const reviews = await reviewsCollection();

  // One round trip: the star-filtered page and the unfiltered breakdown.
  const [result] = await reviews
    .aggregate<{
      page: ReviewDoc[];
      counts: Array<{ _id: number; count: number }>;
    }>([
      { $match: { productId } },
      {
        $facet: {
          page: [
            ...(stars ? [{ $match: { rating: stars } }] : []),
            { $sort: SORTS[sort] },
            { $skip: (page - 1) * REVIEWS_PAGE_SIZE },
            { $limit: REVIEWS_PAGE_SIZE + 1 },
          ],
          counts: [{ $group: { _id: '$rating', count: { $sum: 1 } } }],
        },
      },
    ])
    .toArray();

  const breakdown = emptyRatingBreakdown();
  if (result) {
    let weighted = 0;
    for (const bucket of result.counts) {
      const star = Math.min(5, Math.max(1, Math.round(bucket._id)));
      breakdown.counts[star - 1] = (breakdown.counts[star - 1] ?? 0) + bucket.count;
      breakdown.total += bucket.count;
      weighted += star * bucket.count;
    }
    breakdown.average = breakdown.total > 0 ? Math.round((weighted / breakdown.total) * 10) / 10 : 0;
  }

  const docs = result?.page ?? [];

  return {
    reviews: docs.slice(0, REVIEWS_PAGE_SIZE).map((doc) => toReviewView(doc, options.viewerId)),
    breakdown,
    page,
    hasMore: docs.length > REVIEWS_PAGE_SIZE,
    sort,
    starsFilter: stars,
  };
}

/** The viewer's own review of a product, for prefilling the edit form. */
export async function getOwnReview(
  userId: ObjectId,
  productId: ObjectId,
): Promise<ReviewDoc | null> {
  const reviews = await reviewsCollection();
  return reviews.findOne({ productId, userId });
}

/** Whether the viewer may write a review (delivered order, none written yet). */
export async function getReviewEligibility(
  userId: ObjectId,
  productId: ObjectId,
): Promise<'CAN_REVIEW' | 'ALREADY_REVIEWED' | 'NOT_ELIGIBLE'> {
  const existing = await getOwnReview(userId, productId);
  if (existing) return 'ALREADY_REVIEWED';
  const orderId = await findQualifyingOrder(userId, productId);
  return orderId ? 'CAN_REVIEW' : 'NOT_ELIGIBLE';
}
