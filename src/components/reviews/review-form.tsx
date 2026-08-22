'use client';

import { Star } from 'lucide-react';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { createReviewAction, updateReviewAction } from '@/actions/reviews';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';

interface ReviewFormProps {
  productId: string;
  /** Existing review when editing; null when writing a new one. */
  review: { id: string; rating: number; title: string; comment: string } | null;
  csrfField: ReactNode;
}

const RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'] as const;

/**
 * Create/edit review form.
 *
 * The star picker is a genuine radio group: five real `<input type="radio">`
 * elements, so keyboard arrows, form reset, and no-JS submission all behave.
 * The stars are the labels, not the widget.
 */
export function ReviewForm({ productId, review, csrfField }: ReviewFormProps) {
  const [state, formAction] = useActionState(
    review ? updateReviewAction : createReviewAction,
    emptyFormState,
  );
  const [rating, setRating] = useState(review?.rating ?? 0);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {csrfField}
      {review ? (
        <input type="hidden" name="reviewId" value={review.id} />
      ) : (
        <input type="hidden" name="productId" value={productId} />
      )}

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <fieldset>
        <legend className="text-sm font-semibold">
          Your rating
          <span className="text-deal ml-0.5" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="mt-1 flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="cursor-pointer p-1"
              title={`${value} - ${RATING_LABELS[value - 1]}`}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <Star
                aria-hidden="true"
                className={
                  value <= rating
                    ? 'fill-accent-500 text-accent-500 h-6 w-6'
                    : 'text-ink-subtle h-6 w-6'
                }
              />
              <span className="sr-only">
                {value} {value === 1 ? 'star' : 'stars'} - {RATING_LABELS[value - 1]}
              </span>
            </label>
          ))}
          {rating > 0 && (
            <span className="text-ink-muted ml-1 text-xs">{RATING_LABELS[rating - 1]}</span>
          )}
        </div>
        {state.fields?.rating && (
          <p role="alert" className="text-deal mt-1 text-sm">
            {state.fields.rating}
          </p>
        )}
      </fieldset>

      <TextField
        id={`review-title-${productId}`}
        name="title"
        label="Title"
        required
        defaultValue={review?.title}
        placeholder="What matters most to know?"
        error={state.fields?.title}
      />

      <div className="space-y-1.5">
        <label htmlFor={`review-comment-${productId}`} className="block text-sm font-semibold">
          Your review
          <span className="text-deal ml-0.5" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={`review-comment-${productId}`}
          name="comment"
          rows={4}
          required
          defaultValue={review?.comment}
          aria-invalid={state.fields?.comment ? true : undefined}
          aria-describedby={state.fields?.comment ? `review-comment-${productId}-error` : undefined}
          className={`w-full rounded-md border px-3 py-2.5 text-base ${
            state.fields?.comment
              ? 'border-deal focus:border-deal'
              : 'border-hairline focus:border-link'
          } bg-surface placeholder:text-ink-subtle`}
          placeholder="What did you like or dislike? How is it holding up?"
        />
        {state.fields?.comment && (
          <p
            id={`review-comment-${productId}-error`}
            role="alert"
            className="text-deal text-sm font-medium"
          >
            <span className="sr-only">Error: </span>
            {state.fields.comment}
          </p>
        )}
      </div>

      <SubmitButton pendingLabel={review ? 'Saving...' : 'Publishing...'}>
        {review ? 'Save changes' : 'Submit review'}
      </SubmitButton>
    </form>
  );
}
