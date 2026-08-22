import type { ObjectId } from 'mongodb';

export interface ReviewDoc {
  _id: ObjectId;
  productId: ObjectId;
  userId: ObjectId;
  /** The order that proves the purchase. Required -- see the unique index. */
  orderId: ObjectId;

  /** Display name snapshotted at write time, so renaming an account does not
   *  silently rewrite attribution on old reviews. */
  userName: string;

  /** Whole number, 1-5. Enforced by Zod and by a schema-level range check. */
  rating: number;
  title: string;
  /** Plain text. No HTML is accepted or rendered anywhere in this app. */
  comment: string;

  isVerifiedPurchase: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewView {
  id: string;
  rating: number;
  title: string;
  comment: string;
  /** Display name only -- never the reviewer's email or user id. Exposing the
   *  id would let anyone correlate every review a person has ever written. */
  authorName: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  /** True when the signed-in viewer wrote this one, so the UI can offer edit. */
  isOwn: boolean;
}

export function toReviewView(doc: ReviewDoc, viewerId?: string | null): ReviewView {
  return {
    id: doc._id.toHexString(),
    rating: doc.rating,
    title: doc.title,
    comment: doc.comment,
    authorName: doc.userName,
    isVerifiedPurchase: doc.isVerifiedPurchase,
    createdAt: doc.createdAt.toISOString(),
    isOwn: viewerId != null && doc.userId.toHexString() === viewerId,
  };
}

/** Aggregate shown on the product page. */
export interface RatingBreakdown {
  average: number;
  total: number;
  /** Count per star, index 0 = 1 star. */
  counts: [number, number, number, number, number];
}

export function emptyRatingBreakdown(): RatingBreakdown {
  return { average: 0, total: 0, counts: [0, 0, 0, 0, 0] };
}
