import { BedDouble, Coffee, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HotelPhoto } from '@/components/hotels/hotel-photo';
import { HotelSearchForm } from '@/components/hotels/hotel-search-form';
import { Container } from '@/components/layout/container';
import { FILTERABLE_AMENITIES, type Amenity } from '@/data/hotel-amenities';
import { cityLabel } from '@/data/hotel-cities';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  applyHotelFilters,
  CHILD_MAX_AGE,
  PRICE_BANDS,
  RATING_BANDS,
  ratingWord,
  searchHotels,
  todayKey,
  type Hotel,
  type HotelSort,
} from '@/services/hotels';

export const metadata: Metadata = {
  title: 'Hotel search results',
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

/** Child ages from the URL, dropped if they are not ages. */
function ages(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= CHILD_MAX_AGE)
    .slice(0, 6);
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
  return `/hotels/search?${next.toString()}`;
}

/** Adds or removes one entry from a comma list, for the toggle chips. */
function toggled(current: string[], entry: string): string | undefined {
  const next = current.includes(entry)
    ? current.filter((item) => item !== entry)
    : [...current, entry];
  return next.length > 0 ? next.join(',') : undefined;
}

const SORTS: Array<{ key: HotelSort; label: string }> = [
  { key: 'POPULAR', label: 'Popular' },
  { key: 'RATING', label: 'Customer Rating' },
  { key: 'PRICE_HIGH', label: 'Price (High to Low)' },
  { key: 'PRICE_LOW', label: 'Price (Low to High)' },
];

function prettyDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Hotel results, laid out to the reference: the search bar across the top,
 * filters down the left, sort tabs above the list, and a card per property.
 *
 * Filters and sorts are links, not a client-side panel. Every combination is a
 * URL you can share or reload, the back button behaves, and the whole thing
 * works with JavaScript off.
 */
export default async function HotelSearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const now = new Date();
  const today = todayKey(now);

  const city = one(params.city) ?? '';
  const term = one(params.term) ?? '';
  const checkIn = one(params.in) ?? today;
  const checkOut = one(params.out) ?? today;
  const rooms = Number(one(params.rooms)) || 1;
  const adults = Number(one(params.adults)) || 2;
  const childAges = ages(one(params.kids));

  const bands = list(
    one(params.price),
    PRICE_BANDS.map((_, index) => String(index)),
  ).map(Number);
  const stars = list(one(params.star), ['1', '2', '3', '4', '5'] as const).map(Number);
  const minRating = Number(one(params.rating)) || undefined;
  const amenities = list(one(params.amen), FILTERABLE_AMENITIES);
  const breakfast = one(params.brk) === '1';
  const sort = (list(one(params.sort), [
    'POPULAR',
    'RATING',
    'PRICE_HIGH',
    'PRICE_LOW',
  ] as const)[0] ?? 'POPULAR') as HotelSort;

  const result = searchHotels(
    { city, checkIn, checkOut, rooms, adults, children: childAges, term },
    now,
  );

  // The query string every link on this page is built from.
  const base: Record<string, string> = {
    city,
    in: checkIn,
    out: checkOut,
    rooms: String(rooms),
    adults: String(adults),
  };
  if (term) base.term = term;
  if (childAges.length) base.kids = childAges.join(',');
  if (bands.length) base.price = bands.join(',');
  if (stars.length) base.star = stars.join(',');
  if (minRating) base.rating = String(minRating);
  if (amenities.length) base.amen = amenities.join(',');
  if (breakfast) base.brk = '1';
  if (sort !== 'POPULAR') base.sort = sort;

  // Several price bands ticked is a union, so the bounds are the outer edges --
  // and a band with no ceiling removes the ceiling from the whole union.
  const chosenBands = bands
    .map((index) => PRICE_BANDS[index])
    .filter((band): band is (typeof PRICE_BANDS)[number] => band !== undefined);

  const minPrice =
    chosenBands.length > 0 ? Math.min(...chosenBands.map((band) => band.min)) * 100 : undefined;

  const ceilings = chosenBands.map((band) => band.max);
  const maxPrice =
    chosenBands.length > 0 && ceilings.every((max): max is number => max !== null)
      ? Math.max(...ceilings) * 100
      : undefined;

  const shown = result.ok
    ? applyHotelFilters(result.hotels, {
        ...(minPrice !== undefined ? { minPrice } : {}),
        ...(maxPrice !== undefined ? { maxPrice } : {}),
        stars,
        ...(minRating ? { minRating } : {}),
        amenities,
        freeBreakfast: breakfast,
        sort,
      })
    : [];

  const stayQuery = new URLSearchParams(base).toString();

  return (
    <>
      <section className="bg-slate-800">
        <Container size="wide" className="py-3">
          <HotelSearchForm
            today={today}
            initialCity={city}
            initialTerm={term}
            initialCheckIn={checkIn}
            initialCheckOut={checkOut}
            initialRooms={rooms}
            initialAdults={adults}
            initialChildren={childAges}
            compact
          />
        </Container>
      </section>

      <Container size="wide" className="py-4">
        {!result.ok ? (
          <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
            <BedDouble className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
            <p className="mt-3 text-base font-bold">{result.message}</p>
            <Link href="/hotels" className="text-link mt-2 inline-block text-sm hover:underline">
              Start a new search
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-base font-bold sm:text-lg">
                {result.locality
                  ? `${result.locality}, ${result.city.name}`
                  : cityLabel(result.city)}
                <span className="text-ink-muted ml-2 text-sm font-normal">
                  {prettyDate(checkIn)} – {prettyDate(checkOut)}
                </span>
              </h1>
              <p className="text-ink-muted text-sm">
                {shown.length} propert{shown.length === 1 ? 'y' : 'ies'}
                <span className="text-ink-subtle">
                  {' '}
                  · {result.nights} night{result.nights === 1 ? '' : 's'} · {result.rooms} room
                  {result.rooms === 1 ? '' : 's'} · {result.guests} guest
                  {result.guests === 1 ? '' : 's'}
                </span>
              </p>
            </div>

            <div className="mt-3 gap-5 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
              {/* ------------------------------------------------- the filters */}
              <aside className="border-hairline bg-surface mb-4 rounded-2xl border p-4 lg:mb-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold">Filters</h2>
                  <Link
                    href={`/hotels/search?${new URLSearchParams({
                      city,
                      in: checkIn,
                      out: checkOut,
                      rooms: String(rooms),
                      adults: String(adults),
                    }).toString()}`}
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    Clear All
                  </Link>
                </div>

                <Group title="Price Range">
                  <div className="grid grid-cols-2 gap-2">
                    {PRICE_BANDS.map((band, index) => (
                      <Chip
                        key={band.label}
                        href={withParams(base, {
                          price: toggled(bands.map(String), String(index)),
                        })}
                        on={bands.includes(index)}
                        label={band.label}
                      />
                    ))}
                  </div>
                </Group>

                <Group title="Hotel Star Rating">
                  <div className="grid grid-cols-2 gap-2">
                    {[5, 4, 3, 2].map((star) => (
                      <Chip
                        key={star}
                        href={withParams(base, { star: toggled(stars.map(String), String(star)) })}
                        on={stars.includes(star)}
                        label={`${'★'.repeat(star)} ${star} Star`}
                      />
                    ))}
                  </div>
                </Group>

                <Group title="Customer Ratings">
                  <ul className="space-y-1.5">
                    {RATING_BANDS.map((band) => (
                      <li key={band.label}>
                        <Check
                          href={withParams(base, {
                            rating: minRating === band.min ? undefined : String(band.min),
                          })}
                          on={minRating === band.min}
                          label={band.label}
                        />
                      </li>
                    ))}
                  </ul>
                </Group>

                <Group title="Amenities">
                  <ul className="space-y-1.5">
                    {FILTERABLE_AMENITIES.map((amenity) => (
                      <li key={amenity}>
                        <Check
                          href={withParams(base, { amen: toggled(amenities, amenity) })}
                          on={amenities.includes(amenity)}
                          label={amenity}
                        />
                      </li>
                    ))}
                    <li>
                      <Check
                        href={withParams(base, { brk: breakfast ? undefined : '1' })}
                        on={breakfast}
                        label="Free Breakfast"
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
                  {SORTS.map((option) => (
                    <Link
                      key={option.key}
                      href={withParams(base, {
                        sort: option.key === 'POPULAR' ? undefined : option.key,
                      })}
                      aria-current={sort === option.key ? 'true' : undefined}
                      className={cn(
                        'shrink-0 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors',
                        sort === option.key
                          ? 'border-accent-500 text-ink'
                          : 'text-link border-transparent hover:border-neutral-300',
                      )}
                    >
                      {option.label}
                    </Link>
                  ))}
                </nav>

                <ul className="border-hairline divide-hairline divide-y rounded-b-2xl border">
                  {shown.map((hotel, index) => (
                    <li key={hotel.id} className="bg-surface p-3 sm:p-4">
                      <HotelCard hotel={hotel} stayQuery={stayQuery} priority={index < 2} />
                    </li>
                  ))}
                </ul>

                {shown.length === 0 && (
                  <p className="border-hairline bg-surface rounded-b-2xl border border-t-0 p-8 text-center text-sm">
                    No property here matches every filter.{' '}
                    <Link
                      href={`/hotels/search?${new URLSearchParams({
                        city,
                        in: checkIn,
                        out: checkOut,
                        rooms: String(rooms),
                        adults: String(adults),
                      }).toString()}`}
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
              {result.city.name} and its neighbourhoods are real; these properties are this
              store&apos;s own, generated from the destination and the same on every reload. Rates
              are per room per night before tax and already reflect your dates and party. The
              artwork is drawn rather than photographed, because there is no building to photograph.
            </p>
          </>
        )}
      </Container>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-hairline mt-4 border-t pt-4 first-of-type:border-t-0">
      <h3 className="mb-2 text-xs font-bold">{title}</h3>
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

/** The little dark square carrying the guest score, as the reference draws it. */
export function RatingBadge({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-[#1b4965] px-1.5 py-0.5 text-xs font-bold text-white',
        className,
      )}
    >
      {rating.toFixed(1)}
      <span className="ml-0.5 font-normal opacity-80">/5</span>
    </span>
  );
}

export function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex" aria-label={`${count} star property`}>
      {Array.from({ length: count }, (_, index) => (
        <Star key={index} className="text-accent-400 h-3 w-3 fill-current" aria-hidden="true" />
      ))}
    </span>
  );
}

function HotelCard({
  hotel,
  stayQuery,
  priority,
}: {
  hotel: Hotel;
  stayQuery: string;
  priority: boolean;
}) {
  const href = `/hotels/hotel?${stayQuery}&id=${hotel.id}`;

  return (
    <article className="grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <Link
        href={href}
        className="border-hairline relative block aspect-[4/3] overflow-hidden rounded-xl border sm:aspect-[4/3]"
      >
        <HotelPhoto
          index={hotel.photoIndex}
          alt={`Artwork for ${hotel.name}`}
          sizes="(max-width: 640px) 100vw, 208px"
          priority={priority}
        />
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          View All {hotel.photoCount} Photos
        </span>
      </Link>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <Link href={href} className="text-link text-sm font-bold hover:underline">
            {hotel.name}
          </Link>
          <p className="mt-0.5">
            <Stars count={hotel.starRating} />
          </p>
          <p className="text-ink-muted mt-0.5 text-xs">{hotel.locality}</p>

          {hotel.freeBreakfast && (
            <p className="text-instock mt-2 inline-flex items-center gap-1 text-[11px] font-semibold">
              <Coffee className="h-3 w-3" aria-hidden="true" />
              Free Breakfast
            </p>
          )}

          <ul className="text-ink-subtle mt-2 flex flex-wrap gap-1.5 text-[10px]">
            {hotel.amenities.slice(0, 4).map((amenity: Amenity) => (
              <li key={amenity} className="border-hairline rounded-full border px-2 py-0.5">
                {amenity}
              </li>
            ))}
          </ul>
        </div>

        <div className="text-right sm:w-44">
          <p className="flex items-center justify-end gap-1.5">
            <span className="text-ink-subtle text-[11px]">
              ({hotel.ratingCount.toLocaleString('en-IN')} ratings)
            </span>
            <RatingBadge rating={hotel.rating} />
          </p>
          <p className="text-ink-subtle mt-0.5 text-[11px]">{ratingWord(hotel.rating)}</p>

          {hotel.discountPercent > 0 && hotel.listPrice && (
            <p className="mt-1.5 text-[11px]">
              <span className="text-instock font-semibold">{hotel.discountPercent}% off</span>{' '}
              <span className="text-ink-subtle line-through">{formatPaise(hotel.listPrice)}</span>
            </p>
          )}
          <p className="text-base font-bold">{formatPaise(hotel.price)}</p>
          <p className="text-ink-subtle text-[10px] leading-tight">
            + taxes &amp; fees
            <br />
            per night
          </p>

          <Link
            href={href}
            className="border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950 mt-2 inline-block rounded-md border px-4 py-1.5 text-xs font-bold transition-colors"
          >
            View Rooms
          </Link>
        </div>
      </div>
    </article>
  );
}
