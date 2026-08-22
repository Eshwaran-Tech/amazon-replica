'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { updateOrderStatusAction } from '@/actions/admin';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import type { OrderStatus } from '@/models/types';

interface StatusFormProps {
  orderId: string;
  currentStatus: OrderStatus;
  /** Only the transitions the state machine allows -- rendered, and re-checked
   *  server-side, so a crafted POST with an illegal status still fails. */
  nextStatuses: readonly OrderStatus[];
  isPaid: boolean;
  csrfField: ReactNode;
}

export function StatusForm({
  orderId,
  currentStatus,
  nextStatuses,
  isPaid,
  csrfField,
}: StatusFormProps) {
  const [state, formAction] = useActionState(updateOrderStatusAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {csrfField}
      <input type="hidden" name="orderId" value={orderId} />

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <div className="space-y-1.5">
        <label htmlFor="next-status" className="block text-sm font-semibold">
          Move from {currentStatus} to
        </label>
        <select
          id="next-status"
          name="status"
          className="border-hairline bg-surface focus:border-link min-h-11 w-full rounded-md border px-3 text-base"
        >
          {nextStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {nextStatuses.includes('CANCELLED') && (
        <p className="text-ink-muted text-xs">
          Cancelling releases the reserved stock{isPaid ? ' and refunds the payment in full' : ''}.
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="status-note" className="block text-sm font-semibold">
          Note <span className="text-ink-subtle font-normal">(kept in the order history)</span>
        </label>
        <input
          id="status-note"
          name="note"
          maxLength={300}
          className="border-hairline bg-surface focus:border-link min-h-11 w-full rounded-md border px-3 text-base"
          placeholder="Optional"
        />
      </div>

      <SubmitButton pendingLabel="Updating...">Update status</SubmitButton>
    </form>
  );
}
