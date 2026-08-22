import { ArrowLeft, BedDouble, CalendarDays, MapPin, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HotelPhoto } from '@/components/hotels/hotel-photo';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listHotelBookings } from '@/services/hotel-booking';
import {
  CHILD_MAX_AGE,
  formatTime,
  quoteStay,
  searchHotels,
  todayKey,
  type HotelRoom,
} from '@/services/hotels';
import { getWalletSummary } from '@/services/wallet';

import { Stars } from '../search/page';
import { GuestForm } from './guest-form';

export const metadata: Metadata = {
  title: 'Review your stay',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function ages(raw: string): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= CHILD_MAX_AGE)
    .slice(0, 6);
}

function prettyDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Review and pay.
 *
 * The property, the room and the tariff are re-derived here rather than passed
 * through the URL as data, and derived a third time inside the booking action.
 * This page cannot be the authority on a price: it is a page.
 */
export default async function ReviewStayPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const today = todayKey(now);

  const city = one(params.city);
  const term = one(params.term);
  const checkIn = one(params.in) || today;
  const checkOut = one(params.out) || today;
  const rooms = Number(one(params.rooms)) || 1;
  const adults = Number(one(params.adults)) || 2;
  const kids = one(params.kids);
  const childAges = ages(kids);
  const hotelId = one(params.id);
  const roomId = one(params.room);

  const session = await getSession();
  const result = searchHotels(
    { city, checkIn, checkOut, rooms, adults, children: childAges, term },
    now,
  );
  const hotel = result.ok ? result.hotels.find((entry) => entry.id === hotelId) : undefined;
  const room = hotel?.rooms.find((entry) => entry.id === roomId);

  const [summary, history] = await Promise.all([
    session
      ? getWalletSummary(session.user.id)
      : Promise.resolve({ balance: 0, wallet: 0, giftCards: 0, pending: 0 }),
    session ? listHotelBookings(session.user.id, 3) : Promise.resolve([]),
  ]);

  const stay = new URLSearchParams({
    city,
    in: checkIn,
    out: checkOut,
    rooms: String(rooms),
    adults: String(adults),
  });
  if (term) stay.set('term', term);
  if (kids) stay.set('kids', kids);

  if (!result.ok || !hotel || !room) {
    return (
      <Container size="narrow" className="py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <BedDouble className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">
            {!result.ok
              ? result.message
              : !hotel
                ? 'That property is no longer on this search.'
                : 'That room is not offered here.'}
          </p>
          <Link href="/hotels" className="text-link mt-2 inline-block text-sm hover:underline">
            Start a new search
          </Link>
        </div>
      </Container>
    );
  }

  const quote = quoteStay(room as HotelRoom, { checkIn, checkOut, rooms: result.rooms });
  const backHref = `/hotels/hotel?${stay.toString()}&id=${hotel.id}&room=${room.id}`;

  return (
    <Container size="narrow" className="space-y-4 py-5">
      <Link
        href={backHref}
        className="text-link inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {hotel.name}
      </Link>

      {/* --------------------------------------------------------- the stay */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <div className="grid gap-3 p-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="border-hairline relative aspect-[4/3] overflow-hidden rounded-lg border">
            <HotelPhoto
              index={hotel.photoIndex}
              alt={`Artwork for ${hotel.name}`}
              sizes="128px"
              priority
            />
          </div>

          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-base font-bold">
              {hotel.name}
              <Stars count={hotel.starRating} />
            </h1>
            <p className="text-ink-muted mt-1 flex items-start gap-1.5 text-xs">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {hotel.address}
            </p>
            <p className="text-ink-muted mt-2 text-xs">
              <span className="text-ink font-semibold">{room.tier}</span> · {room.bed} · {room.view}
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-3 text-[11px]">
              <li
                className={
                  room.mealPlan === 'Room with breakfast' ? 'text-instock' : 'text-ink-muted'
                }
              >
                {room.mealPlan}
              </li>
              <li
                className={room.cancellation === 'Free Cancellation' ? 'text-instock' : 'text-deal'}
              >
                {room.cancellation}
              </li>
            </ul>
          </div>
        </div>

        <dl className="border-hairline grid grid-cols-2 gap-px border-t bg-[color:var(--color-hairline)] sm:grid-cols-3">
          <Fact
            icon={CalendarDays}
            label="Check-in"
            value={prettyDate(checkIn)}
            note={`from ${formatTime(hotel.checkInMinutes)}`}
          />
          <Fact
            icon={CalendarDays}
            label="Check-out"
            value={prettyDate(checkOut)}
            note={`by ${formatTime(hotel.checkOutMinutes)}`}
          />
          <Fact
            icon={Users}
            label="Party"
            value={`${result.rooms} room${result.rooms === 1 ? '' : 's'}, ${adults} adult${adults === 1 ? '' : 's'}`}
            note={
              childAges.length > 0
                ? `${childAges.length} child${childAges.length === 1 ? '' : 'ren'}, aged ${childAges.join(', ')}`
                : `${quote.nights} night${quote.nights === 1 ? '' : 's'}`
            }
          />
        </dl>
      </section>

      {/* ------------------------------------------------------- the price */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <h2 className="text-sm font-bold">Price breakup</h2>

        <dl className="mt-3 space-y-1.5 text-sm">
          <Line
            label={`${formatPaise(quote.perNight)} × ${quote.nights} night${quote.nights === 1 ? '' : 's'} × ${quote.rooms} room${quote.rooms === 1 ? '' : 's'}`}
            value={formatPaise(quote.roomTotal)}
          />
          {quote.discount > 0 && (
            // Worded as a saving, not as a deduction. A "− ₹7,490" line above a
            // total that does not move by ₹7,490 reads as a mistake, or worse,
            // as a discount that was quietly dropped.
            <Line
              label="You saved against the rack rate"
              value={formatPaise(quote.discount)}
              tone="good"
            />
          )}
          <Line
            label={quote.taxRate > 0 ? `Taxes & fees (${quote.taxRate}%)` : 'Taxes & fees'}
            value={quote.taxes > 0 ? formatPaise(quote.taxes) : 'None'}
          />
          <Line label="Booking fee" value="None" tone="good" />
          <div className="border-hairline flex items-baseline justify-between border-t pt-2">
            <dt className="text-sm font-bold">Payable amount</dt>
            <dd className="text-accent-400 text-lg font-bold">{formatPaise(quote.total)}</dd>
          </div>
        </dl>

        <p className="text-ink-subtle mt-2 text-[11px] leading-relaxed">
          {quote.taxRate === 0
            ? 'Rooms at this tariff carry no room tax under the Indian GST bands.'
            : `Room tax follows the Indian GST bands, which is why ${quote.taxRate === 18 ? 'an' : 'a'} ${quote.taxRate}% rate applies at this tariff.`}
        </p>
      </section>

      <GuestForm
        stay={{
          city,
          checkIn,
          checkOut,
          rooms: result.rooms,
          adults,
          kids,
          hotelId: hotel.id,
          roomId: room.id,
        }}
        total={quote.total}
        balance={summary.balance}
        signedIn={Boolean(session)}
        defaultName={session?.user.name ?? ''}
        csrfField={<CsrfField />}
      />

      {history.length > 0 && (
        <section
          aria-labelledby="stay-history"
          className="border-hairline bg-surface overflow-hidden rounded-2xl border"
        >
          <h2 id="stay-history" className="border-hairline border-b px-4 py-3 text-sm font-bold">
            Your recent stays
          </h2>
          <ul className="divide-hairline divide-y">
            {history.map((booking) => (
              <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{booking.hotelName}</span>
                  <span className="text-ink-muted block text-xs">
                    {booking.roomTier} · {booking.nights} night{booking.nights === 1 ? '' : 's'} ·{' '}
                    {booking.guestName}
                  </span>
                  <span className="text-ink-subtle block font-mono text-[11px]">
                    {booking.reference}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{formatPaise(booking.amount)}</span>
                  <span className="text-ink-subtle block text-[11px]">
                    {booking.checkIn} → {booking.checkOut}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-ink-subtle text-xs leading-relaxed">
        The amount is summed on the server from the room you chose and the nights you asked for —
        this page sends no figure. No room is held with any hotel; what is real is the charge to
        your{' '}
        <Link href="/pay/balance" className="text-link hover:underline">
          Amazon Pay balance
        </Link>
        .
      </p>
    </Container>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-ink-subtle flex items-center gap-1.5 text-[11px]">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
      <dd className="text-ink-subtle text-[11px]">{note}</dd>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('font-medium', tone === 'good' && 'text-instock')}>{value}</dd>
    </div>
  );
}
