import { CalendarDays, Check, GraduationCap } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { educationBill } from '@/services/bills/civic';
import { listSavedBillers } from '@/services/bills/pay';

export const metadata: Metadata = {
  title: 'Education fees',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * School and college fees.
 *
 * Termly rather than monthly, and the two things that make it its own page:
 *
 *  - **A term is made of heads**, not one number — tuition, lab, library,
 *    transport, hostel — and which heads a student carries differs. A page that
 *    showed a single "term fee" would be hiding the transport charge somebody
 *    is paying for a bus they stopped taking.
 *  - **The late fee accrues per day**, with a cap. Per day is unusual; the cap
 *    matters, because an uncapped daily fee is a trap rather than a deterrent.
 */

interface Props {
  searchParams: Promise<{ biller?: string; account?: string }>;
}

export default async function EducationPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('EDUCATION')[0]?.id ?? '';
  const bill = params.account
    ? educationBill(billerId, params.account.replace(/\s/g, ''), new Date())
    : null;
  const saved = session ? await listSavedBillers(session.user.id, 'EDUCATION') : [];

  const nextTerm = bill?.terms.find((term) => !term.paid);

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Education fees</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <GraduationCap className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Education fees
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Term by term, broken into heads, with the late fee accruing per day up to a cap.
        </p>
      </header>

      <NoBillerNotice what="school or college" />

      <AccountForm
        category="EDUCATION"
        action="/pay/bills/education"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !bill && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That enrolment number does not look right.</p>
          <p className="text-ink-muted mt-1">
            Four digits for the year of admission, then six more.
          </p>
        </div>
      )}

      {bill && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* --------------------------------------------- the student */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-bold">{bill.studentName}</p>
                  <p className="text-ink-muted text-xs">
                    {bill.className} · admitted {bill.admissionYear} · {bill.billerName}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ink-muted text-xs">{bill.cycle.label}</p>
                  <p className="text-ink-muted text-xs">
                    {formatPaise(bill.annualFee)} for the year
                  </p>
                </div>
              </div>

              {/* ---------------------------------------- the term ladder */}
              <ul className="divide-hairline divide-y">
                {bill.terms.map((term) => {
                  const overdue = term.daysLate > 0 && !term.paid;
                  return (
                    <li key={term.id} className={cn('px-4 py-3', term.paid && 'opacity-60')}>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold',
                            term.paid
                              ? 'bg-instock/20 text-instock'
                              : overdue
                                ? 'bg-deal/20 text-deal'
                                : 'bg-accent-500/15 text-accent-400',
                          )}
                          aria-hidden="true"
                        >
                          {term.paid ? <Check className="h-3 w-3" /> : '·'}
                        </span>
                        <span className="text-sm font-bold">{term.label}</span>
                        <span
                          className={cn(
                            'text-xs',
                            overdue ? 'text-deal font-bold' : 'text-ink-muted',
                          )}
                        >
                          {term.paid
                            ? 'Settled'
                            : overdue
                              ? `${term.daysLate} days past ${term.dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                              : `due ${term.dueOn.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                        </span>
                        <span className="ml-auto text-sm font-bold tabular-nums">
                          {term.paid ? formatPaise(term.amount) : formatPaise(term.payable)}
                        </span>
                      </div>

                      {!term.paid && (
                        <dl className="mt-2 grid gap-x-6 gap-y-1 pl-8 text-xs sm:grid-cols-2">
                          {term.heads.map((head) => (
                            <div key={head.label} className="flex justify-between gap-2">
                              <dt className="text-ink-muted">{head.label}</dt>
                              <dd className="tabular-nums">{formatPaise(head.amount)}</dd>
                            </div>
                          ))}
                          {term.lateFee > 0 && (
                            <div className="text-deal flex justify-between gap-2 font-bold">
                              <dt>Late fee</dt>
                              <dd className="tabular-nums">{formatPaise(term.lateFee)}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ------------------------------------------- the late fee */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <CalendarDays className="text-accent-400 h-4 w-4" aria-hidden="true" />
                How the late fee builds
              </h2>

              <div className="px-4 py-4">
                <p className="text-ink-muted text-xs leading-relaxed">
                  ₹{bill.lateFeePerDay} a day past the due date, capped at ₹
                  {bill.lateFeeCap.toLocaleString('en-IN')}. Per day is unusual — most bills charge
                  per month — and the cap is the part worth knowing, because it means the fee stops
                  growing after{' '}
                  <span className="text-ink font-bold">
                    {Math.ceil(bill.lateFeeCap / bill.lateFeePerDay)} days
                  </span>
                  .
                </p>

                <div className="mt-4 space-y-1.5">
                  {[7, 14, 30, 60, 120].map((days) => {
                    const fee = Math.min(bill.lateFeeCap, days * bill.lateFeePerDay);
                    const capped = fee === bill.lateFeeCap;
                    const reached = (nextTerm?.daysLate ?? 0) >= days;
                    return (
                      <div key={days} className="flex items-center gap-3">
                        <span
                          className={cn(
                            'w-16 shrink-0 text-xs',
                            reached ? 'text-deal font-bold' : 'text-ink-muted',
                          )}
                        >
                          {days} days
                        </span>
                        <div className="bg-surface-sunken h-2.5 flex-1 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              capped ? 'bg-deal' : 'bg-accent-500',
                            )}
                            style={{ width: `${(fee / bill.lateFeeCap) * 100}%` }}
                          />
                        </div>
                        <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                          ₹{fee.toLocaleString('en-IN')}
                          {capped && <span className="text-ink-subtle ml-1">cap</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <aside>
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              {nextTerm ? (
                <>
                  <p className="text-ink-muted text-xs">{nextTerm.label}</p>
                  <p className="text-2xl font-bold">{formatPaise(nextTerm.payable)}</p>
                  <p className="text-ink-subtle mt-1 text-xs">
                    {bill.outstandingTerms} term{bill.outstandingTerms === 1 ? '' : 's'} still to
                    pay this year
                  </p>

                  <div className="mt-4">
                    <BillLines
                      lines={bill.lines}
                      total={nextTerm.payable}
                      totalLabel="Payable now"
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    {session ? (
                      bill.terms
                        .filter((term) => !term.paid)
                        .map((term, index) => (
                          <PayForm
                            key={term.id}
                            fields={{
                              category: 'EDUCATION',
                              biller: bill.billerId,
                              account: bill.account,
                              option: 'INSTALMENT',
                              instalment: term.id,
                            }}
                            variant={index === 0 ? 'primary' : 'secondary'}
                            label={`Pay ${term.label}, ${formatPaise(term.payable)}`}
                            saveAs={index === 0 ? bill.billerName : null}
                          />
                        ))
                    ) : (
                      <Link
                        href="/auth/login?next=/pay/bills/education"
                        className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                      >
                        Sign in to pay
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-ink-muted py-6 text-center text-sm">
                  Every term for {bill.cycle.label} is settled. Nothing is outstanding.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
