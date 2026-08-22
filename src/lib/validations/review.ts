import { z } from 'zod';

import {
  limitSchema,
  multiLineText,
  objectIdString,
  pageSchema,
  ratingSchema,
  singleLineText,
} from './common';

/**
 * Review schemas.
 *
 * `title` and `comment` are plain text and are rendered as text nodes by React,
 * which escapes them. This application accepts no HTML from any user, so there
 * is no sanitiser to be bypassed and no `dangerouslySetInnerHTML` for sanitised
 * output to flow into (ESLint's `react/no-danger` is set to error).
 *
 * The text schemas additionally strip zero-width and bidirectional-override
 * characters, which Zod's length checks would happily pass but which let a
 * review render as something other than what is stored.
 *
 * No `userId`, no `isVerifiedPurchase`, no `createdAt`. The author is the
 * session; verified-purchase status is decided by looking for a delivered order
 * containing the product, not by asking the client.
 */

export const createReviewSchema = z.strictObject({
  productId: objectIdString,
  rating: ratingSchema,
  title: singleLineText(3, 100, 'Review title'),
  comment: multiLineText(10, 2000, 'Review'),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const updateReviewSchema = z.strictObject({
  reviewId: objectIdString,
  rating: ratingSchema,
  title: singleLineText(3, 100, 'Review title'),
  comment: multiLineText(10, 2000, 'Review'),
});

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export const deleteReviewSchema = z.strictObject({
  reviewId: objectIdString,
});

export const REVIEW_SORT_OPTIONS = ['newest', 'oldest', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORT_OPTIONS)[number];

export const reviewListQuerySchema = z.object({
  productId: objectIdString,
  rating: z.coerce.number().int().min(1).max(5).optional().catch(undefined),
  sort: z.enum(REVIEW_SORT_OPTIONS).catch('newest').default('newest'),
  page: pageSchema,
  limit: limitSchema,
});

export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
