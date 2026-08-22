'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { cancelOrderAction } from '@/actions/orders';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

interface CancelOrderFormProps {
  orderId: string;
  csrfField: ReactNode;
}

/**
 * Two-step cancel: the first click only arms the real button. An accidental
 * tap on "Cancel this order" in a scrolling thumb's path should not release
 * stock and trigger a refund. (Both steps work without JavaScript beyond
 * hydration -- this is a plain form post, not a fetch.)
 */
export function CancelOrderForm({ orderId, csrfField }: CancelOrderFormProps) {
  const [state, formAction] = useActionState(cancelOrderAction, emptyFormState);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center justify-center rounded-md border px-4 text-sm font-semibold"
      >
        Cancel this order
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {csrfField}
      <input type="hidden" name="orderId" value={orderId} />

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="danger" pendingLabel="Cancelling...">
          Yes, cancel this order
        </SubmitButton>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="text-link min-h-10 px-2 text-sm font-semibold hover:underline"
        >
          Keep the order
        </button>
      </div>
    </form>
  );
}
