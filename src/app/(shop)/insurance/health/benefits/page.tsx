import { Check, Timer, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { cn } from '@/lib/utils/cn';
import { coveredGroups, notCoveredGroups, waitingPeriods } from '@/services/health-insurance';

export const metadata: Metadata = {
  title: 'What health cover includes',
  description:
    'What a health policy covers, what it excludes, and the waiting periods before each thing becomes claimable.',
};

/**
 * Covered, not covered, and when.
 *
 * Three tabs, and the second and third are the ones worth having. A benefits
 * page that lists only inclusions is how somebody discovers an exclusion in a
 * hospital, and a policy bought today does not cover a pre-existing condition
 * today — saying so plainly is more useful than any benefit on the first tab.
 *
 * The tabs are links, not client state, so each is its own URL and can be sent
 * to somebody directly.
 */

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

const TABS = [
  { id: 'covered', label: 'Covered', icon: Check },
  { id: 'excluded', label: 'Not covered', icon: X },
  { id: 'waiting', label: 'Waiting period', icon: Timer },
] as const;

type TabId = (typeof TABS)[number]['id'];

function monthsLabel(months: number): string {
  if (months < 12) return `${months * 30} days`;
  const years = months / 12;
  return `${years} year${years === 1 ? '' : 's'}`;
}

export default async function BenefitsPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab: TabId = TABS.some((entry) => entry.id === params.tab)
    ? (params.tab as TabId)
    : 'covered';

  const groups = tab === 'covered' ? coveredGroups() : tab === 'excluded' ? notCoveredGroups() : [];
  const periods = waitingPeriods();

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/insurance/health" className="hover:text-link hover:underline">
          Health
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Benefits</span>
      </nav>

      <header>
        <h1 className="text-lg font-bold sm:text-xl">What the plan includes</h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm leading-relaxed">
          The second and third tabs are the ones worth reading. An inclusions-only page is how
          people find out about an exclusion at the worst possible moment.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Benefit sections"
        className="border-hairline bg-surface flex gap-1 overflow-x-auto rounded-2xl border p-1"
      >
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <Link
              key={entry.id}
              href={`/insurance/health/benefits?tab=${entry.id}`}
              role="tab"
              aria-selected={active}
              className={cn(
                'flex flex-1 shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors',
                active
                  ? 'bg-accent-500 text-brand-950'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {entry.label}
            </Link>
          );
        })}
      </div>

      {tab === 'waiting' ? (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <ul className="divide-hairline divide-y">
            {periods.map((period) => (
              <li key={period.id} className="flex items-start gap-3 px-4 py-4">
                <span className="bg-deal/15 text-deal shrink-0 rounded-full px-2.5 py-1 text-xs font-bold">
                  {monthsLabel(period.months)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{period.name}</span>
                  <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
                    {period.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs leading-relaxed">
            A waiting period runs from the day the policy starts, not from the day a condition
            appears. Switching insurer normally restarts it, which is the single most expensive
            thing about moving a health policy.
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <section
              key={group.group}
              className="border-hairline bg-surface overflow-hidden rounded-2xl border"
            >
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                {group.group}
              </h2>
              <ul className="divide-hairline divide-y">
                {group.benefits.map((benefit) => (
                  <li key={benefit.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                        tab === 'covered' ? 'bg-instock/15 text-instock' : 'bg-deal/15 text-deal',
                      )}
                      aria-hidden="true"
                    >
                      {tab === 'covered' ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">
                        {benefit.name}
                        {benefit.highlight && (
                          <span className="bg-accent-500/15 text-accent-400 ml-2 rounded-full px-2 py-0.5 text-[0.65rem]">
                            Highlighted
                          </span>
                        )}
                      </span>
                      <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
                        {benefit.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/insurance/health"
          className="bg-accent-500 hover:bg-accent-400 text-brand-950 rounded-lg px-4 py-2 text-sm font-bold"
        >
          Get a quote
        </Link>
        <Link
          href="/insurance"
          className="border-hairline hover:border-accent-500/60 rounded-lg border px-4 py-2 text-sm font-bold"
        >
          Motor cover
        </Link>
      </div>

      <p className="text-ink-subtle text-xs leading-relaxed">
        This store sells no insurance. The plan described here is invented; the structure — a sum
        insured, exclusions, and waiting periods that run from the policy start date — is how a
        health policy is actually put together.
      </p>
    </Container>
  );
}
