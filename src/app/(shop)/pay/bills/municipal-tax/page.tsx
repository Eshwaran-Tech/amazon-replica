import { CalendarCheck, Building, Landmark } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { PENALTY_PERCENT_PER_MONTH, REBATE_PERCENT } from '@/data/bill-tariffs';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { propertyTaxBill } from '@/services/bills/civic';
import { listSavedBillers } from '@/services/bills/pay';

export const metadata: Metadata = {
  title: 'Municipal property tax',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Property tax.
 *
 * The only bill here where **when you pay changes what you pay**, in both
 * directions: a rebate for settling the whole year before the cutoff, and a
 * penalty that accrues per completed month once a due date passes. Both are
 * real conventions, and no municipal demand puts them side by side — which is
 * why the page does.
 *
 * The assessment is shown as well, because a property tax is levied on a
 * *rateable value* derived from area, zone, use and age. A total with none of
 * that behind it cannot be checked by anybody.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function MunicipalTaxPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('MUNICIPAL_TAX')[0]?.id ?? '';
  const bill = params.account
    ? propertyTaxBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'MUNICIPAL_TAX') : [];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Municipal tax</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Landmark className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Municipal property tax
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          The one bill where the date changes the amount — a rebate for paying the year early, a
          penalty for every month you are late.
        </p>
      </header>

      <NoBillerNotice what="corporation" />

      <AccountForm
        category="MUNICIPAL_TAX"
        action="/pay/bills/municipal-tax"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That property id does not look right.</p>
          <p className="text-ink-muted mt-1">
            Eleven digits: two for the zone, three for the ward, six for the serial.
          </p>
        </div>
      )}

      {bill && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* ------------------------------------------ the assessment */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Building className="text-accent-400 h-4 w-4" aria-hidden="true" />
                How the demand is worked out
              </h2>

              <div className="border-hairline grid grid-cols-2 gap-x-6 gap-y-3 border-b px-4 py-4 text-xs sm:grid-cols-4">
                {[
                  { label: 'Zone', value: bill.zone },
                  { label: 'Ward', value: bill.ward },
                  {
                    label: 'Built-up area',
                    value: `${bill.builtUpSqFt.toLocaleString('en-IN')} sq ft`,
                  },
                  { label: 'Age', value: `${bill.ageYears} years` },
                ].map((cell) => (
                  <div key={cell.label}>
                    <p className="text-sm font-bold">{cell.value}</p>
                    <p className="text-ink-subtle">{cell.label}</p>
                  </div>
                ))}
              </div>

              <div className="border-hairline border-b px-4 py-4">
                <p className="text-ink-muted text-xs leading-relaxed">
                  A property tax is levied on a{' '}
                  <span className="text-ink font-bold">rateable value</span>, not on what the
                  property is worth on the market:
                </p>
                <p className="text-ink mt-2 font-mono text-xs leading-relaxed">
                  {bill.builtUpSqFt.toLocaleString('en-IN')} sq ft × ₹{bill.zoneRate} ×{' '}
                  {bill.usage.factor} ({bill.usage.label.toLowerCase()}) × age factor
                </p>
                <p className="mt-2 text-sm font-bold">
                  = {formatPaise(bill.rateableValue)} rateable value a year
                </p>
              </div>

              <div className="px-4 py-4">
                <BillLines
                  lines={bill.lines}
                  total={bill.fullYearPayable}
                  totalLabel="Full year, payable today"
                  totalNote={`Demand ${formatPaise(bill.annualDemand)} for ${bill.financialYear}`}
                />
              </div>
            </section>

            {/* ------------------------------------------- the calendar */}
            <section
              className={cn(
                'border-hairline bg-surface overflow-hidden rounded-2xl border',
                bill.rebate.available && 'border-instock/50',
              )}
            >
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <CalendarCheck className="text-accent-400 h-4 w-4" aria-hidden="true" />
                When you pay changes what you pay
              </h2>

              <div className="px-4 py-4">
                {bill.rebate.available ? (
                  <div className="border-instock/40 bg-instock/10 rounded-xl border p-3">
                    <p className="text-instock text-sm font-bold">
                      {formatPaise(bill.rebate.amount)} off if you settle the whole year now
                    </p>
                    <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                      The {REBATE_PERCENT}% rebate applies to the full year&rsquo;s demand and only
                      until{' '}
                      {bill.rebate.before.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                      })}
                      . It does not apply to a half-yearly instalment, which is the part people
                      miss.
                    </p>
                  </div>
                ) : (
                  <div className="border-hairline bg-surface-sunken rounded-xl border p-3">
                    <p className="text-sm font-bold">
                      The {REBATE_PERCENT}% early-payment rebate has closed for {bill.financialYear}
                    </p>
                    <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                      It ran until{' '}
                      {bill.rebate.before.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                      })}{' '}
                      and was worth {formatPaise(bill.rebate.amount)} on this demand. It reopens at
                      the start of the next financial year, in April.
                    </p>
                  </div>
                )}

                <ul className="mt-4 space-y-2">
                  {bill.instalments.map((instalment) => {
                    const overdue = instalment.daysLate > 0;
                    return (
                      <li
                        key={instalment.id}
                        className={cn(
                          'border-hairline flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border p-3',
                          overdue && 'border-deal/50 bg-deal/5',
                        )}
                      >
                        <span className="text-sm font-bold">{instalment.label}</span>
                        <span
                          className={cn(
                            'text-xs',
                            overdue ? 'text-deal font-bold' : 'text-ink-muted',
                          )}
                        >
                          {overdue
                            ? `${instalment.daysLate} days past ${instalment.dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                            : `due ${instalment.dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </span>
                        <span className="ml-auto text-sm font-bold tabular-nums">
                          {formatPaise(instalment.payable)}
                        </span>
                        {instalment.penalty > 0 && (
                          <span className="text-deal w-full text-xs">
                            Includes {formatPaise(instalment.penalty)} of penalty
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <p className="text-ink-subtle mt-3 text-xs leading-relaxed">
                  The penalty is {PENALTY_PERCENT_PER_MONTH}% per <em>completed</em> month, not per
                  day — so one day late and twenty-nine days late cost exactly the same, and day
                  thirty-one costs another {PENALTY_PERCENT_PER_MONTH}%. Worth knowing before you
                  leave it another fortnight.
                </p>
              </div>
            </section>
          </div>

          <aside className="min-w-0 space-y-3">
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              <p className="text-ink-muted text-xs">
                {bill.rebate.available ? 'Full year, after rebate' : 'Full year'}
              </p>
              <p className="text-2xl font-bold">{formatPaise(bill.fullYearPayable)}</p>
              <p className="text-ink-subtle mt-1 text-xs">
                {bill.billerName} · {bill.financialYear}
              </p>

              <div className="mt-4 space-y-3">
                {session ? (
                  <>
                    <PayForm
                      fields={{
                        category: 'MUNICIPAL_TAX',
                        biller: bill.billerId,
                        account: bill.account,
                        option: 'FULL_YEAR',
                      }}
                      label={`Pay the year, ${formatPaise(bill.fullYearPayable)}`}
                      saveAs={bill.billerName}
                    />

                    {bill.instalments.map((instalment) => (
                      <PayForm
                        key={instalment.id}
                        fields={{
                          category: 'MUNICIPAL_TAX',
                          biller: bill.billerId,
                          account: bill.account,
                          option: 'INSTALMENT',
                          instalment: instalment.id,
                        }}
                        variant="secondary"
                        label={`${instalment.label} only, ${formatPaise(instalment.payable)}`}
                        saveAs={null}
                      />
                    ))}
                  </>
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/municipal-tax"
                    className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                  >
                    Sign in to pay
                  </Link>
                )}
              </div>

              {bill.rebate.available && (
                <p className="text-instock mt-3 text-xs leading-relaxed">
                  Paying the two halves separately forgoes the {formatPaise(bill.rebate.amount)}{' '}
                  rebate — it only applies to the whole year at once.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
