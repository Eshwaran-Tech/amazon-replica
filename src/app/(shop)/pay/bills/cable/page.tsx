import { AlertTriangle, Check, Layers, Plus, Tv } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { BillHeader, BillLines, NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import {
  alaCarteValue,
  BOUQUETS,
  FREE_TO_AIR,
  GENRES,
  NCF_BASE_CHANNELS,
  NCF_BASE_RUPEES,
  NCF_BLOCK_CHANNELS,
  NCF_BLOCK_RUPEES,
  NCF_CAP_RUPEES,
  PAY_CHANNELS,
} from '@/data/television';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listSavedBillers } from '@/services/bills/pay';
import { cableBill, quoteSelection, resolveSelection } from '@/services/bills/television';

export const metadata: Metadata = {
  title: 'Cable TV bill',
  description: 'Pay a cable bill and build a pack that shows the capacity fee stepping as you add.',
};

export const dynamic = 'force-dynamic';

/**
 * Cable television.
 *
 * The one page here that is a **builder** rather than a bill, because cable is
 * the one bill where what you pay is entirely a consequence of choices nobody
 * ever revisits. The regulated structure is:
 *
 *   capacity fee for the *number* of pay channels
 * + the published price of each bouquet or channel you take
 * + 18% GST
 *
 * Free-to-air channels are free and are not counted. The fee **steps** — flat
 * for the first hundred, then a block charge for each further twenty-five — and
 * the step is invisible on a real bill, which is why almost everybody carries
 * two hundred channels to watch nine.
 *
 * So the builder shows the count, the step, and what the same selection would
 * cost bought channel by channel. Every control is a link, so the whole pack
 * lives in the URL and works with JavaScript off.
 */

interface Props {
  searchParams: Promise<{
    biller?: string;
    account?: string;
    b?: string | string[];
    c?: string | string[];
    genre?: string;
  }>;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

export default async function CablePage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const billerId = params.biller ?? billersIn('CABLE')[0]?.id ?? '';
  const account = params.account?.replace(/\s/g, '');
  const current = account ? cableBill(billerId, account, new Date()) : null;

  // The builder starts from whatever is on the account, and diverges once the
  // customer touches anything. `touched` is what tells the two apart.
  const touched = params.b !== undefined || params.c !== undefined;
  const chosenBouquets = touched
    ? list(params.b)
    : (current?.selection.bouquets.map((entry) => entry.id) ?? []);
  const chosenChannels = touched
    ? list(params.c)
    : (current?.selection.channels.map((entry) => entry.id) ?? []);

  const selection = resolveSelection(chosenBouquets, chosenChannels);
  const quote = quoteSelection(selection);

  const genre = GENRES.find((entry) => entry === params.genre) ?? GENRES[0];
  const saved = session ? await listSavedBillers(session.user.id, 'CABLE') : [];

  /** Rebuilds this page's URL with one thing toggled. */
  const link = (changes: { b?: string[]; c?: string[]; genre?: string }): string => {
    const next = new URLSearchParams();
    if (params.biller) next.set('biller', params.biller);
    if (params.account) next.set('account', params.account);
    for (const id of changes.b ?? chosenBouquets) next.append('b', id);
    for (const id of changes.c ?? chosenChannels) next.append('c', id);
    next.set('genre', changes.genre ?? genre);
    return `/pay/bills/cable?${next.toString()}`;
  };

  const inGenre = PAY_CHANNELS.filter((channel) => channel.genre === genre);
  const insideBouquets = new Set(selection.bouquets.flatMap((entry) => entry.channelIds));

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Cable TV</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Tv className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Cable TV
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          You pay a capacity fee for the <em>number</em> of pay channels carried, then the published
          price of whatever you take. Free-to-air channels are free and are not counted.
        </p>
      </header>

      <NoBillerNotice what="cable operator" />

      <AccountForm
        category="CABLE"
        action="/pay/bills/cable"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !current && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That subscriber id does not look right.</p>
          <p className="text-ink-muted mt-1">
            Ten to twelve digits, from your set-top box or bill.
          </p>
        </div>
      )}

      {current && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* ------------------------------------------ the bouquets */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Layers className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Packs
                <span className="text-ink-subtle ml-auto font-normal">
                  {selection.bouquets.length} of {BOUQUETS.length}
                </span>
              </h2>
              <ul className="divide-hairline divide-y">
                {BOUQUETS.map((bouquet) => {
                  const on = chosenBouquets.includes(bouquet.id);
                  const next = on
                    ? chosenBouquets.filter((id) => id !== bouquet.id)
                    : [...chosenBouquets, bouquet.id];
                  const singly = alaCarteValue(bouquet);

                  return (
                    <li key={bouquet.id}>
                      <Link
                        href={link({ b: next })}
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
                            <Check className="h-3 w-3" />
                          ) : (
                            <Plus className="text-ink-subtle h-3 w-3" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold">
                            {bouquet.name}
                            <span className="text-ink-subtle text-xs font-normal">
                              {bouquet.broadcaster}
                            </span>
                          </span>
                          <span className="text-ink-muted mt-0.5 block text-xs">
                            {bouquet.blurb}
                          </span>
                          <span className="text-ink-subtle mt-0.5 block text-xs">
                            {bouquet.channelIds.length} channels · ₹{singly} bought singly
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-bold tabular-nums">
                            ₹{bouquet.priceRupees}
                          </span>
                          {singly > bouquet.priceRupees && (
                            <span className="text-instock block text-[0.65rem] font-bold">
                              saves ₹{singly - bouquet.priceRupees}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* -------------------------------------- à la carte channels */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                Channels on their own
              </h2>

              <div className="border-hairline flex flex-wrap gap-1.5 border-b px-4 py-3">
                {GENRES.map((entry) => (
                  <Link
                    key={entry}
                    href={link({ genre: entry })}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
                      entry === genre
                        ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                        : 'border-hairline text-ink-muted hover:border-accent-500/60',
                    )}
                  >
                    {entry}
                  </Link>
                ))}
              </div>

              <ul className="divide-hairline divide-y">
                {inGenre.map((channel) => {
                  const covered = insideBouquets.has(channel.id);
                  const on = chosenChannels.includes(channel.id);
                  const next = on
                    ? chosenChannels.filter((id) => id !== channel.id)
                    : [...chosenChannels, channel.id];

                  return (
                    <li key={channel.id}>
                      <Link
                        href={link({ c: next })}
                        className={cn(
                          'hover:bg-surface-sunken flex items-center gap-3 px-4 py-2.5 transition-colors',
                          covered && 'opacity-60',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            covered
                              ? 'border-instock bg-instock/20 text-instock'
                              : on
                                ? 'border-accent-500 bg-accent-500 text-brand-950'
                                : 'border-ink-subtle',
                          )}
                          aria-hidden="true"
                        >
                          {covered || on ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Plus className="text-ink-subtle h-3 w-3" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          {channel.name}
                          {channel.hd && (
                            <span className="text-ink-subtle ml-1.5 text-[0.65rem]">HD</span>
                          )}
                          {covered && (
                            <span className="text-instock ml-2 text-xs">already in a pack</span>
                          )}
                        </span>
                        <span className="text-ink-muted shrink-0 text-sm tabular-nums">
                          ₹{channel.mrpRupees}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs leading-relaxed">
                Plus {FREE_TO_AIR.length} free-to-air channels carried on every connection. They
                cost nothing and do not count toward the capacity fee, so nothing is saved by
                dropping them.
              </p>
            </section>
          </div>

          {/* ------------------------------------------------ the total */}
          <aside className="min-w-0 space-y-3">
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <div className="border-hairline border-b px-4 py-3">
                <BillHeader
                  holder={current.holder}
                  account={current.account}
                  period={current.cycle.label}
                  dueOn={current.cycle.dueOn}
                  daysLate={current.cycle.daysLate}
                />
              </div>

              {/* --------------------------------------- the fee stepping */}
              <div className="border-hairline border-b px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-bold">{quote.payChannelCount} pay channels</p>
                  <p className="text-ink-muted text-xs tabular-nums">
                    capacity fee {formatPaise(quote.ncf)}
                  </p>
                </div>

                <div className="bg-surface-sunken relative mt-3 h-3 overflow-hidden rounded-full">
                  <div
                    className="bg-accent-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, (quote.payChannelCount / 200) * 100)}%` }}
                  />
                  {[NCF_BASE_CHANNELS, 125, 150].map((mark) => (
                    <span
                      key={mark}
                      className="bg-surface absolute top-0 h-3 w-px"
                      style={{ left: `${(mark / 200) * 100}%` }}
                      aria-hidden="true"
                    />
                  ))}
                </div>

                {quote.toNextStep !== null ? (
                  <p
                    className={cn(
                      'mt-2 flex items-start gap-1.5 text-xs leading-relaxed',
                      quote.toNextStep <= 3 ? 'text-deal font-bold' : 'text-ink-muted',
                    )}
                  >
                    {quote.toNextStep <= 3 && (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {quote.toNextStep} more channel{quote.toNextStep === 1 ? '' : 's'} and the
                      capacity fee steps up by ₹{NCF_BLOCK_RUPEES}.
                    </span>
                  </p>
                ) : (
                  <p className="text-ink-muted mt-2 text-xs">
                    The capacity fee is capped at ₹{NCF_CAP_RUPEES}. Adding channels now costs only
                    what each channel costs.
                  </p>
                )}

                <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
                  ₹{NCF_BASE_RUPEES} for the first {NCF_BASE_CHANNELS}, then ₹{NCF_BLOCK_RUPEES} per
                  further {NCF_BLOCK_CHANNELS}, capped at ₹{NCF_CAP_RUPEES}.
                </p>
              </div>

              <div className="px-4 py-4">
                <BillLines
                  lines={quote.lines}
                  total={quote.monthlyTotal}
                  totalLabel="A month"
                  totalNote={current.arrears > 0 ? 'Before anything brought forward' : undefined}
                />

                {quote.bouquetSaving > 0 && (
                  <p className="text-instock mt-3 text-xs leading-relaxed">
                    Bought channel by channel the same selection would be{' '}
                    {formatPaise(quote.ifBoughtSingly)} of content — the packs save{' '}
                    {formatPaise(quote.bouquetSaving)} a month.
                  </p>
                )}
              </div>
            </section>

            {/* ------------------------------------------ what is due now */}
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              <p className="text-ink-muted text-xs">Due on the account now</p>
              <p className="text-2xl font-bold">{formatPaise(current.total)}</p>
              <p className="text-ink-subtle mt-1 text-xs leading-relaxed">
                {touched
                  ? 'Your changes above price the months ahead. What is due today is the bill as it stands.'
                  : `${current.billerName} · ${current.cycle.label}`}
              </p>

              <div className="mt-4">
                {session ? (
                  <PayForm
                    fields={{
                      category: 'CABLE',
                      biller: current.billerId,
                      account: current.account,
                      option: 'FULL',
                    }}
                    label={`Pay ${formatPaise(current.total)}`}
                    saveAs={current.billerName}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/bills/cable"
                    className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                  >
                    Sign in to pay
                  </Link>
                )}
              </div>
            </section>

            {touched && (
              <Link
                href={`/pay/bills/cable?biller=${params.biller ?? ''}&account=${params.account ?? ''}`}
                className="border-hairline hover:border-accent-500/60 block rounded-2xl border px-4 py-2.5 text-center text-xs font-bold transition-colors"
              >
                Reset to what is on the account
              </Link>
            )}
          </aside>
        </div>
      )}
    </Container>
  );
}
