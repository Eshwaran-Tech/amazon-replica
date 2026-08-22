import { CalendarRange, Flame, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { GAS_SLABS, GAS_VAT_PERCENT, SCM_PER_CYLINDER } from '@/data/bill-tariffs';
import { billersIn } from '@/data/billers';
import { CYLINDERS } from '@/data/lpg';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers } from '@/services/bills/pay';
import { gasBill } from '@/services/bills/utility';

export const metadata: Metadata = {
  title: 'Piped gas bill',
  description: 'Pay a piped gas bill and see what the same gas would have cost in cylinders.',
};

export const dynamic = 'force-dynamic';

/**
 * Piped gas.
 *
 * Two things here belong to this page and nowhere else:
 *
 *  - **It is not inside GST.** Piped natural gas carries state VAT, and a page
 *    that stamped 18% GST on it would be wrong about the tax being collected.
 *    So the line says VAT and the panel explains why.
 *  - **The comparison anybody switching actually wants** is against the cylinder
 *    it replaces. A 14.2 kg LPG cylinder is roughly 34 SCM of piped gas by
 *    calorific value — a physical fact, not a marketing figure — so the page
 *    prices the same energy both ways.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function PipedGasPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('PIPED_GAS')[0]?.id ?? '';
  const bill = params.account
    ? gasBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'PIPED_GAS') : [];

  const cylinder = CYLINDERS.find((entry) => entry.id === 'domestic-14');
  // Same energy, bought the other way. The gas charge alone is the fair
  // comparison -- a cylinder carries no fixed charge and no meter.
  const gasCharge = bill?.lines.find((line) => line.label === 'Gas charge')?.amount ?? 0;
  const cylinderCost = bill && cylinder ? bill.cylinderEquivalent * cylinder.priceRupees * 100 : 0;

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Piped gas</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Flame className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Piped gas
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Metered in standard cubic metres and read every two months. It sits outside GST, so it
          carries state VAT instead.
        </p>
      </header>

      <NoBillerNotice what="gas distributor" />

      <AccountForm
        category="PIPED_GAS"
        action="/pay/bills/piped-gas"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That BP number does not look right.</p>
          <p className="text-ink-muted mt-1">It is eight to eleven digits, on the top right.</p>
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

              <div className="border-hairline flex items-center gap-2 border-b px-4 py-2.5">
                <CalendarRange className="text-accent-400 h-4 w-4 shrink-0" aria-hidden="true" />
                <p className="text-ink-muted text-xs">
                  A bi-monthly bill. The slab table is priced against two months of gas, so a
                  monthly comparison against it would put you in the wrong band.
                </p>
              </div>

              <div className="border-hairline grid grid-cols-3 divide-x divide-[color:var(--color-hairline,#2a3441)] border-b">
                {[
                  { label: 'Previous', value: bill.previousReading.toLocaleString('en-IN') },
                  { label: 'Current', value: bill.currentReading.toLocaleString('en-IN') },
                  { label: 'Used', value: `${bill.scm} SCM` },
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

            {/* --------------------------------- against the cylinder */}
            {cylinder && (
              <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
                <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                  The same gas, bought in cylinders
                </h2>
                <div className="px-4 py-4">
                  <p className="text-ink-muted text-xs leading-relaxed">
                    {bill.scm} SCM is about{' '}
                    <span className="text-ink font-bold">{bill.cylinderEquivalent} cylinders</span>{' '}
                    of cooking gas by calorific value — a 14.2 kg domestic cylinder holds roughly{' '}
                    {SCM_PER_CYLINDER} SCM of piped-gas equivalent.
                  </p>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="border-hairline bg-surface-sunken rounded-xl border p-3">
                      <p className="text-ink-subtle text-xs">Piped, this cycle</p>
                      <p className="text-lg font-bold tabular-nums">{formatPaise(gasCharge)}</p>
                      <p className="text-ink-subtle mt-1 text-xs">
                        Gas charge only, before the fixed charge and VAT
                      </p>
                    </div>
                    <div className="border-hairline bg-surface-sunken rounded-xl border p-3">
                      <p className="text-ink-subtle text-xs">Same energy in cylinders</p>
                      <p className="text-lg font-bold tabular-nums">{formatPaise(cylinderCost)}</p>
                      <p className="text-ink-subtle mt-1 text-xs">
                        At ₹{cylinder.priceRupees} a refill, before any subsidy
                      </p>
                    </div>
                  </div>

                  <p
                    className={cn(
                      'mt-3 text-xs font-bold',
                      gasCharge < cylinderCost ? 'text-instock' : 'text-deal',
                    )}
                  >
                    {gasCharge < cylinderCost
                      ? `Piped is ${formatPaise(cylinderCost - gasCharge)} cheaper for this much gas.`
                      : `Cylinders would have been ${formatPaise(gasCharge - cylinderCost)} cheaper for this much gas.`}
                  </p>
                  <p className="text-ink-subtle mt-1 text-xs leading-relaxed">
                    Before subsidy, and before the fact that a piped connection never runs out
                    halfway through cooking. Compare it against the gas charge rather than the bill
                    total, because a cylinder carries no meter and no standing charge.
                  </p>
                </div>
              </section>
            )}

            {/* ---------------------------------------------- the tax */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Info className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Why it says VAT and not GST
              </h2>
              <p className="text-ink-muted px-4 py-4 text-xs leading-relaxed">
                Natural gas is one of the handful of things kept outside GST, so it is still taxed
                by the state at {GAS_VAT_PERCENT}% here rather than at a GST rate. Your mobile bill
                next door carries 18% GST; this one does not, and the difference is not a rounding
                error.
              </p>
              <div className="border-hairline border-t px-4 py-3">
                <table className="w-full text-xs">
                  <thead className="text-ink-subtle border-hairline border-b text-left">
                    <tr>
                      <th className="py-1.5 font-bold">Slab, per cycle</th>
                      <th className="py-1.5 text-right font-bold">Rate a SCM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {GAS_SLABS.map((slab, index) => {
                      const from = (GAS_SLABS[index - 1]?.upTo ?? 0) + 1;
                      return (
                        <tr
                          key={slab.upTo}
                          className={cn(bill.scm >= from && 'text-ink font-bold')}
                        >
                          <td className="py-1.5">
                            {slab.upTo === Number.POSITIVE_INFINITY
                              ? `Above ${GAS_SLABS[index - 1]?.upTo ?? 0}`
                              : `${from} to ${slab.upTo}`}{' '}
                            SCM
                          </td>
                          <td className="py-1.5 text-right tabular-nums">₹{slab.rate}</td>
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
                      category: 'PIPED_GAS',
                      biller: bill.billerId,
                      account: bill.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(bill.total)}`}
                    saveAs={bill.billerName}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/piped-gas"
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
