import { Landmark, PiggyBank, Scissors } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { loanBill, prepaymentEffect } from '@/services/bills/credit';
import { listSavedBillers } from '@/services/bills/pay';

export const metadata: Metadata = {
  title: 'Loan repayment',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Loan repayment.
 *
 * Built around the two things an EMI hides:
 *
 *  - **How little of it is principal.** Early in a long loan, most of each
 *    instalment is interest, and the schedule here shows the split month by
 *    month rather than a single "EMI" figure.
 *  - **What one lump sum would do.** A prepayment comes straight off principal,
 *    so every future month's interest is charged on less — the saving compounds
 *    for the rest of the tenure and is always larger than people expect. The
 *    page runs the loan forward twice and shows the difference.
 *
 * The prepayment amounts are links, so the whole simulation lives in the URL.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string; prepay?: string }>;
}

export default async function LoanPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('LOAN')[0]?.id ?? '';
  const bill = params.account
    ? loanBill(billerId, params.account.replace(/\s/g, '').toUpperCase(), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'LOAN') : [];

  // A few lump sums worth simulating, expressed in instalments rather than in
  // round rupees -- "three EMIs" is a decision somebody can actually make.
  const multiples = [1, 3, 6, 12];
  const chosen = Number.parseInt(params.prepay ?? '', 10);
  const prepayMultiple = multiples.includes(chosen) ? chosen : 0;
  const lump = bill && prepayMultiple > 0 ? bill.emi * prepayMultiple : 0;
  const effect =
    bill && lump > 0 ? prepaymentEffect(bill.outstanding, bill.annualRate, bill.emi, lump) : null;

  const paidShare = bill ? (bill.paidMonths / bill.tenureMonths) * 100 : 0;
  const principalShare = bill ? (bill.thisMonth.principal / bill.emi) * 100 : 0;

  const link = (prepay: number): string => {
    const next = new URLSearchParams();
    if (params.biller) next.set('biller', params.biller);
    if (params.account) next.set('account', params.account);
    if (prepay > 0) next.set('prepay', String(prepay));
    return `/pay/bills/loan?${next.toString()}`;
  };

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Loan repayment</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Landmark className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Loan repayment
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          With the split an EMI hides, and what putting one extra instalment against the principal
          would actually save.
        </p>
      </header>

      <NoBillerNotice what="lender" />

      <AccountForm
        category="LOAN"
        action="/pay/bills/loan"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That loan account number does not look right.</p>
          <p className="text-ink-muted mt-1">
            Two letters and eight digits — HL for a home loan, CL for a car loan, PL for a personal
            loan.
          </p>
        </div>
      )}

      {bill && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* --------------------------------------------- where it is */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-bold">
                    {bill.kind} · {bill.holder}
                  </p>
                  <p className="text-ink-muted font-mono text-xs tracking-wide">{bill.account}</p>
                </div>
                <p className="text-ink-muted text-xs">
                  {formatPaise(bill.principal)} at {bill.annualRate}% for {bill.tenureMonths / 12}{' '}
                  years
                </p>
              </div>

              <div className="border-hairline border-b px-4 py-4">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-bold">
                    Instalment {bill.paidMonths} of {bill.tenureMonths} paid
                  </span>
                  <span className="text-ink-muted tabular-nums">
                    {formatPaise(bill.outstanding)} outstanding
                  </span>
                </div>
                <div className="bg-surface-sunken mt-2 h-3 overflow-hidden rounded-full">
                  <div
                    className="bg-accent-500 h-full rounded-full"
                    style={{ width: `${paidShare}%` }}
                  />
                </div>
                <p className="text-ink-subtle mt-2 text-xs">
                  {bill.remainingMonths} instalments still to run, carrying{' '}
                  {formatPaise(bill.interestRemaining)} of interest if nothing changes.
                </p>
              </div>

              {/* ------------------------------- what this month's EMI is */}
              <div className="px-4 py-4">
                <p className="text-ink-muted text-xs">This month&rsquo;s instalment</p>
                <p className="text-2xl font-bold">{formatPaise(bill.emi)}</p>

                <div className="mt-3 flex h-6 overflow-hidden rounded-lg">
                  <div
                    className="bg-instock flex items-center justify-center text-[0.65rem] font-bold text-emerald-950"
                    style={{ width: `${principalShare}%` }}
                  >
                    {principalShare > 18 && `${Math.round(principalShare)}%`}
                  </div>
                  <div
                    className="bg-deal flex items-center justify-center text-[0.65rem] font-bold text-red-950"
                    style={{ width: `${100 - principalShare}%` }}
                  >
                    {100 - principalShare > 18 && `${Math.round(100 - principalShare)}%`}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap justify-between gap-3 text-xs">
                  <span className="text-instock font-bold">
                    Principal {formatPaise(bill.thisMonth.principal)}
                  </span>
                  <span className="text-deal font-bold">
                    Interest {formatPaise(bill.thisMonth.interest)}
                  </span>
                </div>

                <p className="text-ink-muted mt-3 text-xs leading-relaxed">
                  {principalShare < 50 ? (
                    <>
                      Most of this instalment is interest. That is not a fault of the loan — it is
                      how a reducing-balance EMI works: the interest is charged on what is still
                      outstanding, so it dominates early and shrinks as the principal falls.
                    </>
                  ) : (
                    <>
                      You are past the point where interest dominates — {Math.round(principalShare)}
                      % of each instalment now goes to the principal, and that share climbs every
                      month from here.
                    </>
                  )}
                </p>
              </div>
            </section>

            {/* ------------------------------------- the amortisation table */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                The next twelve instalments
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-xs">
                  <thead className="text-ink-subtle border-hairline border-b text-left">
                    <tr>
                      <th className="px-4 py-2 font-bold">No.</th>
                      <th className="px-2 py-2 text-right font-bold">Interest</th>
                      <th className="px-2 py-2 text-right font-bold">Principal</th>
                      <th className="px-4 py-2 text-right font-bold">Balance after</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {bill.schedule.map((row) => (
                      <tr key={row.month}>
                        <td className="px-4 py-2 tabular-nums">{row.month}</td>
                        <td className="text-deal px-2 py-2 text-right tabular-nums">
                          {formatPaise(row.interest)}
                        </td>
                        <td className="text-instock px-2 py-2 text-right tabular-nums">
                          {formatPaise(row.principal)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatPaise(row.closing)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ------------------------------------ the prepayment simulator */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <PiggyBank className="text-accent-400 h-4 w-4" aria-hidden="true" />
                What a prepayment would do
              </h2>

              <div className="border-hairline flex flex-wrap gap-1.5 border-b px-4 py-3">
                {[0, ...multiples].map((multiple) => (
                  <Link
                    key={multiple}
                    href={link(multiple)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                      multiple === prepayMultiple
                        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                        : 'border-hairline text-ink-muted hover:border-accent-500/60',
                    )}
                  >
                    {multiple === 0
                      ? 'Nothing extra'
                      : `${multiple} EMI${multiple === 1 ? '' : 's'} · ${formatPaise(bill.emi * multiple)}`}
                  </Link>
                ))}
              </div>

              {effect ? (
                <div className="px-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="border-instock/40 bg-instock/10 rounded-xl border p-3">
                      <p className="text-instock text-lg font-bold tabular-nums">
                        {effect.monthsSaved} months
                      </p>
                      <p className="text-ink-subtle text-xs">off the tenure</p>
                    </div>
                    <div className="border-instock/40 bg-instock/10 rounded-xl border p-3">
                      <p className="text-instock text-lg font-bold tabular-nums">
                        {formatPaise(effect.interestSaved)}
                      </p>
                      <p className="text-ink-subtle text-xs">of interest never charged</p>
                    </div>
                  </div>

                  <p className="text-ink-muted mt-4 text-sm leading-relaxed">
                    Putting {formatPaise(lump)} against the principal today turns{' '}
                    {effect.monthsWithout} remaining instalments into {effect.monthsWith}, and{' '}
                    {formatPaise(effect.interestWithout)} of interest into{' '}
                    {formatPaise(effect.interestWith)}.
                  </p>
                  <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
                    That is{' '}
                    <span className="text-ink font-bold">
                      {(effect.interestSaved / lump).toFixed(2)}×
                    </span>{' '}
                    the amount you put in — because the prepayment comes straight off the principal
                    and every future month&rsquo;s interest is then charged on less. The saving
                    compounds for the rest of the tenure, which is why it is always larger than
                    people expect.
                  </p>
                </div>
              ) : (
                <p className="text-ink-muted px-4 py-6 text-sm">
                  Choose a lump sum above to see what it would take off the tenure and the interest.
                </p>
              )}
            </section>
          </div>

          <aside className="min-w-0 space-y-3">
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              <p className="text-ink-muted text-xs">Instalment due</p>
              <p className="text-2xl font-bold">{formatPaise(bill.total)}</p>
              <p className="text-ink-subtle mt-1 text-xs">
                {bill.billerName} ·{' '}
                {bill.cycle.daysLate > 0
                  ? `${bill.cycle.daysLate} days overdue`
                  : `due ${bill.cycle.dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
              </p>

              <div className="mt-4 space-y-3">
                {session ? (
                  <>
                    <PayForm
                      fields={{
                        category: 'LOAN',
                        biller: bill.billerId,
                        account: bill.account,
                        option: 'FULL',
                      }}
                      label={`Pay ${formatPaise(bill.total)}`}
                      saveAs={bill.billerName}
                    />

                    {prepayMultiple > 0 && (
                      <PayForm
                        fields={{
                          category: 'LOAN',
                          biller: bill.billerId,
                          account: bill.account,
                          option: 'PREPAY',
                          amount: String(Math.round(lump / 100)),
                        }}
                        variant="secondary"
                        label={`Pay ${formatPaise(bill.emi + lump)} with the prepayment`}
                        saveAs={null}
                      />
                    )}
                  </>
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/loan"
                    className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                  >
                    Sign in to pay
                  </Link>
                )}
              </div>
            </section>

            {/* ------------------------------------------------ foreclose */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Scissors className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Close it early
              </h2>
              <div className="space-y-2 px-4 py-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Outstanding principal</span>
                  <span className="tabular-nums">{formatPaise(bill.foreclosure.amount)}</span>
                </div>
                {bill.foreclosure.charge > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">
                      Foreclosure charge, {bill.foreclosure.chargePercent}%
                    </span>
                    <span className="tabular-nums">{formatPaise(bill.foreclosure.charge)}</span>
                  </div>
                ) : (
                  <p className="text-instock">
                    No foreclosure charge — a bank may not levy one on a floating-rate loan to an
                    individual.
                  </p>
                )}
                <div className="border-hairline flex justify-between border-t pt-2 font-bold">
                  <span>To close today</span>
                  <span className="tabular-nums">{formatPaise(bill.foreclosure.total)}</span>
                </div>
                <p className="text-ink-subtle leading-relaxed">
                  Against {formatPaise(bill.interestRemaining)} of interest you would otherwise pay
                  over {bill.remainingMonths} more months.
                </p>

                {session && (
                  <div className="pt-2">
                    <PayForm
                      fields={{
                        category: 'LOAN',
                        biller: bill.billerId,
                        account: bill.account,
                        option: 'FORECLOSE',
                      }}
                      variant="secondary"
                      label={`Close for ${formatPaise(bill.foreclosure.total)}`}
                      saveAs={null}
                    />
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
