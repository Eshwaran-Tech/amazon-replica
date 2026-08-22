import { Gauge, TrendingUp, Wifi } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { BROADBAND_PLANS } from '@/data/telecom-plans';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers } from '@/services/bills/pay';
import { broadbandBill } from '@/services/bills/telecom';

export const metadata: Metadata = {
  title: 'Broadband bill',
  description: 'Pay a broadband bill and see what the fair-use limit actually cost you.',
};

export const dynamic = 'force-dynamic';

/**
 * Broadband.
 *
 * Unlike every other bill here, going over on broadband **does not cost money**
 * — it costs speed. Past the fair-use limit the line is throttled, often to a
 * tenth of what you pay for, and the bill is identical. So the price of being on
 * the wrong plan is measured in *days at 4 Mbps*, and that is what this page
 * puts in front of you rather than a rupee figure that would be zero.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function BroadbandPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('BROADBAND')[0]?.id ?? '';
  const bill = params.account
    ? broadbandBill(billerId, params.account.replace(/\s/g, '').toUpperCase(), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'BROADBAND') : [];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Broadband</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Wifi className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Broadband
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Going past the fair-use limit does not cost money. It costs speed — and the bill looks
          exactly the same either way, which is why nobody notices.
        </p>
      </header>

      <NoBillerNotice what="internet provider" />

      <AccountForm
        category="BROADBAND"
        action="/pay/bills/broadband"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That account id does not look right.</p>
          <p className="text-ink-muted mt-1">
            Three letters and six digits, for example FBR204815.
          </p>
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
              <div className="px-4 py-4">
                <BillLines lines={bill.lines} total={bill.total} totalLabel="Amount payable" />
              </div>
            </section>

            {/* ------------------------------------------- the FUP gauge */}
            <section
              className={cn(
                'border-hairline bg-surface overflow-hidden rounded-2xl border',
                bill.throttled && 'border-deal/50',
              )}
            >
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Gauge className="text-accent-400 h-4 w-4" aria-hidden="true" />
                {bill.plan.name} — {bill.plan.speedMbps} Mbps
              </h2>

              <div className="px-4 py-4">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-bold">Data used</span>
                  <span className="text-ink-muted tabular-nums">
                    {bill.dataUsedGb.toLocaleString('en-IN')} of{' '}
                    {bill.plan.fupGb.toLocaleString('en-IN')} GB at full speed
                  </span>
                </div>

                <div className="bg-surface-sunken mt-2 h-4 overflow-hidden rounded-full">
                  <div
                    className={cn('h-full rounded-full', bill.throttled ? 'bg-deal' : 'bg-instock')}
                    style={{
                      width: `${Math.min(100, (bill.dataUsedGb / bill.plan.fupGb) * 100)}%`,
                    }}
                  />
                </div>

                {bill.throttled ? (
                  <div className="border-deal/40 bg-deal/10 mt-4 rounded-xl border p-3">
                    <p className="text-deal text-sm font-bold">
                      Throttled to {bill.plan.throttledMbps} Mbps for about {bill.throttledDays}{' '}
                      days
                    </p>
                    <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                      That is{' '}
                      {Math.round((1 - bill.plan.throttledMbps / bill.plan.speedMbps) * 100)}%
                      slower than the line you are paying for, for roughly{' '}
                      {Math.round((bill.throttledDays / 30) * 100)}% of the month — and it costs
                      nothing extra, so the bill gives you no way to notice it happened.
                    </p>
                  </div>
                ) : (
                  <p className="text-instock mt-3 text-xs font-bold">
                    {(bill.plan.fupGb - bill.dataUsedGb).toLocaleString('en-IN')} GB left before the
                    line would be throttled to {bill.plan.throttledMbps} Mbps.
                  </p>
                )}

                {bill.addons.length > 0 && (
                  <ul className="text-ink-muted mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {bill.addons.map((addon) => (
                      <li key={addon.label}>
                        · {addon.label} ₹{addon.rupees}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* ------------------------------------------- the upgrade */}
            {bill.upgrade && (
              <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
                <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                  <TrendingUp className="text-accent-400 h-4 w-4" aria-hidden="true" />
                  What a tier up would have done
                </h2>
                <div className="px-4 py-4">
                  <p className="text-sm">
                    <span className="font-bold">{bill.upgrade.plan.name}</span> —{' '}
                    {bill.upgrade.plan.speedMbps} Mbps,{' '}
                    {bill.upgrade.plan.fupGb.toLocaleString('en-IN')} GB,{' '}
                    {formatPaise(bill.upgrade.extraPerMonth)} more a month.
                  </p>
                  <p className="text-ink-muted mt-2 text-xs leading-relaxed">
                    {bill.throttled && !bill.upgrade.wouldHaveThrottled ? (
                      <>
                        On this month&rsquo;s {bill.dataUsedGb.toLocaleString('en-IN')} GB it would
                        have stayed at full speed the whole month — so the question is whether{' '}
                        {formatPaise(bill.upgrade.extraPerMonth)} is worth {bill.throttledDays} days
                        off the slow lane.
                      </>
                    ) : bill.throttled ? (
                      <>
                        On this month&rsquo;s {bill.dataUsedGb.toLocaleString('en-IN')} GB it would
                        have been throttled too. Upgrading would buy speed, not headroom.
                      </>
                    ) : (
                      <>
                        You did not reach this plan&rsquo;s limit, let alone the next one&rsquo;s.
                        Upgrading would buy a faster line, not more data — worth it only if the
                        speed itself is the constraint.
                      </>
                    )}
                  </p>

                  <div className="border-hairline mt-4 overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[24rem] text-xs">
                      <thead className="text-ink-subtle border-hairline border-b text-left">
                        <tr>
                          <th className="px-3 py-2 font-bold">Plan</th>
                          <th className="px-2 py-2 text-right font-bold">Speed</th>
                          <th className="px-2 py-2 text-right font-bold">Limit</th>
                          <th className="px-3 py-2 text-right font-bold">Rental</th>
                        </tr>
                      </thead>
                      <tbody className="divide-hairline divide-y">
                        {BROADBAND_PLANS.map((plan) => (
                          <tr
                            key={plan.id}
                            className={cn(
                              plan.id === bill.plan.id && 'bg-accent-500/10 font-bold',
                              plan.id === bill.upgrade?.plan.id && 'text-accent-400 font-bold',
                            )}
                          >
                            <td className="px-3 py-2">{plan.name}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {plan.speedMbps} Mbps
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {plan.fupGb.toLocaleString('en-IN')} GB
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              ₹{plan.rentalRupees}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
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
                      category: 'BROADBAND',
                      biller: bill.billerId,
                      account: bill.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(bill.total)}`}
                    saveAs={bill.billerName}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/broadband"
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
