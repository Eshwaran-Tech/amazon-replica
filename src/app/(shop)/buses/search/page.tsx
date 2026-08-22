import { Bus, ChevronDown, ChevronUp, MapPin, Radio, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BusSearchForm } from '@/components/buses/bus-search-form';
import { Container } from '@/components/layout/container';
import { AMENITIES, COACH_TYPES, type Amenity } from '@/data/bus-operators';
import { holidayOn } from '@/data/holidays';
import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import {
  applyBusFilters,
  arrivalOf,
  formatDuration,
  formatTime,
  searchBuses,
  WINDOW_LABELS,
  type BusDeparture,
  type BusSort,
} from '@/services/buses';

export const metadata: Metadata = {
  title: 'Bus search results',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  return `/buses/search?${next.toString()}`;
}

function withParam(base: Record<string, string>, key: string, value: string | undefined): string {
  return withParams(base, { [key]: value });
}

/** Adds or removes one entry from a comma list, for the toggle chips. */
function toggled(current: string[], entry: string): string | undefined {
  const next = current.includes(entry)
    ? current.filter((item) => item !== entry)
    : [...current, entry];
  return next.length > 0 ? next.join(',') : undefined;
}

/**
 * A short ladder of caps, from the results themselves.
 *
 * Four rungs between the cheapest and the dearest fare on the route, rounded up
 * to a whole ten rupees so the labels read like prices rather than arithmetic.
 * Nothing is offered that would empty the list: the top rung always clears the
 * dearest coach.
 */
function fareSteps(cheapest: number, dearest: number): number[] {
  if (dearest <= cheapest) return [];
  const steps: number[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const raw = cheapest + ((dearest - cheapest) * index) / 4;
    const rounded = Math.ceil(raw / 1000) * 1000;
    if (!steps.includes(rounded)) steps.push(rounded);
  }
  return steps;
}

/** The same ladder for journey time, rounded up to the half hour. */
function durationSteps(quickest: number, longest: number): number[] {
  if (longest <= quickest) return [];
  const steps: number[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const raw = quickest + ((longest - quickest) * index) / 4;
    const rounded = Math.ceil(raw / 30) * 30;
    if (!steps.includes(rounded)) steps.push(rounded);
  }
  return steps;
}

/**
 * The sort tabs, each with the direction it reads best in.
 *
 * A rating or a seat count wants the biggest first; a fare, a clock or a
 * journey time wants the smallest. Naming that here means the URL only has to
 * carry a direction when the reader has asked for the other one.
 */
const SORTS: Array<{ key: BusSort; label: string; natural: 'asc' | 'desc' }> = [
  { key: 'RATING', label: 'Rating', natural: 'desc' },
  { key: 'DEPARTURE', label: 'Departure', natural: 'asc' },
  { key: 'DURATION', label: 'Duration', natural: 'asc' },
  { key: 'ARRIVAL', label: 'Arrival', natural: 'asc' },
  { key: 'PRICE', label: 'Price', natural: 'asc' },
  { key: 'SEATS', label: 'Seats Left', natural: 'desc' },
];

/**
 * Bus results, laid out to the reference: filters down the left, sort tabs
 * across the top of the list, and a card per departure.
 *
 * Filters are links, not a form. Every combination is a URL you can share or
 * reload, the whole thing works with JavaScript off, and the back button
 * behaves -- none of which is true of a client-side filter panel.
 */
export default async function BusSearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const today = todayKey(now);

  const from = one(params.from) ?? '';
  const to = one(params.to) ?? '';
  const date = one(params.date) ?? today;

  const types = list(one(params.type), COACH_TYPES);
  const windows = list(one(params.win), ['0', '1', '2', '3'] as const).map(Number);
  const amenities = list(one(params.amen), AMENITIES);
  const arrivals = list(one(params.arr), ['0', '1', '2', '3'] as const).map(Number);
  const trackable = one(params.track) === '1';
  const maxFare = Number(one(params.max)) || undefined;
  const maxDuration = Number(one(params.dur)) || undefined;
  // Absent means "whichever way this column reads best", which is not the same
  // as ascending -- so it stays undefined rather than collapsing to false.
  const dir = one(params.dir);
  const desc = dir === 'desc' ? true : dir === 'asc' ? false : undefined;
  const sort = (list(one(params.sort), [
    'RATING',
    'DEPARTURE',
    'DURATION',
    'ARRIVAL',
    'PRICE',
    'SEATS',
  ] as const)[0] ?? 'RATING') as BusSort;

  const result = searchBuses({ from, to, date }, now);

  // The query string every filter link is built from.
  const base: Record<string, string> = { from, to, date };
  if (types.length) base.type = types.join(',');
  if (windows.length) base.win = windows.join(',');
  if (amenities.length) base.amen = amenities.join(',');
  if (arrivals.length) base.arr = arrivals.join(',');
  if (trackable) base.track = '1';
  if (maxFare) base.max = String(maxFare);
  if (maxDuration) base.dur = String(maxDuration);
  if (sort !== 'RATING') base.sort = sort;
  if (desc !== undefined) base.dir = desc ? 'desc' : 'asc';

  const filters = {
    types,
    windows,
    arrivals,
    liveTrackable: trackable,
    amenities,
    maxFare,
    maxDuration,
    sort,
    desc,
  };
  const shown = result.ok ? applyBusFilters(result.buses, filters) : [];

  // Slider bounds come from the route's own results, so the handle never sits
  // outside the fares that exist.
  const fares = result.ok ? result.buses.map((bus) => bus.fare) : [];
  const cheapest = fares.length ? Math.min(...fares) : 0;
  const dearest = fares.length ? Math.max(...fares) : 0;
  const durations = result.ok ? result.buses.map((bus) => bus.durationMinutes) : [];
  const quickest = durations.length ? Math.min(...durations) : 0;
  const longest = durations.length ? Math.max(...durations) : 0;

  const activeSort = SORTS.find((option) => option.key === sort);
  const descending = desc ?? activeSort?.natural === 'desc';

  const holiday = holidayOn(date);

  return (
    <>
      <section className="bg-slate-800">
        <Container size="wide" className="py-4">
          <BusSearchForm today={today} initialFrom={from} initialTo={to} initialDate={date} />
        </Container>
      </section>

      <Container size="wide" className="py-5">
        {!result.ok ? (
          <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
            <Bus className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
            <p className="mt-3 text-base font-bold">{result.message}</p>
            <Link href="/buses" className="text-link mt-2 inline-block text-sm hover:underline">
              Start a new search
            </Link>
          </div>
        ) : (
          <>
            {/* ------------------------------------------------ the summary */}
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-base font-bold sm:text-lg">
                {result.from.name} - {result.to.name},{' '}
                {new Date(date).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
                {holiday && (
                  <span className="ml-2 rounded-full bg-[#fff1e0] px-2 py-0.5 text-xs font-semibold text-[#c45500]">
                    {holiday.name}
                  </span>
                )}
              </h1>
              <p className="text-ink-muted text-sm">
                {shown.length} buses found
                <span className="text-ink-subtle"> · {result.distanceKm} km by road</span>
              </p>
            </div>

            <div className="mt-4 gap-5 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
              {/* ---------------------------------------------- the filters */}
              <aside className="border-hairline bg-surface mb-4 rounded-2xl border p-4 lg:mb-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">Filters</h2>
                  <Link
                    href={`/buses/search?from=${from}&to=${to}&date=${date}`}
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    Clear All
                  </Link>
                </div>

                <FilterGroup title="Filter by Bus Type">
                  <div className="grid grid-cols-2 gap-2">
                    {COACH_TYPES.map((type) => (
                      <Chip
                        key={type}
                        href={withParam(base, 'type', toggled(types, type))}
                        on={types.includes(type)}
                        label={type}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup title="Filter by Departure">
                  <div className="grid grid-cols-2 gap-2">
                    {WINDOW_LABELS.map((label, index) => (
                      <Chip
                        key={label}
                        href={withParam(base, 'win', toggled(windows.map(String), String(index)))}
                        on={windows.includes(index)}
                        label={label}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup title="Filter by Arrival">
                  <div className="grid grid-cols-2 gap-2">
                    {WINDOW_LABELS.map((label, index) => (
                      <Chip
                        key={label}
                        href={withParam(base, 'arr', toggled(arrivals.map(String), String(index)))}
                        on={arrivals.includes(index)}
                        label={label}
                      />
                    ))}
                  </div>
                </FilterGroup>

                <FilterGroup title="Filter by Price">
                  <Steps
                    base={base}
                    param="max"
                    current={maxFare}
                    values={fareSteps(cheapest, dearest)}
                    format={(value) => `Under ₹${Math.round(value / 100).toLocaleString('en-IN')}`}
                  />
                </FilterGroup>

                <FilterGroup title="Filter by Duration">
                  <Steps
                    base={base}
                    param="dur"
                    current={maxDuration}
                    values={durationSteps(quickest, longest)}
                    // "Under 9h" reads better on a cap than "Under 9h 0m".
                    format={(value) => `Under ${formatDuration(value).replace(' 0m', '')}`}
                  />
                </FilterGroup>

                <FilterGroup title="">
                  <Check
                    href={withParam(base, 'track', trackable ? undefined : '1')}
                    on={trackable}
                    label="Live trackable buses"
                  />
                </FilterGroup>

                <FilterGroup title="Filter by amenities">
                  <ul className="space-y-1.5">
                    {AMENITIES.map((amenity) => (
                      <li key={amenity}>
                        <Check
                          href={withParam(base, 'amen', toggled(amenities, amenity))}
                          on={amenities.includes(amenity)}
                          label={amenity}
                        />
                      </li>
                    ))}
                  </ul>
                </FilterGroup>
              </aside>

              {/* ---------------------------------------------- the results */}
              <div className="min-w-0">
                <nav
                  aria-label="Sort results"
                  className="border-hairline bg-surface flex overflow-x-auto rounded-t-2xl border border-b-0"
                >
                  {SORTS.map((option) => {
                    const active = sort === option.key;
                    // Each tab lands on its own natural order first; clicking the
                    // one already chosen turns it round. Two clicks, both orders.
                    const flipped = active ? !descending : option.natural === 'desc';
                    const href = withParams(base, {
                      sort: option.key === 'RATING' ? undefined : option.key,
                      dir:
                        flipped === (option.natural === 'desc')
                          ? undefined
                          : flipped
                            ? 'desc'
                            : 'asc',
                    });

                    return (
                      <Link
                        key={option.key}
                        href={href}
                        aria-current={active ? 'true' : undefined}
                        title={active ? `Sort by ${option.label}, other way round` : undefined}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors',
                          active
                            ? 'border-accent-500 text-ink'
                            : 'text-link border-transparent hover:border-neutral-300',
                        )}
                      >
                        {option.label}
                        {active &&
                          (descending ? (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ))}
                      </Link>
                    );
                  })}
                </nav>

                <ul className="border-hairline divide-hairline divide-y rounded-b-2xl border">
                  {shown.map((bus) => (
                    <li key={bus.id} className="bg-surface p-4">
                      <BusCard bus={bus} route={{ from, to, date }} />
                    </li>
                  ))}
                </ul>

                {shown.length === 0 && (
                  <p className="border-hairline bg-surface rounded-b-2xl border border-t-0 p-8 text-center text-sm">
                    No coach on this route matches every filter.{' '}
                    <Link
                      href={`/buses/search?from=${from}&to=${to}&date=${date}`}
                      className="text-link font-semibold hover:underline"
                    >
                      Clear them
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>

            <p className="text-ink-subtle mt-5 text-xs leading-relaxed">
              Timetables and fares are generated from the {result.distanceKm} km road distance
              between {result.from.name} and {result.to.name}, and are the same on every reload. The
              operators are this store&apos;s own — no seat is held with any real bus company.
            </p>
          </>
        )}
      </Container>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
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

/**
 * A one-of-N cap, as links.
 *
 * Clicking the rung that is already on clears it, so the control is its own
 * reset -- there is no dead end where the only way back to every price is the
 * Clear All at the top of the column.
 */
function Steps({
  base,
  param,
  current,
  values,
  format,
}: {
  base: Record<string, string>;
  param: string;
  current: number | undefined;
  values: number[];
  format: (value: number) => string;
}) {
  if (values.length === 0) {
    return <p className="text-ink-subtle text-[11px]">Every coach here is the same.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {values.map((value) => (
        <li key={value}>
          <Check
            href={withParam(base, param, current === value ? undefined : String(value))}
            on={current === value}
            label={format(value)}
          />
        </li>
      ))}
    </ul>
  );
}

function BusCard({
  bus,
  route,
}: {
  bus: BusDeparture;
  route: { from: string; to: string; date: string };
}) {
  const arrival = arrivalOf(bus);

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-sm font-bold">{bus.operator.name}</p>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] font-bold',
              bus.rating >= 4
                ? 'border-instock text-instock'
                : bus.rating >= 3
                  ? 'border-accent-500 text-accent-400'
                  : 'text-deal border-red-500',
            )}
          >
            <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
            {bus.rating.toFixed(1)}
          </span>
          <span className="text-ink-subtle text-[11px]">
            {bus.ratingCount.toLocaleString('en-IN')} Ratings
          </span>
        </div>
        <p className="text-ink-muted mt-0.5 text-xs">{bus.coach}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="font-bold">{formatTime(bus.departureMinutes)}</span>
          <span className="text-ink-muted text-xs">{formatDuration(bus.durationMinutes)}</span>
          <span className="font-bold">
            {formatTime(arrival.minutes)}
            {arrival.dayOffset > 0 && (
              <span className="text-ink-muted ml-0.5 align-super text-[10px]">
                +{arrival.dayOffset}
              </span>
            )}
          </span>
        </div>

        {bus.amenities.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {bus.amenities.map((amenity: Amenity) => (
              <li
                key={amenity}
                className="border-hairline text-ink-subtle rounded-full border px-2 py-0.5 text-[10px]"
              >
                {amenity}
              </li>
            ))}
          </ul>
        )}

        <p className="text-ink-subtle mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {bus.boardingPoints.length || 1} boarding · {bus.dropPoints.length || 1} drop
          </span>
          {bus.liveTrackable && (
            <span className="text-instock inline-flex items-center gap-1">
              <Radio className="h-3 w-3" aria-hidden="true" />
              Live Trackable
            </span>
          )}
        </p>
      </div>

      <div className="text-right sm:w-40">
        <p className="text-base font-bold">
          {formatPaise(bus.fare)}
          {bus.listFare && (
            <span className="text-ink-subtle ml-1.5 text-xs font-normal line-through">
              {formatPaise(bus.listFare)}
            </span>
          )}
        </p>
        <p className="text-ink-subtle mt-0.5 text-[11px]">{bus.seatsLeft} seats left</p>
        <Link
          href={`/buses/seats?from=${encodeURIComponent(route.from)}&to=${encodeURIComponent(route.to)}&date=${route.date}&bus=${bus.id}`}
          className="border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950 mt-2 inline-block rounded-md border px-4 py-1.5 text-xs font-bold transition-colors"
        >
          Select Seats
        </Link>
      </div>
    </div>
  );
}
