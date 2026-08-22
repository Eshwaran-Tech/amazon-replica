import { AlertTriangle, ArrowRight, Info, TrainFront, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { findNetwork, METRO_TOP_UPS, MIN_METRO_TOP_UP } from '@/data/transit';
import { METRO_STATIONS, stationsOn } from '@/data/transit-routes';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  cardHistory,
  cardsFor,
  METRO_LIMITS,
  METRO_NETWORKS,
  quoteJourney,
} from '@/services/metro';
import { getWalletSummary } from '@/services/wallet';

import { CardForms } from './card-forms';

export const metadata: Metadata = {
  title: 'Metro card',
  description: 'Recharge a metro card from your Amazon Pay balance and check what a journey costs.',
};

export const dynamic = 'force-dynamic';

/**
 * Metro cards.
 *
 * The balance is real and comes out of the same wallet as everything else. The
 * fare finder is real arithmetic: a distance slab, which is how every Indian
 * metro prices a journey, and the card discount that is the whole reason
 * anybody carries a card rather than buying a token.
 *
 * What is not real is any connection to a gate. A journey appears on the card
 * only when the customer records one, and the page says so rather than letting
 * a made-up debit read as a tap-out.
 */

interface Props {
  searchParams: Promise<{ network?: string; from?: string; to?: string }>;
}

export default async function MetroPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const cards = session ? await cardsFor(session.user.id) : [];
  const wallet = session ? await getWalletSummary(session.user.id) : null;

  const network =
    findNetwork(params.network) ?? findNetwork(cards[0]?.providerId) ?? METRO_NETWORKS[0];

  const stations = network ? stationsOn(network.id) : [];
  const fromId = params.from ?? stations[0]?.id ?? '';
  const toId = params.to ?? stations[stations.length - 1]?.id ?? '';
  const fare = quoteJourney(fromId, toId);

  const history = session && cards[0] ? await cardHistory(session.user.id, cards[0].number) : null;

  const fareLink = (changes: { network?: string; from?: string; to?: string }): string => {
    const next = new URLSearchParams();
    next.set('network', changes.network ?? network?.id ?? '');
    if (!changes.network) {
      next.set('from', changes.from ?? fromId);
      next.set('to', changes.to ?? toId);
    }
    return `/pay/metro?${next.toString()}`;
  };

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Metro</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <TrainFront className="text-accent-400 h-5 w-5" aria-hidden="true" />
            Metro card
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            One card per city, topped up from your Amazon Pay balance.
          </p>
        </div>
        {wallet && (
          <p className="text-ink-muted text-sm">
            Amazon Pay balance{' '}
            <span className="text-ink font-bold">{formatPaise(wallet.balance)}</span>
          </p>
        )}
      </header>

      <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          <span className="text-ink font-bold">No gate can see this card.</span> The networks are
          this store&rsquo;s own; the stations are real places and the fares follow the real slab
          structure. The balance moves your actual Amazon Pay money — a journey appears on the card
          only when you record one.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {!session ? (
            <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
              <p className="text-sm font-bold">Sign in to add or recharge a card.</p>
              <Link
                href="/auth/login?next=/pay/metro"
                className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
              >
                Sign in
              </Link>
            </div>
          ) : (
            <>
              {cards.length > 0 && (
                <section className="grid gap-3 sm:grid-cols-2">
                  {cards.map((card) => (
                    <article
                      key={card.id}
                      className={cn(
                        'border-hairline bg-surface rounded-2xl border p-4',
                        card.lowBalance && 'border-deal/60',
                      )}
                    >
                      <p className="text-sm font-bold">{card.providerName}</p>
                      <p className="text-ink-muted mt-0.5 font-mono text-xs tracking-wider">
                        {card.number.replace(/(.{4})/g, '$1 ').trim()}
                      </p>
                      <p className="mt-3 text-xl font-bold">{formatPaise(card.balance)}</p>
                      {card.lowBalance ? (
                        <p className="text-deal mt-1 flex items-center gap-1.5 text-xs font-bold">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Below {formatPaise(card.minBalance)} — a gate would refuse it
                        </p>
                      ) : (
                        <p className="text-ink-subtle mt-1 text-xs">
                          Refused below {formatPaise(card.minBalance)}
                        </p>
                      )}
                    </article>
                  ))}
                </section>
              )}

              <CardForms
                cards={cards}
                networks={METRO_NETWORKS.map((entry) => ({
                  id: entry.id,
                  city: entry.city,
                  name: entry.name,
                  cardName: entry.cardName,
                  cardDiscountPercent: entry.cardDiscountPercent,
                }))}
                stations={METRO_STATIONS.map((station) => ({
                  id: station.id,
                  name: station.name,
                  networkId: station.networkId,
                  line: station.line,
                }))}
                topUps={METRO_TOP_UPS}
                limits={METRO_LIMITS}
                csrfField={<CsrfField />}
              />

              {history && history.entries.length > 0 && (
                <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
                  <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                    {history.account.providerName}
                    <span className="text-ink-subtle ml-2 font-normal">recent activity</span>
                  </h2>
                  <ul className="divide-hairline divide-y">
                    {history.entries.map((entry) => (
                      <li key={entry.id} className="flex items-baseline gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{entry.note}</span>
                          <span className="text-ink-subtle text-xs">
                            {entry.createdAt.toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}{' '}
                            · {entry.reference}
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
                </section>
              )}
            </>
          )}
        </div>

        {/* ------------------------------------------------- fare finder */}
        <aside className="min-w-0 space-y-3">
          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
              What a journey costs
            </h2>

            <div className="border-hairline flex flex-wrap gap-1.5 border-b px-4 py-3">
              {METRO_NETWORKS.map((entry) => (
                <Link
                  key={entry.id}
                  href={fareLink({ network: entry.id })}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                    entry.id === network?.id
                      ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                      : 'border-hairline text-ink-muted hover:border-accent-500/60',
                  )}
                >
                  {entry.city}
                </Link>
              ))}
            </div>

            <form method="get" className="space-y-3 px-4 py-3">
              <input type="hidden" name="network" value={network?.id ?? ''} />

              {(
                [
                  { name: 'from', label: 'From', value: fromId },
                  { name: 'to', label: 'To', value: toId },
                ] as const
              ).map((picker) => (
                <div key={picker.name}>
                  <label htmlFor={`fare-${picker.name}`} className="mb-1 block text-xs font-bold">
                    {picker.label}
                  </label>
                  <select
                    id={`fare-${picker.name}`}
                    name={picker.name}
                    defaultValue={picker.value}
                    className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  >
                    {[...new Set(stations.map((station) => station.line))].map((line) => (
                      <optgroup key={line} label={`${line} line`}>
                        {stations
                          .filter((station) => station.line === line)
                          .map((station) => (
                            <option key={station.id} value={station.id}>
                              {station.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}

              <button
                type="submit"
                className="border-hairline hover:border-accent-500/60 w-full rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
              >
                Check the fare
              </button>
            </form>

            {fare ? (
              <div className="border-hairline space-y-2 border-t px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-bold">
                  {fare.fromName}
                  <ArrowRight className="text-ink-subtle h-3.5 w-3.5" aria-hidden="true" />
                  {fare.toName}
                </p>
                <p className="text-ink-muted text-xs">{fare.km} km of track</p>
                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-muted">Token at the window</dt>
                    <dd className="tabular-nums">{formatPaise(fare.tokenFare)}</dd>
                  </div>
                  <div className="flex justify-between font-bold">
                    <dt>On the card</dt>
                    <dd className="text-instock tabular-nums">{formatPaise(fare.cardFare)}</dd>
                  </div>
                  <div className="border-hairline flex justify-between border-t pt-1">
                    <dt className="text-ink-muted">Saved, at {fare.discountPercent}% off</dt>
                    <dd className="text-instock tabular-nums">{formatPaise(fare.saving)}</dd>
                  </div>
                </dl>
                <p className="text-ink-subtle text-xs leading-relaxed">
                  Fares go by distance slab, not by the kilometre — which is why two stops and four
                  stops can cost the same.
                </p>
              </div>
            ) : (
              <p className="text-ink-muted border-hairline border-t px-4 py-3 text-xs">
                Choose two different stations on the same network.
              </p>
            )}
          </section>

          <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
            <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
              <Wallet className="text-accent-400 h-4 w-4" aria-hidden="true" />
              Elsewhere
            </h2>
            <ul className="divide-hairline divide-y text-sm">
              {[
                { label: 'FASTag and tolls', href: '/pay/fastag' },
                { label: 'Add money to Amazon Pay', href: '/pay/balance' },
                { label: 'Train tickets', href: '/trains' },
                { label: 'Ledger statement', href: '/pay/statement' },
              ].map((row) => (
                <li key={row.href}>
                  <Link
                    href={row.href}
                    className="text-link hover:bg-surface-sunken block px-4 py-2.5 transition-colors"
                  >
                    {row.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <p className="text-ink-subtle text-xs leading-relaxed">
        A recharge is at least ₹{MIN_METRO_TOP_UP}. The card&rsquo;s balance is summed from its
        ledger rather than kept in a column, so it and the ledger cannot drift apart — the same rule
        the Amazon Pay balance follows.
      </p>
    </Container>
  );
}
