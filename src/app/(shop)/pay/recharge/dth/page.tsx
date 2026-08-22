import { AlertTriangle, BatteryLow, Check, Plus, Satellite, Tv } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BillLines } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { ACCOUNT_FORMATS } from '@/data/billers';
import {
  alaCarteValue,
  BOUQUETS,
  DTH_OPERATORS,
  FREE_TO_AIR,
  GENRES,
  NCF_BLOCK_RUPEES,
  NCF_CAP_RUPEES,
  PAY_CHANNELS,
} from '@/data/television';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { dthAccount, quoteSelection, resolveSelection } from '@/services/bills/television';
import { getWalletSummary } from '@/services/wallet';

export const metadata: Metadata = {
  title: 'DTH recharge',
  description: 'Recharge a DTH box, build the pack, and see how long the balance lasts.',
};

export const dynamic = 'force-dynamic';

/**
 * DTH.
 *
 * **Prepaid, so there is nothing owed.** There is a balance, it drains at
 * whatever your pack costs a month, and the only questions are *how long does it
 * last* and *what am I actually paying for*. That is a different question from
 * every bill next door, which is why this is a recharge and not a bill — and why
 * the panel leads with days remaining rather than an amount due.
 *
 * The pack builder is the regulated structure: a capacity fee for the number of
 * pay channels, then the published price of each pack or channel, then GST. And
 * a longer recharge genuinely costs less per month, so the term picker shows
 * the per-month rate rather than shouting about savings.
 */

interface Props {
  searchParams: Promise<{
    operator?: string;
    box?: string;
    b?: string | string[];
    c?: string | string[];
    genre?: string;
    months?: string;
  }>;
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

export default async function DthPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();

  const operatorId = params.operator ?? DTH_OPERATORS[0]?.id ?? '';
  const box = params.box?.replace(/\s/g, '');
  const valid = box ? ACCOUNT_FORMATS.DTH.pattern.test(box) : false;

  const touched = params.b !== undefined || params.c !== undefined;
  const base = valid && box ? dthAccount(operatorId, box) : null;

  const chosenBouquets = touched
    ? list(params.b)
    : (base?.selection.bouquets.map((entry) => entry.id) ?? []);
  const chosenChannels = touched
    ? list(params.c)
    : (base?.selection.channels.map((entry) => entry.id) ?? []);

  const selection = resolveSelection(chosenBouquets, chosenChannels);
  const account = valid && box ? dthAccount(operatorId, box, selection) : null;
  const quote = quoteSelection(selection);

  const months = Number.parseInt(params.months ?? '1', 10) || 1;
  const term = account?.terms.find((entry) => entry.months === months) ?? account?.terms[0];

  const genre = GENRES.find((entry) => entry === params.genre) ?? GENRES[0];
  const inGenre = PAY_CHANNELS.filter((channel) => channel.genre === genre);
  const insideBouquets = new Set(selection.bouquets.flatMap((entry) => entry.channelIds));

  const wallet = session ? await getWalletSummary(session.user.id) : null;

  const link = (changes: {
    b?: string[];
    c?: string[];
    genre?: string;
    months?: number;
    operator?: string;
  }): string => {
    const next = new URLSearchParams();
    next.set('operator', changes.operator ?? operatorId);
    if (params.box) next.set('box', params.box);
    for (const id of changes.b ?? chosenBouquets) next.append('b', id);
    for (const id of changes.c ?? chosenChannels) next.append('c', id);
    next.set('genre', changes.genre ?? genre);
    next.set('months', String(changes.months ?? months));
    return `/pay/recharge/dth?${next.toString()}`;
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
        <span className="text-ink">DTH recharge</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Satellite className="text-accent-400 h-5 w-5" aria-hidden="true" />
            DTH recharge
          </h1>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            Prepaid, so nothing is owed — there is a balance and a monthly outgo. Build the pack and
            see how long it lasts.
          </p>
        </div>
        {wallet && (
          <p className="text-ink-muted text-sm">
            Amazon Pay balance{' '}
            <span className="text-ink font-bold">{formatPaise(wallet.balance)}</span>
          </p>
        )}
      </header>

      <div className="border-link/40 bg-link/5 rounded-2xl border p-3 text-xs leading-relaxed">
        <p className="text-ink-muted">
          <span className="text-ink font-bold">No set-top box can see this.</span> The operators and
          broadcasters are this store&rsquo;s own, and the account is worked out from the subscriber
          id you type. The money is real, and the pricing is the real regulated structure — a
          capacity fee for the number of pay channels, then what each pack costs, then GST.
        </p>
      </div>

      {/* ------------------------------------------------- the lookup */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
          <Tv className="text-accent-400 h-4 w-4" aria-hidden="true" />
          Your box
        </h2>
        <form method="get" className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="operator" className="mb-1 block text-xs font-bold">
              Operator
            </label>
            <select
              id="operator"
              name="operator"
              defaultValue={operatorId}
              className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            >
              {DTH_OPERATORS.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name} — {operator.note}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="box" className="mb-1 block text-xs font-bold">
              {ACCOUNT_FORMATS.DTH.label}
            </label>
            <input
              id="box"
              name="box"
              required
              inputMode="numeric"
              autoComplete="off"
              defaultValue={params.box ?? ''}
              placeholder={ACCOUNT_FORMATS.DTH.placeholder}
              className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm tracking-wide outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 w-full rounded-lg px-4 py-2 text-sm font-bold transition-colors sm:w-auto"
            >
              Look up
            </button>
          </div>
          <p className="text-ink-subtle text-xs sm:col-span-3">{ACCOUNT_FORMATS.DTH.hint}</p>
        </form>
      </section>

      {params.box && !valid && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That subscriber id does not look right.</p>
          <p className="text-ink-muted mt-1">Ten to twelve digits.</p>
        </div>
      )}

      {account && term && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* --------------------------------------------- the packs */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                Packs
                <span className="text-ink-subtle ml-2 font-normal">
                  {selection.bouquets.length} chosen
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
                          <span className="block text-sm font-bold">{bouquet.name}</span>
                          <span className="text-ink-muted mt-0.5 block text-xs">
                            {bouquet.blurb}
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

            {/* ------------------------------------- channels on their own */}
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
                          {covered && <span className="text-instock ml-2 text-xs">in a pack</span>}
                        </span>
                        <span className="text-ink-muted shrink-0 text-sm tabular-nums">
                          ₹{channel.mrpRupees}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs">
                Plus {FREE_TO_AIR.length} free-to-air channels, which cost nothing and count for
                nothing against the capacity fee.
              </p>
            </section>
          </div>

          {/* ------------------------------------------------ the recharge */}
          <aside className="min-w-0 space-y-3">
            {/* ------------------------------------------ how long it lasts */}
            <section
              className={cn(
                'border-hairline bg-surface overflow-hidden rounded-2xl border',
                account.daysRemaining < 7 && 'border-deal/50',
              )}
            >
              <div className="px-4 py-4">
                <p className="text-ink-muted text-xs">Balance on the box</p>
                <p className="text-2xl font-bold">{formatPaise(account.balance)}</p>

                <p
                  className={cn(
                    'mt-2 flex items-center gap-1.5 text-sm font-bold',
                    account.daysRemaining < 7 ? 'text-deal' : 'text-instock',
                  )}
                >
                  {account.daysRemaining < 7 && (
                    <BatteryLow className="h-4 w-4" aria-hidden="true" />
                  )}
                  {account.daysRemaining === 0
                    ? 'The box would go blank today'
                    : `About ${account.daysRemaining} days left`}
                </p>

                <p className="text-ink-subtle mt-1 text-xs leading-relaxed">
                  At {formatPaise(account.monthlyOutgo)} a month for this pack
                  {account.boxRental > 0 &&
                    `, including ${formatPaise(account.boxRental)} box rental`}
                  .
                </p>
              </div>
            </section>

            {/* -------------------------------------------- the breakdown */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                {quote.payChannelCount} pay channels
                <span className="text-ink-subtle ml-2 font-normal">a month</span>
              </h2>

              <div className="px-4 py-4">
                <BillLines lines={quote.lines} total={quote.monthlyTotal} totalLabel="A month" />

                {quote.toNextStep !== null ? (
                  <p
                    className={cn(
                      'mt-3 flex items-start gap-1.5 text-xs leading-relaxed',
                      quote.toNextStep <= 3 ? 'text-deal font-bold' : 'text-ink-muted',
                    )}
                  >
                    {quote.toNextStep <= 3 && (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>
                      {quote.toNextStep} more channel{quote.toNextStep === 1 ? '' : 's'} and the
                      capacity fee steps up ₹{NCF_BLOCK_RUPEES}.
                    </span>
                  </p>
                ) : (
                  <p className="text-ink-muted mt-3 text-xs">
                    Capacity fee capped at ₹{NCF_CAP_RUPEES}. Further channels cost only their own
                    price.
                  </p>
                )}

                {quote.bouquetSaving > 0 && (
                  <p className="text-instock mt-2 text-xs leading-relaxed">
                    Bought singly the same channels would be {formatPaise(quote.ifBoughtSingly)} —
                    the packs save {formatPaise(quote.bouquetSaving)} a month.
                  </p>
                )}
              </div>
            </section>

            {/* ------------------------------------------------- the term */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                How long to recharge for
              </h2>
              <ul className="divide-hairline divide-y">
                {account.terms.map((entry) => {
                  const on = entry.months === term.months;
                  return (
                    <li key={entry.months}>
                      <Link
                        href={link({ months: entry.months })}
                        className={cn(
                          'hover:bg-surface-sunken flex items-center gap-3 px-4 py-2.5 transition-colors',
                          on && 'bg-accent-500/10',
                        )}
                      >
                        <span
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 rounded-full border-2',
                            on ? 'border-accent-400 bg-accent-400' : 'border-ink-subtle',
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          {entry.label}
                          <span className="text-ink-subtle ml-2 text-xs">
                            {formatPaise(entry.perMonth)} a month
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-bold tabular-nums">
                            {formatPaise(entry.amount)}
                          </span>
                          {entry.saves > 0 && (
                            <span className="text-instock block text-[0.65rem] font-bold">
                              saves {formatPaise(entry.saves)}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="border-hairline border-t px-4 py-4">
                {session ? (
                  <PayForm
                    which="DTH"
                    fields={{
                      biller: account.operatorId,
                      account: account.subscriberId,
                      option: 'DTH',
                      months: String(term.months),
                    }}
                    repeated={{
                      bouquet: selection.bouquets.map((entry) => entry.id),
                      channel: selection.channels.map((entry) => entry.id),
                    }}
                    label={`Recharge ${formatPaise(term.amount)}`}
                    saveAs={null}
                  />
                ) : (
                  <Link
                    href="/auth/login?next=/pay/recharge/dth"
                    className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                  >
                    Sign in to recharge
                  </Link>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
