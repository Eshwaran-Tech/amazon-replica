import { BadgePercent, Bus, ShieldCheck, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { BusSearchForm } from '@/components/buses/bus-search-form';
import { Container } from '@/components/layout/container';
import { BUS_CITIES, POPULAR_CITIES } from '@/data/bus-cities';

export const metadata: Metadata = {
  title: 'Bus Tickets',
  description: 'Search intercity bus tickets across India.',
};

/** Rendered per request: "today" must not be baked in at build time. */
export const dynamic = 'force-dynamic';

/** `YYYY-MM-DD` in local time -- `toISOString()` would shift the day. */
function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const POPULAR_ROUTES: Array<[string, string]> = [
  ['bengaluru', 'chennai'],
  ['mumbai', 'pune'],
  ['delhi', 'jaipur'],
  ['hyderabad', 'bengaluru'],
  ['chennai', 'coimbatore'],
  ['pune', 'goa'],
  ['delhi', 'manali'],
  ['bengaluru', 'mysuru'],
];

/**
 * Bus tickets.
 *
 * Built to the reference: the search panel over a road hero, popular cities in
 * the city dropdowns, a two-month calendar that marks real Indian holidays, and
 * a results page with the same filters and sorts.
 *
 * **What is not reproduced.** The reference is "powered by redBus" and its
 * promo strip offers cashback on an Amazon Pay ICICI Bank credit card. Those
 * are a real company's mark and a real bank's product. The operators listed in
 * its results -- Mahadev Travels, VRL, KSRTC and the rest -- are real
 * businesses, and inventing a 1.7-star rating for one of them is a false
 * statement about a company, not a licensing question. This store carries its
 * own ten operators.
 *
 * **What is real.** The cities, their states and their coordinates; the road
 * distances derived from them; and the holidays on the calendar.
 */
export default function BusesPage() {
  const today = todayKey();

  return (
    <>
      {/* ----------------------------------------------------- search panel */}
      {/* No `overflow-hidden` here, however tempting: the calendar and the city
          dropdowns are absolutely positioned children of this section, and
          clipping the backdrop would clip them too. The artwork clips itself. */}
      <section className="relative isolate bg-gradient-to-b from-slate-700 to-slate-900">
        {/* A road, drawn rather than photographed -- the reference's hero is a
            stock highway shot, and this needs no licence. */}
        <span aria-hidden="true" className="absolute inset-0 overflow-hidden opacity-30">
          <svg viewBox="0 0 1200 260" preserveAspectRatio="none" className="h-full w-full">
            <rect width="1200" height="260" fill="#334155" />
            <path d="M0 210h1200v50H0z" fill="#1e293b" />
            <path d="M0 195h1200v6H0z" fill="#64748b" opacity="0.5" />
            {Array.from({ length: 24 }, (_, index) => (
              <rect
                key={index}
                x={index * 50 + 6}
                y="228"
                width="28"
                height="5"
                rx="2"
                fill="#f8fafc"
                opacity="0.6"
              />
            ))}
          </svg>
        </span>

        <Container size="wide" className="relative py-6 sm:py-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
            <Bus className="h-6 w-6" aria-hidden="true" />
            Bus Tickets
          </h1>

          <div className="mt-4">
            <BusSearchForm today={today} />
          </div>
        </Container>
      </section>

      <Container size="wide" className="space-y-6 py-6">
        {/* ------------------------------------------------- the offer strip */}
        <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-amber-300 to-amber-200 p-5 text-amber-950 sm:p-6">
          <p className="text-sm font-bold">Festive fares</p>
          <p className="mt-1 text-2xl leading-tight font-black sm:text-3xl">
            Cheapest seats show first
          </p>
          <p className="mt-2 max-w-xl text-sm">
            Sort by price and the whole list reorders — no sponsored row jumps the queue, because
            this store sells no placements.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { icon: Wallet, text: 'Pay from your Amazon Pay balance' },
              { icon: BadgePercent, text: 'No booking or convenience fee' },
              { icon: ShieldCheck, text: 'Fares hold while you choose' },
            ].map((item) => (
              <span
                key={item.text}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/10 px-3 py-1 text-xs font-semibold"
              >
                <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {item.text}
              </span>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------- popular routes */}
        <section aria-labelledby="popular-routes">
          <h2 id="popular-routes" className="text-base font-bold sm:text-lg">
            Popular routes
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {POPULAR_ROUTES.map(([from, to]) => {
              const fromCity = BUS_CITIES.find((city) => city.id === from);
              const toCity = BUS_CITIES.find((city) => city.id === to);
              if (!fromCity || !toCity) return null;

              return (
                <li key={`${from}-${to}`}>
                  <Link
                    href={`/buses/search?from=${from}&to=${to}&date=${today}`}
                    className="border-hairline bg-surface hover:border-accent-500 block rounded-xl border p-3 text-sm transition-colors"
                  >
                    <span className="block font-semibold">
                      {fromCity.name} → {toCity.name}
                    </span>
                    <span className="text-ink-muted block text-xs">Today</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-ink-subtle text-xs leading-relaxed">
          {BUS_CITIES.length} cities, {POPULAR_CITIES.length} of them in the popular list. The
          cities, their states and the road distances between them are real; the operators and their
          timetables are this store&apos;s own, generated from that distance so the same route on
          the same date always returns the same coaches. No seat is reserved with anybody.
        </p>
      </Container>
    </>
  );
}
