import { ArrowRight, Info, Pencil, TrainFront } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { holidayOn } from '@/data/holidays';
import { DAY_LETTERS, DAY_NAMES, statusLabel, TRAIN_CLASSES } from '@/data/train-classes';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  addDays,
  applyTrainFilters,
  arrivalOf,
  classesOffered,
  formatDuration,
  formatTime,
  freshnessLabel,
  searchTrains,
  todayKey,
  weekdayOf,
  WINDOW_LABELS,
  type TrainClassOffer,
  type TrainDeparture,
  type TrainSort,
} from '@/services/trains';

import { EditSearch } from './edit-search';

export const metadata: Metadata = {
  title: 'Train search results',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A comma list from the URL, kept to values we recognise. */
function list<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
}

/** Rebuilds the URL with some parameters changed. Filters are plain links. */
function withParams(
  base: Record<string, string>,
  changes: Record<string, string | undefined>,
): string {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  return `/trains/search?${next.toString()}`;
}

/** Adds or removes one entry from a comma list, for the toggle chips. */
function toggled(current: string[], entry: string): string | undefined {
  const next = current.includes(entry)
    ? current.filter((item) => item !== entry)
    : [...current, entry];
  return next.length > 0 ? next.join(',') : undefined;
}

const SORTS: Array<{ key: TrainSort; label: string }> = [
  { key: 'DEPARTURE', label: 'Departure' },
  { key: 'ARRIVAL', label: 'Arrival' },
  { key: 'DURATION', label: 'Duration' },
  { key: 'FARE', label: 'Fare' },
];

function prettyDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Train results, laid out to the reference: a route strip at the top, a card
 * per service with its running days and class tiles, and sort and AC controls.
 *
 * Filters and sorts are links, not a client-side panel. Every combination is a
 * URL you can share or reload, the back button behaves, and the whole thing
 * works with JavaScript off.
 */
export default async function TrainSearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const today = todayKey(now);

  const from = one(params.from) ?? '';
  const to = one(params.to) ?? '';
  const date = one(params.date) ?? today;

  const acOnly = one(params.ac) === '1';
  const availableOnly = one(params.avl) === '1';
  const classFilter = list(
    one(params.cls),
    TRAIN_CLASSES.map((entry) => entry.code),
  );
  const windows = list(one(params.win), ['0', '1', '2', '3'] as const).map(Number);
  const dir = one(params.dir);
  const desc = dir === 'desc' ? true : dir === 'asc' ? false : undefined;
  const sort = (list(one(params.sort), ['DEPARTURE', 'ARRIVAL', 'DURATION', 'FARE'] as const)[0] ??
    'DEPARTURE') as TrainSort;

  const result = searchTrains({ from, to, date }, now);

  // The query string every link on this page is built from.
  const base: Record<string, string> = { from, to, date };
  if (acOnly) base.ac = '1';
  if (availableOnly) base.avl = '1';
  if (classFilter.length) base.cls = classFilter.join(',');
  if (windows.length) base.win = windows.join(',');
  if (sort !== 'DEPARTURE') base.sort = sort;
  if (desc !== undefined) base.dir = desc ? 'desc' : 'asc';

  const shown = result.ok
    ? applyTrainFilters(result.trains, {
        acOnly,
        availableOnly,
        classes: classFilter,
        windows,
        sort,
        desc,
      })
    : [];

  const offered = result.ok ? classesOffered(result.trains) : [];
  const holiday = holidayOn(date);
  const weekday = weekdayOf(date);

  return (
    <>
      {/* ------------------------------------------------------- the route strip */}
      <section className="bg-slate-800">
        <Container size="wide" className="py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-center leading-tight text-white">
                <span className="block text-sm font-bold">{prettyDate(date).split(',')[1]}</span>
                <span className="block text-[10px] opacity-80">
                  {prettyDate(date).split(',')[0]}
                </span>
              </span>
              <p className="min-w-0 truncate text-sm font-semibold text-white">
                {result.ok ? `${result.from.name}` : from}
                <ArrowRight className="mx-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                {result.ok ? `${result.to.name}` : to}
              </p>
            </div>

            <EditSearch today={today} from={from} to={to} date={date} acOnly={acOnly}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </EditSearch>
          </div>
        </Container>
      </section>

      <Container size="wide" className="py-4">
        {!result.ok ? (
          <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
            <TrainFront className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
            <p className="mt-3 text-base font-bold">{result.message}</p>
            <Link href="/trains" className="text-link mt-2 inline-block text-sm hover:underline">
              Start a new search
            </Link>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------------- notices */}
            {!result.reservationOpen && (
              <Notice tone="warn">
                Reservation is not open this far ahead. The chart for {prettyDate(date)} opens
                nearer the date — the furthest date bookable today is{' '}
                <strong>{prettyDate(result.bookingHorizon)}</strong>.
              </Notice>
            )}

            {holiday && (
              <Notice tone="info">
                {holiday.name} falls on this date. Trains fill early around a holiday, and the fares
                on this page carry the same premium a real chart would.
              </Notice>
            )}

            {result.notRunningToday > 0 && (
              <Notice tone="info">
                {result.notRunningToday} more service{result.notRunningToday === 1 ? '' : 's'} run
                {result.notRunningToday === 1 ? 's' : ''} this route, but not on a{' '}
                {DAY_NAMES[weekday]}. Try{' '}
                <Link
                  href={withParams(base, { date: addDays(date, 1) })}
                  className="text-link font-semibold hover:underline"
                >
                  {prettyDate(addDays(date, 1))}
                </Link>
                .
              </Notice>
            )}

            {/* -------------------------------------------------------- summary */}
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-base font-bold sm:text-lg">
                {result.from.code} → {result.to.code}
                <span className="text-ink-muted ml-2 text-sm font-normal">{prettyDate(date)}</span>
              </h1>
              <p className="text-ink-muted text-sm">
                {shown.length} train{shown.length === 1 ? '' : 's'}
                <span className="text-ink-subtle"> · {result.distanceKm} km by rail</span>
              </p>
            </div>

            <div className="mt-3 gap-5 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
              {/* ------------------------------------------------- the filters */}
              <aside className="border-hairline bg-surface mb-4 rounded-2xl border p-4 lg:mb-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">Filters</h2>
                  <Link
                    href={`/trains/search?from=${from}&to=${to}&date=${date}`}
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    Clear All
                  </Link>
                </div>

                <Group title="Class">
                  <div className="grid grid-cols-3 gap-2">
                    {offered.map((code) => (
                      <Chip
                        key={code}
                        href={withParams(base, { cls: toggled(classFilter, code) })}
                        on={classFilter.includes(code)}
                        label={code}
                      />
                    ))}
                  </div>
                </Group>

                <Group title="Departure">
                  <div className="grid grid-cols-2 gap-2">
                    {WINDOW_LABELS.map((label, index) => (
                      <Chip
                        key={label}
                        href={withParams(base, {
                          win: toggled(windows.map(String), String(index)),
                        })}
                        on={windows.includes(index)}
                        label={label}
                      />
                    ))}
                  </div>
                </Group>

                <Group title="">
                  <ul className="space-y-2">
                    <li>
                      <Check
                        href={withParams(base, { ac: acOnly ? undefined : '1' })}
                        on={acOnly}
                        label="AC Only"
                      />
                    </li>
                    <li>
                      <Check
                        href={withParams(base, { avl: availableOnly ? undefined : '1' })}
                        on={availableOnly}
                        label="Berths available"
                      />
                    </li>
                  </ul>
                </Group>
              </aside>

              {/* ------------------------------------------------- the results */}
              <div className="min-w-0">
                <nav
                  aria-label="Sort results"
                  className="border-hairline bg-surface flex overflow-x-auto rounded-t-2xl border border-b-0"
                >
                  {SORTS.map((option) => {
                    const active = sort === option.key;
                    const flipped = active ? !(desc ?? false) : false;
                    return (
                      <Link
                        key={option.key}
                        href={withParams(base, {
                          sort: option.key === 'DEPARTURE' ? undefined : option.key,
                          dir: flipped ? 'desc' : undefined,
                        })}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'shrink-0 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors',
                          active
                            ? 'border-accent-500 text-ink'
                            : 'text-link border-transparent hover:border-neutral-300',
                        )}
                      >
                        {option.label}
                        {active && <span aria-hidden="true"> {desc ? '↓' : '↑'}</span>}
                      </Link>
                    );
                  })}
                </nav>

                <ul className="border-hairline divide-hairline divide-y rounded-b-2xl border">
                  {shown.map((train) => (
                    <li key={train.id} className="bg-surface p-4">
                      <TrainCard train={train} route={{ from, to, date }} weekday={weekday} />
                    </li>
                  ))}
                </ul>

                {shown.length === 0 && (
                  <p className="border-hairline bg-surface rounded-b-2xl border border-t-0 p-8 text-center text-sm">
                    {result.trains.length === 0
                      ? `No service runs ${result.from.city} to ${result.to.city} on a ${DAY_NAMES[weekday]}.`
                      : 'No train on this route matches every filter.'}{' '}
                    <Link
                      href={`/trains/search?from=${from}&to=${to}&date=${date}`}
                      className="text-link font-semibold hover:underline"
                    >
                      Clear the filters
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>

            <p className="text-ink-subtle mt-5 text-xs leading-relaxed">
              {result.from.name} and {result.to.name} are real stations {result.distanceKm} km apart
              by rail, and every timing and fare above is generated from that distance — the same on
              every reload. The services themselves are this store&apos;s own. No berth is reserved
              with Indian Railways; the charge to your{' '}
              <Link href="/pay/balance" className="text-link hover:underline">
                Eshwaran Pay balance
              </Link>{' '}
              is real.
            </p>
          </>
        )}
      </Container>
    </>
  );
}

function Notice({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'mt-3 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed',
        tone === 'warn'
          ? 'border-[#c45500]/40 bg-[#fff1e0] text-[#8a3d00]'
          : 'border-hairline bg-surface text-ink-muted',
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-hairline mt-4 border-t pt-4 first-of-type:border-t-0">
      {title && <h3 className="mb-2 text-xs font-bold">{title}</h3>}
      {children}
    </div>
  );
}

function Chip({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-pressed={on}
      className={cn(
        'block rounded-lg border-2 px-2 py-2 text-center text-[11px] font-semibold transition-colors',
        on
          ? 'border-accent-500 bg-accent-500/10 text-ink'
          : 'border-hairline text-ink-muted hover:border-accent-500',
      )}
    >
      {label}
    </Link>
  );
}

function Check({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link href={href} aria-pressed={on} className="flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-black',
          on ? 'border-accent-500 bg-accent-500 text-brand-950' : 'border-hairline',
        )}
      >
        {on ? '✓' : ''}
      </span>
      <span className={on ? 'text-ink font-semibold' : 'text-ink-muted'}>{label}</span>
    </Link>
  );
}

function TrainCard({
  train,
  route,
  weekday,
}: {
  train: TrainDeparture;
  route: { from: string; to: string; date: string };
  weekday: number;
}) {
  const arrival = arrivalOf(train);
  const arrivalDate = addDays(route.date, arrival.dayOffset);

  return (
    <div>
      {/* --------------------------------------------------- number and name */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm">
          <span className="text-ink-subtle font-mono text-xs">{train.number}</span>{' '}
          <span className="text-link font-semibold">{train.name}</span>
        </p>
        <Link
          href={`/trains/route?from=${route.from}&to=${route.to}&date=${route.date}&train=${train.number}`}
          className="text-link shrink-0 text-xs font-semibold hover:underline"
        >
          Route
        </Link>
      </div>

      {/* ------------------------------------------- departure, run, arrival */}
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div>
          <p className="text-base font-bold">{formatTime(train.departureMinutes)}</p>
          <p className="text-ink-subtle text-[11px]">{prettyDate(route.date)}</p>
        </div>

        <div className="min-w-0 text-center">
          <RunningDays runsOn={train.runsOn} weekday={weekday} />
          <p className="border-hairline text-ink-muted mx-auto mt-1 inline-block rounded border border-dashed px-2 py-0.5 text-[11px]">
            {formatDuration(train.durationMinutes)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-base font-bold">
            {formatTime(arrival.minutes)}
            {arrival.dayOffset > 0 && (
              <span className="text-ink-muted ml-0.5 align-super text-[10px]">
                +{arrival.dayOffset}
              </span>
            )}
          </p>
          <p className="text-ink-subtle text-[11px]">{prettyDate(arrivalDate)}</p>
        </div>
      </div>

      <div className="text-ink-subtle mt-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span>
          {train.origin.name} ({train.origin.code})
        </span>
        <span>
          {train.destination.name} ({train.destination.code})
        </span>
      </div>

      {/* ------------------------------------------------------ class tiles */}
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {train.classes.map((offer) => (
          <li key={offer.code}>
            <ClassTile offer={offer} train={train} route={route} />
          </li>
        ))}
      </ul>

      <p className="text-ink-subtle mt-2 text-[11px]">
        {train.haltCount} halts · {train.distanceKm} km
      </p>
    </div>
  );
}

/** The S M T W T F S strip, with the searched day ringed. */
function RunningDays({ runsOn, weekday }: { runsOn: boolean[]; weekday: number }) {
  const daily = runsOn.every(Boolean);

  return (
    <p
      className="flex items-center justify-center gap-1 text-[10px] font-bold"
      aria-label={
        daily
          ? 'Runs every day'
          : `Runs on ${runsOn
              .map((runs, index) => (runs ? DAY_NAMES[index] : null))
              .filter(Boolean)
              .join(', ')}`
      }
    >
      {daily ? (
        <span className="text-instock" aria-hidden="true">
          All days
        </span>
      ) : (
        DAY_LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            aria-hidden="true"
            className={cn(
              'flex h-4 w-4 items-center justify-center rounded-sm',
              runsOn[index] ? 'text-instock' : 'text-ink-subtle/50',
              index === weekday && runsOn[index] && 'bg-instock/15',
            )}
          >
            {letter}
          </span>
        ))
      )}
    </p>
  );
}

/**
 * One class on one train.
 *
 * A bookable class is a link to the passenger form; anything else is a plain
 * span that says why. The tile never pretends: "WL 33" is not a button, because
 * this store cannot sell a place in a queue it has no way to clear.
 */
function ClassTile({
  offer,
  train,
  route,
}: {
  offer: TrainClassOffer;
  train: TrainDeparture;
  route: { from: string; to: string; date: string };
}) {
  const status = statusLabel(offer.status, offer.count);

  const body = (
    <>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-[11px] font-bold">{offer.code}</span>
        {offer.tatkal && (
          <span className="bg-instock text-brand-950 rounded-sm px-1 text-[9px] font-bold">
            TATKAL
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-sm font-bold">{formatPaise(offer.fare)}</span>
      <span
        className={cn(
          'mt-0.5 block text-[11px] font-semibold',
          offer.status === 'AVAILABLE' && 'text-instock',
          offer.status === 'RAC' && 'text-accent-400',
          (offer.status === 'WAITLIST' || offer.status === 'REGRET') && 'text-deal',
          (offer.status === 'CLOSED' || offer.status === 'DEPARTED') && 'text-ink-subtle',
        )}
      >
        {status}
      </span>
      <span className="text-ink-subtle mt-0.5 block text-[10px]">
        {offer.status === 'DEPARTED' || offer.status === 'CLOSED'
          ? ' '
          : freshnessLabel(offer.updatedMinutesAgo)}
      </span>
    </>
  );

  const shell = 'block h-full rounded-lg border px-2 py-1.5 text-left transition-colors';

  if (!offer.bookable) {
    return (
      <span
        className={cn(shell, 'border-hairline bg-surface-sunken cursor-not-allowed opacity-70')}
        title={`${offer.label}: ${status}`}
      >
        {body}
      </span>
    );
  }

  const href = `/trains/book?from=${route.from}&to=${route.to}&date=${route.date}&train=${train.number}&class=${offer.code}`;

  return (
    <Link
      href={href}
      className={cn(shell, 'border-instock hover:bg-instock/10')}
      title={`Book ${offer.label} — ${status}`}
    >
      {body}
    </Link>
  );
}
