import { Droplet, Info, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { SEWERAGE_CESS_PERCENT, WATER_SLABS } from '@/data/bill-tariffs';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers } from '@/services/bills/pay';
import { waterBill } from '@/services/bills/utility';

export const metadata: Metadata = {
  title: 'Water bill',
  description: 'Pay a water bill and see what your household actually draws per person per day.',
};

export const dynamic = 'force-dynamic';

/**
 * Water.
 *
 * Two things make this page different from the electricity one next door, and
 * both are real rather than cosmetic:
 *
 *  - The **sewerage cess is a percentage of the water charge**, not a flat fee,
 *    so it rises with consumption. On a heavy bill it is the second largest
 *    line and almost nobody knows what it is.
 *  - A reading in kilolitres means nothing to anybody. **Litres per person per
 *    day** does, and there is a real national design figure -- 135 lpcd -- to
 *    put it against. That is the number this page is built around.
 *
 * The cycle is two months, because that is genuinely how water is read.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function WaterPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('WATER')[0]?.id ?? '';
  const bill = params.account
    ? waterBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'WATER') : [];

  // Where this household sits against the design standard, capped so a very
  // heavy user does not push the bar off the end of the track.
  const ratio = bill ? Math.min(2, bill.lpcd / bill.lpcdStandard) : 0;

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Water</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Droplet className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Water
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Read every two months. The sewerage cess is a share of the water charge rather than a flat
          fee, so it moves whenever consumption does.
        </p>
      </header>

      <NoBillerNotice what="water board" />

      <AccountForm
        category="WATER"
        action="/pay/bills/water"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That connection number does not look right.</p>
          <p className="text-ink-muted mt-1">It is eight to ten digits from your water bill.</p>
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

              <div className="border-hairline grid grid-cols-3 divide-x divide-[color:var(--color-hairline,#2a3441)] border-b">
                {[
                  {
                    label: 'Previous',
                    value: `${bill.previousReading.toLocaleString('en-IN')} kl`,
                  },
                  { label: 'Current', value: `${bill.currentReading.toLocaleString('en-IN')} kl` },
                  { label: 'Drawn', value: `${bill.kilolitres} kl` },
                ].map((cell) => (
                  <div key={cell.label} className="px-4 py-3 text-center">
                    <p className="text-base font-bold tabular-nums">{cell.value}</p>
                    <p className="text-ink-subtle text-xs">{cell.label}</p>
                  </div>
                ))}
              </div>

              <div className="px-4 py-4">
                <BillLines lines={bill.lines} total={bill.total} totalLabel="Amount payable" />
              </div>
            </section>

            {/* ------------------------------------- litres per person */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Users className="text-accent-400 h-4 w-4" aria-hidden="true" />
                What that is per person, per day
              </h2>

              <div className="px-4 py-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-bold tabular-nums">{bill.lpcd}</p>
                    <p className="text-ink-subtle text-xs">litres per person per day</p>
                  </div>
                  <p className="text-ink-muted text-right text-xs leading-relaxed">
                    {bill.kilolitres} kl over 60 days,
                    <br />
                    across {bill.household} {bill.household === 1 ? 'person' : 'people'}
                  </p>
                </div>

                <div className="relative mt-5">
                  <div className="bg-surface-sunken h-3 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        bill.lpcd > bill.lpcdStandard ? 'bg-deal' : 'bg-instock',
                      )}
                      style={{ width: `${(ratio / 2) * 100}%` }}
                    />
                  </div>
                  {/* The standard sits at the halfway mark of a 2x track. */}
                  <div
                    className="bg-ink-muted absolute top-0 h-3 w-px"
                    style={{ left: '50%' }}
                    aria-hidden="true"
                  />
                  <p className="text-ink-subtle mt-1.5 text-xs" style={{ marginLeft: '50%' }}>
                    ↑ {bill.lpcdStandard} lpcd
                  </p>
                </div>

                <p className="text-ink-muted mt-4 text-xs leading-relaxed">
                  {bill.lpcd > bill.lpcdStandard ? (
                    <>
                      That is{' '}
                      <span className="text-ink font-bold">
                        {Math.round((bill.lpcd / bill.lpcdStandard - 1) * 100)}% above
                      </span>{' '}
                      the 135 litres per person per day that urban water supply in India is designed
                      around — and because the tariff is telescopic, the water above the standard is
                      charged at the dearest rate on your bill.
                    </>
                  ) : (
                    <>
                      That is{' '}
                      <span className="text-ink font-bold">
                        {Math.round((1 - bill.lpcd / bill.lpcdStandard) * 100)}% below
                      </span>{' '}
                      the 135 litres per person per day that urban water supply in India is designed
                      around.
                    </>
                  )}{' '}
                  The 135 figure is a real national planning standard, not a neighbourhood average
                  nobody measured.
                </p>
              </div>
            </section>

            {/* --------------------------------------------- the cess */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Info className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Why the cess moves
              </h2>
              <div className="space-y-3 px-4 py-4">
                <p className="text-ink-muted text-xs leading-relaxed">
                  The sewerage cess is{' '}
                  <span className="text-ink font-bold">
                    {SEWERAGE_CESS_PERCENT}% of the water charge
                  </span>
                  , not a flat fee — the more you draw, the more goes down the drain, and the charge
                  follows. It is the reason a heavy bill is heavier than the slab table alone
                  suggests.
                </p>

                <table className="w-full text-xs">
                  <thead className="text-ink-subtle border-hairline border-b text-left">
                    <tr>
                      <th className="py-1.5 font-bold">Slab</th>
                      <th className="py-1.5 text-right font-bold">Rate</th>
                      <th className="py-1.5 text-right font-bold">With cess</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {WATER_SLABS.map((slab, index) => {
                      const from = (WATER_SLABS[index - 1]?.upTo ?? 0) + 1;
                      const inSlab = bill.kilolitres >= from;
                      return (
                        <tr key={slab.upTo} className={cn(inSlab && 'text-ink font-bold')}>
                          <td className="py-1.5">
                            {slab.upTo === Number.POSITIVE_INFINITY
                              ? `Above ${WATER_SLABS[index - 1]?.upTo ?? 0}`
                              : `${from} to ${slab.upTo}`}{' '}
                            kl
                          </td>
                          <td className="py-1.5 text-right tabular-nums">₹{slab.rate}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            ₹{(slab.rate * (1 + SEWERAGE_CESS_PERCENT / 100)).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
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
                      category: 'WATER',
                      biller: bill.billerId,
                      account: bill.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(bill.total)}`}
                    saveAs={bill.billerName}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/water"
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
