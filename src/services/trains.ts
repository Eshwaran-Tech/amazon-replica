import { isBusyDay } from '@/data/holidays';
import {
  findClass,
  isBookable,
  TRAIN_CLASSES,
  type ReservationStatus,
  type TrainClass,
  type TrainClassCode,
} from '@/data/train-classes';
import {
  crowKm,
  findStation,
  RAIL_FACTOR,
  railKm,
  stationsInCity,
  TRAIN_STATIONS,
  type TrainStation,
} from '@/data/train-stations';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * Train search.
 *
 * Deterministic, like the bus and flight searches it sits beside: the same
 * route on the same date produces the same services on every machine and every
 * reload. No `Math.random()`, no `Date.now()` inside the generator -- a page
 * that reshuffled itself between the search and the payment would be worse than
 * no page at all.
 *
 * Three things here are modelled on how railway booking actually behaves,
 * because without them the page is a picture rather than a feature:
 *
 *  1. **A route has a fixed timetable.** The pool of services is seeded by the
 *     city pair alone, so tomorrow's list is the same trains as today's -- only
 *     the availability moves. Reseeding per date would give you a different
 *     railway every morning.
 *  2. **Services run on given days.** A train that does not run on a Thursday
 *     does not appear in a Thursday search. That is why the running-days strip
 *     is on the card at all.
 *  3. **Only a seat can be sold.** Waitlist and regret are shown, with their
 *     numbers, and cannot be booked. This store will not take money for a place
 *     in a queue it has no way to clear.
 *
 * The stations, their codes and the distances between them are real. Every
 * service, its number, its name and its fares are this store's own.
 */

export type TrainKind = 'SF' | 'EXP' | 'MAIL';

export interface TrainClassOffer {
  code: TrainClassCode;
  label: string;
  ac: boolean;
  fare: Paise;
  status: ReservationStatus;
  /** Berths behind the status: 26 for "AVL 26", 33 for "WL 33". */
  count: number;
  /** Whether the tatkal quota is open for this class on this date. */
  tatkal: boolean;
  /** Minutes since this figure was last refreshed, for the "x ago" line. */
  updatedMinutesAgo: number;
  bookable: boolean;
}

export interface TrainDeparture {
  id: string;
  /** Five digits, this store's own. */
  number: string;
  name: string;
  kind: TrainKind;
  origin: TrainStation;
  destination: TrainStation;
  /** Minutes past midnight, on the travel date. */
  departureMinutes: number;
  durationMinutes: number;
  /** Seven booleans from Sunday, matching `DAY_LETTERS`. */
  runsOn: boolean[];
  distanceKm: number;
  haltCount: number;
  classes: TrainClassOffer[];
}

export interface TrainSearchInput {
  from: string;
  to: string;
  /** `YYYY-MM-DD`. */
  date: string;
}

export type TrainSearchResult =
  | {
      ok: true;
      trains: TrainDeparture[];
      from: TrainStation;
      to: TrainStation;
      distanceKm: number;
      /** Services on the route that do not run on this weekday. */
      notRunningToday: number;
      /** False when the date is past the reservation window. */
      reservationOpen: boolean;
      /** The furthest date reservation is open for, `YYYY-MM-DD`. */
      bookingHorizon: string;
    }
  | { ok: false; code: 'UNKNOWN_STATION' | 'SAME_CITY'; message: string };

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

const NAME_HEADS = [
  'Amber',
  'Indigo',
  'Saffron',
  'Cobalt',
  'Emerald',
  'Ivory',
  'Scarlet',
  'Onyx',
  'Copper',
  'Slate',
  'Cinnabar',
  'Verdant',
];

const NAME_TAILS = [
  'Arrow',
  'Comet',
  'Pennant',
  'Falcon',
  'Meridian',
  'Compass',
  'Sentinel',
  'Voyager',
  'Zenith',
  'Quill',
  'Kite',
  'Trail',
];

const KIND_SUFFIX: Record<TrainKind, string> = {
  SF: 'SF Exp',
  EXP: 'Exp',
  MAIL: 'Mail',
};

/** Average end-to-end speed once halts and slack are counted. */
const KIND_SPEED: Record<TrainKind, number> = { SF: 82, EXP: 68, MAIL: 55 };

/**
 * How far ahead reservation opens.
 *
 * A real booking window, and the reason a date months out shows no berths in
 * any class rather than a page full of imaginary ones.
 */
export const ADVANCE_RESERVATION_DAYS = 60;

/** `HH:MM` on a 24-hour clock, which is how a railway timetable reads. */
export function formatTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Arrival clock time and how many days later it lands. */
export function arrivalOf(train: TrainDeparture): { minutes: number; dayOffset: number } {
  const total = train.departureMinutes + train.durationMinutes;
  return { minutes: total % 1440, dayOffset: Math.floor(total / 1440) };
}

/** Whole days between today and the travel date; negative is in the past. */
export function daysAhead(dateKey: string, today: Date): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return 0;
  const target = new Date(year, month - 1, day);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

/** Day of the week for a `YYYY-MM-DD` key, Sunday = 0. */
export function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return 0;
  return new Date(year, month - 1, day).getDay();
}

/** `YYYY-MM-DD` for a date, in the machine's own timezone. */
export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` a whole number of days after a key. */
export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  const moved = new Date(year, month - 1, day + days);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
}

/**
 * Chargeable kilometres.
 *
 * Long-distance fares taper: the first stretch is charged in full and the rest
 * at a falling rate, which is why a 2,000 km ticket is nowhere near twice a
 * 1,000 km one. Without the taper a Delhi-Chennai sleeper prices like a small
 * car, and the whole page stops being believable.
 */
export function chargeableKm(km: number): number {
  if (km <= 500) return km;
  if (km <= 1500) return 500 + (km - 500) * 0.62;
  return 500 + 1000 * 0.62 + (km - 1500) * 0.3;
}

/**
 * Fare for one passenger.
 *
 * Distance and class do the work; the departure date nudges it, as a dynamic
 * fare does. Rounded to a whole five rupees, which is how a printed fare reads.
 */
export function fareFor(km: number, travelClass: TrainClass, lead: number, busy: boolean): Paise {
  const leadFactor = lead <= 0 ? 1.18 : lead < 3 ? 1.12 : lead < 10 ? 1.04 : 1;
  const rupees =
    (travelClass.base + chargeableKm(km) * travelClass.ratePerKm) * leadFactor * (busy ? 1.09 : 1);
  return rupeesToPaise(Math.max(25, Math.round(rupees / 5) * 5));
}

/** "3 hours ago", "54 minutes ago" -- how fresh the availability figure is. */
export function freshnessLabel(minutesAgo: number): string {
  if (minutesAgo < 2) return 'a minute ago';
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
  const hours = Math.round(minutesAgo / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "All days", or the running days spelt out. */
export function runsOnLabel(runsOn: boolean[]): string {
  if (runsOn.every(Boolean)) return 'All days';
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return runsOn
    .map((runs, index) => (runs ? names[index] : null))
    .filter(Boolean)
    .join(', ');
}

/** One service on a route, before a date is applied. */
interface TrainService {
  index: number;
  number: string;
  name: string;
  kind: TrainKind;
  origin: TrainStation;
  destination: TrainStation;
  departureMinutes: number;
  durationMinutes: number;
  runsOn: boolean[];
  distanceKm: number;
  haltCount: number;
  classCodes: TrainClassCode[];
}

/**
 * The timetable for a city pair.
 *
 * Seeded by the cities alone, deliberately: the services on a route are a fact
 * about the route, not about the day you happened to search it.
 */
function servicesFor(fromCity: string, toCity: string): TrainService[] {
  const origins = stationsInCity(fromCity);
  const destinations = stationsInCity(toCity);
  const first = origins[0];
  const last = destinations[0];
  if (!first || !last) return [];

  const random = makeRandom(hash(`train:${fromCity}:${toCity}`));
  const km = railKm(first, last);

  // A short corridor runs all day; a two-night trunk route runs a handful.
  const count =
    km < 400
      ? 9 + Math.floor(random() * 6)
      : km < 1200
        ? 7 + Math.floor(random() * 5)
        : 4 + Math.floor(random() * 4);

  const services: TrainService[] = [];

  for (let index = 0; index < count; index += 1) {
    const origin = origins[Math.floor(random() * origins.length)] ?? first;
    const destination = destinations[Math.floor(random() * destinations.length)] ?? last;

    const kind: TrainKind = random() < 0.42 ? 'SF' : random() < 0.75 ? 'EXP' : 'MAIL';
    const distanceKm = railKm(origin, destination);

    const head = NAME_HEADS[Math.floor(random() * NAME_HEADS.length)] ?? 'Amber';
    const tail = NAME_TAILS[Math.floor(random() * NAME_TAILS.length)] ?? 'Arrow';

    // Long hauls leave in the evening so the night is spent travelling; short
    // ones spread across the day, which is how the real boards read.
    const departureMinutes =
      distanceKm > 700
        ? 15 * 60 + Math.floor(random() * (9 * 60))
        : 4 * 60 + Math.floor((index / count) * (17 * 60)) + Math.floor(random() * 45);

    const speed = KIND_SPEED[kind];
    const durationMinutes = Math.round((distanceKm / speed) * 60) + 25 + Math.floor(random() * 70);

    // Roughly half of all services run daily; the rest keep a weekly pattern.
    const daily = random() < 0.52;
    const runsOn = daily
      ? [true, true, true, true, true, true, true]
      : Array.from({ length: 7 }, () => random() < 0.45);
    // A pattern that runs on no day at all is not a service.
    if (!runsOn.some(Boolean)) runsOn[Math.floor(random() * 7)] = true;

    // A day train sells chairs; an overnight one sells berths. A long-haul
    // service adds first class only sometimes, as the real formations do.
    const overnight = durationMinutes > 9 * 60 || departureMinutes > 19 * 60;
    const classCodes: TrainClassCode[] = overnight ? ['SL', '3A', '2A'] : ['2S', 'CC', '3A'];
    if (overnight && random() < 0.45) classCodes.push('1A');
    if (!overnight && random() < 0.35) classCodes.push('2A');

    services.push({
      index,
      number: String(12_000 + Math.floor(random() * 18_000)),
      name: `${head} ${tail} ${KIND_SUFFIX[kind]}`,
      kind,
      origin,
      destination,
      departureMinutes,
      durationMinutes,
      runsOn,
      distanceKm,
      haltCount: 3 + Math.floor(random() * 18),
      classCodes: classCodes.sort(
        (a, b) => (findClass(a)?.order ?? 0) - (findClass(b)?.order ?? 0),
      ),
    });
  }

  return services.sort((a, b) => a.departureMinutes - b.departureMinutes);
}

/**
 * Availability for one class on one date.
 *
 * Pressure rises as the date approaches and on a holiday or a weekend, which is
 * the shape a real chart has. Sleeper fills before AC; first class rarely
 * waitlists because there are so few berths to queue for.
 */
function offerFor(
  service: TrainService,
  travelClass: TrainClass,
  input: { date: string; lead: number; busy: boolean; departed: boolean },
): TrainClassOffer {
  const random = makeRandom(hash(`avail:${service.number}:${travelClass.code}:${input.date}`));

  const fare = fareFor(service.distanceKm, travelClass, input.lead, input.busy);
  const updatedMinutesAgo = 1 + Math.floor(random() * 1439);

  // Tatkal opens the day before travel and is not offered in first class.
  const tatkal = input.lead >= 0 && input.lead <= 1 && travelClass.code !== '1A';

  // Reservation opens a fixed window ahead of travel. Past it there is no chart
  // to sell from, so the tile says so rather than inventing berths.
  if (input.lead > ADVANCE_RESERVATION_DAYS) {
    return {
      code: travelClass.code,
      label: travelClass.label,
      ac: travelClass.ac,
      fare,
      status: 'CLOSED',
      count: 0,
      tatkal: false,
      updatedMinutesAgo,
      bookable: false,
    };
  }

  if (input.departed) {
    return {
      code: travelClass.code,
      label: travelClass.label,
      ac: travelClass.ac,
      fare,
      status: 'DEPARTED',
      count: 0,
      tatkal: false,
      updatedMinutesAgo,
      bookable: false,
    };
  }

  // 0 when the train leaves today, 1 when it is months away.
  const room = Math.min(1, Math.max(0, input.lead / 45));
  const scarce = travelClass.code === '1A' ? 0.55 : travelClass.code === 'SL' ? 1.15 : 1;
  const pAvailable = Math.min(0.93, (0.34 + room * 0.58) / scarce) * (input.busy ? 0.85 : 1);

  const roll = random();

  if (roll < pAvailable) {
    const berths = travelClass.code === '1A' ? 12 : travelClass.code === 'SL' ? 120 : 60;
    return {
      code: travelClass.code,
      label: travelClass.label,
      ac: travelClass.ac,
      fare,
      status: 'AVAILABLE',
      count: 1 + Math.floor(random() * berths),
      tatkal,
      updatedMinutesAgo,
      bookable: true,
    };
  }

  if (roll < pAvailable + 0.14 && travelClass.sleeping && travelClass.code !== '1A') {
    return {
      code: travelClass.code,
      label: travelClass.label,
      ac: travelClass.ac,
      fare,
      status: 'RAC',
      count: 1 + Math.floor(random() * 28),
      tatkal,
      updatedMinutesAgo,
      bookable: true,
    };
  }

  if (roll < pAvailable + 0.62) {
    const waitlist = 1 + Math.floor(random() * (travelClass.code === '1A' ? 8 : 90));
    // A queue past the chart limit stops being a queue and becomes a refusal.
    const regret = waitlist > (travelClass.code === 'SL' ? 78 : 52);
    return {
      code: travelClass.code,
      label: travelClass.label,
      ac: travelClass.ac,
      fare,
      status: regret ? 'REGRET' : 'WAITLIST',
      count: regret ? 0 : waitlist,
      tatkal,
      updatedMinutesAgo,
      bookable: false,
    };
  }

  return {
    code: travelClass.code,
    label: travelClass.label,
    ac: travelClass.ac,
    fare,
    status: 'CLOSED',
    count: 0,
    tatkal: false,
    updatedMinutesAgo,
    bookable: false,
  };
}

export function searchTrains(input: TrainSearchInput, today: Date): TrainSearchResult {
  const from = findStation(input.from);
  const to = findStation(input.to);

  if (!from || !to) {
    return { ok: false, code: 'UNKNOWN_STATION', message: 'Choose a station from the list.' };
  }
  if (from.city === to.city) {
    return {
      ok: false,
      code: 'SAME_CITY',
      message: 'Source and destination must be different cities.',
    };
  }

  const services = servicesFor(from.city, to.city);
  const weekday = weekdayOf(input.date);
  const lead = daysAhead(input.date, today);
  const busy = isBusyDay(input.date);
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  const running = services.filter((service) => service.runsOn[weekday]);

  const trains: TrainDeparture[] = running.map((service) => {
    // A train that has already pulled out today cannot be sold, whatever the
    // chart says. Only today is affected -- tomorrow's 04:44 is still to come.
    const departed = lead < 0 || (lead === 0 && service.departureMinutes <= nowMinutes);

    return {
      id: `${from.city}-${to.city}-${service.number}`,
      number: service.number,
      name: service.name,
      kind: service.kind,
      origin: service.origin,
      destination: service.destination,
      departureMinutes: service.departureMinutes,
      durationMinutes: service.durationMinutes,
      runsOn: service.runsOn,
      distanceKm: service.distanceKm,
      haltCount: service.haltCount,
      classes: service.classCodes
        .map((code) => findClass(code))
        .filter((entry): entry is TrainClass => entry !== undefined)
        .map((travelClass) =>
          offerFor(service, travelClass, { date: input.date, lead, busy, departed }),
        ),
    };
  });

  return {
    ok: true,
    trains,
    from,
    to,
    distanceKm: railKm(from, to),
    notRunningToday: services.length - running.length,
    reservationOpen: lead <= ADVANCE_RESERVATION_DAYS,
    bookingHorizon: addDays(todayKey(today), ADVANCE_RESERVATION_DAYS),
  };
}

/** One class on one train, for the booking page. Re-derived, never trusted. */
export function offerOn(train: TrainDeparture, classCode: string): TrainClassOffer | undefined {
  const wanted = classCode.trim().toUpperCase();
  return train.classes.find((offer) => offer.code === wanted);
}

export interface TrainHalt {
  station: TrainStation;
  /** Kilometres from the train's origin. */
  km: number;
  /** Minutes past the departure date's midnight; may exceed 1440. */
  arrivalMinutes: number;
  /** How long the train stands, in minutes. Zero at the two ends. */
  haltMinutes: number;
  dayOffset: number;
}

/**
 * The halts between a train's two ends.
 *
 * Derived from real geography rather than invented: a station is a candidate
 * when it sits near the straight line between origin and destination and
 * between them along it, which is what "on the way" means. They are then
 * ordered by distance from the origin and timed by the share of the journey
 * they sit at.
 *
 * That gives a route list that agrees with the map -- a Delhi to Chennai train
 * calls at Bhopal and Nagpur, not at Guwahati -- without needing a route table
 * this store has no way to keep true.
 */
export function routeOf(train: TrainDeparture): TrainHalt[] {
  const origin = train.origin;
  const destination = train.destination;
  const total = crowKm(origin, destination);
  if (total === 0) return [];

  // Longitude is scaled by the cosine of the mean latitude before any of this:
  // a degree of longitude is about 98 km at Chennai and 88 km at Delhi, so
  // projecting on raw lat/lon would stretch every east-west route and let
  // stations well off the corridor look close to it.
  const scale = Math.cos(((origin.lat + destination.lat) / 2) * (Math.PI / 180));
  const dLat = destination.lat - origin.lat;
  const dLon = (destination.lon - origin.lon) * scale;
  const lengthSquared = dLat * dLat + dLon * dLon;
  if (lengthSquared === 0) return [];

  /** Where a station falls along the run: 0 at the origin, 1 at the end. */
  function along(station: TrainStation): number {
    return (
      ((station.lat - origin.lat) * dLat + (station.lon - origin.lon) * scale * dLon) /
      lengthSquared
    );
  }

  const candidates = TRAIN_STATIONS.filter((station) => {
    if (station.city === origin.city || station.city === destination.city) return false;

    const t = along(station);
    if (t <= 0.04 || t >= 0.96) return false;

    // How far off the line it sits, back in real degrees so the haversine is
    // measuring something that exists.
    const nearestLat = origin.lat + t * dLat;
    const nearestLon = origin.lon + (t * dLon) / scale;
    const offKm = crowKm(station, { ...station, lat: nearestLat, lon: nearestLon });

    // A hundred-odd kilometres off the corridor is a halt with a detour. More
    // than that is a different route -- a Delhi to Chennai train does not call
    // at Jaipur, however tempting the arithmetic makes it look.
    return offKm < Math.min(140, Math.max(60, total * 0.09));
  });

  // One station per city: a train calls at a city once.
  const byCity = new Map<string, TrainStation>();
  for (const station of candidates) {
    if (!byCity.has(station.city)) byCity.set(station.city, station);
  }

  const random = makeRandom(hash(`route:${train.number}`));
  // Ordered along the run rather than by distance from the origin: two stations
  // can be equally far from Delhi and an hour apart on the way to Chennai.
  const chosen = [...byCity.values()]
    .sort((a, b) => along(a) - along(b))
    .filter(() => random() < 0.85)
    .slice(0, Math.max(1, train.haltCount));

  const stops: TrainHalt[] = [origin, ...chosen, destination].map((station, index, all) => {
    // Progress along the run, not distance from the origin: a station that
    // doubles back would otherwise get an earlier time than the one before it.
    const share =
      index === 0 ? 0 : index === all.length - 1 ? 1 : Math.min(1, Math.max(0, along(station)));
    const km = Math.round(total * share * RAIL_FACTOR);
    const arrival = train.departureMinutes + Math.round(train.durationMinutes * share);
    const terminal = index === 0 || index === all.length - 1;

    return {
      station,
      km,
      arrivalMinutes: arrival,
      // A junction stands longer than a wayside halt; the ends stand not at all.
      haltMinutes: terminal ? 0 : station.name.includes('Jn') ? 5 : 2,
      dayOffset: Math.floor(arrival / 1440),
    };
  });

  return stops;
}

export type TrainSort = 'DEPARTURE' | 'ARRIVAL' | 'DURATION' | 'FARE' | 'NAME';

export interface TrainFilters {
  /** Keep only trains offering an air-conditioned class. */
  acOnly?: boolean;
  /** Keep only trains with a bookable berth in some class. */
  availableOnly?: boolean;
  classes?: TrainClassCode[];
  /** Departure windows, four six-hour buckets from midnight. */
  windows?: number[];
  sort?: TrainSort;
  desc?: boolean;
}

/** Six-hour bucket a clock time falls in: 0 = 00:00-05:59. */
export function timeWindow(minutes: number): number {
  return Math.floor((((minutes % 1440) + 1440) % 1440) / 360);
}

export const WINDOW_LABELS = ['12AM-6AM', '6AM-12PM', '12PM-6PM', '6PM-12AM'] as const;

/** The cheapest bookable fare on a train, for sorting and for the card. */
export function cheapestFare(train: TrainDeparture): Paise | null {
  const fares = train.classes.filter((offer) => offer.bookable).map((offer) => offer.fare);
  return fares.length > 0 ? Math.min(...fares) : null;
}

export function applyTrainFilters(
  trains: TrainDeparture[],
  filters: TrainFilters,
): TrainDeparture[] {
  let result = trains;

  if (filters.acOnly) {
    result = result.filter((train) => train.classes.some((offer) => offer.ac));
  }

  if (filters.availableOnly) {
    result = result.filter((train) => train.classes.some((offer) => offer.bookable));
  }

  if (filters.classes?.length) {
    result = result.filter((train) =>
      filters.classes?.some((code) => train.classes.some((offer) => offer.code === code)),
    );
  }

  if (filters.windows?.length) {
    result = result.filter((train) =>
      filters.windows?.includes(timeWindow(train.departureMinutes)),
    );
  }

  // One comparator per key, then a single flip -- writing the reverse of each
  // sort out by hand is how an "ascending" that is really descending gets in.
  const readers: Record<TrainSort, (train: TrainDeparture) => number> = {
    DEPARTURE: (train) => train.departureMinutes,
    ARRIVAL: (train) => arrivalOf(train).minutes,
    DURATION: (train) => train.durationMinutes,
    // Trains with nothing to sell sort last rather than first.
    FARE: (train) => cheapestFare(train) ?? Number.MAX_SAFE_INTEGER,
    NAME: (train) => Number(train.number),
  };

  const sort = filters.sort ?? 'DEPARTURE';
  const read = readers[sort];
  const descending = filters.desc ?? false;

  return [...result].sort((a, b) => (descending ? read(b) - read(a) : read(a) - read(b)));
}

/** Whether any class on this train can actually be sold. */
export function hasSeats(train: TrainDeparture): boolean {
  return train.classes.some((offer) => isBookable(offer.status));
}

/** Every class code any train on this route offers, for the filter chips. */
export function classesOffered(trains: TrainDeparture[]): TrainClassCode[] {
  const seen = new Set<TrainClassCode>();
  for (const train of trains) {
    for (const offer of train.classes) seen.add(offer.code);
  }
  return TRAIN_CLASSES.filter((entry) => seen.has(entry.code)).map((entry) => entry.code);
}
