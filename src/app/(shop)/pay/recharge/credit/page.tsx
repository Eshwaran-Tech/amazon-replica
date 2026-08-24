import { Gift, Info, Sparkles, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import {
  DENOMINATIONS,
  findStore,
  MAX_TOP_UP,
  MIN_TOP_UP,
  RELOAD_AMOUNTS,
  RELOAD_THRESHOLDS,
  STORES,
} from '@/data/content-stores';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import type { ContentStore } from '@/models/content-credit';
import { creditBalances, getAutoReload, listCreditEntries } from '@/services/content-credit';
import { getWalletSummary } from '@/services/wallet';

import { CreditForms } from './credit-forms';

export const metadata: Metadata = {
  title: 'App Store and Play credit',
  description: 'Buy store credit for apps, games and rentals, and set it to top itself up.',
};

export const dynamic = 'force-dynamic';

/**
 * App store and Play credit.
 *
 * **This is not the wallet with a different name on it**, and the page leads
 * with why. Store credit is *scoped*: it buys digital content here and nothing
 * else, it cannot be withdrawn, and it is **spent before the Eshwaran Pay balance**
 * whenever you rent something or take a channel. That last part is not a claim —
 * `services/video.ts` genuinely draws on it first.
 *
 * The two mechanics that belong to a store credit and not to a wallet are both
 * here and both work: a **bonus that rises with the amount**, and an
 * **automatic reload** that fires at the moment of spending rather than on a
 * timer. The reload is the one thing in this store that can charge somebody
 * without their pressing anything, so it is capped and it says so.
 */

interface Props {
  searchParams: Promise<{ store?: string }>;
}

const LABELS: Record<string, string> = {
  TOP_UP: 'Added',
  BONUS: 'Bonus',
  SPEND: 'Spent',
  AUTO_RELOAD: 'Automatic reload',
};

export default async function CreditPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const store = findStore(params.store) ?? STORES[0];
  const storeId = (store?.id ?? 'APPSTORE') as ContentStore;

  const [balances, entries, reload, wallet] = session
    ? await Promise.all([
        creditBalances(session.user.id),
        listCreditEntries(session.user.id, storeId),
        getAutoReload(session.user.id, storeId),
        getWalletSummary(session.user.id),
      ])
    : [{ APPSTORE: 0, PLAY: 0 }, [], null, null];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Eshwaran Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Store credit</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Gift className="text-accent-400 h-5 w-5" aria-hidden="true" />
            App Store and Play credit
          </h1>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            A separate balance for digital content — spent before your Eshwaran Pay balance whenever
            you rent or subscribe to something here.
          </p>
        </div>
        {wallet && (
          <p className="text-ink-muted text-sm">
            Eshwaran Pay balance{' '}
            <span className="text-ink font-bold">{formatPaise(wallet.balance)}</span>
          </p>
        )}
      </header>

      <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">This is not a second wallet.</span> Store credit is
          scoped: it buys digital content on this store and nothing else, and it cannot be withdrawn
          or moved back. What it is not is decorative — rent a film or take a channel and the credit
          is genuinely drawn down first, with the wallet covering only what is left.
        </p>
      </div>

      {/* ------------------------------------------------ the two stores */}
      <section className="grid gap-3 sm:grid-cols-2">
        {STORES.map((entry) => {
          const active = entry.id === storeId;
          return (
            <Link
              key={entry.id}
              href={`/pay/recharge/credit?store=${entry.id}`}
              className={cn(
                'rounded-2xl border p-4 transition-colors',
                active
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-hairline bg-surface hover:border-accent-500/60',
              )}
            >
              <p className={cn('text-sm font-bold', active && 'text-accent-400')}>{entry.name}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {formatPaise(balances[entry.id])}
              </p>
              <p className="text-ink-muted mt-1 text-xs">{entry.blurb}</p>
              <ul className="text-ink-subtle mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {entry.spendableOn.map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </Link>
          );
        })}
      </section>

      {!session ? (
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <p className="text-sm font-bold">Sign in to buy credit.</p>
          <Link
            href="/auth/login?next=/pay/recharge/credit"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)] lg:items-start">
          <CreditForms
            store={storeId}
            storeName={store?.name ?? 'Store credit'}
            denominations={DENOMINATIONS}
            limits={{ min: MIN_TOP_UP, max: MAX_TOP_UP }}
            reload={
              reload
                ? {
                    enabled: reload.enabled,
                    thresholdRupees: reload.thresholdRupees,
                    amountRupees: reload.amountRupees,
                    reloadsThisMonth: reload.reloadsThisMonth,
                    maxPerMonth: reload.maxPerMonth,
                  }
                : null
            }
            thresholds={RELOAD_THRESHOLDS}
            amounts={RELOAD_AMOUNTS}
            csrfField={<CsrfField />}
          />

          <aside className="min-w-0 space-y-3">
            {/* -------------------------------------------- where it goes */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Sparkles className="text-accent-400 h-4 w-4" aria-hidden="true" />
                What it buys
              </h2>
              <ul className="divide-hairline divide-y text-sm">
                {[
                  { label: 'Rent a film or a series', href: '/prime' },
                  { label: 'Take a channel', href: '/prime' },
                  { label: 'Your library', href: '/prime' },
                ].map((row) => (
                  <li key={row.label}>
                    <Link
                      href={row.href}
                      className="text-link hover:bg-surface-sunken block px-4 py-2.5 transition-colors"
                    >
                      {row.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs leading-relaxed">
                Credit is taken first and the wallet covers the remainder, so a rental can be paid
                for out of both at once without you choosing between them.
              </p>
            </section>

            {/* ----------------------------------------------- the ledger */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Wallet className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Movements
              </h2>

              {entries.length === 0 ? (
                <p className="text-ink-muted px-4 py-8 text-center text-sm">
                  Nothing yet. The balance is summed from this ledger rather than kept in a column,
                  so the two cannot drift apart.
                </p>
              ) : (
                <ul className="divide-hairline divide-y">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex items-baseline gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{entry.note}</span>
                        <span className="text-ink-subtle text-xs">
                          {LABELS[entry.type] ?? entry.type} ·{' '}
                          {entry.createdAt.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-sm font-bold tabular-nums',
                          entry.direction === 'CREDIT' ? 'text-instock' : 'text-ink',
                        )}
                      >
                        {entry.direction === 'CREDIT' ? '+' : '−'}
                        {formatPaise(entry.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      <p className="text-ink-subtle text-xs leading-relaxed">
        A bonus is worked out on the server from the amount, never carried by the form. Automatic
        reload is checked at the moment of spending — which is the only honest place to check it,
        because that is when a balance actually runs low.
      </p>
    </Container>
  );
}
