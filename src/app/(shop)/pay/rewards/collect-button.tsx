'use client';

import { Check, Clock, X } from 'lucide-react';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { collectRewardAction } from '@/actions/pay';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { cn } from '@/lib/utils/cn';

/**
 * One tile's Collect button.
 *
 * A form per tile rather than one form for the page: collecting is a write, and
 * a page-wide form would mean every tile posting every other tile's state.
 *
 * A collected offer is not a button any more. The tile says what happened and
 * when it lapses, because "Collected" with no date is the state people forget
 * about until it has expired.
 */

interface Props {
  offerId: string;
  status: 'AVAILABLE' | 'CLAIMED' | 'REDEEMED' | 'EXPIRED' | 'SIGNED_OUT';
  /** Set when the claim is live or spent. */
  detail?: string;
  csrfField: ReactNode;
}

export function CollectButton({ offerId, status, detail, csrfField }: Props) {
  const [state, formAction] = useActionState(collectRewardAction, emptyFormState);

  if (status === 'SIGNED_OUT') {
    return (
      <a
        href="/auth/login?next=/pay/rewards"
        className="border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950 block rounded-md border px-3 py-1.5 text-center text-[11px] font-bold transition-colors"
      >
        Sign in to collect
      </a>
    );
  }

  if (status !== 'AVAILABLE') {
    const tone =
      status === 'REDEEMED'
        ? 'text-instock'
        : status === 'EXPIRED'
          ? 'text-ink-subtle'
          : 'text-accent-400';
    const Icon = status === 'REDEEMED' ? Check : status === 'EXPIRED' ? X : Clock;

    return (
      <p className={cn('flex items-center justify-center gap-1 text-[11px] font-semibold', tone)}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {status === 'REDEEMED' ? 'Used' : status === 'EXPIRED' ? 'Lapsed' : 'Collected'}
        {detail && <span className="text-ink-subtle font-normal">· {detail}</span>}
      </p>
    );
  }

  return (
    <form action={formAction}>
      {csrfField}
      <input type="hidden" name="offer" value={offerId} />

      {state.message && !state.ok && (
        <p role="alert" className="text-deal mb-1 text-[10px]">
          {state.message}
        </p>
      )}

      <SubmitButton fullWidth size="sm" pendingLabel="Collecting...">
        Collect Now
      </SubmitButton>
    </form>
  );
}
