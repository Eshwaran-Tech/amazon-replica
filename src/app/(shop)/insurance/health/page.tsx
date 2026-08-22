import {
  ArrowRight,
  BadgeCheck,
  Building2,
  HeartPulse,
  Info,
  Sparkles,
  Stethoscope,
  Timer,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import {
  CHILD_MAX_AGE,
  HEADLINE_BENEFITS,
  HEALTH_DISCOUNTS,
  MAX_AGE,
  MIN_AGE,
  SUM_INSURED_LAKHS,
} from '@/data/health-plans';
import { INSURERS } from '@/data/insurers';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listPolicies } from '@/services/insurance-purchase';

export const metadata: Metadata = {
  title: 'Health cover',
  description:
    'What a health policy is made of: a sum insured, a premium banded by age, and the waiting periods before each thing becomes claimable.',
};

export const dynamic = 'force-dynamic';

/**
 * The health landing page.
 *
 * **This store sells no insurance.** The plan is invented and the rates are
 * illustrative; the notice says so at the top.
 *
 * The form is a plain GET with a fixed set of age fields — two adults, four
 * children, each with a "not included" option. That is deliberately simpler
 * than an add-a-member widget: it works with JavaScript switched off, the whole
 * quote lives in the URL, and the back button undoes exactly one change.
 */

const ADULT_AGES = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, index) => MIN_AGE + index);

/** Derived, so the headline cannot drift from what the insurer cards say. */
const WIDEST_NETWORK = Math.max(...INSURERS.map((insurer) => insurer.hospitals));
const CHILD_AGES = Array.from({ length: CHILD_MAX_AGE + 1 }, (_, index) => index);

export default async function HealthInsurancePage() {
  const session = await getSession();
  const policies = session ? await listPolicies(session.user.id, 5) : [];
  const health = policies.filter((policy) => policy.kind === 'HEALTH');

  return (
    <Container size="default" className="space-y-5 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <Link href="/insurance" className="hover:text-link hover:underline">
          Insurance
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Health</span>
      </nav>

      <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">This store sells no insurance.</span> The plan below
          is invented and the rates are illustrative. What is real is the shape of a health policy —
          a premium that climbs steeply with age, a list of exclusions, and waiting periods before
          particular things become claimable at all.
        </p>
      </div>

      {/* ---------------------------------------------------- the hero */}
      <section className="from-brand-900 to-surface border-hairline overflow-hidden rounded-2xl border bg-gradient-to-br">
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            <span className="bg-accent-500/15 text-accent-400 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Just launched
            </span>
            <h1 className="text-xl font-bold sm:text-2xl">One plan, and what it actually does</h1>
            <p className="text-ink-muted max-w-prose text-sm leading-relaxed">
              Cover from {SUM_INSURED_LAKHS[0]} lakh to{' '}
              {SUM_INSURED_LAKHS[SUM_INSURED_LAKHS.length - 1]} lakh for up to two adults and four
              children, priced on the eldest member — which is how a family floater really works,
              and why averaging the ages would understate it.
            </p>

            <ul className="grid gap-3 sm:grid-cols-2">
              {HEADLINE_BENEFITS.map((benefit) => (
                <li
                  key={benefit.name}
                  className="border-hairline bg-surface/60 rounded-xl border p-3"
                >
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <BadgeCheck className="text-instock h-4 w-4 shrink-0" aria-hidden="true" />
                    {benefit.name}
                  </p>
                  <p className="text-ink-muted mt-1 text-xs leading-relaxed">{benefit.detail}</p>
                </li>
              ))}
            </ul>

            <div className="text-ink-muted flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <span className="flex items-center gap-1.5">
                <Building2 className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Up to {WIDEST_NETWORK.toLocaleString('en-IN')} cashless hospitals
              </span>
              <span className="flex items-center gap-1.5">
                <Stethoscope className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Annual check-up from year two
              </span>
              <span className="flex items-center gap-1.5">
                <Timer className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Waiting periods listed in full
              </span>
            </div>
          </div>

          {/* -------------------------------------------- the quote form */}
          <div className="border-hairline bg-surface rounded-2xl border p-4">
            <h2 className="text-sm font-bold">Get a health cover quote</h2>
            <p className="text-ink-muted mt-1 text-xs leading-relaxed">
              Set an age for each person to include. Leave the rest on “Not included”.
            </p>

            <form action="/insurance/health/quote" method="get" className="mt-4 space-y-3">
              <div>
                <label htmlFor="sumInsuredLakhs" className="mb-1 block text-xs font-bold">
                  Sum insured
                </label>
                <select
                  id="sumInsuredLakhs"
                  name="sumInsuredLakhs"
                  defaultValue="10"
                  className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                >
                  {SUM_INSURED_LAKHS.map((lakhs) => (
                    <option key={lakhs} value={lakhs}>
                      {lakhs >= 100 ? `${lakhs / 100} crore` : `${lakhs} lakh`}
                    </option>
                  ))}
                </select>
              </div>

              <fieldset>
                <legend className="mb-1 text-xs font-bold">Adults</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1].map((index) => (
                    <select
                      key={index}
                      name="adultAge"
                      defaultValue={index === 0 ? '32' : ''}
                      aria-label={`Adult ${index + 1} age`}
                      className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    >
                      <option value="">Not included</option>
                      {ADULT_AGES.map((age) => (
                        <option key={age} value={age}>
                          {age} years
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-1 text-xs font-bold">Children</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((index) => (
                    <select
                      key={index}
                      name="childAge"
                      defaultValue=""
                      aria-label={`Child ${index + 1} age`}
                      className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    >
                      <option value="">Not included</option>
                      {CHILD_AGES.map((age) => (
                        <option key={age} value={age}>
                          {age === 0 ? 'Under 1' : `${age} years`}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="termYears" className="mb-1 block text-xs font-bold">
                  Term
                </label>
                <select
                  id="termYears"
                  name="termYears"
                  defaultValue="1"
                  className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                >
                  <option value="1">One year</option>
                  <option value="2">Two years — 7% off</option>
                </select>
              </div>

              <button
                type="submit"
                className="bg-accent-500 hover:bg-accent-400 text-brand-950 w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-colors"
              >
                Get health cover
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* ------------------------------------------- existing policies */}
      {health.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Your cover</h2>
          <ul className="divide-hairline divide-y">
            {health.map((policy) => (
              <li
                key={policy.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="text-sm font-bold">{policy.subject}</span>
                <span className="text-ink-muted text-xs">
                  {policy.insurerName} · {policy.policyNumber}
                </span>
                <span className="text-ink-muted ml-auto text-xs">
                  Expires{' '}
                  {policy.expiresAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span className="text-sm font-bold">{formatPaise(policy.premium)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* -------------------------------------------------- discounts */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
          The discounts, and what each one needs
        </h2>
        <ul className="divide-hairline divide-y">
          {HEALTH_DISCOUNTS.map((discount) => (
            <li key={discount.id} className="flex items-baseline gap-3 px-4 py-3">
              <span className="bg-instock/15 text-instock shrink-0 rounded-full px-2 py-0.5 text-xs font-bold">
                {discount.percent}%
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{discount.name}</span>
                <span className="text-ink-muted mt-0.5 block text-xs">{discount.condition}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs leading-relaxed">
          They multiply rather than add: 5% and 10% together is 14.5% off, not 15%. Adding them is
          the commonest way a quoted premium comes out below the one that gets charged.
        </p>
      </section>

      {/* --------------------------------------------------- benefits */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/insurance/health/benefits"
          className="border-hairline bg-surface hover:border-accent-500/60 flex items-start gap-3 rounded-2xl border p-4 transition-colors"
        >
          <span className="bg-accent-500/15 text-accent-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <HeartPulse className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold">
              What is covered, what is not, and when
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
              Including the tab most pages leave out: the waiting periods. A policy bought today
              does not cover a pre-existing condition today, and saying so plainly is more useful
              than any benefit on the first tab.
            </span>
          </span>
        </Link>

        <Link
          href="/insurance"
          className="border-hairline bg-surface hover:border-accent-500/60 flex items-start gap-3 rounded-2xl border p-4 transition-colors"
        >
          <span className="bg-accent-500/15 text-accent-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <BadgeCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold">
              Motor cover
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
              A car or a bike, quoted with the breakdown in front of you.
            </span>
          </span>
        </Link>
      </section>
    </Container>
  );
}
