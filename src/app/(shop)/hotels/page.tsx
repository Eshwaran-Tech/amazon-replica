import { BadgeIndianRupee, BedDouble, ReceiptText, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HotelSearchForm } from '@/components/hotels/hotel-search-form';
import { Container } from '@/components/layout/container';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listHotelBookings } from '@/services/hotel-booking';
import { addDays, todayKey } from '@/services/hotels';

export const metadata: Metadata = {
  title: 'Hotels',
  description:
    'Search hotels across India and abroad, and pay for a stay from your Amazon Pay balance.',
};

export const dynamic = 'force-dynamic';

/**
 * Hotels.
 *
 * The destinations and their neighbourhoods are real. The properties are this
 * store's own and are generated from the destination -- which the note at the
 * foot of the page says plainly, because a booking flow that implied it was
 * quoting a real hotel would be the one dishonest thing on it.
 */
export default async function HotelsPage() {
  const now = new Date();
  const today = todayKey(now);

  const session = await getSession();
  const history = session ? await listHotelBookings(session.user.id, 3) : [];

  return (
    <>
      {/* ---------------------------------------------------------- the search */}
      <section className="bg-slate-800">
        <Container size="wide" className="py-6">
          <h1 className="mb-4 text-lg font-bold text-white sm:text-xl">Hotels</h1>
          <HotelSearchForm
            today={today}
            initialCheckIn={today}
            initialCheckOut={addDays(today, 1)}
          />
        </Container>
      </section>

      <Container size="wide" className="space-y-6 py-6">
        {/* ------------------------------------------------------ what is true */}
        <section aria-labelledby="hotel-promises">
          <h2 id="hotel-promises" className="sr-only">
            What this costs
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: BadgeIndianRupee,
                title: 'The rate is per night',
                body: 'And the total is that rate times your nights times your rooms, shown before you pay. No number appears for the first time on the bill.',
              },
              {
                icon: ReceiptText,
                title: 'Tax is stated, not sprung',
                body: 'Room tax follows the real GST bands, so a budget room and a suite carry different rates — and both are on the breakdown.',
              },
              {
                icon: ShieldCheck,
                title: 'One ledger',
                body: 'A stay is a line in your Amazon Pay balance, next to every other thing this store has charged you.',
              },
            ].map((item) => (
              <li key={item.title} className="border-hairline bg-surface rounded-xl border p-4">
                <item.icon className="text-accent-400 h-5 w-5" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold">{item.title}</p>
                <p className="text-ink-muted mt-1 text-xs leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------------- your stays */}
        {history.length > 0 && (
          <section
            aria-labelledby="hotel-history"
            className="border-hairline bg-surface overflow-hidden rounded-2xl border"
          >
            <h2 id="hotel-history" className="border-hairline border-b px-4 py-3 text-sm font-bold">
              Your recent stays
            </h2>
            <ul className="divide-hairline divide-y">
              {history.map((stay) => (
                <li key={stay.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{stay.hotelName}</span>
                    <span className="text-ink-muted block text-xs">
                      {stay.locality}, {stay.cityName} · {stay.roomTier} · {stay.nights} night
                      {stay.nights === 1 ? '' : 's'} · {stay.rooms} room
                      {stay.rooms === 1 ? '' : 's'}
                    </span>
                    <span className="text-ink-subtle block font-mono text-[11px]">
                      {stay.reference}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold">{formatPaise(stay.amount)}</span>
                    <span className="text-ink-subtle block text-[11px]">
                      {stay.checkIn} → {stay.checkOut}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="text-center">
          <Link href="/help" className="text-link text-sm font-semibold hover:underline">
            Help &amp; FAQs
          </Link>
        </div>

        <p className="text-ink-subtle text-xs leading-relaxed">
          <BedDouble className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
          The destinations and their neighbourhoods are real. Every property on the results page —
          its name, its tariff, its rooms and its reviews — is this store&apos;s own, generated from
          the destination and the same on every reload. The artwork is drawn here rather than
          photographed, because there is no building to photograph. No room is held with any hotel;
          what is real is the charge to your{' '}
          <Link href="/pay/balance" className="text-link hover:underline">
            Amazon Pay balance
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
