'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { cancelPrimeAction, joinPrimeAction } from '@/actions/prime';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import type { PrimePlan } from '@/models/prime';

interface PlanOption {
  plan: PrimePlan;
  name: string;
  price: number;
  perMonth: number;
  months: number;
}

interface JoinFormProps {
  plans: PlanOption[];
  csrfField: ReactNode;
  signedIn: boolean;
  /** Wallet balance, so an unaffordable plan says so before it is clicked. */
  balance: number;
}

/**
 * The plan buttons.
 *
 * A plan the wallet cannot cover is disabled with the shortfall named, rather
 * than failing after the click -- the server checks the balance again anyway,
 * but there is no reason to let someone press a button that cannot work.
 */
export function JoinPrimeForm({ plans, csrfField, signedIn, balance }: JoinFormProps) {
  const [state, formAction] = useActionState(joinPrimeAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-2">
      {csrfField}

      {state.message && (
        <div className="max-w-sm">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      )}

      {plans.map((plan) => {
        const affordable = balance >= plan.price;

        return (
          <div key={plan.plan} className="max-w-sm">
            <button
              type="submit"
              name="plan"
              value={plan.plan}
              disabled={signedIn && !affordable}
              className="border-hairline bg-surface hover:border-accent-500 w-full rounded-lg border px-4 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signedIn
                ? `Join ${plan.name} at ${formatPaise(plan.price)}/${plan.months === 1 ? 'month' : 'year'}`
                : `Sign in to join ${plan.name}`}
            </button>
            <p className="text-ink-subtle mt-0.5 mb-2 text-[11px]">
              Effectively {formatPaise(plan.perMonth)}/month
              {signedIn && !affordable && (
                <span className="text-deal">
                  {' '}
                  — {formatPaise(plan.price - balance)} short of your balance
                </span>
              )}
            </p>
          </div>
        );
      })}
    </form>
  );
}

export function CancelPrimeForm({ csrfField }: { csrfField: ReactNode }) {
  const [state, formAction] = useActionState(cancelPrimeAction, emptyFormState);

  return (
    <form action={formAction} className="mt-3 max-w-sm space-y-2">
      {csrfField}
      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}
      <SubmitButton variant="secondary" pendingLabel="Working...">
        Turn off renewal
      </SubmitButton>
    </form>
  );
}
