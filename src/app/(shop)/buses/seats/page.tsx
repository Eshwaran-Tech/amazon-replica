import { ArrowLeft, Bus, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listBusBookings } from '@/services/bus-booking';
import { MAX_SEATS_PER_BOOKING, seatMapFor } from '@/services/bus-seats';
import { arrivalOf, formatDuration, formatTime, searchBuses } from '@/services/buses';
import { getWalletSummary } from '@/services/wallet';

import { SeatPicker } from './seat-picker';

export const metadata: Metadata = {
  title: 'Select seats',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/**
 * Seat selection.
 *
 * The coach is re-derived from the route, date and id rather than passed
 * through the URL as data. The search is deterministic, so the same URL always
 * rebuilds the same coach -- and a tampered id simply finds nothing rather than
 * conjuring a bus with a fare of its own.
 *
 * The layout follows the coach description the results page showed: a "(2+1)"
 * sleeper gets three berths a row across two decks, a "(2+2)" seater gets four
 * seats a row on one. The aisle sits where the split says it does.
 */
export default async function SeatSelectionPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const from = one(params.from);
  const to = one(params.to);
  const date = one(params.date);
  const busId = one(params.bus);

  const session = await getSession();
  const now = new Date();
  const search = searchBuses({ from, to, date }, now);
  const bus = search.ok ? search.buses.find((entry) => entry.id === busId) : undefined;

  const [summary, history] = await Promise.all([
    session
      ? getWalletSummary(session.user.id)
      : Promise.resolve({ balance: 0, wallet: 0, giftCards: 0, pending: 0 }),
    session ? listBusBookings(session.user.id, 3) : Promise.resolve([]),
  ]);

  if (!search.ok || !bus) {
    return (
      <Container size="narrow" className="py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <Bus className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">
            {search.ok ? 'That coach is no longer on this route.' : search.message}
          </p>
          <Link href="/buses" className="text-link mt-2 inline-block text-sm hover:underline">
            Start a new search
          </Link>
        </div>
      </Container>
    );
  }

  const map = seatMapFor(bus);
  const arrival = arrivalOf(bus);

  return (
    <Container size="wide" className="space-y-4 py-5">
      <Link
        href={`/buses/search?from=${from}&to=${to}&date=${date}`}
        className="text-link inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {search.from.name} – {search.to.name}
      </Link>

      {/* --------------------------------------------------- the departure */}
      <header className="border-hairline bg-surface rounded-2xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold sm:text-lg">{bus.operator.name}</h1>
            <p className="text-ink-muted text-xs">{bus.coach}</p>
          </div>
          <p className="text-ink-muted flex items-center gap-3 text-sm">
            <span className="text-ink font-bold">{formatTime(bus.departureMinutes)}</span>
            <span className="inline-flex items-center gap-1 text-xs">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDuration(bus.durationMinutes)}
            </span>
            <span className="text-ink font-bold">
              {formatTime(arrival.minutes)}
              {arrival.dayOffset > 0 && (
                <span className="text-ink-muted ml-0.5 align-super text-[10px]">
                  +{arrival.dayOffset}
                </span>
              )}
            </span>
          </p>
        </div>
        <p className="text-ink-subtle mt-2 text-xs">
          {search.from.name} → {search.to.name} ·{' '}
          {new Date(date).toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}{' '}
          · {map.availableSeats} of {map.totalSeats} seats free · fares from{' '}
          {formatPaise(Math.min(...map.seats.map((seat) => seat.fare)))}
        </p>
      </header>

      <SeatPicker
        decks={map.layouts.map((layout) => ({
          deck: layout.deck,
          rows: layout.rows,
          columns: layout.columns,
          aisleAfter: layout.aisleAfter,
          seats: layout.seats.map((seat) => ({
            id: seat.id,
            deck: seat.deck,
            kind: seat.kind,
            row: seat.row,
            column: seat.column,
            available: seat.available,
            ladiesOnly: seat.ladiesOnly,
            fare: seat.fare,
          })),
        }))}
        boardingPoints={bus.boardingPoints.length > 0 ? bus.boardingPoints : ['Central Bus Stand']}
        dropPoints={bus.dropPoints.length > 0 ? bus.dropPoints : ['Central Bus Stand']}
        maxSeats={MAX_SEATS_PER_BOOKING}
        balance={summary.balance}
        signedIn={Boolean(session)}
        route={{ from, to, date, busId }}
        csrfField={<CsrfField />}
      />

      {history.length > 0 && (
        <section
          aria-labelledby="bus-history"
          className="border-hairline bg-surface overflow-hidden rounded-2xl border"
        >
          <h2 id="bus-history" className="border-hairline border-b px-4 py-3 text-sm font-bold">
            Your recent bus tickets
          </h2>
          <ul className="divide-hairline divide-y">
            {history.map((booking) => (
              <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {booking.fromCity} → {booking.toCity}
                  </span>
                  <span className="text-ink-muted block text-xs">
                    {booking.operatorName} · seats {booking.seatIds.join(', ')} ·{' '}
                    {formatTime(booking.departureMinutes)}
                  </span>
                  <span className="text-ink-subtle block font-mono text-[11px]">
                    {booking.reference}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{formatPaise(booking.amount)}</span>
                  <span className="text-ink-subtle block text-[11px]">{booking.travelDate}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-ink-subtle text-xs leading-relaxed">
        The map is generated from this coach&apos;s own layout and is the same on every reload, so a
        seat that was free when you picked it is still free when you pay. The fare is summed on the
        server from the seats you chose. No seat is reserved with any real bus company — what is
        real is the charge to your{' '}
        <Link href="/pay/balance" className="text-link hover:underline">
          Amazon Pay balance
        </Link>
        .
      </p>
    </Container>
  );
}
