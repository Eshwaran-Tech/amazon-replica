import { Cable, PhoneCall } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers } from '@/services/bills/pay';
import { landlineBill } from '@/services/bills/telecom';

export const metadata: Metadata = {
  title: 'Landline bill',
  description: 'Pay a landline bill with the calls metered by type against the free allowance.',
};

export const dynamic = 'force-dynamic';

/**
 * Landline.
 *
 * The distinctive thing is the **call detail**: a landline meters local, STD and
 * ISD at three different rates, and the free-call allowance is spent on the
 * dearest calls first. That last part is the opposite of what everybody assumes
 * and it changes the bill materially, so the page shows the allowance being
 * consumed rather than hiding it inside a total.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function LandlinePage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('LANDLINE')[0]?.id ?? '';
  const bill = params.account
    ? landlineBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'LANDLINE') : [];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Landline</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Cable className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Landline
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          A rental with a free-call allowance, then metered by call type. Local, STD and ISD are
          three different rates.
        </p>
      </header>

      <NoBillerNotice what="exchange" />

      <AccountForm
        category="LANDLINE"
        action="/pay/bills/landline"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That number does not look right.</p>
          <p className="text-ink-muted mt-1">
            STD code first, including the leading zero, then the subscriber number.
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

            {/* ------------------------------------------- call detail */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <PhoneCall className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Calls this month
                <span className="text-ink-subtle ml-auto font-normal">
                  {bill.totalMinutes.toLocaleString('en-IN')} minutes
                </span>
              </h2>

              {/* The allowance, and how much of it is gone. */}
              <div className="border-hairline border-b px-4 py-4">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-bold">Free-call allowance</span>
                  <span className="text-ink-muted tabular-nums">
                    {bill.freeUsed} of {bill.freeMinutes} minutes used
                  </span>
                </div>
                <div className="bg-surface-sunken mt-2 h-3 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      bill.freeUsed >= bill.freeMinutes ? 'bg-deal' : 'bg-instock',
                    )}
                    style={{ width: `${Math.min(100, (bill.freeUsed / bill.freeMinutes) * 100)}%` }}
                  />
                </div>
                <p className="text-ink-muted mt-2 text-xs leading-relaxed">
                  The allowance is spent on the{' '}
                  <span className="text-ink font-bold">dearest calls first</span> — ISD before STD,
                  STD before local. That is how a bundle is actually settled, and it is worth more
                  to you than the other way round: an allowance spent on 60-paise local calls would
                  save a fraction of what it saves here.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-xs">
                  <thead className="text-ink-subtle border-hairline border-b text-left">
                    <tr>
                      <th className="px-4 py-2 font-bold">Type</th>
                      <th className="px-2 py-2 text-right font-bold">Minutes</th>
                      <th className="px-2 py-2 text-right font-bold">Free</th>
                      <th className="px-2 py-2 text-right font-bold">Charged</th>
                      <th className="px-4 py-2 text-right font-bold">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {bill.calls.map((call) => (
                      <tr key={call.label} className={cn(call.rupees > 0 && 'font-bold')}>
                        <td className="px-4 py-2">
                          {call.label}
                          <span className="text-ink-subtle ml-2 font-normal">
                            ₹{call.perMinute}/min
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{call.minutes}</td>
                        <td className="text-instock px-2 py-2 text-right tabular-nums">
                          {call.minutes - call.chargeable}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{call.chargeable}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {call.rupees > 0 ? formatPaise(Math.round(call.rupees) * 100) : '—'}
                        </td>
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
                {bill.billerName} · {bill.planName}
              </p>

              <div className="mt-4">
                {session ? (
                  <PayForm
                    fields={{
                      category: 'LANDLINE',
                      biller: bill.billerId,
                      account: bill.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(bill.total)}`}
                    saveAs={bill.billerName}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/landline"
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
