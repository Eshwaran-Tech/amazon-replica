import { describe, expect, it } from 'vitest';

import {
  findClass,
  isBookable,
  statusLabel,
  TRAIN_CLASSES,
  type ReservationStatus,
} from '@/data/train-classes';
import {
  crowKm,
  findStation,
  POPULAR_STATIONS,
  railKm,
  searchStations,
  stationsInCity,
  TRAIN_STATIONS,
} from '@/data/train-stations';
import {
  ADVANCE_RESERVATION_DAYS,
  addDays,
  applyTrainFilters,
  arrivalOf,
  chargeableKm,
  cheapestFare,
  classesOffered,
  fareFor,
  formatDuration,
  formatTime,
  freshnessLabel,
  routeOf,
  runsOnLabel,
  searchTrains,
  timeWindow,
  todayKey,
  weekdayOf,
  type TrainDeparture,
} from '@/services/trains';

/**
 * Train search.
 *
 * A generated timetable is only worth anything if it is stable and derived from
 * something real. So: the same route and date must return the same services
 * every time; distance must actually drive duration and fare; a train must not
 * appear on a day it does not run; and nothing that cannot be sold may be
 * presented as bookable.
 */

const TODAY = new Date(2026, 7, 21, 13, 40); // Fri 21 Aug 2026, 13:40.
const DATE = '2026-09-21'; // A Monday, a month out.

function search(from: string, to: string, date = DATE, today = TODAY) {
  const result = searchTrains({ from, to, date }, today);
  if (!result.ok) throw new Error(`search failed: ${result.message}`);
  return result;
}

const route = () => search('NDLS', 'HWH').trains;

describe('train stations', () => {
  it('finds a station by code, case-insensitively, and nothing by a bad one', () => {
    expect(findStation('ndls')?.name).toBe('New Delhi');
    // Every Delhi terminus is one city, so a Delhi search reaches all of them.
    expect(findStation('NDLS')?.city).toBe('Delhi');
    expect(stationsInCity('Delhi').map((station) => station.code)).toEqual(
      expect.arrayContaining(['NDLS', 'NZM', 'ANVT', 'DLI']),
    );
    expect(findStation('ZZZZ')).toBeUndefined();
    expect(findStation(null)).toBeUndefined();
  });

  it('gives every station a unique code', () => {
    const codes = new Set(TRAIN_STATIONS.map((station) => station.code));
    expect(codes.size).toBe(TRAIN_STATIONS.length);
  });

  it('offers the popular list before anyone types', () => {
    expect(searchStations('')).toEqual([...POPULAR_STATIONS]);
    expect(POPULAR_STATIONS.length).toBeGreaterThanOrEqual(8);
  });

  it('matches on code, name, city and state', () => {
    expect(searchStations('HWH').map((s) => s.code)).toContain('HWH');
    expect(searchStations('howrah').map((s) => s.code)).toContain('HWH');
    expect(searchStations('kolkata').map((s) => s.code)).toContain('SDAH');
    expect(searchStations('kerala').map((s) => s.state)).toContain('Kerala');
  });

  it('puts an exact code match first', () => {
    // "DR" is Dadar's code and also two letters inside other station names.
    expect(searchStations('DR')[0]?.code).toBe('DR');
  });

  it('groups the stations of a city', () => {
    const mumbai = stationsInCity('Mumbai').map((station) => station.code);
    expect(mumbai).toContain('CSMT');
    expect(mumbai).toContain('LTT');
    expect(stationsInCity('Atlantis')).toEqual([]);
  });

  it('puts real distances between real stations', () => {
    const ndls = findStation('NDLS');
    const hwh = findStation('HWH');
    const mas = findStation('MAS');
    if (!ndls || !hwh || !mas) throw new Error('missing station');

    // Delhi-Howrah is ~1,300 km as the crow flies, ~1,450 km by rail.
    expect(crowKm(ndls, hwh)).toBeGreaterThan(1150);
    expect(crowKm(ndls, hwh)).toBeLessThan(1400);
    expect(railKm(ndls, hwh)).toBeGreaterThan(crowKm(ndls, hwh));

    // Delhi-Chennai is further than Delhi-Howrah, as the map says.
    expect(railKm(ndls, mas)).toBeGreaterThan(railKm(ndls, hwh));
  });

  it('measures the same distance in both directions', () => {
    const a = findStation('BPL');
    const b = findStation('SC');
    if (!a || !b) throw new Error('missing station');
    expect(railKm(a, b)).toBe(railKm(b, a));
  });
});

describe('train classes', () => {
  it('finds a class by code and nothing by a bad one', () => {
    expect(findClass('sl')?.label).toBe('Sleeper');
    expect(findClass('3A')?.ac).toBe(true);
    expect(findClass('QQ')).toBeUndefined();
  });

  it('prices a more comfortable class above a less comfortable one', () => {
    const ordered = [...TRAIN_CLASSES].sort((a, b) => a.order - b.order);
    for (let index = 1; index < ordered.length; index += 1) {
      const lower = ordered[index - 1];
      const higher = ordered[index];
      if (!lower || !higher) throw new Error('missing class');
      expect(higher.ratePerKm, `${higher.code} vs ${lower.code}`).toBeGreaterThan(lower.ratePerKm);
    }
  });

  it('only ever lets a real berth be booked', () => {
    expect(isBookable('AVAILABLE')).toBe(true);
    expect(isBookable('RAC')).toBe(true);
    for (const status of ['WAITLIST', 'REGRET', 'CLOSED', 'DEPARTED'] as ReservationStatus[]) {
      expect(isBookable(status), status).toBe(false);
    }
  });

  it('prints the status the way a chart does', () => {
    expect(statusLabel('AVAILABLE', 26)).toBe('AVL 26');
    expect(statusLabel('WAITLIST', 33)).toBe('WL 33');
    expect(statusLabel('RAC', 5)).toBe('RAC 5');
    expect(statusLabel('REGRET', 0)).toBe('REGRET');
    expect(statusLabel('CLOSED', 0)).toBe('NOT AVAILABLE');
    expect(statusLabel('DEPARTED', 0)).toBe('TRAIN DEPARTED');
  });
});

describe('train search: what it refuses', () => {
  it('refuses a station it does not know', () => {
    expect(searchTrains({ from: 'ZZZZ', to: 'HWH', date: DATE }, TODAY)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_STATION',
    });
  });

  it('refuses two stations in the same city', () => {
    // A Mumbai CSMT to Dadar reservation is a metro ride, not a ticket.
    expect(searchTrains({ from: 'CSMT', to: 'DR', date: DATE }, TODAY)).toMatchObject({
      ok: false,
      code: 'SAME_CITY',
    });
  });
});

describe('train search: the timetable', () => {
  it('returns the same services for the same route and date, every time', () => {
    const first = search('NDLS', 'HWH');
    const second = search('NDLS', 'HWH');
    expect(
      second.trains.map((t) => `${t.number}:${t.departureMinutes}:${t.durationMinutes}`),
    ).toEqual(first.trains.map((t) => `${t.number}:${t.departureMinutes}:${t.durationMinutes}`));
  });

  it('keeps the same trains on a route from one date to the next', () => {
    // A route's services are a fact about the route. Only availability moves.
    const monday = search('NDLS', 'HWH', '2026-09-21');
    const tuesday = search('NDLS', 'HWH', '2026-09-22');
    const daily = (result: typeof monday) =>
      result.trains.filter((train) => train.runsOn.every(Boolean)).map((train) => train.number);

    expect(daily(tuesday)).toEqual(daily(monday));
  });

  it('never lists a train on a day it does not run', () => {
    for (let day = 0; day < 7; day += 1) {
      const date = addDays('2026-09-21', day);
      const result = search('NDLS', 'HWH', date);
      const weekday = weekdayOf(date);
      for (const train of result.trains) {
        expect(train.runsOn[weekday], `${train.number} on ${date}`).toBe(true);
      }
    }
  });

  it('counts the services it held back', () => {
    const result = search('CSMT', 'SBC');
    expect(result.notRunningToday).toBeGreaterThanOrEqual(0);
    // Everything held back must be a train that does run some other day.
    const total = result.trains.length + result.notRunningToday;
    const otherDays = new Set<string>();
    for (let day = 0; day < 7; day += 1) {
      for (const train of search('CSMT', 'SBC', addDays('2026-09-21', day)).trains) {
        otherDays.add(train.number);
      }
    }
    expect(otherDays.size).toBe(total);
  });

  it('gives every train a distinct number on a route', () => {
    const numbers = route().map((train) => train.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('runs a long haul longer than a short one', () => {
    const short = search('NDLS', 'LJN').trains;
    const long = search('NDLS', 'MAS').trains;
    const median = (trains: TrainDeparture[]) =>
      [...trains].sort((a, b) => a.durationMinutes - b.durationMinutes)[
        Math.floor(trains.length / 2)
      ]?.durationMinutes ?? 0;
    expect(median(long)).toBeGreaterThan(median(short));
  });

  it('lands an overnight service on a later day', () => {
    const overnight = search('NDLS', 'MAS').trains;
    expect(overnight.every((train) => arrivalOf(train).dayOffset >= 1)).toBe(true);
  });

  it('starts and ends at stations in the searched cities', () => {
    const result = search('NDLS', 'HWH');
    for (const train of result.trains) {
      expect(train.origin.city).toBe(result.from.city);
      expect(train.destination.city).toBe(result.to.city);
    }
  });

  it('offers only classes it can price', () => {
    for (const train of route()) {
      expect(train.classes.length).toBeGreaterThan(0);
      for (const offer of train.classes) {
        expect(findClass(offer.code)).toBeDefined();
        expect(offer.fare).toBeGreaterThan(0);
      }
    }
  });

  it('never lists the same class twice on one train', () => {
    for (const train of route()) {
      const codes = train.classes.map((offer) => offer.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe('train fares', () => {
  it('tapers with distance, so a long ticket is not a multiple of a short one', () => {
    expect(chargeableKm(400)).toBe(400);
    expect(chargeableKm(1000)).toBeLessThan(1000);
    expect(chargeableKm(2000)).toBeLessThan(2 * chargeableKm(1000));
    // Still monotonic: further always costs more, just not proportionally.
    expect(chargeableKm(2000)).toBeGreaterThan(chargeableKm(1500));
  });

  it('charges a better class more over the same distance', () => {
    const sleeper = findClass('SL');
    const first = findClass('1A');
    if (!sleeper || !first) throw new Error('missing class');
    expect(fareFor(1500, first, 30, false)).toBeGreaterThan(fareFor(1500, sleeper, 30, false));
  });

  it('charges more for a late booking and for a busy day', () => {
    const sleeper = findClass('SL');
    if (!sleeper) throw new Error('missing class');
    expect(fareFor(1000, sleeper, 0, false)).toBeGreaterThan(fareFor(1000, sleeper, 30, false));
    expect(fareFor(1000, sleeper, 30, true)).toBeGreaterThan(fareFor(1000, sleeper, 30, false));
  });

  it('prices every fare as whole rupees', () => {
    for (const train of route()) {
      for (const offer of train.classes) {
        expect(offer.fare % 100).toBe(0);
      }
    }
  });

  it('orders the class tiles by comfort, and their fares with them', () => {
    for (const train of route()) {
      const orders = train.classes.map((offer) => findClass(offer.code)?.order ?? -1);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));

      const fares = train.classes.map((offer) => offer.fare);
      expect(fares).toEqual([...fares].sort((a, b) => a - b));
    }
  });
});

describe('train availability', () => {
  it('never marks a waitlist or a regret bookable', () => {
    for (let day = 0; day <= 40; day += 5) {
      for (const train of search('NDLS', 'HWH', addDays('2026-08-21', day)).trains) {
        for (const offer of train.classes) {
          expect(offer.bookable, `${offer.code} ${offer.status}`).toBe(isBookable(offer.status));
        }
      }
    }
  });

  it('always leaves at least one berth behind a bookable status', () => {
    for (const train of route()) {
      for (const offer of train.classes.filter((entry) => entry.bookable)) {
        expect(offer.count).toBeGreaterThan(0);
      }
    }
  });

  it('opens up as the date moves further out', () => {
    // Measured as a share of the classes on offer, across several routes: the
    // set of trains running changes with the weekday, so a raw count on one
    // route compares two different timetables and proves nothing.
    const ROUTES = [
      ['NDLS', 'HWH'],
      ['NDLS', 'MAS'],
      ['CSMT', 'SBC'],
      ['HWH', 'PNBE'],
      ['ADI', 'JP'],
    ] as const;

    const bookableShareAt = (lead: number) => {
      let offers = 0;
      let bookable = 0;
      for (const [from, to] of ROUTES) {
        for (const train of search(from, to, addDays(todayKey(TODAY), lead)).trains) {
          for (const offer of train.classes) {
            offers += 1;
            if (offer.bookable) bookable += 1;
          }
        }
      }
      return offers === 0 ? 0 : bookable / offers;
    };

    expect(bookableShareAt(30)).toBeGreaterThan(bookableShareAt(2));
    expect(bookableShareAt(50)).toBeGreaterThan(bookableShareAt(30));
  });

  it('sells nothing past the reservation window', () => {
    const beyond = search('NDLS', 'HWH', addDays(todayKey(TODAY), ADVANCE_RESERVATION_DAYS + 5));
    expect(beyond.reservationOpen).toBe(false);
    for (const train of beyond.trains) {
      for (const offer of train.classes) {
        expect(offer.status).toBe('CLOSED');
        expect(offer.bookable).toBe(false);
      }
    }
  });

  it('marks a train that has already left today as departed', () => {
    const lateAfternoon = new Date(2026, 7, 21, 16, 30);
    const result = search('NDLS', 'HWH', todayKey(lateAfternoon), lateAfternoon);
    const nowMinutes = 16 * 60 + 30;

    for (const train of result.trains) {
      const gone = train.departureMinutes <= nowMinutes;
      for (const offer of train.classes) {
        expect(offer.status === 'DEPARTED', `${train.number} @ ${train.departureMinutes}`).toBe(
          gone,
        );
      }
    }
  });

  it('opens tatkal the day before travel, and never in first class', () => {
    const tomorrow = search('NDLS', 'HWH', addDays(todayKey(TODAY), 1));
    const later = search('NDLS', 'HWH', addDays(todayKey(TODAY), 10));

    expect(tomorrow.trains.some((t) => t.classes.some((o) => o.tatkal))).toBe(true);
    expect(later.trains.some((t) => t.classes.some((o) => o.tatkal))).toBe(false);
    for (const train of tomorrow.trains) {
      for (const offer of train.classes.filter((entry) => entry.code === '1A')) {
        expect(offer.tatkal).toBe(false);
      }
    }
  });

  it('gives the same availability for the same train, class and date', () => {
    const first = search('NDLS', 'HWH').trains[0];
    const again = search('NDLS', 'HWH').trains[0];
    expect(again?.classes.map((o) => `${o.code}:${o.status}:${o.count}`)).toEqual(
      first?.classes.map((o) => `${o.code}:${o.status}:${o.count}`),
    );
  });
});

describe('train filters and sorts', () => {
  it('keeps only trains with an AC class', () => {
    for (const train of applyTrainFilters(route(), { acOnly: true })) {
      expect(train.classes.some((offer) => offer.ac)).toBe(true);
    }
  });

  it('keeps only trains with something to sell', () => {
    const available = applyTrainFilters(route(), { availableOnly: true });
    for (const train of available) {
      expect(train.classes.some((offer) => offer.bookable)).toBe(true);
      expect(cheapestFare(train)).not.toBeNull();
    }
    expect(available.length).toBeLessThanOrEqual(route().length);
  });

  it('keeps only the classes asked for, any-of', () => {
    for (const train of applyTrainFilters(route(), { classes: ['1A'] })) {
      expect(train.classes.some((offer) => offer.code === '1A')).toBe(true);
    }
    const one = applyTrainFilters(route(), { classes: ['1A'] }).length;
    const two = applyTrainFilters(route(), { classes: ['1A', 'SL'] }).length;
    expect(two).toBeGreaterThanOrEqual(one);
  });

  it('keeps only departures inside the chosen window', () => {
    for (const window of [0, 1, 2, 3]) {
      for (const train of applyTrainFilters(route(), { windows: [window] })) {
        expect(timeWindow(train.departureMinutes)).toBe(window);
      }
    }
  });

  it.each(['DEPARTURE', 'ARRIVAL', 'DURATION', 'FARE'] as const)('sorts by %s', (sort) => {
    const read = {
      DEPARTURE: (train: TrainDeparture) => train.departureMinutes,
      ARRIVAL: (train: TrainDeparture) => arrivalOf(train).minutes,
      DURATION: (train: TrainDeparture) => train.durationMinutes,
      FARE: (train: TrainDeparture) => cheapestFare(train) ?? Number.MAX_SAFE_INTEGER,
    }[sort];

    const up = applyTrainFilters(route(), { sort }).map(read);
    expect(up).toEqual([...up].sort((a, b) => a - b));

    const down = applyTrainFilters(route(), { sort, desc: true }).map(read);
    expect(down).toEqual([...down].sort((a, b) => b - a));
  });

  it('sorts a train with nothing to sell to the back on fare', () => {
    const trains = route();
    const sorted = applyTrainFilters(trains, { sort: 'FARE' });
    const firstUnsellable = sorted.findIndex((train) => cheapestFare(train) === null);
    if (firstUnsellable === -1) return;
    for (const train of sorted.slice(firstUnsellable)) {
      expect(cheapestFare(train)).toBeNull();
    }
  });

  it('never invents a train the search did not return', () => {
    const all = route();
    const filtered = applyTrainFilters(all, { acOnly: true, availableOnly: true });
    for (const train of filtered)
      expect(all.some((entry) => entry.number === train.number)).toBe(true);
  });

  it('lists only classes some train on the route actually offers', () => {
    const offered = classesOffered(route());
    for (const code of offered) {
      expect(route().some((train) => train.classes.some((offer) => offer.code === code))).toBe(
        true,
      );
    }
    // And in comfort order, so the chips read the way the tiles do.
    const orders = offered.map((code) => findClass(code)?.order ?? -1);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('train routes', () => {
  it('starts at the origin and ends at the destination', () => {
    for (const train of route()) {
      const halts = routeOf(train);
      expect(halts[0]?.station.code).toBe(train.origin.code);
      expect(halts[halts.length - 1]?.station.code).toBe(train.destination.code);
    }
  });

  it('calls at stations that are actually on the way', () => {
    const train = search('NDLS', 'MAS').trains[0];
    if (!train) throw new Error('no service');
    const cities = routeOf(train).map((halt) => halt.station.city);

    // The Delhi-Chennai corridor runs through the centre of the country.
    expect(
      cities.some((city) => ['Bhopal', 'Itarsi', 'Nagpur', 'Agra', 'Gwalior'].includes(city)),
    ).toBe(true);
    // And nowhere near the north-east.
    expect(cities).not.toContain('Guwahati');
    expect(cities).not.toContain('Amritsar');
  });

  it('runs its distances and its clock forwards', () => {
    for (const train of route()) {
      const halts = routeOf(train);
      for (let index = 1; index < halts.length; index += 1) {
        const previous = halts[index - 1];
        const current = halts[index];
        if (!previous || !current) throw new Error('missing halt');
        expect(current.km).toBeGreaterThanOrEqual(previous.km);
        expect(current.arrivalMinutes).toBeGreaterThanOrEqual(previous.arrivalMinutes);
      }
    }
  });

  it('calls at each city once', () => {
    for (const train of route()) {
      const cities = routeOf(train).map((halt) => halt.station.city);
      expect(new Set(cities).size).toBe(cities.length);
    }
  });

  it('lands its last halt on the arrival the card showed', () => {
    for (const train of route()) {
      const halts = routeOf(train);
      const last = halts[halts.length - 1];
      expect(last?.arrivalMinutes).toBe(train.departureMinutes + train.durationMinutes);
      expect(last?.dayOffset).toBe(arrivalOf(train).dayOffset);
    }
  });
});

describe('train formatting', () => {
  it('reads times on a 24-hour clock, as a timetable does', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(9 * 60 + 5)).toBe('09:05');
    expect(formatTime(12 * 60)).toBe('12:00');
    expect(formatTime(19 * 60 + 15)).toBe('19:15');
    expect(formatTime(25 * 60)).toBe('01:00');
  });

  it('reads durations in hours and padded minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(60 * 34 + 5)).toBe('34h 05m');
  });

  it('reads freshness the way the tiles print it', () => {
    expect(freshnessLabel(1)).toBe('a minute ago');
    expect(freshnessLabel(54)).toBe('54 minutes ago');
    expect(freshnessLabel(120)).toBe('2 hours ago');
    expect(freshnessLabel(60)).toBe('1 hour ago');
    expect(freshnessLabel(60 * 30)).toBe('1 day ago');
  });

  it('says All days rather than spelling out seven', () => {
    expect(runsOnLabel([true, true, true, true, true, true, true])).toBe('All days');
    expect(runsOnLabel([false, true, false, false, false, false, true])).toBe('Mon, Sat');
  });

  it('buckets a clock time into the right six hours', () => {
    expect(timeWindow(0)).toBe(0);
    expect(timeWindow(7 * 60)).toBe(1);
    expect(timeWindow(13 * 60)).toBe(2);
    expect(timeWindow(23 * 60)).toBe(3);
  });

  it('moves dates without drifting a day', () => {
    expect(addDays('2026-08-21', 1)).toBe('2026-08-22');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-08-21', -1)).toBe('2026-08-20');
    expect(weekdayOf('2026-08-21')).toBe(5);
  });
});
