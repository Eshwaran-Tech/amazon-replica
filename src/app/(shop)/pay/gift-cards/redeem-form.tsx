'use client';

import { Info } from 'lucide-react';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { redeemGiftCardAction } from '@/actions/wallet';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';

interface RedeemFormProps {
  csrfField: ReactNode;
  signedIn: boolean;
}

/**
 * "Add gift card to balance".
 *
 * The field accepts the code with or without its dashes -- the schema strips
 * separators before checking the length, because people paste codes exactly
 * as printed.
 */
export function RedeemGiftCardForm({ csrfField, signedIn }: RedeemFormProps) {
  const [state, formAction] = useActionState(redeemGiftCardAction, emptyFormState);

  return (
    <form action={formAction} className="mt-3 space-y-3" noValidate>
      {csrfField}

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <TextField
        id="giftCardCode"
        name="code"
        label="Enter gift card code"
        placeholder="8U9S-Y3E8CQ-39MPQ"
        autoComplete="off"
        spellCheck={false}
        required
        className="font-mono uppercase"
        {...(state.fields?.code ? { error: state.fields.code } : {})}
      />

      <SubmitButton fullWidth pendingLabel="Checking code...">
        {signedIn ? 'Add gift card to balance' : 'Sign in to add a gift card'}
      </SubmitButton>

      <p className="text-ink-subtle flex items-start gap-1.5 text-xs leading-relaxed">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        For optimal utilisation, balance expiring the earliest will be redeemed first.
      </p>
    </form>
  );
}
