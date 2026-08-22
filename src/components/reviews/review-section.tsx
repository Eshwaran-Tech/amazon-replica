import { BadgeCheck } from 'lucide-react';
import { ObjectId } from 'mongodb';
import Link from 'next/link';

import { RatingStars } from '@/components/product/rating-stars';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { REVIEW_SORT_OPTIONS, type ReviewSort } from '@/lib/validations/review';
import type { ReviewDoc } from '@/models/review';
import { getOwnReview, getReviewEligibility, listReviews } from '@/services/reviews';

import { DeleteReviewButton } from './delete-review-button';
import { ReviewForm } from './review-form';

interface ReviewSectionProps {
  productId: string;
  productSlug: string;
  /** Raw searchParams values; validated here before use. */
  rawSort?: string | string[];
  rawStars?: string | string[];
  rawPage?: string | string[];
}

const SORT_LABELS: Record<ReviewSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
};

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function reviewsHref(slug: string, sort: ReviewSort, stars: number | null, page: number): string {
  const params = new URLSearchParams();
  if (sort !== 'newest') params.set('rsort', sort);
  if (stars) params.set('rstars', String(stars));
  if (page > 1) params.set('rpage', String(page));
  const query = params.toString();
  return `/products/${slug}${query ? `?${query}` : ''}#reviews`;
}

/**
 * The customer-reviews block of a product page.
 *
 * Reading needs no account. Writing is offered only to a signed-in, verified
 * customer whose order containing this product has been delivered -- and the
 * server action re-checks all of that; what renders here is presentation, not
 * enforcement.
 */
export async function ReviewSection({
  productId,
  productSlug,
  rawSort,
  rawStars,
  rawPage,
}: ReviewSectionProps) {
  const session = await getSession();
  const id = new ObjectId(productId);

  const sort = REVIEW_SORT_OPTIONS.find((option) => option === rawSort) ?? 'newest';
  const stars = typeof rawStars === 'string' ? Number.parseInt(rawStars, 10) || null : null;
  const page = typeof rawPage === 'string' ? Number.parseInt(rawPage, 10) || 1 : 1;

  const listing = await listReviews(id, { viewerId: session?.user.id ?? null, sort, stars, page });

  let ownReview: ReviewDoc | null = null;
  let eligibility: 'CAN_REVIEW' | 'ALREADY_REVIEWED' | 'NOT_ELIGIBLE' | 'SIGNED_OUT' = 'SIGNED_OUT';
  if (session) {
    eligibility = await getReviewEligibility(new ObjectId(session.user.id), id);
    if (eligibility === 'ALREADY_REVIEWED') {
      ownReview = await getOwnReview(new ObjectId(session.user.id), id);
    }
  }

  const { breakdown } = listing;

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="bg-surface mt-4 rounded-lg p-3 sm:p-4"
    >
      <h2 id="reviews-heading" className="text-lg font-bold">
        Customer reviews
      </h2>

      <div className="mt-3 gap-6 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        {/* ------------------------------------------------ breakdown rail */}
        <div>
          {breakdown.total > 0 ? (
            <>
              <div className="flex items-center gap-2">
                <RatingStars rating={breakdown.average} size="md" />
                <span className="text-base font-semibold">
                  {breakdown.average.toFixed(1)} out of 5
                </span>
              </div>
              <p className="text-ink-muted mt-1 text-sm">
                {breakdown.total} {breakdown.total === 1 ? 'review' : 'reviews'}
              </p>

              <ul className="mt-3 space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = breakdown.counts[star - 1] ?? 0;
                  const share =
                    breakdown.total > 0 ? Math.round((count / breakdown.total) * 100) : 0;
                  return (
                    <li key={star}>
                      <Link
                        href={reviewsHref(
                          productSlug,
                          sort,
                          listing.starsFilter === star ? null : star,
                          1,
                        )}
                        aria-label={`${star} star reviews: ${count}`}
                        className={`flex items-center gap-2 text-sm hover:underline ${
                          listing.starsFilter === star ? 'text-link font-semibold' : 'text-ink'
                        }`}
                      >
                        <span className="w-12 shrink-0">{star} star</span>
                        <span className="bg-surface-sunken relative h-4 flex-1 overflow-hidden rounded">
                          <span
                            className="bg-accent-500 absolute inset-y-0 left-0"
                            style={{ width: `${share}%` }}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="text-ink-muted w-9 shrink-0 text-right">{share}%</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-ink-muted text-sm">No reviews yet.</p>
          )}

          {/* ------------------------------------------------- write area */}
          <div className="border-hairline mt-4 border-t pt-4">
            <h3 className="text-sm font-bold">Review this product</h3>

            {eligibility === 'SIGNED_OUT' && (
              <p className="text-ink-muted mt-1 text-sm">
                <Link
                  href={`/auth/login?next=${encodeURIComponent(`/products/${productSlug}`)}`}
                  className="text-link hover:underline"
                >
                  Sign in
                </Link>{' '}
                to write a review once your order has been delivered.
              </p>
            )}

            {eligibility === 'NOT_ELIGIBLE' && (
              <p className="text-ink-muted mt-1 text-sm">
                Reviews are open to customers whose order containing this item has been delivered.
              </p>
            )}

            {eligibility === 'CAN_REVIEW' && (
              <div className="mt-2">
                <ReviewForm productId={productId} review={null} csrfField={<CsrfField />} />
              </div>
            )}

            {eligibility === 'ALREADY_REVIEWED' && ownReview && (
              <div className="mt-2">
                <p className="text-ink-muted mb-2 text-xs">
                  You reviewed this product. Edit or delete your review below.
                </p>
                <ReviewForm
                  productId={productId}
                  review={{
                    id: ownReview._id.toHexString(),
                    rating: ownReview.rating,
                    title: ownReview.title,
                    comment: ownReview.comment,
                  }}
                  csrfField={<CsrfField />}
                />
                <div className="mt-2">
                  <DeleteReviewButton
                    reviewId={ownReview._id.toHexString()}
                    csrfField={<CsrfField />}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------- the list */}
        <div className="mt-5 lg:mt-0">
          {breakdown.total > 0 && (
            <nav
              aria-label="Sort reviews"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            >
              <span className="text-ink-muted">Sort by:</span>
              {REVIEW_SORT_OPTIONS.map((option) => (
                <Link
                  key={option}
                  href={reviewsHref(productSlug, option, listing.starsFilter, 1)}
                  aria-current={sort === option ? 'true' : undefined}
                  className={
                    sort === option ? 'text-ink font-semibold' : 'text-link hover:underline'
                  }
                >
                  {SORT_LABELS[option]}
                </Link>
              ))}
              {listing.starsFilter && (
                <Link
                  href={reviewsHref(productSlug, sort, null, 1)}
                  className="text-link ml-auto hover:underline"
                >
                  Clear {listing.starsFilter}-star filter
                </Link>
              )}
            </nav>
          )}

          {listing.reviews.length === 0 && breakdown.total > 0 && (
            <p className="text-ink-muted mt-4 text-sm">
              No {listing.starsFilter}-star reviews on this page.
            </p>
          )}

          <ul className="divide-hairline mt-2 divide-y">
            {listing.reviews.map((review) => (
              <li key={review.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars rating={review.rating} size="sm" />
                  <h3 className="text-sm font-bold">{review.title}</h3>
                </div>
                <p className="text-ink-subtle mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                  <span>
                    {review.authorName}
                    {review.isOwn && <span className="text-link font-semibold"> (you)</span>}
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  <span>{dateFormat.format(new Date(review.createdAt))}</span>
                  {review.isVerifiedPurchase && (
                    <span className="text-instock inline-flex items-center gap-1 font-semibold">
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Verified purchase
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{review.comment}</p>
              </li>
            ))}
          </ul>

          {(listing.page > 1 || listing.hasMore) && (
            <nav
              aria-label="Review pages"
              className="mt-3 flex items-center justify-center gap-3 text-sm"
            >
              {listing.page > 1 && (
                <Link
                  href={reviewsHref(productSlug, sort, listing.starsFilter, listing.page - 1)}
                  className="border-hairline hover:bg-surface-muted inline-flex min-h-9 items-center rounded-md border px-3 font-semibold"
                >
                  Previous
                </Link>
              )}
              <span className="text-ink-muted">Page {listing.page}</span>
              {listing.hasMore && (
                <Link
                  href={reviewsHref(productSlug, sort, listing.starsFilter, listing.page + 1)}
                  className="border-hairline hover:bg-surface-muted inline-flex min-h-9 items-center rounded-md border px-3 font-semibold"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
