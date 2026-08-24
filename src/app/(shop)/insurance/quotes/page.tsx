import { AlertTriangle, Check, Info, Minus, Plus, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { NCB_LADDER, PLAN_KINDS, type PlanType } from '@/data/insurers';
import { findModel, parseRegistration } from '@/data/vehicles';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { addOnsFor, idvFor, ncbPercent, quotesFor } from '@/services/motor-insurance';

import { BuyPlan } from './buy-plan';

export const metadata: Metadata = {
  title: 'Motor insurance quotes',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The quotes page.
 *
 * Every control is a link, so the whole state of the quote lives in the URL: it
 * is shareable, the back button undoes exactly one change, and none of it needs
 * JavaScript. Only the buy button is a form, because only it changes anything.
 *
 * The card shows the **breakdown**, not a single figure. That is the point of
 * the page: a motor premium is own damage less the no-claim bonus, plus a
 * third-party figure that is never discounted, plus add-ons, plus tax — and a
 * customer who sees only the total cannot tell which of those moved.
 */

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Rebuilds this page's URL with one thing changed. */
function withParams(base: Record<string, string>, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return `/insurance/quotes?${next.toString()}`;
}

const STEPS = ['Vehicle', 'Plan', 'Add-ons', 'Pay'] as const;

export default async function QuotesPage({ searchParams }: Props) {
  const params = await searchParams;

  const modelId = one(params.modelId) ?? '';
  const model = findModel(modelId);
  const registrationInput = one(params.registration) ?? '';
  const registration = parseRegistration(registrationInput);

  if (!model || !registration) {
    return (
      <Container size="default" className="space-y-4 py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <AlertTriangle className="text-ink-muted mx-auto h-8 w-8" aria-hidden="true" />
          <h1 className="mt-3 text-base font-bold">
            {model ? 'That registration does not look right' : 'Choose a vehicle first'}
          </h1>
          <p className="text-ink-muted mx-auto mt-1 max-w-prose text-sm">
            {model
              ? 'A plate reads as two letters, a district number, a series and up to four digits — TN 02 BQ 6666.'
              : 'Pick a make and model, and we will quote every insurer on it.'}
          </p>
          <Link
            href="/insurance"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-4 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Back to insurance
          </Link>
        </div>
      </Container>
    );
  }

  const ageMonths = Math.max(
    0,
    Math.min(360, Number.parseInt(one(params.ageMonths) ?? '24', 10) || 0),
  );
  const claimFreeYears = Math.max(0, Math.min(5, Number.parseInt(one(params.ncb) ?? '0', 10) || 0));
  const plan = (one(params.plan) ?? 'COMPREHENSIVE') as PlanType;

  const range = idvFor(model, ageMonths);
  const idvParam = Number.parseInt(one(params.idv) ?? '', 10);
  const idv = Number.isFinite(idvParam) ? idvParam : range.suggested;

  const available = addOnsFor(model.kind, ageMonths);
  const chosen = (one(params.addOns) ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((id) => available.some((addOn) => addOn.id === id));

  const base: Record<string, string> = {
    kind: model.kind,
    modelId: model.id,
    registration: registration.normalised,
    ageMonths: String(ageMonths),
    ncb: String(claimFreeYears),
    plan,
    idv: String(idv),
    addOns: chosen.join(','),
  };

  const result = quotesFor({
    modelId: model.id,
    ageMonths,
    plan,
    idv,
    claimFreeYears,
    addOnIds: chosen,
  });

  const quotes = result.ok ? result.quotes : [];
  const cheapest = quotes[0];

  // The four IDV rungs a customer actually chooses between, plus wherever they
  // are now if they have moved off them.
  const idvSteps = [
    range.min,
    Math.round((range.min + range.suggested) / 2 / 100) * 100,
    range.suggested,
    range.max,
  ].filter((value, index, all) => all.indexOf(value) === index);

  const bonus = plan === 'THIRD_PARTY' ? 0 : ncbPercent(claimFreeYears);

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/insurance" className="hover:text-link hover:underline">
          Insurance
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Quotes</span>
      </nav>

      {/* --------------------------------------------------- the stepper */}
      <ol className="border-hairline bg-surface flex items-center gap-2 overflow-x-auto rounded-2xl border px-4 py-3 text-xs">
        {STEPS.map((step, index) => (
          <li key={step} className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold',
                index === 0 ? 'bg-instock/20 text-instock' : 'bg-accent-500/15 text-accent-400',
              )}
            >
              {index === 0 ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
            </span>
            <span className={cn(index === 0 ? 'text-ink-muted' : 'font-bold')}>{step}</span>
            {index < STEPS.length - 1 && (
              <span className="text-ink-subtle mx-1" aria-hidden="true">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* ------------------------------------------------- the vehicle bar */}
      <section className="border-hairline bg-surface flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border px-4 py-3">
        <div>
          <p className="text-base font-bold tracking-wider">{registration.pretty}</p>
          <p className="text-ink-muted text-xs">
            {registration.region.name} · {model.make} {model.model} {model.variant} ·{' '}
            {model.cc > 0 ? `${model.cc} cc` : 'Electric'}
          </p>
        </div>
        <div className="text-ink-muted text-xs">
          <p>
            {ageMonths < 12
              ? `${ageMonths} month${ageMonths === 1 ? '' : 's'} old`
              : `${Math.floor(ageMonths / 12)} year${Math.floor(ageMonths / 12) === 1 ? '' : 's'} old`}
          </p>
          <p>
            Depreciation {range.depreciationPercent}%
            {range.band ? ` · ${range.band}` : ' · past the published ladder'}
          </p>
        </div>
        <Link href="/insurance" className="text-link ml-auto text-xs font-bold hover:underline">
          Change vehicle
        </Link>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-start">
        {/* ------------------------------------------------ the controls */}
        <aside className="space-y-3">
          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Plan type</h2>
            <ul className="divide-hairline divide-y">
              {PLAN_KINDS.map((kind) => (
                <li key={kind.id}>
                  <Link
                    href={withParams(base, { plan: kind.id })}
                    className={cn(
                      'hover:bg-surface-sunken block px-4 py-3 transition-colors',
                      plan === kind.id && 'bg-accent-500/10',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-bold">
                      <span
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 rounded-full border-2',
                          plan === kind.id
                            ? 'border-accent-400 bg-accent-400'
                            : 'border-ink-subtle',
                        )}
                        aria-hidden="true"
                      />
                      {kind.name}
                      {kind.recommended && (
                        <span className="text-accent-400 text-[0.65rem]">Recommended</span>
                      )}
                    </span>
                    <span className="text-ink-muted mt-1 block pl-5.5 text-xs leading-relaxed">
                      {kind.blurb}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {plan !== 'THIRD_PARTY' && (
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                Declared value
              </h2>
              <div className="space-y-3 px-4 py-3">
                <p className="text-ink-muted text-xs leading-relaxed">
                  What the insurer pays if the vehicle is stolen or written off. A lower value cuts
                  the premium and cuts the payout by the same proportion.
                </p>
                <p className="text-lg font-bold">{formatPaise(idv)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {idvSteps.map((step) => (
                    <Link
                      key={step}
                      href={withParams(base, { idv: String(step) })}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                        step === idv
                          ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                          : 'border-hairline text-ink-muted hover:border-accent-500/60',
                      )}
                    >
                      {formatPaise(step, { withSymbol: false }).replace(/\.00$/, '')}
                      {step === range.suggested && (
                        <span className="text-ink-subtle ml-1 font-normal">suggested</span>
                      )}
                    </Link>
                  ))}
                </div>
                <p className="text-ink-subtle text-xs">
                  Insurers here accept {formatPaise(range.min)} to {formatPaise(range.max)}.
                </p>
              </div>
            </section>
          )}

          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
              No-claim bonus
              {bonus > 0 && <span className="text-instock ml-2">{bonus}% off own damage</span>}
            </h2>
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {NCB_LADDER.map((rung) => (
                <Link
                  key={rung.claimFreeYears}
                  href={withParams(base, { ncb: String(rung.claimFreeYears) })}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                    rung.claimFreeYears === claimFreeYears
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-hairline text-ink-muted hover:border-accent-500/60',
                  )}
                >
                  {rung.claimFreeYears === 0 ? 'None' : `${rung.claimFreeYears}y`}
                </Link>
              ))}
            </div>
            <p className="text-ink-subtle px-4 pb-3 text-xs leading-relaxed">
              It comes off the own-damage part alone, never off third party — which is why a 50%
              bonus moves the total by far less than half.
            </p>
          </section>
        </aside>

        {/* -------------------------------------------------- the quotes */}
        <div className="space-y-3">
          {plan !== 'THIRD_PARTY' && (
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                Add-ons
                <span className="text-ink-subtle ml-2 font-normal">
                  {chosen.length} of {available.length} chosen
                </span>
              </h2>
              <ul className="divide-hairline divide-y">
                {available.map((addOn) => {
                  const on = chosen.includes(addOn.id);
                  const next = on ? chosen.filter((id) => id !== addOn.id) : [...chosen, addOn.id];
                  return (
                    <li key={addOn.id}>
                      <Link
                        href={withParams(base, { addOns: next.join(',') })}
                        className="hover:bg-surface-sunken flex items-start gap-3 px-4 py-3 transition-colors"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            on
                              ? 'border-accent-500 bg-accent-500 text-brand-950'
                              : 'border-ink-subtle',
                          )}
                          aria-hidden="true"
                        >
                          {on ? (
                            <Minus className="h-3 w-3" />
                          ) : (
                            <Plus className="text-ink-subtle h-3 w-3" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">{addOn.name}</span>
                          <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
                            {addOn.blurb}
                          </span>
                          <span className="text-ink-subtle mt-0.5 block text-xs">
                            Not offered past {addOn.maxVehicleAge} years
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {available.length === 0 && (
                <p className="text-ink-muted px-4 py-6 text-center text-sm">
                  No add-on is offered on a vehicle this old. That is the real constraint, not a gap
                  in the list.
                </p>
              )}
            </section>
          )}

          {!result.ok && (
            <div className="border-hairline bg-surface flex items-start gap-2 rounded-2xl border p-4 text-sm">
              <AlertTriangle className="text-deal mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="text-ink-muted">{result.message}</p>
            </div>
          )}

          {quotes.map((quote) => {
            const best = cheapest?.insurer.id === quote.insurer.id;
            return (
              <article
                key={quote.insurer.id}
                className={cn(
                  'border-hairline bg-surface rounded-2xl border p-4',
                  best && 'border-accent-500/60',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-bold">
                      {quote.insurer.name}
                      {best && (
                        <span className="bg-accent-500/15 text-accent-400 rounded-full px-2 py-0.5 text-[0.65rem]">
                          Lowest premium
                        </span>
                      )}
                    </h3>
                    <p className="text-ink-muted mt-0.5 text-xs">
                      {quote.insurer.tagline} · {quote.insurer.claimRatio}% of claims settled ·{' '}
                      {quote.insurer.garages.toLocaleString('en-IN')} cashless garages
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{formatPaise(quote.total)}</p>
                    <p className="text-ink-subtle text-xs">for a year, tax included</p>
                  </div>
                </div>

                <dl className="border-hairline mt-3 space-y-1 border-t pt-3">
                  {quote.lines.map((line) => (
                    <div key={line.label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink-muted text-xs">
                        {line.label}
                        {line.note && (
                          <span className="text-ink-subtle block text-[0.7rem]">{line.note}</span>
                        )}
                      </dt>
                      <dd
                        className={cn(
                          'shrink-0 text-xs font-bold tabular-nums',
                          line.amount < 0 && 'text-instock',
                        )}
                      >
                        {line.amount < 0 ? '−' : ''}
                        {formatPaise(Math.abs(line.amount))}
                      </dd>
                    </div>
                  ))}
                  <div className="border-hairline flex items-baseline justify-between gap-3 border-t pt-1">
                    <dt className="text-sm font-bold">Total</dt>
                    <dd className="text-sm font-bold tabular-nums">{formatPaise(quote.total)}</dd>
                  </div>
                </dl>

                <p className="text-ink-subtle mt-2 flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Declared value {formatPaise(quote.idv)}
                </p>

                <BuyPlan
                  insurerId={quote.insurer.id}
                  modelId={model.id}
                  registration={registration.normalised}
                  ageMonths={ageMonths}
                  plan={plan}
                  idv={idv}
                  claimFreeYears={claimFreeYears}
                  addOnIds={chosen}
                  label={`Pay ${formatPaise(quote.total)} from Eshwaran Pay`}
                  csrfField={<CsrfField />}
                />
              </article>
            );
          })}

          <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
            <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="text-ink-muted">
              <span className="text-ink font-bold">No cover is being sold.</span> These insurers are
              invented and these rates are illustrative. Paying moves money out of your Eshwaran Pay
              balance and records what it was for; it does not put a contract of insurance in force
              anywhere.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
