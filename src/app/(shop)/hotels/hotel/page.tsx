import {
  Accessibility,
  AirVent,
  ArrowLeft,
  BedDouble,
  CarFront,
  CircleParking,
  ConciergeBell,
  Dumbbell,
  Flower2,
  MapPin,
  Martini,
  MoveVertical,
  PawPrint,
  Umbrella,
  UtensilsCrossed,
  WashingMachine,
  Waves,
  Wifi,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HotelPhoto } from '@/components/hotels/hotel-photo';
import { Container } from '@/components/layout/container';
import { AMENITY_ICONS, type Amenity } from '@/data/hotel-amenities';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  CHILD_MAX_AGE,
  formatTime,
  quoteStay,
  ratingWord,
  reviewsFor,
  searchHotels,
  todayKey,
  type Hotel,
  type HotelReview,
  type HotelRoom,
} from '@/services/hotels';

import { RatingBadge, Stars } from '../search/page';
import { ReviewList } from './review-list';

export const metadata: Metadata = {
  title: 'Hotel details',
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
  });
}

/** Only the icons the amenity table can name, so nothing resolves at runtime. */
const ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed,
  CircleParking,
  Zap,
  ConciergeBell,
  Martini,
  Waves,
  Wifi,
  AirVent,
  Dumbbell,
  Flower2,
  WashingMachine,
  CarFront,
  Umbrella,
  MoveVertical,
  Accessibility,
  PawPrint,
};

/**
 * One property.
 *
 * The hotel and its tariff are re-derived from the destination, dates and party
 * rather than passed through the URL as data. The search is deterministic, so
 * the same URL always rebuilds the same property -- and a tampered id simply
 * finds nothing rather than conjuring a hotel with a rate of its own.
 */
export default async function HotelDetailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const today = todayKey(now);

  const city = one(params.city);
  const term = one(params.term);
  const checkIn = one(params.in) || today;
  const checkOut = one(params.out) || today;
  const rooms = Number(one(params.rooms)) || 1;
  const adults = Number(one(params.adults)) || 2;
  const childAges = ages(one(params.kids));
  const id = one(params.id);
  const chosenRoomId = one(params.room);

  const result = searchHotels(
    { city, checkIn, checkOut, rooms, adults, children: childAges, term },
    now,
  );
  const hotel = result.ok ? result.hotels.find((entry) => entry.id === id) : undefined;

  const stay = new URLSearchParams({
    city,
    in: checkIn,
    out: checkOut,
    rooms: String(rooms),
    adults: String(adults),
  });
  if (term) stay.set('term', term);
  if (childAges.length) stay.set('kids', childAges.join(','));

  if (!result.ok || !hotel) {
    return (
      <Container size="narrow" className="py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <BedDouble className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">
            {result.ok ? 'That property is no longer on this search.' : result.message}
          </p>
          <Link href="/hotels" className="text-link mt-2 inline-block text-sm hover:underline">
            Start a new search
          </Link>
        </div>
      </Container>
    );
  }

  const selected =
    hotel.rooms.find((room) => room.id === chosenRoomId) ?? (hotel.rooms[0] as HotelRoom);
  const quote = quoteStay(selected, { checkIn, checkOut, rooms: result.rooms });
  const reviews = reviewsFor(hotel);

  return (
    <Container size="wide" className="space-y-4 py-5">
      <Link
        href={`/hotels/search?${stay.toString()}`}
        className="text-link inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {result.city.name}
      </Link>

      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-4">
          {/* --------------------------------------------------- the property */}
          <header>
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-bold sm:text-xl">
              {hotel.name}
              <Stars count={hotel.starRating} />
            </h1>
            <p className="text-ink-muted mt-1 flex items-start gap-1.5 text-xs">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {hotel.address}
            </p>
          </header>

          {/* ----------------------------------------------------- the gallery
              A fixed height rather than per-tile aspect ratios: in a two-row
              grid an aspect ratio on the children fights the row sizing, and
              the tiles end up strewn down the page with holes between them. */}
          <div className="grid h-56 grid-cols-4 grid-rows-2 gap-1.5 overflow-hidden rounded-2xl sm:h-80">
            <div className="relative col-span-4 row-span-2 sm:col-span-2">
              <HotelPhoto
                index={hotel.photoIndex}
                alt={`Picture for ${hotel.name}`}
                sizes="(max-width: 640px) 100vw, 420px"
                priority
              />
            </div>
            {[1, 2, 3].map((offset, position) => (
              <div
                key={offset}
                className={cn('relative hidden sm:block', position === 2 && 'col-span-2')}
              >
                <HotelPhoto
                  index={hotel.photoIndex}
                  offset={offset * 5 + 1}
                  alt={`${hotel.name}, view ${offset + 1}`}
                  sizes="240px"
                />
                {position === 2 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">
                    View All {hotel.photoCount} Photos
                  </span>
                )}
              </div>
            ))}
          </div>

          <p className="flex flex-wrap items-center gap-2 text-xs">
            <RatingBadge rating={hotel.rating} />
            <span className="text-ink-muted">
              {ratingWord(hotel.rating)} · {hotel.ratingCount.toLocaleString('en-IN')} ratings
            </span>
            {hotel.amenities.includes('Beach Access') && (
              <span className="text-instock">· Steps from the beach</span>
            )}
          </p>

          {/* -------------------------------------------------- the amenities */}
          <section
            aria-labelledby="amenities"
            className="border-hairline bg-surface rounded-2xl border p-4"
          >
            <h2 id="amenities" className="text-sm font-bold text-[#c45500]">
              Hotel Amenities
            </h2>
            <ul className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-4">
              {hotel.amenities.slice(0, 5).map((amenity: Amenity) => {
                const Icon = ICONS[AMENITY_ICONS[amenity]] ?? BedDouble;
                return (
                  <li key={amenity} className="w-20 text-center">
                    <span className="border-hairline mx-auto flex h-10 w-10 items-center justify-center rounded-full border">
                      <Icon className="text-ink-muted h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-ink-muted mt-1.5 block text-[11px] leading-tight">
                      {amenity}
                    </span>
                  </li>
                );
              })}
              {hotel.amenities.length > 5 && (
                <li className="text-link w-20 self-center text-center text-xs font-semibold">
                  + {hotel.amenities.length - 5} more amenities
                </li>
              )}
            </ul>
          </section>

          {/* ------------------------------------------------------- the rooms */}
          <section
            aria-labelledby="rooms"
            className="border-hairline bg-surface rounded-2xl border p-4"
          >
            <h2 id="rooms" className="text-sm font-bold text-[#c45500]">
              {hotel.rooms.length} Room Type{hotel.rooms.length === 1 ? '' : 's'}
            </h2>

            <ul className="mt-3 space-y-3">
              {hotel.rooms.map((room, index) => (
                <li key={room.id}>
                  <RoomTile
                    hotel={hotel}
                    room={room}
                    offset={index * 7 + 2}
                    nights={result.nights}
                    rooms={result.rooms}
                    selected={room.id === selected.id}
                    href={`/hotels/hotel?${stay.toString()}&id=${hotel.id}&room=${room.id}`}
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* ------------------------------------------------------- the rules */}
          <section
            aria-labelledby="rules"
            className="border-hairline bg-surface rounded-2xl border p-4"
          >
            <h2 id="rules" className="text-sm font-bold text-[#c45500]">
              Important To Know
            </h2>
            <p className="text-ink-muted mt-2 text-xs">
              <span className="text-ink font-semibold">Check-in:</span>{' '}
              {formatTime(hotel.checkInMinutes)}
              <span className="mx-2">|</span>
              <span className="text-ink font-semibold">Check-out:</span>{' '}
              {formatTime(hotel.checkOutMinutes)}
            </p>
            <ul className="text-ink-muted mt-2 list-disc space-y-1 pl-4 text-xs">
              <li>Primary guest must be at least {hotel.minimumAge} years of age.</li>
              <li>A government-issued photo ID is checked at the desk.</li>
              <li>
                {hotel.petsAllowed ? 'Pets are allowed on request.' : 'Pets are not allowed.'}
              </li>
              <li>
                {selected.cancellation === 'Free Cancellation'
                  ? 'This rate can be cancelled free of charge before check-in.'
                  : 'This rate is non-refundable once booked, which is why it is cheaper.'}
              </li>
            </ul>
          </section>

          {/* ----------------------------------------------------- the reviews */}
          <section
            aria-labelledby="reviews"
            className="border-hairline bg-surface rounded-2xl border p-4"
          >
            <h2 id="reviews" className="text-sm font-bold text-[#c45500]">
              Hotel Reviews
            </h2>
            <p className="mt-2 flex items-center gap-2">
              <RatingBadge rating={hotel.rating} className="text-sm" />
              <span className="text-ink-muted text-xs">
                {hotel.ratingCount.toLocaleString('en-IN')} ratings
              </span>
            </p>

            <ReviewList reviews={reviews as HotelReview[]} />
          </section>
        </div>

        {/* ------------------------------------------------------- the summary */}
        <aside className="border-hairline bg-surface mt-4 space-y-3 rounded-2xl border p-4 lg:sticky lg:top-4 lg:mt-0">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-bold text-[#c45500]">{selected.tier}</h2>
            {hotel.rooms.length > 1 && (
              <Link
                href={`/hotels/hotel?${stay.toString()}&id=${hotel.id}#rooms`}
                className="text-link shrink-0 text-xs font-semibold hover:underline"
              >
                Explore rooms
              </Link>
            )}
          </div>

          <p className="text-ink-subtle text-xs">
            {prettyDate(checkIn)} → {prettyDate(checkOut)} · {quote.nights} night
            {quote.nights === 1 ? '' : 's'} · {quote.rooms} room{quote.rooms === 1 ? '' : 's'}
          </p>

          <dl className="border-hairline space-y-1.5 border-t pt-3 text-sm">
            <Line label={`Price per night`} value={formatPaise(quote.perNight)} />
            <Line
              label={`${quote.nights} night${quote.nights === 1 ? '' : 's'} × ${quote.rooms} room${quote.rooms === 1 ? '' : 's'}`}
              value={formatPaise(quote.roomTotal)}
            />
            {quote.discount > 0 && (
              <Line label="You saved" value={formatPaise(quote.discount)} tone="good" />
            )}
            <Line
              label={`Taxes & fees${quote.taxRate > 0 ? ` (${quote.taxRate}%)` : ''}`}
              value={quote.taxes > 0 ? formatPaise(quote.taxes) : 'None'}
            />
          </dl>

          <div className="border-hairline flex items-baseline justify-between border-t pt-3">
            <span className="text-sm font-bold">Payable amount</span>
            <span className="text-accent-400 text-lg font-bold">{formatPaise(quote.total)}</span>
          </div>

          <Link
            href={`/hotels/review?${stay.toString()}&id=${hotel.id}&room=${selected.id}`}
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-bold"
          >
            Proceed to review
          </Link>

          <p className="text-ink-subtle text-center text-[11px]">
            Nothing is charged until you confirm on the next page.
          </p>
        </aside>
      </div>

      <p className="text-ink-subtle text-xs leading-relaxed">
        {hotel.city.name} and {hotel.locality} are real places. This property, its tariff, its rooms
        and its reviews are this store&apos;s own and are generated from the destination — the same
        on every reload. The artwork is drawn rather than photographed, because there is no building
        to photograph. No room is held with any hotel; what is real is the charge to your{' '}
        <Link href="/pay/balance" className="text-link hover:underline">
          Eshwaran Pay balance
        </Link>
        .
      </p>
    </Container>
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

function RoomTile({
  hotel,
  room,
  offset,
  nights,
  rooms,
  selected,
  href,
}: {
  hotel: Hotel;
  room: HotelRoom;
  offset: number;
  nights: number;
  rooms: number;
  selected: boolean;
  href: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-xl border-2 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]',
        selected ? 'border-instock bg-instock/5' : 'border-hairline',
      )}
    >
      <div className="border-hairline relative aspect-[4/3] overflow-hidden rounded-lg border">
        <HotelPhoto
          index={hotel.photoIndex}
          offset={offset}
          alt={`${room.tier} at ${hotel.name}`}
          sizes="160px"
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold">{room.tier}</p>
            <p className="text-ink-muted text-xs">
              {room.size} sq ft · {room.bed} · {room.view} · sleeps {room.sleeps}
            </p>
          </div>
          <span
            aria-hidden="true"
            className={cn(
              'mt-1 h-4 w-4 shrink-0 rounded-full border-2',
              selected ? 'border-instock bg-instock' : 'border-hairline',
            )}
          />
        </div>

        <ul className="text-ink-muted mt-2 space-y-0.5 text-xs">
          <li className={room.mealPlan === 'Room with breakfast' ? 'text-instock' : undefined}>
            ✓ {room.mealPlan}
          </li>
          <li className={room.cancellation === 'Free Cancellation' ? 'text-instock' : 'text-deal'}>
            ✓ {room.cancellation}
          </li>
        </ul>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
          <p>
            {room.discountPercent > 0 && room.listPrice && (
              <>
                <span className="text-instock text-[11px] font-semibold">
                  {room.discountPercent}% off
                </span>{' '}
                <span className="text-ink-subtle text-[11px] line-through">
                  {formatPaise(room.listPrice)}
                </span>{' '}
              </>
            )}
            <span className="text-base font-bold">{formatPaise(room.price)}</span>
            <span className="text-ink-subtle text-[11px]"> per night</span>
          </p>

          <Link
            href={href}
            aria-current={selected ? 'true' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-bold transition-colors',
              selected
                ? 'border-instock text-instock cursor-default'
                : 'border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950',
            )}
          >
            {selected ? 'Selected' : 'Select'}
          </Link>
        </div>

        <p className="text-ink-subtle mt-1 text-[11px]">
          {formatPaise(room.price * nights * rooms)} for {nights} night{nights === 1 ? '' : 's'}
          {rooms > 1 && `, ${rooms} rooms`} + taxes
        </p>
      </div>
    </div>
  );
}
