import { Plane } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FlightSearchForm } from '@/components/flights/search-form';
import { Container } from '@/components/layout/container';
import { AIRPORTS } from '@/data/airports';
import { AIRLINES } from '@/data/airlines';

export const metadata: Metadata = {
  title: 'Flights',
  description: 'Search flights across India and beyond.',
};

/** Rendered per request: "today" must not be baked in at build time. */
export const dynamic = 'force-dynamic';

/** `YYYY-MM-DD` in local time -- `toISOString()` would shift the day. */
function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const POPULAR: Array<[string, string]> = [
  ['DEL', 'BOM'],
  ['BLR', 'DEL'],
  ['BOM', 'GOI'],
  ['DEL', 'SXR'],
  ['MAA', 'BLR'],
  ['CCU', 'DEL'],
  ['HYD', 'BOM'],
  ['BLR', 'SIN'],
  ['DEL', 'DXB'],
];

export default function FlightsPage() {
  const today = todayKey();

  return (
    <Container size="wide" className="py-5 sm:py-7">
      <div className="flex items-center gap-2">
        <Plane className="text-accent-400 h-5 w-5" aria-hidden="true" />
        <h1 className="text-xl font-bold sm:text-2xl">Flights</h1>
      </div>
      <p className="text-ink-muted mt-1 text-sm">
        {AIRPORTS.length} airports, {AIRLINES.length} airlines. Schedules and fares are generated
        for this demonstration store — see the note below.
      </p>

      <div className="mt-4">
        <FlightSearchForm today={today} />
      </div>

      {/* ------------------------------------------------------- popular */}
      <section aria-labelledby="popular-routes" className="mt-6">
        <h2 id="popular-routes" className="text-sm font-bold">
          Popular routes
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {POPULAR.map(([from, to]) => {
            const origin = AIRPORTS.find((airport) => airport.code === from);
            const destination = AIRPORTS.find((airport) => airport.code === to);
            if (!origin || !destination) return null;

            return (
              <li key={`${from}-${to}`}>
                <Link
                  href={`/flights/search?from=${from}&to=${to}&date=${today}&adults=1&cabin=ECONOMY`}
                  className="border-hairline hover:border-accent-500 bg-surface flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors"
                >
                  <span className="font-semibold">{origin.city}</span>
                  <span className="text-accent-400" aria-hidden="true">
                    →
                  </span>
                  <span className="font-semibold">{destination.city}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-ink-subtle mt-6 max-w-3xl text-xs leading-relaxed">
        No airline is integrated with this store. Searching builds a plausible day of departures
        from the route and date — distance sets the flying time and the base fare, and the result is
        deterministic, so the same search always returns the same flights. Nothing here can be
        booked or paid for.{' '}
        <Link href="/help" className="text-link hover:underline">
          Help &amp; FAQs
        </Link>
      </p>
    </Container>
  );
}
