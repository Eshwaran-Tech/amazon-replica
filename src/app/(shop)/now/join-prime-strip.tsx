'use client';

import { BadgeCheck } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { joinPrimeAction } from '@/actions/prime';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

/**
 * The reference's "SAVE MORE WITH prime BENEFITS" band.
 *
 * It offers one plan rather than three: this strip exists to state the delivery
 * benefit and let someone act on it, and the full comparison already lives on
 * `/prime`. The button is the same `joinPrimeAction` that page uses, so it
 * charges the wallet and starts a real membership -- it does not link away to a
 * form that does the work.
 */
export function JoinPrimeStrip({
  member,
  signedIn,
  csrfField,
}: {
  member: boolean;
  signedIn: boolean;
  csrfField: ReactNode;
}) {
  const [state, formAction] = useActionState(joinPrimeAction, emptyFormState);

  if (member) {
    return (
      <div className="border-hairline flex items-center gap-2 border-t bg-gradient-to-r from-sky-500/15 to-transparent px-4 py-3 text-sm sm:px-5">
        <BadgeCheck className="text-instock h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Prime is active.</span>{' '}
          <span className="text-ink-muted">
            Delivery is free on every order, whatever the basket comes to.
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="border-hairline border-t bg-gradient-to-r from-sky-500/15 to-transparent px-4 py-3 sm:px-5">
      <p className="text-sm">
        <span className="font-semibold">Save more with Prime</span>{' '}
        <span className="text-ink-muted">
          — free delivery on every order, no minimum, plus the Prime Video catalogue.
        </span>
      </p>

      {state.message && (
        <div className="mt-2 max-w-md">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      )}

      <form action={formAction} className="mt-2 flex flex-wrap items-center gap-3">
        {csrfField}
        <input type="hidden" name="plan" value="MONTHLY" />
        {signedIn ? (
          <SubmitButton size="sm" pendingLabel="Joining...">
            Join Prime
          </SubmitButton>
        ) : (
          <Link
            href="/auth/login?next=/prime"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-9 items-center rounded-md px-4 text-sm font-semibold"
          >
            Sign in to join Prime
          </Link>
        )}
        <Link href="/prime" className="text-link text-sm font-semibold hover:underline">
          Compare plans
        </Link>
      </form>

      <p className="text-ink-subtle mt-1.5 text-[11px]">
        Charged to your Amazon Pay balance. The benefit applies to the next order you place.
      </p>
    </div>
  );
}
