import { airlinesFor, type Airline } from '@/data/airlines';
import { distanceKm, findAirport, type Airport } from '@/data/airports';
import type { Paise } from '@/lib/utils/money';
import { rupeesToPaise } from '@/lib/utils/money';

/**
 * Flight schedules.
 *
 * **These are generated, not fetched.** There is no airline integration behind
 * this store, so a search builds a plausible day of departures from the route
 * and the date rather than pretending to have queried anyone. Every screen
 * that shows them says so.
 *
 * Generation is **deterministic**, seeded from `from:to:date`, for the same
 * reasons the product catalogue is: the same search returns the same flights
 * on every machine and every reload, so a result can be linked to, compared,
 * or filtered without the list reshuffling underneath. No `Math.random()` and
 * no `Date.now()` anywhere in here.
 *
 * The numbers are derived rather than invented. Distance decides duration;
 * duration, the carrier's fare index, how far ahead the date is and the time
 * of day decide the fare. So Delhi->Mumbai is cheaper than Delhi->Singapore,
 * a red-eye undercuts a breakfast departure, and tomorrow costs more than a
 * month out -- without any of that being written down as a special case.
 */

/** FNV-1a, matching `data/catalog.ts`. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 -- small, fast, seedable. */
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

export type CabinClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export const CABIN_LABELS: Record<CabinClass, string> = {
  ECONOMY: 'Economy',
  PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS: 'Business',
  FIRST: 'First Class',
};

const CABIN_MULTIPLIER: Record<CabinClass, number> = {
  ECONOMY: 1,
  PREMIUM_ECONOMY: 1.7,
  BUSINESS: 3.1,
  FIRST: 5.2,
};

export interface FlightLeg {
  id: string;
  airline: Airline;
  flightNumber: string;
  from: Airport;
  to: Airport;
  /** Minutes past midnight, local to the origin. */
  departureMinutes: number;
  /** Total journey minutes, including any layover. */
  durationMinutes: number;
  stops: number;
  /** Airport code of the layover, when there is one. */
  via: string | null;
  fare: Paise;
  seatsLeft: number;
  refundable: boolean;
  distanceKm: number;
}

export interface FlightSearchInput {
  from: string;
  to: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  travellers: number;
  cabin: CabinClass;
}

export type FlightSearchResult =
  | { ok: true; flights: FlightLeg[]; from: Airport; to: Airport; distanceKm: number }
  | { ok: false; code: 'UNKNOWN_AIRPORT' | 'SAME_AIRPORT'; message: string };

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${rest.toString().padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Arrival can land past midnight; the caller shows a "+1 day" marker. */
export function arrivalOf(leg: FlightLeg): { minutes: number; dayOffset: number } {
  const total = leg.departureMinutes + leg.durationMinutes;
  return { minutes: total % (24 * 60), dayOffset: Math.floor(total / (24 * 60)) };
}

/** Days between today and the travel date; negative for the past. */
function daysAhead(date: string, today: Date): number {
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Builds the day's departures for a route.
 *
 * `today` is passed in rather than read from the clock, so the pricing curve
 * is testable and the function stays pure.
 */
export function searchFlights(input: FlightSearchInput, today: Date): FlightSearchResult {
  const from = findAirport(input.from);
  const to = findAirport(input.to);

  if (!from || !to) {
    return { ok: false, code: 'UNKNOWN_AIRPORT', message: 'Choose an airport from the list.' };
  }
  if (from.code === to.code) {
    return { ok: false, code: 'SAME_AIRPORT', message: 'Origin and destination must differ.' };
  }

  const km = distanceKm(from, to);
  const isDomestic = from.country === to.country;
  const carriers = airlinesFor(isDomestic);

  const random = makeRandom(hash(`${from.code}:${to.code}:${input.date}`));

  // Busy trunk routes get more departures than a thin regional pair.
  const count = km < 1500 ? 10 + Math.floor(random() * 6) : 7 + Math.floor(random() * 5);

  // ~800 km/h cruise, plus taxi and climb.
  const nonstopMinutes = Math.max(50, Math.round((km / 800) * 60) + 35);

  const lead = daysAhead(input.date, today);
  // Fares climb steeply inside a fortnight and flatten out beyond a month.
  const leadFactor = lead <= 0 ? 1.55 : lead < 3 ? 1.4 : lead < 7 ? 1.22 : lead < 14 ? 1.1 : lead < 30 ? 1 : 0.94;

  const flights: FlightLeg[] = [];
  const usedNumbers = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const airline = carriers[Math.floor(random() * carriers.length)] ?? carriers[0];
    if (!airline) break;

    // Spread departures across the day rather than clustering them.
    const slot = Math.floor((index / count) * (21 * 60 - 5 * 60)) + 5 * 60;
    const departureMinutes = Math.min(23 * 60 + 55, slot + Math.floor(random() * 55));

    // Long routes are more likely to route through a hub.
    const stopRoll = random();
    const stops = km > 3500 ? (stopRoll < 0.55 ? 1 : 0) : km > 1200 ? (stopRoll < 0.25 ? 1 : 0) : stopRoll < 0.12 ? 1 : 0;

    const layoverMinutes = stops === 1 ? 60 + Math.floor(random() * 150) : 0;
    const durationMinutes = nonstopMinutes + layoverMinutes + Math.floor(random() * 25);

    let flightNumber = `${airline.code} ${100 + Math.floor(random() * 899)}`;
    while (usedNumbers.has(flightNumber)) {
      flightNumber = `${airline.code} ${100 + Math.floor(random() * 899)}`;
    }
    usedNumbers.add(flightNumber);

    // Distance drives the fare; the rest nudges it.
    const baseRupees = 1400 + km * (isDomestic ? 3.1 : 4.4);
    // Dawn and late-night departures are the cheap ones.
    const timeFactor = departureMinutes < 7 * 60 || departureMinutes > 21 * 60 ? 0.88 : 1.06;
    const stopDiscount = stops === 1 ? 0.86 : 1;
    const jitter = 0.9 + random() * 0.22;

    const rupees =
      baseRupees *
      airline.fareIndex *
      leadFactor *
      timeFactor *
      stopDiscount *
      jitter *
      CABIN_MULTIPLIER[input.cabin];

    flights.push({
      id: `${from.code}-${to.code}-${input.date}-${index}`,
      airline,
      flightNumber,
      from,
      to,
      departureMinutes,
      durationMinutes,
      stops,
      via: stops === 1 ? pickHub(from, to, random) : null,
      // Rounded to something that looks like a published fare.
      fare: rupeesToPaise(Math.round(rupees / 10) * 10 - 1),
      seatsLeft: 1 + Math.floor(random() * 9),
      refundable: random() < 0.35,
      distanceKm: km,
    });
  }

  flights.sort((a, b) => a.departureMinutes - b.departureMinutes);
  return { ok: true, flights, from, to, distanceKm: km };
}

/** A plausible connecting airport: a hub that is neither endpoint. */
function pickHub(from: Airport, to: Airport, random: () => number): string {
  const hubs = ['DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'DXB', 'DOH', 'SIN'].filter(
    (code) => code !== from.code && code !== to.code,
  );
  return hubs[Math.floor(random() * hubs.length)] ?? 'DEL';
}

// --------------------------------------------------------------- filtering

export interface FlightFilters {
  stops?: 'ANY' | 'NONSTOP' | 'ONE';
  airlines?: string[];
  departFrom?: number;
  departTo?: number;
  sort?: 'DEPARTURE' | 'DURATION' | 'PRICE_ASC' | 'PRICE_DESC';
}

export function applyFilters(flights: FlightLeg[], filters: FlightFilters): FlightLeg[] {
  let result = flights;

  if (filters.stops === 'NONSTOP') result = result.filter((flight) => flight.stops === 0);
  if (filters.stops === 'ONE') result = result.filter((flight) => flight.stops === 1);

  if (filters.airlines && filters.airlines.length > 0) {
    const wanted = new Set(filters.airlines);
    result = result.filter((flight) => wanted.has(flight.airline.code));
  }

  if (typeof filters.departFrom === 'number') {
    result = result.filter((flight) => flight.departureMinutes >= (filters.departFrom ?? 0));
  }
  if (typeof filters.departTo === 'number') {
    result = result.filter((flight) => flight.departureMinutes <= (filters.departTo ?? 1440));
  }

  const sorted = [...result];
  switch (filters.sort) {
    case 'DURATION':
      sorted.sort((a, b) => a.durationMinutes - b.durationMinutes);
      break;
    case 'PRICE_ASC':
      sorted.sort((a, b) => a.fare - b.fare);
      break;
    case 'PRICE_DESC':
      sorted.sort((a, b) => b.fare - a.fare);
      break;
    default:
      sorted.sort((a, b) => a.departureMinutes - b.departureMinutes);
  }
  return sorted;
}

/** Airline codes present in a result set, for the filter list. */
export function airlinesInResults(flights: FlightLeg[]): Array<{ code: string; name: string; count: number }> {
  const counts = new Map<string, { code: string; name: string; count: number }>();
  for (const flight of flights) {
    const entry = counts.get(flight.airline.code);
    if (entry) entry.count += 1;
    else counts.set(flight.airline.code, { code: flight.airline.code, name: flight.airline.name, count: 1 });
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The lowest fare on a route for one date, or null if the route is invalid.
 *
 * The calendar prints a fare under every day, which is only honest if it is
 * the same number the search would produce -- so this runs the real generator
 * rather than a cheaper approximation that could disagree with the results
 * page. Generation is pure and deterministic, so a month of these is a few
 * hundred short-lived objects and no I/O.
 */
export function cheapestFareFor(
  from: string,
  to: string,
  date: string,
  today: Date,
  cabin: CabinClass = 'ECONOMY',
): Paise | null {
  const result = searchFlights({ from, to, date, travellers: 1, cabin }, today);
  if (!result.ok || result.flights.length === 0) return null;

  return result.flights.reduce((lowest, flight) => Math.min(lowest, flight.fare), Number.MAX_SAFE_INTEGER);
}
