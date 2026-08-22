import { ChevronRight, Gift, Sparkles, UserCog, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { AddMoneyForm } from '@/components/pay/add-money-form';
import { Alert } from '@/components/ui/alert';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import type { WalletEntryType } from '@/models/wallet';
import { getWalletSummary, listWalletEntries } from '@/services/wallet';

export const metadata: Metadata = {
  title: 'Amazon Pay balance',
  description: 'Your Amazon Pay balance, wallet, gift cards and vouchers.',
};

/**
 * The Amazon Pay balance screen, reached from "Add Money" on `/pay`.
 *
 * Laid out to the reference: the balance and its breakdown on the left above
 * the top-up panel, and a column of onward links on the right.
 *
 * The figures are summed from the ledger in `services/wallet.ts` for the
 * signed-in user, so they are real balances rather than placeholders. Vouchers
 * have no ledger of their own yet and are shown as the zero they actually are.
 */

const BREAKDOWN: Array<{ label: string; note?: string; key: 'wallet' | 'giftCards' | 'vouchers' }> =
  [
    { key: 'wallet', label: 'Wallet' },
    { key: 'giftCards', label: 'Gift Cards', note: 'Includes Cashback & Refunds' },
    { key: 'vouchers', label: 'Vouchers' },
  ];

/**
 * What each ledger entry is called on screen.
 *
 * Typed against the union so a new entry type is a compile error here rather
 * than a row that quietly reads "Wallet top-up" while money leaves the wallet.
 */
const ENTRY_LABELS: Record<WalletEntryType, string> = {
  TOP_UP: 'Wallet top-up',
  GIFT_CARD: 'Gift card',
  PRIME: 'Prime membership',
  VIDEO: 'Prime Video',
  ORDER: 'Order payment',
  REFUND: 'Order refund',
  CASHBACK: 'Order cashback',
  RECHARGE: 'Mobile recharge',
  BUS: 'Bus ticket',
  TRAIN: 'Train ticket',
  HOTEL: 'Hotel booking',
  GIFT_PURCHASE: 'Gift card bought',
  INSURANCE: 'Insurance premium',
  FASTAG: 'FASTag',
  METRO: 'Metro card',
  BILL: 'Bill payment',
  CONTENT_CREDIT: 'Store credit',
};

const DO_MORE: Array<{ label: string; href?: string }> = [
  { label: 'Add Gift Card to Balance', href: '/pay/gift-cards' },
  { label: 'Statement with a running balance', href: '/pay/statement' },
  { label: 'Your rewards', href: '/pay/rewards' },
  { label: 'Add Cash to balance' },
];

function RowLink({ label, href }: { label: string; href?: string }) {
  const content = (
    <>
      <span className={href ? 'text-link' : 'text-ink-subtle'}>{label}</span>
      {href ? (
        <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <span className="text-ink-subtle text-[10px] tracking-wide uppercase">Soon</span>
      )}
    </>
  );

  if (!href) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">{content}</div>
    );
  }

  return (
    <Link
      href={href}
      className="hover:bg-surface-sunken flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
    >
      {content}
    </Link>
  );
}

interface PageProps {
  searchParams: Promise<{ added?: string }>;
}

export default async function PayBalancePage({ searchParams }: PageProps) {
  const session = await getSession();
  const { added } = await searchParams;

  // Signed-out visitors see a real zero, not someone else's figures.
  const summary = session
    ? await getWalletSummary(session.user.id)
    : { balance: 0, wallet: 0, giftCards: 0, pending: 0 };
  const entries = session ? await listWalletEntries(session.user.id, 5) : [];

  return (
    <Container size="default" className="py-5 sm:py-7">
      <nav aria-label="Breadcrumb" className="text-ink-muted mb-3 text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Balance</span>
      </nav>

      <h1 className="text-xl font-bold sm:text-2xl">Amazon Pay balance</h1>

      {added === '1' && (
        <div className="mt-3">
          <Alert tone="success">Money added. Your wallet balance is updated below.</Alert>
        </div>
      )}

      {summary.pending > 0 && (
        <div className="mt-3">
          <Alert tone="info">
            {formatPaise(summary.pending)} is awaiting payment and is not counted in your balance
            yet.
          </Alert>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        {/* --------------------------------------------------------- left */}
        <div className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold">Total balance</h2>
            <span className="text-accent-400 text-lg font-bold">
              {formatPaise(summary.balance)}
            </span>
          </div>

          <ul className="border-hairline mt-3 divide-y border-t border-dashed">
            {BREAKDOWN.map((row) => (
              <li key={row.label} className="flex items-start justify-between gap-3 py-2.5">
                <span className="text-ink-muted text-sm">
                  {row.label}
                  {row.note && <span className="text-ink-subtle block text-xs">{row.note}</span>}
                </span>
                <span className="text-ink-muted text-sm">
                  {formatPaise(
                    row.key === 'wallet'
                      ? summary.wallet
                      : row.key === 'giftCards'
                        ? summary.giftCards
                        : 0,
                  )}
                </span>
              </li>
            ))}
          </ul>

          <AddMoneyForm csrfField={<CsrfField />} signedIn={Boolean(session)} />

          {/* --------------------------------------------------- rewards */}
          <div className="border-hairline mt-5 flex max-w-sm items-center gap-3 rounded-xl border p-3">
            <span
              aria-hidden="true"
              className="bg-accent-500/15 text-accent-400 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            >
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Scratch Card Rewards</p>
              <p className="text-ink-muted text-xs">
                Win offers from top brands every time you pay
              </p>
              <p className="text-ink-subtle mt-0.5 text-[11px] tracking-wide uppercase">
                Not available in this store
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-sm">
            <Link href="/help" className="text-link hover:underline">
              Help &amp; FAQs
            </Link>
            <span className="text-ink-subtle mx-2" aria-hidden="true">
              |
            </span>
            <Link href="/terms" className="text-link hover:underline">
              Condition of Use
            </Link>
          </p>
        </div>

        {/* -------------------------------------------------------- right */}
        <div className="space-y-4">
          <section
            aria-labelledby="do-more"
            className="border-hairline bg-surface overflow-hidden rounded-2xl border"
          >
            <h2 id="do-more" className="border-hairline border-b px-4 py-3 text-sm font-bold">
              Do more with Amazon Pay Balance
            </h2>
            <ul className="divide-hairline divide-y">
              {DO_MORE.map((row) => (
                <li key={row.label}>
                  <RowLink label={row.label} {...(row.href ? { href: row.href } : {})} />
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="transactions"
            className="border-hairline bg-surface overflow-hidden rounded-2xl border"
          >
            <h2 id="transactions" className="border-hairline border-b px-4 py-3 text-sm font-bold">
              Transaction history
            </h2>

            {entries.length === 0 ? (
              <p className="text-ink-subtle px-4 py-3 text-sm">No wallet activity yet.</p>
            ) : (
              <ul className="divide-hairline divide-y">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm">{ENTRY_LABELS[entry.type]}</span>
                      <span className="text-ink-subtle block font-mono text-xs">
                        {entry.reference}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={
                          entry.direction === 'CREDIT'
                            ? 'text-instock block text-sm font-semibold'
                            : 'block text-sm font-semibold'
                        }
                      >
                        {entry.direction === 'CREDIT' ? '+' : '−'} {formatPaise(entry.amount)}
                      </span>
                      <span
                        className={
                          entry.status === 'COMPLETED'
                            ? 'text-instock block text-[11px] uppercase'
                            : entry.status === 'FAILED'
                              ? 'text-deal block text-[11px] uppercase'
                              : 'text-ink-subtle block text-[11px] uppercase'
                        }
                      >
                        {entry.status.toLowerCase()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <RowLink label="Order payments" href="/orders" />
          </section>

          <section
            aria-labelledby="manage"
            className="border-hairline bg-surface overflow-hidden rounded-2xl border"
          >
            <h2 id="manage" className="border-hairline border-b px-4 py-3 text-sm font-bold">
              Manage
            </h2>
            <Link
              href="/account"
              className="hover:bg-surface-sunken flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="bg-surface-sunken text-ink-muted flex h-8 w-8 items-center justify-center rounded-full"
                >
                  <UserCog className="h-4 w-4" />
                </span>
                Account Settings
              </span>
              <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </section>

          <div className="border-hairline text-ink-subtle rounded-2xl border border-dashed p-3 text-xs leading-relaxed">
            <span className="text-ink-muted mb-1 flex items-center gap-1.5 font-semibold">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              About this balance
            </span>
            Every figure here is summed from your own ledger: top-ups settled by the built-in test
            gateway, gift cards you have redeemed, and everything you have spent. Vouchers have no
            ledger yet, so that row is genuinely zero rather than sample data — see the{' '}
            <Link href="/pay" className="text-link hover:underline">
              Amazon Pay
            </Link>{' '}
            directory, where unavailable services are marked.
            <span className="mt-2 flex items-start gap-1.5">
              <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Spendable at{' '}
                <Link href="/cart" className="text-link hover:underline">
                  checkout
                </Link>
                , and on{' '}
                <Link href="/prime" className="text-link hover:underline">
                  Prime and Prime Video
                </Link>
                . Cancel an order paid this way and the money comes straight back here.
              </span>
            </span>
          </div>
        </div>
      </div>
    </Container>
  );
}
