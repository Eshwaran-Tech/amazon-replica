import { Plane } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FlightSearchForm } from '@/components/flights/search-form';
import { Container } from '@/components/layout/container';
import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import {
  airlinesInResults,
  applyFilters,
  arrivalOf,
  CABIN_LABELS,
  formatDuration,
  formatMinutes,
  searchFlights,
  type CabinClass,
  type FlightLeg,
} from '@/services/flights';

export const metadata: Metadata = {
  title: 'Flight search results',
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

/** Rebuilds the current URL with one parameter changed, for the filter links. */
function withParam(base: Record<string, string>, key: string, value: string | undefined): string {
  const params = new URLSearchParams(base);
  if (value === undefined) params.delete(key);
  else params.set(key, value);
  return `/flights/search?${params.toString()}`;
}

export default async function FlightResultsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const today = todayKey(now);

  const from = (one(params.from) ?? 'DEL').toUpperCase();
  const to = (one(params.to) ?? 'BOM').toUpperCase();
  const date = one(params.date) ?? today;
  const returnDate = one(params.returnDate);
  const adults = Math.min(9, Math.max(1, Number(one(params.adults) ?? 1) || 1));
  const children = Math.min(9 - adults, Math.max(0, Number(one(params.children) ?? 0) || 0));
  const infants = Math.min(adults, Math.max(0, Number(one(params.infants) ?? 0) || 0));
  // Infants travel on a lap, so they occupy no seat and pay no fare here.
  const payingSeats = adults + children;
  const travellers = payingSeats + infants;
  const cabin = (one(params.cabin) ?? 'ECONOMY') as CabinClass;

  const stops = (one(params.stops) ?? 'ANY') as 'ANY' | 'NONSTOP' | 'ONE';
  const sort = (one(params.sort) ?? 'DEPARTURE') as
    'DEPARTURE' | 'DURATION' | 'PRICE_ASC' | 'PRICE_DESC';
  const airlineFilter = one(params.airline);

  const result = searchFlights({ from, to, date, travellers, cabin }, now);

  // Keeps every filter link carrying the whole search.
  const base: Record<string, string> = {
    from,
    to,
    date,
    adults: String(adults),
    children: String(children),
    infants: String(infants),
    cabin,
    ...(returnDate ? { returnDate } : {}),
    ...(stops !== 'ANY' ? { stops } : {}),
    ...(sort !== 'DEPARTURE' ? { sort } : {}),
    ...(airlineFilter ? { airline: airlineFilter } : {}),
  };

  if (!result.ok) {
    return (
      <Container size="wide" className="py-5 sm:py-7">
        <h1 className="text-xl font-bold sm:text-2xl">Flights</h1>
        <p className="text-deal mt-2 text-sm">{result.message}</p>
        <div className="mt-4">
          <FlightSearchForm
            today={today}
            initial={{ from, to, date, adults, children, infants, cabin }}
          />
        </div>
      </Container>
    );
  }

  const carriers = airlinesInResults(result.flights);
  const flights = applyFilters(result.flights, {
    stops,
    sort,
    ...(airlineFilter ? { airlines: [airlineFilter] } : {}),
  });

  const cheapest = result.flights.reduce<FlightLeg | null>(
    (best, flight) => (!best || flight.fare < best.fare ? flight : best),
    null,
  );

  return (
    <Container size="wide" className="py-5 sm:py-7">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Plane className="text-accent-400 h-5 w-5 self-center" aria-hidden="true" />
        <h1 className="text-lg font-bold sm:text-xl">
          {result.from.city} → {result.to.city}
        </h1>
        <p className="text-ink-muted text-sm">
          {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}{' '}
          · {travellers} traveller{travellers > 1 ? 's' : ''}
          {infants > 0 && ` (${infants} infant${infants > 1 ? 's' : ''})`} · {CABIN_LABELS[cabin]} ·{' '}
          {result.distanceKm.toLocaleString('en-IN')} km
        </p>
      </div>

      <div className="mt-4">
        <FlightSearchForm
          today={today}
          initial={{
            from,
            to,
            date,
            adults,
            children,
            infants,
            cabin,
            ...(returnDate ? { returnDate } : {}),
          }}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-5">
        {/* ------------------------------------------------------- filters */}
        <aside className="border-hairline bg-surface h-fit rounded-2xl border p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold">Filters</h2>
            <Link
              href={withParam(
                {
                  from,
                  to,
                  date,
                  adults: String(adults),
                  children: String(children),
                  infants: String(infants),
                  cabin,
                },
                '_',
                undefined,
              )}
              className="text-link text-xs hover:underline"
            >
              Clear all
            </Link>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold">Number of stops</legend>
            <ul className="mt-2 space-y-1">
              {(
                [
                  ['ANY', 'Any'],
                  ['NONSTOP', 'Non-stop'],
                  ['ONE', '1 stop'],
                ] as const
              ).map(([value, label]) => (
                <li key={value}>
                  <Link
                    href={withParam(base, 'stops', value === 'ANY' ? undefined : value)}
                    className={cn(
                      'block rounded-lg px-2 py-1 text-xs transition-colors',
                      stops === value
                        ? 'bg-accent-500/15 text-accent-400 font-semibold'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold">Preferred airlines</legend>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href={withParam(base, 'airline', undefined)}
                  className={cn(
                    'block rounded-lg px-2 py-1 text-xs transition-colors',
                    !airlineFilter
                      ? 'bg-accent-500/15 text-accent-400 font-semibold'
                      : 'hover:bg-surface-sunken',
                  )}
                >
                  All airlines
                </Link>
              </li>
              {carriers.map((carrier) => (
                <li key={carrier.code}>
                  <Link
                    href={withParam(base, 'airline', carrier.code)}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors',
                      airlineFilter === carrier.code
                        ? 'bg-accent-500/15 text-accent-400 font-semibold'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="truncate">{carrier.name}</span>
                    <span className="text-ink-subtle">{carrier.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </fieldset>

          {cheapest && (
            <p className="text-ink-subtle mt-4 text-[11px] leading-relaxed">
              Cheapest on this route: {formatPaise(cheapest.fare)} on {cheapest.airline.name}.
            </p>
          )}
        </aside>

        {/* ------------------------------------------------------- results */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-ink-muted text-xs">Sort by</span>
            {(
              [
                ['DEPARTURE', 'Departure'],
                ['DURATION', 'Duration'],
                ['PRICE_ASC', 'Price: low to high'],
                ['PRICE_DESC', 'Price: high to low'],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={withParam(base, 'sort', value === 'DEPARTURE' ? undefined : value)}
                className={cn(
                  'border-hairline rounded-full border px-2.5 py-1 text-xs transition-colors',
                  sort === value
                    ? 'border-accent-500 text-accent-400 font-semibold'
                    : 'hover:bg-surface-sunken',
                )}
              >
                {label}
              </Link>
            ))}
          </div>

          <p className="text-ink-muted mb-3 text-sm">
            {flights.length} of {result.flights.length} flight
            {result.flights.length === 1 ? '' : 's'}
          </p>

          {flights.length === 0 ? (
            <p className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
              No flights match these filters.{' '}
              <Link
                href={withParam(base, 'stops', undefined)}
                className="text-link hover:underline"
              >
                Clear the stops filter
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {flights.map((flight) => (
                <li key={flight.id}>
                  <FlightCard flight={flight} payingSeats={payingSeats} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Container>
  );
}

function FlightCard({ flight, payingSeats }: { flight: FlightLeg; payingSeats: number }) {
  const arrival = arrivalOf(flight);

  return (
    <article className="border-hairline bg-surface rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-[8.5rem] items-center gap-2">
          <span
            aria-hidden="true"
            className="bg-surface-sunken text-accent-400 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
          >
            {flight.airline.code}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{flight.airline.name}</span>
            <span className="text-ink-subtle block font-mono text-[11px]">
              {flight.flightNumber}
            </span>
          </span>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <div>
            <p className="text-base font-bold">{formatMinutes(flight.departureMinutes)}</p>
            <p className="text-ink-subtle text-[11px]">{flight.from.code}</p>
          </div>

          <div className="min-w-[6rem] flex-1 text-center">
            <p className="text-ink-muted text-[11px]">{formatDuration(flight.durationMinutes)}</p>
            <div className="bg-hairline relative my-1 h-px w-full">
              <span className="bg-accent-500 absolute top-1/2 left-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full" />
              <span className="bg-accent-500 absolute top-1/2 right-0 h-1.5 w-1.5 -translate-y-1/2 rounded-full" />
            </div>
            <p className="text-ink-subtle text-[11px]">
              {flight.stops === 0 ? 'Non-stop' : `1 stop · ${flight.via}`}
            </p>
          </div>

          <div>
            <p className="text-base font-bold">
              {formatMinutes(arrival.minutes)}
              {arrival.dayOffset > 0 && (
                <span className="text-accent-400 ml-0.5 align-super text-[10px]">
                  +{arrival.dayOffset}
                </span>
              )}
            </p>
            <p className="text-ink-subtle text-[11px]">{flight.to.code}</p>
          </div>
        </div>

        <div className="ml-auto text-right">
          <p className="text-accent-400 text-lg font-bold">{formatPaise(flight.fare)}</p>
          <p className="text-ink-subtle text-[11px]">
            per traveller
            {payingSeats > 1 && <> · {formatPaise(flight.fare * payingSeats)} total</>}
          </p>
        </div>
      </div>

      <div className="text-ink-subtle mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span>{flight.refundable ? 'Refundable' : 'Non-refundable'}</span>
        <span aria-hidden="true">·</span>
        <span>{flight.seatsLeft} seats left at this fare</span>
        <span aria-hidden="true">·</span>
        {/* Said here rather than discovered by clicking a button that does nothing. */}
        <span>Booking is not available in this store</span>
      </div>
    </article>
  );
}
