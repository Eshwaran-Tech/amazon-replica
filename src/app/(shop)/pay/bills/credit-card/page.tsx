import { AlertTriangle, CreditCard, ShieldCheck, TrendingDown } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  cardBill,
  MIN_DUE_FLOOR_RUPEES,
  MIN_DUE_PERCENT,
  revolveCost,
} from '@/services/bills/credit';
import { listSavedBillers } from '@/services/bills/pay';

import { PayChoice } from './pay-choice';

export const metadata: Metadata = {
  title: 'Credit card bill',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Credit card.
 *
 * The page is built around **one number that no statement shows you**: what
 * paying only the minimum actually costs, in months and in rupees. A card
 * charges around 3.5% a month once you revolve — 42% a year — and a minimum due
 * of 5% barely outruns it. On a typical balance the interest ends up larger
 * than the original spending, and it takes over a decade.
 *
 * That is computed month by month here, from the balance in front of you, and
 * shown next to the button that would do it.
 *
 * **The full card number is never asked for.** The account is a registered
 * mobile and the last four digits, which identifies the card to whoever holds
 * it without this store touching a card number. Same rule as saved cards.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function CreditCardPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('CREDIT_CARD')[0]?.id ?? '';
  const bill = params.account
    ? cardBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'CREDIT_CARD') : [];

  // What the same balance costs if the minimum is paid instead of the total.
  const usedShare = bill ? (bill.statementBalance / bill.creditLimit) * 100 : 0;

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Credit card</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <CreditCard className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Credit card bill
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          With the figure a statement leaves out: what paying only the minimum would cost you, in
          months and in rupees.
        </p>
      </header>

      <div className="border-instock/40 bg-instock/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <ShieldCheck className="text-instock mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">This page never asks for a card number.</span> It
          takes your registered mobile and the last four digits — enough to recognise your own card,
          and nothing this store could misuse if it wanted to. No card number is stored anywhere in
          this codebase.
        </p>
      </div>

      <NoBillerNotice what="bank" />

      <AccountForm
        category="CREDIT_CARD"
        action="/pay/bills/credit-card"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That does not look right.</p>
          <p className="text-ink-muted mt-1">
            Your ten-digit registered mobile, then the last four digits of the card.
          </p>
        </div>
      )}

      {bill && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* -------------------------------------------- the statement */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-bold">{bill.holder}</p>
                  <p className="text-ink-muted font-mono text-xs tracking-widest">
                    •••• •••• •••• {bill.lastFour}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ink-muted text-xs">{bill.cycle.label}</p>
                  <p
                    className={cn(
                      'text-xs font-bold',
                      bill.cycle.daysLate > 0 ? 'text-deal' : 'text-ink-muted',
                    )}
                  >
                    {bill.cycle.daysLate > 0
                      ? `${bill.cycle.daysLate} days overdue`
                      : `Due ${bill.cycle.dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
              </div>

              <div className="border-hairline grid grid-cols-2 divide-x divide-[color:var(--color-hairline,#2a3441)] border-b sm:grid-cols-4">
                {[
                  { label: 'Total due', value: formatPaise(bill.statementBalance), strong: true },
                  { label: 'Minimum due', value: formatPaise(bill.minimumDue) },
                  { label: 'Unbilled', value: formatPaise(bill.unbilled) },
                  { label: 'Available', value: formatPaise(bill.availableLimit) },
                ].map((cell) => (
                  <div key={cell.label} className="px-3 py-3 text-center">
                    <p className={cn('text-sm tabular-nums', cell.strong ? 'font-bold' : '')}>
                      {cell.value}
                    </p>
                    <p className="text-ink-subtle text-xs">{cell.label}</p>
                  </div>
                ))}
              </div>

              <div className="border-hairline border-b px-4 py-4">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-bold">Limit used</span>
                  <span className="text-ink-muted tabular-nums">
                    {Math.round(usedShare)}% of {formatPaise(bill.creditLimit)}
                  </span>
                </div>
                <div className="bg-surface-sunken mt-2 h-3 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      usedShare > 70 ? 'bg-deal' : usedShare > 30 ? 'bg-accent-500' : 'bg-instock',
                    )}
                    style={{ width: `${Math.min(100, usedShare)}%` }}
                  />
                </div>
                {usedShare > 30 && (
                  <p className="text-ink-muted mt-2 text-xs leading-relaxed">
                    Sustained use above about 30% of a limit is the single largest drag on a credit
                    score after a missed payment — separately from any interest.
                  </p>
                )}
              </div>

              <div className="px-4 py-4">
                <BillLines
                  lines={bill.lines}
                  total={bill.statementBalance}
                  totalLabel="Total due"
                />
                <p className="text-ink-subtle mt-3 text-xs">
                  {bill.rewardPoints.toLocaleString('en-IN')} reward points on the card.
                </p>
              </div>
            </section>

            {/* --------------------------------- the cost of the minimum */}
            <section className="border-deal/50 bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <TrendingDown className="text-deal h-4 w-4" aria-hidden="true" />
                What paying only the minimum costs
              </h2>

              <div className="px-4 py-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      label: 'To clear it',
                      value: bill.revolve.neverClears
                        ? 'Never'
                        : `${Math.floor(bill.revolve.months / 12)}y ${bill.revolve.months % 12}m`,
                      tone: 'text-deal',
                    },
                    {
                      label: 'Interest paid',
                      value: formatPaise(bill.revolve.interest),
                      tone: 'text-deal',
                    },
                    {
                      label: 'Paid in total',
                      value: formatPaise(bill.revolve.totalPaid),
                      tone: 'text-ink',
                    },
                  ].map((cell) => (
                    <div
                      key={cell.label}
                      className="border-hairline bg-surface-sunken rounded-xl border p-3"
                    >
                      <p className={cn('text-lg font-bold tabular-nums', cell.tone)}>
                        {cell.value}
                      </p>
                      <p className="text-ink-subtle text-xs">{cell.label}</p>
                    </div>
                  ))}
                </div>

                <p className="text-ink-muted mt-4 text-sm leading-relaxed">
                  On {formatPaise(bill.statementBalance)}, paying only the minimum every month costs{' '}
                  <span className="text-deal font-bold">{formatPaise(bill.revolve.interest)}</span>{' '}
                  in interest — {Math.round((bill.revolve.interest / bill.statementBalance) * 100)}%
                  of what you actually spent — and takes {bill.revolve.months} months.
                </p>

                <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
                  The card charges {bill.monthlyRate}% a month, which is{' '}
                  <span className="text-ink font-bold">{bill.annualRate}% a year</span>. The minimum
                  due is {MIN_DUE_PERCENT}% of the balance with a ₹{MIN_DUE_FLOOR_RUPEES} floor — so
                  it barely outruns the interest, and almost all of each payment goes to the bank
                  rather than to the debt. Simulated month by month from the balance above, not
                  estimated.
                </p>

                {/* A couple of alternatives, so the number is actionable. */}
                <div className="border-hairline mt-4 overflow-hidden rounded-xl border">
                  <table className="w-full text-xs">
                    <thead className="text-ink-subtle border-hairline border-b text-left">
                      <tr>
                        <th className="px-3 py-2 font-bold">If you pay</th>
                        <th className="px-2 py-2 text-right font-bold">Cleared in</th>
                        <th className="px-3 py-2 text-right font-bold">Interest</th>
                      </tr>
                    </thead>
                    <tbody className="divide-hairline divide-y">
                      <tr className="text-instock font-bold">
                        <td className="px-3 py-2">
                          The total, {formatPaise(bill.statementBalance)}
                        </td>
                        <td className="px-2 py-2 text-right">This month</td>
                        <td className="px-3 py-2 text-right tabular-nums">Nothing</td>
                      </tr>
                      {[0.5, 0.25].map((share) => {
                        const part = Math.round((bill.statementBalance * share) / 100) * 100;
                        const rest = revolveCost(bill.statementBalance - part);
                        return (
                          <tr key={share}>
                            <td className="px-3 py-2">
                              {Math.round(share * 100)}% now, {formatPaise(part)}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {rest.months} months
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatPaise(rest.interest)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="text-deal font-bold">
                        <td className="px-3 py-2">The minimum, {formatPaise(bill.minimumDue)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {bill.revolve.months} months
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPaise(bill.revolve.interest)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          <aside>
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              <h2 className="mb-3 text-sm font-bold">How much to pay</h2>

              {session ? (
                <PayChoice
                  category="CREDIT_CARD"
                  biller={bill.billerId}
                  account={bill.account}
                  total={bill.statementBalance}
                  minimum={bill.minimumDue}
                  minimumWarning={
                    <div className="border-deal/40 bg-deal/10 flex items-start gap-2 rounded-xl border p-3">
                      <AlertTriangle
                        className="text-deal mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <p className="text-ink-muted text-xs leading-relaxed">
                        Paying {formatPaise(bill.minimumDue)} leaves{' '}
                        {formatPaise(bill.statementBalance - bill.minimumDue)} revolving at{' '}
                        {bill.monthlyRate}% a month. Kept up, that costs{' '}
                        <span className="text-deal font-bold">
                          {formatPaise(bill.revolve.interest)}
                        </span>{' '}
                        over {bill.revolve.months} months.
                      </p>
                    </div>
                  }
                />
              ) : (
                <Link
                  href="/auth/login?next=/pay/bills/credit-card"
                  className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                >
                  Sign in to pay
                </Link>
              )}
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
