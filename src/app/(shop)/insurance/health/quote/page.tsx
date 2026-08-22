import { AlertTriangle, Info, Timer, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { SUM_INSURED_LAKHS, WAITING_PERIODS } from '@/data/health-plans';
import { INSURERS } from '@/data/insurers';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { quoteHealth, type Member } from '@/services/health-insurance';

import { BuyHealth } from './buy-health';

export const metadata: Metadata = {
  title: 'Health cover quote',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The health quote.
 *
 * The whole quote is in the URL, so it is shareable and the back button works.
 * The premium is broken into its parts for the same reason the motor one is: a
 * single figure cannot be checked against anything, and the part that surprises
 * people — that a family is priced on its eldest member — is invisible until
 * the rated age is shown.
 */

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ages(value: string | string[] | undefined): number[] {
  const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return raw
    .map((entry) => Number.parseInt(entry, 10))
    .filter((age) => Number.isFinite(age) && age >= 0);
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HealthQuotePage({ searchParams }: Props) {
  const params = await searchParams;

  const adultAges = ages(params.adultAge);
  const childAges = ages(params.childAge);
  const termYears = one(params.termYears) === '2' ? 2 : 1;

  const requested = Number.parseInt(one(params.sumInsuredLakhs) ?? '10', 10);
  const sumInsuredLakhs = (SUM_INSURED_LAKHS as readonly number[]).includes(requested)
    ? requested
    : 10;

  const members: Member[] = [
    ...adultAges.map((age) => ({ kind: 'ADULT' as const, age })),
    ...childAges.map((age) => ({ kind: 'CHILD' as const, age })),
  ];

  const result = quoteHealth({ sumInsuredLakhs, members, termYears });

  if (!result.ok) {
    return (
      <Container size="default" className="space-y-4 py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <AlertTriangle className="text-ink-muted mx-auto h-8 w-8" aria-hidden="true" />
          <h1 className="mt-3 text-base font-bold">That combination cannot be quoted</h1>
          <p className="text-ink-muted mx-auto mt-1 max-w-prose text-sm">{result.message}</p>
          <Link
            href="/insurance/health"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-4 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Change the details
          </Link>
        </div>
      </Container>
    );
  }

  const quote = result.quote;

  // The same cover quoted on each insurer's book. Each one goes back through
  // the same function the server will use when the customer pays, so the figure
  // on the card is the figure charged -- a loading applied here and nowhere else
  // would make those two different numbers.
  const offers = INSURERS.map((insurer) =>
    quoteHealth({ sumInsuredLakhs, members, termYears, insurerId: insurer.id }),
  )
    .filter((entry): entry is Extract<typeof entry, { ok: true }> => entry.ok)
    .map((entry) => entry.quote)
    .sort((a, b) => a.total - b.total);

  // The breakdown belongs to a real offer, not to an unloaded average nobody
  // can buy. It shows the cheapest, which is the one the page recommends.
  const headline = offers[0] ?? quote;

  const withParams = (changes: Record<string, string>): string => {
    const next = new URLSearchParams();
    next.set('sumInsuredLakhs', changes.sumInsuredLakhs ?? String(sumInsuredLakhs));
    next.set('termYears', changes.termYears ?? String(termYears));
    for (const age of adultAges) next.append('adultAge', String(age));
    for (const age of childAges) next.append('childAge', String(age));
    return `/insurance/health/quote?${next.toString()}`;
  };

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/insurance/health" className="hover:text-link hover:underline">
          Health
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Quote</span>
      </nav>

      {/* ---------------------------------------------------- the members */}
      <section className="border-hairline bg-surface flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="text-accent-400 h-4 w-4" aria-hidden="true" />
          <p className="text-sm font-bold">
            {quote.members.length} {quote.members.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <p className="text-ink-muted text-xs">
          {[
            ...adultAges.map((age) => `Adult ${age}`),
            ...childAges.map((age) => `Child ${age}`),
          ].join(' · ')}
        </p>
        <p className="text-ink-muted text-xs">
          Rated on the eldest at {quote.ratedAge}, in the {quote.ratedBand} band
        </p>
        <Link
          href="/insurance/health"
          className="text-link ml-auto text-xs font-bold hover:underline"
        >
          Change
        </Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start">
        <aside className="space-y-3">
          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Sum insured</h2>
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {SUM_INSURED_LAKHS.map((lakhs) => (
                <Link
                  key={lakhs}
                  href={withParams({ sumInsuredLakhs: String(lakhs) })}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                    lakhs === sumInsuredLakhs
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-hairline text-ink-muted hover:border-accent-500/60',
                  )}
                >
                  {lakhs >= 100 ? `${lakhs / 100}Cr` : `${lakhs}L`}
                </Link>
              ))}
            </div>
          </section>

          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Term</h2>
            <div className="flex gap-1.5 px-4 py-3">
              {[1, 2].map((years) => (
                <Link
                  key={years}
                  href={withParams({ termYears: String(years) })}
                  className={cn(
                    'flex-1 rounded-lg border px-2.5 py-1.5 text-center text-xs font-bold transition-colors',
                    years === termYears
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-hairline text-ink-muted hover:border-accent-500/60',
                  )}
                >
                  {years === 1 ? 'One year' : 'Two years'}
                </Link>
              ))}
            </div>
            {termYears === 2 && (
              <p className="text-ink-subtle border-hairline border-t px-4 py-2.5 text-xs">
                {formatPaise(headline.perYear)} a year, paid up front for both years.
              </p>
            )}
          </section>

          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
              <Timer className="text-accent-400 h-4 w-4" aria-hidden="true" />
              Before you can claim
            </h2>
            <ul className="divide-hairline divide-y">
              {WAITING_PERIODS.map((period) => (
                <li key={period.id} className="px-4 py-2.5">
                  <p className="text-sm font-bold">
                    {period.name}
                    <span className="text-deal ml-2 text-xs">
                      {period.months < 12
                        ? `${period.months * 30} days`
                        : `${period.months / 12} year${period.months === 12 ? '' : 's'}`}
                    </span>
                  </p>
                  <p className="text-ink-muted mt-0.5 text-xs leading-relaxed">{period.detail}</p>
                </li>
              ))}
            </ul>
            <Link
              href="/insurance/health/benefits?tab=waiting"
              className="text-link border-hairline block border-t px-4 py-2.5 text-xs font-bold hover:underline"
            >
              Everything covered, excluded and waiting
            </Link>
          </section>
        </aside>

        <div className="space-y-3">
          {/* -------------------------------------------- the breakdown */}
          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
              What the premium is made of
              {headline.insurer && (
                <span className="text-ink-subtle ml-2 font-normal">
                  at {headline.insurer.name}, the cheapest here
                </span>
              )}
            </h2>
            <dl className="space-y-1 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted text-xs">
                  Premium for {quote.members.length}{' '}
                  {quote.members.length === 1 ? 'person' : 'people'}, {quote.ratedBand} band
                  {termYears === 2 && ', two years'}
                </dt>
                <dd className="shrink-0 text-xs font-bold tabular-nums">
                  {formatPaise(headline.basePremium)}
                </dd>
              </div>
              {headline.discounts.map((discount) => (
                <div key={discount.id} className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-muted text-xs">
                    {discount.name} — {discount.percent}%
                  </dt>
                  <dd className="text-instock shrink-0 text-xs font-bold tabular-nums">applied</dd>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted text-xs">
                  Discounts together
                  <span className="text-ink-subtle block text-[0.7rem]">
                    Multiplied, not added — see the note below
                  </span>
                </dt>
                <dd className="text-instock shrink-0 text-xs font-bold tabular-nums">
                  −{formatPaise(headline.discountAmount)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted text-xs">Tax ({headline.taxPercent}%)</dt>
                <dd className="shrink-0 text-xs font-bold tabular-nums">
                  {formatPaise(headline.tax)}
                </dd>
              </div>
              <div className="border-hairline flex items-baseline justify-between gap-3 border-t pt-1.5">
                <dt className="text-sm font-bold">
                  Total
                  {termYears === 2 && (
                    <span className="text-ink-subtle block text-[0.7rem] font-normal">
                      {formatPaise(headline.perYear)} a year
                    </span>
                  )}
                </dt>
                <dd className="text-sm font-bold tabular-nums">{formatPaise(headline.total)}</dd>
              </div>
            </dl>
            <p className="text-ink-subtle border-hairline border-t px-4 py-2.5 text-xs leading-relaxed">
              {headline.discounts.map((discount) => `${discount.percent}%`).join(' and ')} together
              is{' '}
              {Math.round(
                (1 -
                  headline.discounts.reduce(
                    (factor, discount) => factor * (1 - discount.percent / 100),
                    1,
                  )) *
                  1000,
              ) / 10}
              % off, not {headline.discounts.reduce((sum, discount) => sum + discount.percent, 0)}%.
              Adding percentages is how a quoted premium ends up below the one that gets charged.
            </p>
          </section>

          {/* ------------------------------------------------ the offers */}
          {offers.map((offer, index) => (
            <article
              key={offer.insurer?.id ?? index}
              className={cn(
                'border-hairline bg-surface rounded-2xl border p-4',
                index === 0 && 'border-accent-500/60',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold">
                    {offer.insurer?.name}
                    {index === 0 && (
                      <span className="bg-accent-500/15 text-accent-400 rounded-full px-2 py-0.5 text-[0.65rem]">
                        Lowest premium
                      </span>
                    )}
                  </h3>
                  <p className="text-ink-muted mt-0.5 text-xs">
                    {offer.insurer?.healthTagline} · {offer.insurer?.claimRatio}% of claims settled
                    · {offer.insurer?.hospitals.toLocaleString('en-IN')} cashless hospitals
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{formatPaise(offer.total)}</p>
                  <p className="text-ink-subtle text-xs">
                    {termYears === 2 ? 'for two years' : 'for a year'}, tax included
                  </p>
                </div>
              </div>

              <BuyHealth
                insurerId={offer.insurer?.id ?? ''}
                sumInsuredLakhs={sumInsuredLakhs}
                termYears={termYears}
                adultAges={adultAges}
                childAges={childAges}
                label={`Pay ${formatPaise(offer.total)} from Amazon Pay`}
                csrfField={<CsrfField />}
              />
            </article>
          ))}

          <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
            <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-ink-muted">
              <span className="text-ink font-bold">No cover is being sold.</span> These insurers are
              invented and these rates are illustrative. Paying moves money out of your Amazon Pay
              balance and records what it was for; it does not put a contract of insurance in force
              anywhere.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
