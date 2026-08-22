'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { deleteReviewAction } from '@/actions/reviews';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

interface DeleteReviewButtonProps {
  reviewId: string;
  csrfField: ReactNode;
}

/** Two-step delete, same pattern as order cancellation: arm, then confirm. */
export function DeleteReviewButton({ reviewId, csrfField }: DeleteReviewButtonProps) {
  const [state, formAction] = useActionState(deleteReviewAction, emptyFormState);
  const [armed, setArmed] = useState(false);

  if (state.ok) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-deal min-h-9 text-sm font-semibold hover:underline"
      >
        Delete my review
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      {csrfField}
      <input type="hidden" name="reviewId" value={reviewId} />

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="danger" size="sm" pendingLabel="Deleting...">
          Yes, delete it
        </SubmitButton>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="text-link min-h-9 text-sm font-semibold hover:underline"
        >
          Keep it
        </button>
      </div>
    </form>
  );
}
