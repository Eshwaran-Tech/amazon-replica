'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { payTopUpAction } from '@/actions/wallet';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';

interface TopUpCardFormProps {
  entryId: string;
  amountFormatted: string;
  csrfField: ReactNode;
}

/**
 * Test-card form for a wallet top-up.
 *
 * The card number decides the simulated outcome, and it decides it on the
 * server: this form only carries the entry id and the card details, and the
 * action asks `completeTopUp` what happened. Nothing here can assert success,
 * and the amount is not a field -- it already lives on the pending entry.
 */
export function TopUpCardForm({ entryId, amountFormatted, csrfField }: TopUpCardFormProps) {
  const [state, formAction] = useActionState(payTopUpAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrfField}
      <input type="hidden" name="entryId" value={entryId} />

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <TextField
        id="nameOnCard"
        name="nameOnCard"
        label="Name on card"
        autoComplete="cc-name"
        required
        defaultValue=""
        {...(state.fields?.nameOnCard ? { error: state.fields.nameOnCard } : {})}
      />

      <TextField
        id="cardNumber"
        name="cardNumber"
        label="Card number"
        inputMode="numeric"
        autoComplete="cc-number"
        placeholder="4242 4242 4242 4242"
        required
        defaultValue=""
        {...(state.fields?.cardNumber ? { error: state.fields.cardNumber } : {})}
      />

      <SubmitButton fullWidth pendingLabel="Contacting gateway...">
        Pay {amountFormatted}
      </SubmitButton>
    </form>
  );
}
