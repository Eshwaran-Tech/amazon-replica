'use client';

import { Info } from 'lucide-react';
import { useActionState, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { startTopUpAction } from '@/actions/wallet';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { CURRENCY_SYMBOL, formatPaise, rupeesToPaise } from '@/lib/utils/money';
import { MAX_TOP_UP_RUPEES } from '@/lib/validations/wallet';

/**
 * The "Add money to Wallet" panel.
 *
 * The client-side checks here are for feedback only. The amount is validated
 * again by `topUpSchema` inside the Server Action, and it is that parse -- not
 * this one -- that decides whether a ledger row is written. Disabling the
 * button while the field is invalid stops a pointless round trip; it is not
 * what stops a bad amount.
 */

const MAX_TOP_UP_PAISE = rupeesToPaise(MAX_TOP_UP_RUPEES);

const QUICK_ADD_RUPEES = [500, 1000, 1500] as const;

interface AddMoneyFormProps {
  csrfField: ReactNode;
  /** Signed-out visitors are sent to sign in rather than shown a dead button. */
  signedIn: boolean;
}

export function AddMoneyForm({ csrfField, signedIn }: AddMoneyFormProps) {
  const inputId = useId();
  const noteId = `${inputId}-note`;
  const [rupees, setRupees] = useState('1000');
  const [state, formAction] = useActionState(startTopUpAction, emptyFormState);

  const parsed = Number(rupees);
  const isNumber = rupees.trim() !== '' && Number.isFinite(parsed);
  const paise = isNumber ? Math.round(parsed * 100) : 0;

  const error = !isNumber
    ? 'Enter an amount.'
    : !Number.isInteger(parsed)
      ? 'Enter a whole rupee amount.'
      : paise <= 0
        ? 'Enter an amount greater than zero.'
        : paise > MAX_TOP_UP_PAISE
          ? `You can add up to ${formatPaise(MAX_TOP_UP_PAISE)}.`
          : undefined;

  function bump(amount: number) {
    const next = (isNumber ? Math.max(parsed, 0) : 0) + amount;
    setRupees(String(Math.min(next, MAX_TOP_UP_RUPEES)));
  }

  return (
    <form action={formAction} className="mt-5" noValidate>
      {csrfField}

      <h2 className="text-sm font-bold">Add money to Wallet</h2>

      {state.message && !state.ok && (
        <div className="mt-2 max-w-xs">
          <Alert tone="error">{state.message}</Alert>
        </div>
      )}

      <div className="border-hairline mt-3 max-w-xs rounded-xl border p-3">
        <label htmlFor={inputId} className="text-ink-muted block text-xs">
          Enter Amount
        </label>

        <div className="mt-1 flex items-center gap-1.5">
          <span aria-hidden="true" className="text-lg">
            {CURRENCY_SYMBOL}
          </span>
          <input
            id={inputId}
            name="amountRupees"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_TOP_UP_RUPEES}
            step={1}
            value={rupees}
            onChange={(event) => setRupees(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={noteId}
            className="w-full min-w-0 bg-transparent text-lg font-semibold outline-none"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK_ADD_RUPEES.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => bump(amount)}
            className="border-hairline hover:border-accent-500 focus-visible:outline-accent-500 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            + {CURRENCY_SYMBOL}
            {amount}
          </button>
        ))}
      </div>

      <p
        id={noteId}
        className={
          error ? 'text-deal mt-2 text-xs' : 'text-link mt-2 flex items-center gap-1 text-xs'
        }
        {...(error ? { role: 'alert' } : {})}
      >
        {!error && <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {error ?? `You can add up to ${formatPaise(MAX_TOP_UP_PAISE)}.`}
      </p>

      <div className="mt-3 max-w-xs">
        <SubmitButton disabled={Boolean(error)} fullWidth>
          {signedIn ? 'Set-up wallet to add money' : 'Sign in to add money'}
        </SubmitButton>
      </div>

      <p className="text-ink-subtle mt-2 max-w-xs text-xs leading-relaxed">
        Continues to a test payment step. This store runs the built-in demo gateway, so no real
        money moves -- card 4242 4242 4242 4242 succeeds.
      </p>
    </form>
  );
}
