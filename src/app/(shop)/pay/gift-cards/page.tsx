import { ChevronRight, CreditCard, Gift, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { getWalletSummary } from '@/services/wallet';

import { RedeemGiftCardForm } from './redeem-form';

export const metadata: Metadata = {
  title: 'Eshwaran Pay Gift card',
  description: 'Add a gift card to your Eshwaran Pay balance.',
};

/**
 * Gift cards, reached from "Add Gift Card" on `/pay`.
 *
 * The available balance is the gift-card share of the ledger, kept separate
 * from wallet top-ups so this page reports what it claims to rather than the
 * combined figure.
 */
export default async function GiftCardsPage() {
  const session = await getSession();
  const summary = session
    ? await getWalletSummary(session.user.id)
    : { balance: 0, wallet: 0, giftCards: 0, pending: 0 };

  return (
    <Container size="default" className="py-5 sm:py-7">
      <nav aria-label="Breadcrumb" className="text-ink-muted mb-3 text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Eshwaran Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Gift cards</span>
      </nav>

      <h1 className="text-xl font-bold sm:text-2xl">Eshwaran Pay Gift card</h1>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
        {/* --------------------------------------------------------- left */}
        <div className="space-y-4">
          <section className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
            <div className="border-hairline flex items-center gap-3 rounded-xl border p-3">
              <span
                aria-hidden="true"
                className="bg-accent-500/15 text-accent-400 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              >
                <Gift className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Gift Cards</p>
                <p className="text-ink-muted text-xs">
                  Available balance:{' '}
                  <span className="text-accent-400 font-bold">
                    {formatPaise(summary.giftCards)}
                  </span>
                </p>
              </div>
            </div>

            <h2 className="mt-5 text-sm font-bold">Add gift card to balance</h2>
            <RedeemGiftCardForm csrfField={<CsrfField />} signedIn={Boolean(session)} />

            <p className="mt-3 text-sm">
              <Link href="/help" className="text-link hover:underline">
                Need more help?
              </Link>
            </p>
          </section>

          {/* Where the codes come from, since there is no shop selling them. */}
          <section className="border-hairline bg-surface rounded-2xl border border-dashed p-4 text-xs leading-relaxed">
            <span className="text-ink-muted mb-1 flex items-center gap-1.5 font-semibold">
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              Where to get a code
            </span>
            <p className="text-ink-subtle">
              This store does not sell gift cards, so nothing here issues one to you. Mint test
              cards with <code className="text-ink font-mono">pnpm giftcards:mint</code> and redeem
              the codes it prints. Only a keyed hash of each code is stored, so the command prints
              them once and cannot show them again.
            </p>
          </section>
        </div>

        {/* -------------------------------------------------------- right */}
        <div className="space-y-4">
          <section className="border-hairline bg-surface rounded-2xl border p-4">
            <h2 className="text-sm font-bold">Add money</h2>
            <p className="text-ink-muted mt-1 text-xs leading-relaxed">
              You can add money to your wallet with the built-in test gateway.
            </p>
            <Link
              href="/pay/balance"
              className="bg-surface-sunken border-hairline hover:border-accent-500 mt-3 flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Add money to Wallet
            </Link>
            <p className="mt-2 text-xs">
              <Link href="/help" className="text-link hover:underline">
                Need more help?
              </Link>
            </p>
          </section>

          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <Link
              href="/pay/balance"
              className="hover:bg-surface-sunken flex items-center justify-between gap-3 px-4 py-3 text-sm font-bold transition-colors"
            >
              Transaction history
              <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </section>
        </div>
      </div>

      <p className="mt-5 text-center text-sm">
        <Link href="/help" className="text-link hover:underline">
          Help and FAQs
        </Link>
      </p>
    </Container>
  );
}
