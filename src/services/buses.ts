import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import {
  AMENITIES,
  BUS_OPERATORS,
  coachTypes,
  type Amenity,
  type BusOperator,
  type CoachType,
} from '@/data/bus-operators';
import { findCity, roadKm, type BusCity } from '@/data/bus-cities';
import { isBusyDay } from '@/data/holidays';

import { coachCapacity } from './bus-seats';

/**
 * Bus search.
 *
 * Deterministic, like the flight search it mirrors: the same route on the same
 * date produces the same departures on every machine and every reload. No
 * `Math.random()`, no `Date.now()` -- a results page that reshuffled itself
 * between the search and the seat selection would be worse than useless.
 *
 * Everything is derived from real road distance: a coach averages ~45 km/h once
 * halts are counted, and the fare starts from the kilometres before the
 * operator, the coach class, the departure hour and how far ahead the booking
 * is push it around.
 */

export interface BusDeparture {
  id: string;
  operator: BusOperator;
  coach: string;
  coachTypes: CoachType[];
  /** Minutes past midnight on the travel date. */
  departureMinutes: number;
  durationMinutes: number;
  fare: Paise;
  /** Struck-through price, when this departure is discounted. */
  listFare: Paise | null;
  seatsLeft: number;
  /** 1.0-5.0, one decimal. */
  rating: number;
  ratingCount: number;
  liveTrackable: boolean;
  amenities: Amenity[];
  boardingPoints: string[];
  dropPoints: string[];
  distanceKm: number;
}

export interface BusSearchInput {
  from: string;
  to: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

export type BusSearchResult =
  | { ok: true; buses: BusDeparture[]; from: BusCity; to: BusCity; distanceKm: number }
  | { ok: false; code: 'UNKNOWN_CITY' | 'SAME_CITY'; message: string };

/** FNV-1a, matching the project's other deterministic generators. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `HH:MM` from minutes past midnight, wrapping past a day boundary. */
export function formatTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Arrival clock time and how many days later it lands. */
export function arrivalOf(bus: BusDeparture): { minutes: number; dayOffset: number } {
  const total = bus.departureMinutes + bus.durationMinutes;
  return { minutes: total % 1440, dayOffset: Math.floor(total / 1440) };
}

/** Whole days between today and the travel date; negative is in the past. */
function daysAhead(dateKey: string, today: Date): number {
  const parts = dateKey.split('-').map(Number);
  const [year, month, day] = parts;
  if (year === undefined || month === undefined || day === undefined) return 0;
  const target = new Date(year, month - 1, day);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

const BOARDING = [
  'Central Bus Stand',
  'Highway Junction',
  'Railway Station Road',
  'Airport Road',
  'City Centre',
  'Ring Road Toll',
  'Bypass Signal',
];

const DROPPING = [
  'Central Bus Stand',
  'Old Town Gate',
  'Tech Park Gate',
  'Railway Station',
  'Market Circle',
  'Outer Ring Road',
];

export function searchBuses(input: BusSearchInput, today: Date): BusSearchResult {
  const from = findCity(input.from);
  const to = findCity(input.to);

  if (!from || !to) {
    return { ok: false, code: 'UNKNOWN_CITY', message: 'Choose a city from the list.' };
  }
  if (from.id === to.id) {
    return { ok: false, code: 'SAME_CITY', message: 'Source and destination must differ.' };
  }

  const km = roadKm(from, to);
  const random = makeRandom(hash(`bus:${from.id}:${to.id}:${input.date}`));

  // Short hops run all day; a two-night trunk route runs a handful of coaches.
  const count =
    km < 400
      ? 14 + Math.floor(random() * 10)
      : km < 1200
        ? 8 + Math.floor(random() * 8)
        : 3 + Math.floor(random() * 5);

  // ~45 km/h door to door once meal halts and traffic are counted, plus a
  // fixed allowance for getting out of one city and into the next.
  const baseMinutes = Math.round((km / 45) * 60) + 45;

  const lead = daysAhead(input.date, today);
  const leadFactor = lead <= 0 ? 1.35 : lead < 3 ? 1.2 : lead < 7 ? 1.1 : lead < 21 ? 1 : 0.95;
  // A holiday or a weekend is when a coach fills, and the fare shows it.
  const busyFactor = isBusyDay(input.date) ? 1.18 : 1;

  const buses: BusDeparture[] = [];

  for (let index = 0; index < count; index += 1) {
    const operator = BUS_OPERATORS[Math.floor(random() * BUS_OPERATORS.length)];
    if (!operator) break;

    const coach = operator.coaches[Math.floor(random() * operator.coaches.length)] ?? 'A/C Seater';

    // Long routes leave in the evening so the night is spent travelling; short
    // ones spread across the day. Both are how the real timetables read.
    const departureMinutes =
      km > 500
        ? 17 * 60 + Math.floor(random() * (7 * 60))
        : 5 * 60 + Math.floor((index / count) * (17 * 60)) + Math.floor(random() * 40);

    const durationMinutes = baseMinutes + Math.floor(random() * 90) - 30;

    const isNight = departureMinutes >= 20 * 60 || departureMinutes < 5 * 60;
    const classFactor = coach.toLowerCase().includes('non a/c')
      ? 0.72
      : coach.toLowerCase().includes('volvo')
        ? 1.22
        : 1;

    const baseRupees = 120 + km * 1.55;
    const rupees =
      baseRupees *
      operator.fareIndex *
      classFactor *
      leadFactor *
      busyFactor *
      (isNight ? 1.06 : 1) *
      (0.92 + random() * 0.2);

    const fare = Math.max(99, Math.round(rupees / 10) * 10 - 1);
    // Roughly a third of departures carry a struck-through price.
    const discounted = random() < 0.35;

    // Amenities: what the operator fits as standard, plus the odd extra.
    const amenities = new Set<Amenity>(operator.standardAmenities as Amenity[]);
    for (const amenity of AMENITIES) {
      if (random() < 0.18) amenities.add(amenity);
    }

    const ratingCount = 3 + Math.floor(random() * 1600);
    const rating = Math.min(
      5,
      Math.max(1, Number((operator.standard + (random() - 0.5) * 1.2).toFixed(1))),
    );

    buses.push({
      id: `${from.id}-${to.id}-${input.date}-${index}`,
      operator,
      coach,
      coachTypes: coachTypes(coach),
      departureMinutes,
      durationMinutes,
      fare: rupeesToPaise(fare),
      listFare: discounted ? rupeesToPaise(Math.round((fare * 1.22) / 10) * 10 - 1) : null,
      // Bounded by what the coach actually holds: a 40-seat layout must never
      // be listed with 44 seats left, because the seat map is where that lie
      // gets counted.
      seatsLeft: Math.min(1 + Math.floor(random() * 44), coachCapacity(coach)),
      rating,
      ratingCount,
      liveTrackable: random() < 0.55,
      amenities: AMENITIES.filter((amenity) => amenities.has(amenity)),
      boardingPoints: BOARDING.filter(() => random() < 0.5).slice(0, 4),
      dropPoints: DROPPING.filter(() => random() < 0.5).slice(0, 4),
      distanceKm: km,
    });
  }

  buses.sort((a, b) => a.departureMinutes - b.departureMinutes);
  return { ok: true, buses, from, to, distanceKm: km };
}

// --------------------------------------------------------------- filtering

export type BusSort = 'RATING' | 'DEPARTURE' | 'DURATION' | 'ARRIVAL' | 'PRICE' | 'SEATS';

export interface BusFilters {
  types?: CoachType[];
  /** Departure windows, as in the reference: 0 = 6am-12pm ... 3 = 12am-6am. */
  windows?: number[];
  /** Arrival windows, same four buckets. */
  arrivals?: number[];
  liveTrackable?: boolean;
  amenities?: Amenity[];
  /** Inclusive fare bounds in paise. */
  minFare?: number;
  maxFare?: number;
  /** Longest journey to keep, in minutes. */
  maxDuration?: number;
  sort?: BusSort;
  /** Ascending by default for price and time, descending for rating and seats. */
  desc?: boolean;
}

/** Which of the reference's four windows a departure falls in. */
export function departureWindow(minutes: number): number {
  const hour = Math.floor(minutes / 60);
  if (hour >= 6 && hour < 12) return 0;
  if (hour >= 12 && hour < 18) return 1;
  if (hour >= 18) return 2;
  return 3;
}

export const WINDOW_LABELS = ['6AM-12PM', '12PM-6PM', '6PM-12AM', '12AM-6AM'] as const;

export function applyBusFilters(buses: BusDeparture[], filters: BusFilters): BusDeparture[] {
  let result = buses;

  if (filters.types?.length) {
    // Any-of within the filter, as the reference's chips behave: ticking AC and
    // Sleeper shows both, not only coaches that are somehow both and neither.
    result = result.filter((bus) => filters.types?.some((type) => bus.coachTypes.includes(type)));
  }

  if (filters.windows?.length) {
    result = result.filter((bus) =>
      filters.windows?.includes(departureWindow(bus.departureMinutes)),
    );
  }

  if (filters.arrivals?.length) {
    // The same four buckets, read off the arrival clock. On an overnight route
    // that is a different answer from the departure one, which is the whole
    // reason a traveller asks for it.
    result = result.filter((bus) =>
      filters.arrivals?.includes(departureWindow(arrivalOf(bus).minutes)),
    );
  }

  if (typeof filters.minFare === 'number') {
    const floor = filters.minFare;
    result = result.filter((bus) => bus.fare >= floor);
  }

  if (typeof filters.maxFare === 'number') {
    const ceiling = filters.maxFare;
    result = result.filter((bus) => bus.fare <= ceiling);
  }

  if (typeof filters.maxDuration === 'number') {
    const longest = filters.maxDuration;
    result = result.filter((bus) => bus.durationMinutes <= longest);
  }

  if (filters.liveTrackable) {
    result = result.filter((bus) => bus.liveTrackable);
  }

  if (filters.amenities?.length) {
    // All-of here, unlike the chips: someone who ticks Wifi and Blankets wants
    // a coach with both, not a coach with either.
    result = result.filter((bus) =>
      filters.amenities?.every((amenity) => bus.amenities.includes(amenity)),
    );
  }

  // One comparator per key, then a single flip. Writing the reverse of each
  // sort out by hand is how an "ascending" that is really descending gets in.
  const readers: Record<BusSort, (bus: BusDeparture) => number> = {
    RATING: (bus) => bus.rating,
    DEPARTURE: (bus) => bus.departureMinutes,
    DURATION: (bus) => bus.durationMinutes,
    ARRIVAL: (bus) => arrivalOf(bus).minutes,
    PRICE: (bus) => bus.fare,
    SEATS: (bus) => bus.seatsLeft,
  };

  const sort = filters.sort ?? 'RATING';
  const read = readers[sort];
  // Rating and seats read best highest-first; a price or a clock reads lowest.
  const naturallyDescending = sort === 'RATING' || sort === 'SEATS';
  const descending = filters.desc ?? naturallyDescending;

  return [...result].sort((a, b) => (descending ? read(b) - read(a) : read(a) - read(b)));
}

/** The cheapest fare on a route and date, for the calendar strip. */
export function cheapestFareFor(from: string, to: string, date: string, today: Date): Paise | null {
  const result = searchBuses({ from, to, date }, today);
  if (!result.ok || result.buses.length === 0) return null;
  return Math.min(...result.buses.map((bus) => bus.fare));
}
