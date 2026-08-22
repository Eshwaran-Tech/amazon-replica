import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { requirePageUser } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { findPendingTopUp } from '@/services/wallet';

import { TopUpCardForm } from './card-form';

export const metadata: Metadata = {
  title: 'Add money to wallet',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ entryId: string }>;
}

/**
 * Payment step for a pending wallet top-up.
 *
 * Ownership is enforced inside the lookup, not by a check afterwards: the
 * entry is found by id *and* the session's user id together, so another
 * customer's top-up id is indistinguishable from one that never existed --
 * the same safe-404 the order payment page uses.
 *
 * The amount is read from the stored entry and only *displayed*. There is no
 * amount field on this page and none in `walletCardSchema`, so the figure
 * cannot be re-stated at payment time.
 */
export default async function TopUpPage({ params }: PageProps) {
  const session = await requirePageUser('/pay/balance');
  const { entryId } = await params;

  const entry = await findPendingTopUp(session.user.id, entryId);
  if (!entry) notFound();

  if (entry.status === 'COMPLETED') redirect('/pay/balance?added=1');

  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-muted mb-3 text-sm">
        <Link href="/pay/balance" className="hover:text-link hover:underline">
          Amazon Pay balance
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Add money</span>
      </nav>

      <h1 className="text-xl font-bold sm:text-2xl">Add money to your wallet</h1>
      <p className="text-ink-muted mt-1 text-sm">
        Reference <span className="text-ink font-mono font-semibold">{entry.reference}</span> —
        amount <span className="text-ink font-semibold">{formatPaise(entry.amount)}</span>.
      </p>

      {entry.status === 'FAILED' && entry.failureReason && (
        <p className="text-deal mt-2 text-sm">
          Previous attempt failed ({entry.failureReason.replace(/_/g, ' ')}). Start a new top-up
          from the{' '}
          <Link href="/pay/balance" className="text-link hover:underline">
            balance page
          </Link>
          .
        </p>
      )}

      {entry.status === 'PENDING' && (
        <div className="mt-4 space-y-4">
          <Alert tone="info">
            Test gateway — no real money moves. Cards: 4242 4242 4242 4242 succeeds, 4000 0000 0000
            0002 is declined, 4000 0000 0000 9995 fails with insufficient funds.
          </Alert>

          <TopUpCardForm
            entryId={entry.id}
            amountFormatted={formatPaise(entry.amount)}
            csrfField={<CsrfField />}
          />
        </div>
      )}
    </Container>
  );
}
