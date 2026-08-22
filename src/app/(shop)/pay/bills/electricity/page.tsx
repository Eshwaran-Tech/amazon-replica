import { Gauge, Lightbulb, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { ELECTRICITY_SLABS } from '@/data/bill-tariffs';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers, paymentsForAccount } from '@/services/bills/pay';
import { electricityBill, marginalCost } from '@/services/bills/utility';

export const metadata: Metadata = {
  title: 'Electricity bill',
  description: 'Pay an electricity bill and see which slab each unit fell in.',
};

export const dynamic = 'force-dynamic';

/**
 * Electricity.
 *
 * The distinctive thing here is the **slab breakdown**. An electricity tariff is
 * telescopic -- each band is charged at its own rate for the units that fall
 * inside it -- and no bill shows you the split, which is why almost nobody knows
 * that their 401st unit costs more than twice their first.
 *
 * So the page shows three things a real bill does not: which slab each unit
 * landed in, what the *next* unit would cost, and six months of consumption
 * beside each other.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function ElectricityPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('ELECTRICITY')[0]?.id ?? '';
  const bill = params.account
    ? electricityBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;

  const [saved, history] = session
    ? await Promise.all([
        listSavedBillers(session.user.id, 'ELECTRICITY'),
        params.account
          ? paymentsForAccount(session.user.id, 'ELECTRICITY', params.account)
          : Promise.resolve([]),
      ])
    : [[], []];

  const peak = bill ? Math.max(...bill.history.map((entry) => entry.units)) : 1;

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Electricity</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Lightbulb className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Electricity
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Billed on a telescopic slab tariff: each band is charged at its own rate for the units
          that fall inside it. Your last unit costs more than your first, and this page shows by how
          much.
        </p>
      </header>

      <NoBillerNotice what="electricity board" />

      <AccountForm
        category="ELECTRICITY"
        action="/pay/bills/electricity"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That consumer number does not look right.</p>
          <p className="text-ink-muted mt-1">
            It is ten to twelve digits, printed at the top of your bill.
          </p>
        </div>
      )}

      {bill && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* -------------------------------------------- the reading */}
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
                    label: 'Previous reading',
                    value: bill.previousReading.toLocaleString('en-IN'),
                  },
                  { label: 'Current reading', value: bill.currentReading.toLocaleString('en-IN') },
                  { label: 'Units drawn', value: bill.units.toLocaleString('en-IN') },
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

            {/* --------------------------------------- the slab breakdown */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Gauge className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Which slab your units fell in
              </h2>

              <div className="space-y-2 px-4 py-4">
                {ELECTRICITY_SLABS.map((slab, index) => {
                  const used = bill.slabs[index];
                  const width = used ? (used.units / bill.units) * 100 : 0;
                  const label =
                    slab.upTo === Number.POSITIVE_INFINITY
                      ? `Above ${ELECTRICITY_SLABS[index - 1]?.upTo ?? 0}`
                      : `${(ELECTRICITY_SLABS[index - 1]?.upTo ?? 0) + 1} to ${slab.upTo}`;

                  return (
                    <div key={label}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className={cn(used ? 'font-bold' : 'text-ink-subtle')}>
                          {label} units
                          <span className="text-ink-muted ml-2 font-normal">
                            ₹{slab.rate.toFixed(2)} a unit
                          </span>
                        </span>
                        <span className="text-ink-muted shrink-0 tabular-nums">
                          {used ? `${used.units} units · ${formatPaise(used.amount * 100)}` : '—'}
                        </span>
                      </div>
                      <div className="bg-surface-sunken mt-1 h-2 overflow-hidden rounded-full">
                        <div
                          className="bg-accent-500 h-full rounded-full"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-hairline bg-surface-sunken border-t px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <TrendingUp className="text-deal h-4 w-4" aria-hidden="true" />
                  Your next unit costs {formatPaise(marginalCost(bill.units, 1))}
                </p>
                <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                  {bill.unitsToNextSlab !== null && bill.nextSlabRate !== null ? (
                    <>
                      {bill.unitsToNextSlab} more units and the rate steps to ₹
                      {bill.nextSlabRate.toFixed(2)}. Another 50 units from here would add{' '}
                      {formatPaise(marginalCost(bill.units, 50))}, not{' '}
                      {formatPaise(marginalCost(0, 50))} — which is what 50 units cost at the bottom
                      of the tariff.
                    </>
                  ) : (
                    <>
                      You are in the top slab, so every further unit is charged at ₹
                      {bill.marginalRate.toFixed(2)} — the highest rate on the tariff.
                    </>
                  )}
                </p>
              </div>
            </section>

            {/* ------------------------------------------- six-month bars */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                Six months of consumption
              </h2>
              <div className="flex items-end justify-between gap-2 px-4 pt-6 pb-3">
                {bill.history.map((entry, index) => (
                  <div
                    key={`${entry.label}-${index}`}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-ink-muted text-[0.65rem] tabular-nums">
                      {entry.units}
                    </span>
                    <div
                      className={cn(
                        'w-full rounded-t',
                        index === bill.history.length - 1 ? 'bg-accent-500' : 'bg-accent-500/35',
                      )}
                      style={{ height: `${Math.max(6, (entry.units / peak) * 110)}px` }}
                    />
                    <span className="text-ink-subtle text-[0.65rem]">{entry.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-ink-subtle border-hairline border-t px-4 py-2.5 text-xs">
                Sanctioned load {bill.sanctionedLoad} kW. The fixed charge follows that, not your
                consumption, so it is the same in a month you are away.
              </p>
            </section>
          </div>

          {/* ------------------------------------------------- pay panel */}
          <aside className="min-w-0 space-y-3">
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
                      category: 'ELECTRICITY',
                      biller: bill.billerId,
                      account: bill.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(bill.total)}`}
                    saveAs={bill.billerName}
                  />
                ) : (
                  <Link
                    href={`/auth/login?next=/pay/bills/electricity`}
                    className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                  >
                    Sign in to pay
                  </Link>
                )}
              </div>
            </section>

            {history.length > 0 && (
              <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
                <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                  Paid on this connection
                </h2>
                <ul className="divide-hairline divide-y text-xs">
                  {history.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="text-ink-muted">{entry.period}</span>
                      <span className="font-bold tabular-nums">{formatPaise(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </Container>
  );
}
