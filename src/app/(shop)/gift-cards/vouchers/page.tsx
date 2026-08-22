import { Leaf, ShoppingBag, Sparkles, Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { getWalletSummary } from '@/services/wallet';
import { VOUCHER_TYPES } from '@/services/gift-store';

import { RedeemGiftCardForm } from '../../pay/gift-cards/redeem-form';

export const metadata: Metadata = {
  title: 'Add to Amazon Pay balance',
  description: 'Add a gift card or voucher code to your Amazon Pay balance.',
};

export const dynamic = 'force-dynamic';

const ICONS = {
  SHOPPING: ShoppingBag,
  FRESH: Leaf,
  GOLD: Sparkles,
  PRIME: Ticket,
} as const;

/**
 * Adding a code to the balance.
 *
 * The reference shows four voucher balances side by side. This store keeps
 * **one** Amazon Pay balance and says so, because four separately spendable
 * pots is a claim the checkout would immediately contradict -- there is one
 * ledger, and a rupee redeemed from a Fresh voucher buys a book just as well.
 *
 * What each voucher kind is issued *for* is real and worth showing, so the
 * panels explain it. What is not shown is four fictional numbers.
 */
export default async function VouchersPage() {
  const session = await getSession();
  const summary = session
    ? await getWalletSummary(session.user.id)
    : { balance: 0, wallet: 0, giftCards: 0, pending: 0 };

  return (
    <>
      <GiftNav active="/gift-cards/vouchers" />

      <Container size="default" className="space-y-5 py-5">
        <div>
          <h1 className="text-lg font-bold sm:text-xl">Vouchers &amp; gift cards</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Add a code and its value lands in your Amazon Pay balance.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="space-y-4">
            {/* --------------------------------------------------- the form */}
            <section className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
              <h2 className="text-sm font-bold">Enter voucher code</h2>
              <div className="mt-3">
                <RedeemGiftCardForm signedIn={Boolean(session)} csrfField={<CsrfField />} />
              </div>
              <p className="text-ink-subtle mt-3 text-[11px] leading-relaxed">
                Case and dashes do not matter — <span className="font-mono">8u9s y3e8cq-39mpq</span>{' '}
                and <span className="font-mono">8U9S-Y3E8CQ-39MPQ</span> are the same code. A wrong
                code and a used one give the same answer on purpose, so this box cannot be used to
                discover which codes exist.
              </p>
            </section>

            {/* ------------------------------------------ what the kinds mean */}
            <section aria-labelledby="kinds" className="space-y-3">
              <h2 id="kinds" className="text-sm font-bold">
                What the voucher kinds mean
              </h2>

              {VOUCHER_TYPES.map((type) => {
                const Icon = ICONS[type.id];
                return (
                  <article
                    key={type.id}
                    className="border-hairline bg-surface overflow-hidden rounded-2xl border"
                  >
                    <div
                      className="flex items-center gap-2.5 px-4 py-3"
                      style={{ background: `hsl(${type.hue} 46% 18%)` }}
                    >
                      <Icon className="h-4 w-4 text-white" aria-hidden="true" />
                      <h3 className="text-sm font-bold text-white">{type.name}</h3>
                    </div>

                    <div className="p-4">
                      <p className="text-ink-muted text-xs">{type.purpose}</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {type.spendableOn.map((entry) => (
                          <li
                            key={entry}
                            className="border-hairline text-ink-subtle rounded-full border px-2 py-0.5 text-[10px]"
                          >
                            {entry}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>

          {/* --------------------------------------------------- the balance */}
          <aside className="border-hairline bg-surface space-y-3 rounded-2xl border p-4 lg:sticky lg:top-4">
            <h2 className="text-sm font-bold">Your Amazon Pay balance</h2>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">From gift cards and vouchers</dt>
                <dd className="font-medium">{formatPaise(summary.giftCards)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">From top-ups</dt>
                <dd className="font-medium">{formatPaise(summary.wallet)}</dd>
              </div>
              <div className="border-hairline flex items-baseline justify-between border-t pt-2">
                <dt className="text-sm font-bold">Available</dt>
                <dd className="text-accent-400 text-lg font-bold">
                  {formatPaise(summary.balance)}
                </dd>
              </div>
            </dl>

            <p className="text-ink-subtle text-[11px] leading-relaxed">
              One balance, not four. A rupee redeemed from a Fresh voucher spends the same as any
              other — showing four separate pots here would be a claim the checkout would
              immediately contradict.
            </p>

            <Link
              href="/pay/balance"
              className="border-hairline hover:border-accent-500 block rounded-lg border px-3 py-2 text-center text-xs font-semibold transition-colors"
            >
              See every entry
            </Link>
            <Link
              href="/gift-cards/buy"
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-3 py-2 text-center text-xs font-bold"
            >
              Send a gift card
            </Link>
          </aside>
        </div>

        <p className="text-ink-subtle text-xs leading-relaxed">
          A gift card code is bearer money: whoever holds it can spend it. This store keeps only a
          keyed hash of every code, so a dumped database is worth nothing — and redemption is a
          single conditional update, so two people racing the same code cannot both be paid.
        </p>
      </Container>
    </>
  );
}
