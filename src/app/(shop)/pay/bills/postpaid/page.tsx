import { ArrowRight, Smartphone, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { POSTPAID_PLANS } from '@/data/telecom-plans';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers } from '@/services/bills/pay';
import { postpaidBill } from '@/services/bills/telecom';

export const metadata: Metadata = {
  title: 'Mobile postpaid bill',
  description: 'Pay a postpaid bill, itemised, with the plan that would have been cheaper.',
};

export const dynamic = 'force-dynamic';

/**
 * Mobile postpaid.
 *
 * A postpaid bill is a rental plus everything that went past it, and the thing
 * it never tells you is whether a different plan would have been cheaper for the
 * month you actually had. That is what this page computes -- against the whole
 * book, on this month's real usage, and only counting plans that carry at least
 * as many connections, because "cheaper" is not cheaper if it costs you a line.
 *
 * It is the reason people stay on the wrong plan for years.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function PostpaidPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('POSTPAID')[0]?.id ?? '';
  const bill = params.account
    ? postpaidBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'POSTPAID') : [];

  const usedShare = bill ? Math.min(1.4, bill.dataUsedGb / bill.plan.dataGb) : 0;

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Mobile postpaid</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Smartphone className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Mobile postpaid
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Itemised: the rental, then everything that went past it. And the plan that would have cost
          less for the month you actually had.
        </p>
      </header>

      <NoBillerNotice what="operator" />

      <AccountForm
        category="POSTPAID"
        action="/pay/bills/postpaid"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That is not a valid mobile number.</p>
          <p className="text-ink-muted mt-1">Ten digits, starting 6 to 9, with no country code.</p>
        </div>
      )}

      {bill && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <div className="border-hairline border-b px-4 py-3">
                <BillHeader
                  holder={bill.holder}
                  account={bill.account}
                  period={bill.cycle.label}
                  dueOn={bill.cycle.dueOn}
                  daysLate={bill.cycle.daysLate}
                />
              </div>

              {/* ------------------------------------------ data gauge */}
              <div className="border-hairline border-b px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-bold">{bill.plan.name}</p>
                  <p className="text-ink-muted text-xs tabular-nums">
                    {bill.dataUsedGb} of {bill.plan.dataGb} GB
                    {bill.plan.connections > 1 && ` across ${bill.plan.connections} connections`}
                  </p>
                </div>

                <div className="bg-surface-sunken mt-2 h-3 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      bill.overageGb > 0 ? 'bg-deal' : 'bg-instock',
                    )}
                    style={{ width: `${Math.min(100, (usedShare / 1.4) * 100)}%` }}
                  />
                </div>

                <p className="text-ink-subtle mt-2 text-xs">
                  {bill.overageGb > 0
                    ? `${bill.overageGb} GB past the quota, charged at ₹${bill.plan.overagePerGb} a GB.`
                    : `${bill.plan.dataGb - bill.dataUsedGb} GB left inside the plan.`}
                </p>

                <ul className="text-ink-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {bill.plan.includes.map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                </ul>
              </div>

              <div className="px-4 py-4">
                <BillLines lines={bill.lines} total={bill.total} totalLabel="Amount payable" />
              </div>
            </section>

            {/* ----------------------------- the plan that fits better */}
            <section
              className={cn(
                'border-hairline bg-surface overflow-hidden rounded-2xl border',
                bill.betterPlan && 'border-instock/50',
              )}
            >
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Sparkles className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Are you on the right plan?
              </h2>

              {bill.betterPlan ? (
                <div className="px-4 py-4">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink-muted">{bill.plan.name}</span>
                    <ArrowRight className="text-ink-subtle h-3.5 w-3.5" aria-hidden="true" />
                    <span className="font-bold">{bill.betterPlan.plan.name}</span>
                  </p>
                  <p className="text-instock mt-2 text-lg font-bold">
                    {formatPaise(bill.betterPlan.saves)} less this month
                  </p>
                  <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                    On exactly this month&rsquo;s usage — {bill.dataUsedGb} GB
                    {bill.isdMinutes > 0 && `, ${bill.isdMinutes} ISD minutes`}
                    {bill.roamingDays > 0 && `, ${bill.roamingDays} days of roaming`} — the{' '}
                    {bill.betterPlan.plan.name} would have billed{' '}
                    {formatPaise(bill.betterPlan.wouldHaveCost)} against your{' '}
                    {formatPaise(bill.total)}. It carries {bill.betterPlan.plan.dataGb} GB and{' '}
                    {bill.betterPlan.plan.connections} connection
                    {bill.betterPlan.plan.connections === 1 ? '' : 's'}, so nothing is given up.
                  </p>
                  <p className="text-ink-subtle mt-2 text-xs">
                    One month is one month. Check it against a heavier one before you switch.
                  </p>
                </div>
              ) : (
                <p className="text-ink-muted px-4 py-6 text-sm">
                  Nothing in the book would have been cheaper for this month&rsquo;s usage without
                  costing you a connection. You are on the right plan.
                </p>
              )}

              <div className="border-hairline overflow-x-auto border-t">
                <table className="w-full min-w-[26rem] text-xs">
                  <thead className="text-ink-subtle border-hairline border-b text-left">
                    <tr>
                      <th className="px-4 py-2 font-bold">Plan</th>
                      <th className="px-2 py-2 text-right font-bold">Rental</th>
                      <th className="px-2 py-2 text-right font-bold">Data</th>
                      <th className="px-2 py-2 text-right font-bold">Over</th>
                      <th className="px-4 py-2 text-right font-bold">Lines</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {POSTPAID_PLANS.map((plan) => (
                      <tr
                        key={plan.id}
                        className={cn(
                          plan.id === bill.plan.id && 'bg-accent-500/10 font-bold',
                          plan.id === bill.betterPlan?.plan.id && 'text-instock font-bold',
                        )}
                      >
                        <td className="px-4 py-2">{plan.name}</td>
                        <td className="px-2 py-2 text-right tabular-nums">₹{plan.rentalRupees}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{plan.dataGb} GB</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          ₹{plan.overagePerGb}/GB
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{plan.connections}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside>
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              <p className="text-ink-muted text-xs">Amount payable</p>
              <p className="text-2xl font-bold">{formatPaise(bill.total)}</p>
              <p className="text-ink-subtle mt-1 text-xs">
                {bill.billerName} · {bill.cycle.label}
              </p>

              <div className="mt-4">
                {session ? (
                  <PayForm
                    fields={{
                      category: 'POSTPAID',
                      biller: bill.billerId,
                      account: bill.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(bill.total)}`}
                    saveAs={bill.billerName}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/postpaid"
                    className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                  >
                    Sign in to pay
                  </Link>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
