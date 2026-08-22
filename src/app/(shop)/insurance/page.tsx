import {
  BadgeCheck,
  Bike,
  Car,
  CircleHelp,
  Clock,
  HeartPulse,
  Info,
  ShieldCheck,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { INSURERS, NCB_LADDER, PLAN_KINDS } from '@/data/insurers';
import { modelsOf, type VehicleKind } from '@/data/vehicles';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listPolicies } from '@/services/insurance-purchase';

export const metadata: Metadata = {
  title: 'Vehicle insurance',
  description: 'Compare motor cover for a car or a bike and pay from your Amazon Pay balance.',
};

export const dynamic = 'force-dynamic';

/**
 * The motor insurance landing page.
 *
 * **This store sells no insurance.** Every insurer named here is invented and
 * every rate is illustrative -- the notice at the top says so, in the first
 * thing anybody reads, rather than in small print at the bottom. What the page
 * is for is the arithmetic: what a premium is made of, and why a no-claim bonus
 * moves the total less than people expect.
 *
 * The whole flow is URL-driven -- the vehicle kind is a link, the form is a
 * plain GET -- so a quote is shareable, the back button is correct, and none of
 * it needs JavaScript to work.
 */

interface Props {
  searchParams: Promise<{ kind?: string }>;
}

const FEATURES = [
  {
    icon: Wallet,
    title: 'Paid from your balance',
    body: 'The premium leaves your Amazon Pay balance and lands in the same ledger as everything else you buy here.',
  },
  {
    icon: BadgeCheck,
    title: 'The breakdown, not just a number',
    body: 'Own damage, third party, each add-on and the tax, listed separately. A single figure cannot be checked against anything.',
  },
  {
    icon: Clock,
    title: 'Priced on the vehicle’s age',
    body: 'The declared value follows the published depreciation ladder, and an older vehicle carries a higher own-damage rate.',
  },
  {
    icon: Wrench,
    title: 'Add-ons with their real limits',
    body: 'Zero depreciation is not sold on an old car. Each add-on shows the age it stops being offered at.',
  },
];

export default async function InsurancePage({ searchParams }: Props) {
  const params = await searchParams;
  const kind: VehicleKind = params.kind === 'BIKE' ? 'BIKE' : 'CAR';
  const models = modelsOf(kind);

  const session = await getSession();
  const policies = session ? await listPolicies(session.user.id, 5) : [];
  const motor = policies.filter((policy) => policy.kind === 'MOTOR');

  return (
    <Container size="default" className="space-y-5 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Insurance</span>
      </nav>

      <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">This store sells no insurance.</span> It is not an
          insurer, a broker or a corporate agent, the insurers below are invented, and no policy
          issued here covers anything. What is real is the arithmetic — the depreciation ladder, the
          no-claim bonus applying to own damage alone, the add-on age limits and the 18% tax are all
          published convention.
        </p>
      </div>

      {/* ------------------------------------------------------ the hero */}
      <section className="from-brand-900 to-surface border-hairline overflow-hidden rounded-2xl border bg-gradient-to-br">
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center">
          <div className="min-w-0 space-y-3">
            <p className="text-accent-400 text-xs font-bold tracking-wide uppercase">
              Motor insurance
            </p>
            <h1 className="text-xl font-bold sm:text-2xl">
              Cover for your {kind === 'CAR' ? 'car' : 'bike'}, priced in front of you
            </h1>
            <p className="text-ink-muted max-w-prose text-sm leading-relaxed">
              Enter the registration, tell us how old the vehicle is, and see what each insurer
              would charge and why. Every figure is broken into its parts before you pay anything.
            </p>
            <ul className="text-ink-muted flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {['Instant breakdown', 'No-claim bonus applied', 'Add-on age limits shown'].map(
                (item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <ShieldCheck className="text-instock h-3.5 w-3.5" aria-hidden="true" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* ------------------------------------------------- the form */}
          <div className="border-hairline bg-surface rounded-2xl border p-4">
            <div
              role="tablist"
              aria-label="Vehicle type"
              className="bg-surface-sunken mb-4 grid grid-cols-2 gap-1 rounded-xl p-1"
            >
              {(
                [
                  { id: 'CAR', label: 'Car', icon: Car },
                  { id: 'BIKE', label: 'Bike', icon: Bike },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = kind === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={`/insurance?kind=${tab.id}`}
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                      active
                        ? 'bg-accent-500 text-brand-950'
                        : 'text-ink-muted hover:text-ink hover:bg-surface',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <form action="/insurance/quotes" method="get" className="space-y-3">
              <input type="hidden" name="kind" value={kind} />

              <div>
                <label htmlFor="registration" className="mb-1 block text-xs font-bold">
                  Registration number
                </label>
                <input
                  id="registration"
                  name="registration"
                  required
                  placeholder="TN 02 BQ 6666"
                  autoComplete="off"
                  spellCheck={false}
                  className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm tracking-wider uppercase outline-none"
                />
                <p className="text-ink-subtle mt-1 text-xs">
                  The state code is read from the plate, so TN 02 is Tamil Nadu.
                </p>
              </div>

              <div>
                <label htmlFor="modelId" className="mb-1 block text-xs font-bold">
                  Make and model
                </label>
                <select
                  id="modelId"
                  name="modelId"
                  required
                  className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.make} {model.model} {model.variant}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ageMonths" className="mb-1 block text-xs font-bold">
                    Age of vehicle
                  </label>
                  <select
                    id="ageMonths"
                    name="ageMonths"
                    defaultValue="24"
                    className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  >
                    {[
                      { months: 3, label: 'Brand new' },
                      { months: 12, label: '1 year' },
                      { months: 24, label: '2 years' },
                      { months: 36, label: '3 years' },
                      { months: 48, label: '4 years' },
                      { months: 60, label: '5 years' },
                      { months: 96, label: '8 years' },
                      { months: 144, label: '12 years' },
                    ].map((option) => (
                      <option key={option.months} value={option.months}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ncb" className="mb-1 block text-xs font-bold">
                    Claim-free years
                  </label>
                  <select
                    id="ncb"
                    name="ncb"
                    defaultValue="0"
                    className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  >
                    {NCB_LADDER.map((rung) => (
                      <option key={rung.claimFreeYears} value={rung.claimFreeYears}>
                        {rung.claimFreeYears === 0
                          ? 'None, or claimed last year'
                          : `${rung.claimFreeYears} year${rung.claimFreeYears === 1 ? '' : 's'} — ${rung.percent}% off`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="bg-accent-500 hover:bg-accent-400 text-brand-950 w-full rounded-lg px-4 py-2.5 text-sm font-bold transition-colors"
              >
                View plans
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- existing policies */}
      {motor.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Your policies</h2>
          <ul className="divide-hairline divide-y">
            {motor.map((policy) => (
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

      {/* ------------------------------------------------------ the plans */}
      <section className="space-y-3">
        <h2 className="text-base font-bold">What the three kinds of policy actually cover</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_KINDS.map((plan) => (
            <article
              key={plan.id}
              className={cn(
                'border-hairline bg-surface flex flex-col rounded-2xl border p-4',
                plan.recommended && 'border-accent-500/60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold">{plan.name}</h3>
                {plan.recommended && (
                  <span className="bg-accent-500/15 text-accent-400 rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-ink-muted mt-1 text-xs leading-relaxed">{plan.blurb}</p>
              <ul className="mt-3 space-y-1.5">
                {plan.covers.map((cover) => (
                  <li key={cover} className="text-ink-muted flex items-start gap-2 text-xs">
                    <ShieldCheck
                      className="text-instock mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {cover}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------- the features */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <article
              key={feature.title}
              className="border-hairline bg-surface rounded-2xl border p-4"
            >
              <span className="bg-accent-500/15 text-accent-400 mb-3 flex h-9 w-9 items-center justify-center rounded-full">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="text-sm font-bold">{feature.title}</h3>
              <p className="text-ink-muted mt-1 text-xs leading-relaxed">{feature.body}</p>
            </article>
          );
        })}
      </section>

      {/* ------------------------------------------------------ elsewhere */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/insurance/health"
          className="border-hairline bg-surface hover:border-accent-500/60 flex items-start gap-3 rounded-2xl border p-4 transition-colors"
        >
          <span className="bg-accent-500/15 text-accent-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <HeartPulse className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-bold">Health cover</span>
            <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
              A sum insured, a premium banded by age, and — the part people are caught by — the
              waiting periods before each thing becomes claimable.
            </span>
          </span>
        </Link>

        <Link
          href="/help/amazon-pay"
          className="border-hairline bg-surface hover:border-accent-500/60 flex items-start gap-3 rounded-2xl border p-4 transition-colors"
        >
          <span className="bg-accent-500/15 text-accent-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <CircleHelp className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-bold">Questions about Amazon Pay</span>
            <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
              How the balance works, what a refund does, and where to raise a complaint.
            </span>
          </span>
        </Link>
      </section>

      <p className="text-ink-subtle text-xs leading-relaxed">
        {INSURERS.length} insurers quote here and all {INSURERS.length} are invented. The premium is
        recomputed on the server from the vehicle you choose — the form never carries an amount, so
        nothing a browser asserts can change what is charged.
      </p>
    </Container>
  );
}
