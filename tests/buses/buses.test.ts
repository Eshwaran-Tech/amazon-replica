import { describe, expect, it } from 'vitest';

import { BUS_CITIES, findCity, POPULAR_CITIES, roadKm, searchCities } from '@/data/bus-cities';
import { AMENITIES, COACH_TYPES, coachTypes } from '@/data/bus-operators';
import { holidayOn, holidaysInMonth, isBusyDay } from '@/data/holidays';
import {
  applyBusFilters,
  arrivalOf,
  cheapestFareFor,
  departureWindow,
  formatDuration,
  formatTime,
  searchBuses,
} from '@/services/buses';

/**
 * Bus search.
 *
 * The whole point of a generated timetable is that it is stable and derived
 * from something real. So: the same route and date must return the same
 * coaches every time, distance must actually drive duration and fare, and every
 * filter and sort must do what its label says.
 */

const TODAY = new Date(2026, 7, 21); // 21 Aug 2026, matching the reference.

function buses(from: string, to: string, date = '2026-09-21') {
  const result = searchBuses({ from, to, date }, TODAY);
  if (!result.ok) throw new Error(`search failed: ${result.message}`);
  return result;
}

describe('bus cities', () => {
  it('finds a city by id, and nothing by a bad one', () => {
    expect(findCity('bengaluru')?.name).toBe('Bengaluru');
    expect(findCity('atlantis')).toBeUndefined();
    expect(findCity(null)).toBeUndefined();
  });

  it('offers the popular list before anyone types', () => {
    expect(searchCities('')).toEqual(POPULAR_CITIES);
    expect(POPULAR_CITIES.length).toBeGreaterThanOrEqual(6);
  });

  it('matches on name and on state', () => {
    expect(searchCities('beng').map((city) => city.id)).toContain('bengaluru');
    expect(searchCities('kerala').map((city) => city.state)).toContain('Kerala');
  });

  it('gives every city a unique id', () => {
    const ids = new Set(BUS_CITIES.map((city) => city.id));
    expect(ids.size).toBe(BUS_CITIES.length);
  });

  it('puts real distances between real cities', () => {
    const blr = findCity('bengaluru');
    const maa = findCity('chennai');
    const del = findCity('delhi');
    if (!blr || !maa || !del) throw new Error('missing city');

    // Bengaluru-Chennai is ~350 km by NH48; Bengaluru-Delhi is ~2,150 km.
    expect(roadKm(blr, maa)).toBeGreaterThan(300);
    expect(roadKm(blr, maa)).toBeLessThan(400);
    expect(roadKm(blr, del)).toBeGreaterThan(2000);
    expect(roadKm(blr, del)).toBeLessThan(2400);
  });
});

describe('holidays', () => {
  it('knows the fixed-date national holidays', () => {
    expect(holidayOn('2026-01-26')?.name).toBe('Republic Day');
    expect(holidayOn('2026-08-15')?.name).toBe('Independence Day');
    expect(holidayOn('2026-10-02')?.name).toBe('Gandhi Jayanti');
    expect(holidayOn('2026-12-25')?.name).toBe('Christmas Day');
  });

  it('counts them per month, which is what the calendar header shows', () => {
    // The reference's own screenshot: August 2026 has three.
    expect(holidaysInMonth(2026, 7)).toHaveLength(3);
    expect(holidaysInMonth(2026, 8)).toHaveLength(2);
  });

  it('treats weekends and holidays as busy travel days', () => {
    expect(isBusyDay('2026-08-15')).toBe(true); // Independence Day, a Saturday
    expect(isBusyDay('2026-08-23')).toBe(true); // Sunday
    expect(isBusyDay('2026-08-20')).toBe(false); // an ordinary Thursday
  });

  it('says nothing rather than guessing for an unlisted year', () => {
    expect(holidaysInMonth(2035, 0)).toEqual([]);
  });
});

describe('bus search', () => {
  it('refuses an unknown city', () => {
    const result = searchBuses({ from: 'atlantis', to: 'chennai', date: '2026-09-21' }, TODAY);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_CITY');
  });

  it('refuses a journey to the city you are in', () => {
    const result = searchBuses({ from: 'chennai', to: 'chennai', date: '2026-09-21' }, TODAY);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('SAME_CITY');
  });

  it('returns the same coaches every time for a route and date', () => {
    const first = buses('bengaluru', 'chennai');
    const second = buses('bengaluru', 'chennai');
    expect(first.buses.map((bus) => `${bus.id}:${bus.fare}:${bus.departureMinutes}`)).toEqual(
      second.buses.map((bus) => `${bus.id}:${bus.fare}:${bus.departureMinutes}`),
    );
  });

  it('returns a different timetable on a different date', () => {
    const a = buses('bengaluru', 'chennai', '2026-09-21');
    const b = buses('bengaluru', 'chennai', '2026-09-22');
    expect(a.buses.map((bus) => bus.fare)).not.toEqual(b.buses.map((bus) => bus.fare));
  });

  it('takes longer and costs more the further it goes', () => {
    const near = buses('bengaluru', 'mysuru');
    const far = buses('bengaluru', 'delhi');

    const shortest = (list: typeof near.buses) => Math.min(...list.map((b) => b.durationMinutes));
    const cheapest = (list: typeof near.buses) => Math.min(...list.map((b) => b.fare));

    expect(shortest(far.buses)).toBeGreaterThan(shortest(near.buses));
    expect(cheapest(far.buses)).toBeGreaterThan(cheapest(near.buses));
  });

  it('runs more coaches on a short hop than on a two-night trunk route', () => {
    expect(buses('mumbai', 'pune').buses.length).toBeGreaterThan(
      buses('bengaluru', 'delhi').buses.length,
    );
  });

  it('charges more on a holiday than on the ordinary day beside it', () => {
    // 2 Oct 2026 is Gandhi Jayanti; 1 Oct is not.
    const holiday = Math.min(...buses('mumbai', 'pune', '2026-10-02').buses.map((b) => b.fare));
    const ordinary = Math.min(...buses('mumbai', 'pune', '2026-10-01').buses.map((b) => b.fare));
    expect(holiday).toBeGreaterThan(ordinary * 1.05);
  });

  it('keeps every departure inside a real day and a sane fare', () => {
    for (const bus of buses('chennai', 'coimbatore').buses) {
      expect(bus.departureMinutes).toBeGreaterThanOrEqual(0);
      expect(bus.departureMinutes).toBeLessThan(1440);
      expect(bus.durationMinutes).toBeGreaterThan(0);
      expect(bus.fare).toBeGreaterThan(0);
      expect(Number.isSafeInteger(bus.fare)).toBe(true);
      expect(bus.rating).toBeGreaterThanOrEqual(1);
      expect(bus.rating).toBeLessThanOrEqual(5);
      expect(bus.seatsLeft).toBeGreaterThan(0);
    }
  });

  it('never strikes through a price lower than the one charged', () => {
    for (const bus of buses('bengaluru', 'chennai').buses) {
      if (bus.listFare !== null) expect(bus.listFare).toBeGreaterThan(bus.fare);
    }
  });

  it('lands an overnight coach on the next day', () => {
    const overnight = buses('bengaluru', 'delhi').buses[0];
    if (!overnight) throw new Error('no coaches on that route');
    expect(arrivalOf(overnight).dayOffset).toBeGreaterThanOrEqual(1);
  });
});

describe('bus filters and sorts', () => {
  const route = () => buses('bengaluru', 'chennai').buses;

  it('keeps only the coach types asked for', () => {
    const sleepers = applyBusFilters(route(), { types: ['Sleeper'] });
    for (const bus of sleepers) expect(bus.coachTypes).toContain('Sleeper');
    expect(sleepers.length).toBeLessThan(route().length);
  });

  it('treats bus types as any-of, so two ticks widen the list', () => {
    const ac = applyBusFilters(route(), { types: ['AC'] }).length;
    const both = applyBusFilters(route(), { types: ['AC', 'Non AC'] }).length;
    expect(both).toBeGreaterThanOrEqual(ac);
  });

  it('keeps only departures inside the chosen window', () => {
    const morning = applyBusFilters(route(), { windows: [0] });
    for (const bus of morning) expect(departureWindow(bus.departureMinutes)).toBe(0);
  });

  it('treats amenities as all-of, so two ticks narrow the list', () => {
    const wifi = applyBusFilters(route(), { amenities: ['Wifi'] }).length;
    const both = applyBusFilters(route(), { amenities: ['Wifi', 'Blankets'] }).length;
    expect(both).toBeLessThanOrEqual(wifi);
    for (const bus of applyBusFilters(route(), { amenities: ['Wifi', 'Blankets'] })) {
      expect(bus.amenities).toContain('Wifi');
      expect(bus.amenities).toContain('Blankets');
    }
  });

  it('keeps only trackable coaches when asked', () => {
    for (const bus of applyBusFilters(route(), { liveTrackable: true })) {
      expect(bus.liveTrackable).toBe(true);
    }
  });

  it.each([
    ['PRICE', (bus: { fare: number }) => bus.fare, 'asc'],
    ['DEPARTURE', (bus: { departureMinutes: number }) => bus.departureMinutes, 'asc'],
    ['DURATION', (bus: { durationMinutes: number }) => bus.durationMinutes, 'asc'],
    ['RATING', (bus: { rating: number }) => bus.rating, 'desc'],
    ['SEATS', (bus: { seatsLeft: number }) => bus.seatsLeft, 'desc'],
  ] as const)('sorts by %s', (sort, read, direction) => {
    const values = applyBusFilters(route(), { sort }).map(read);
    const expected = [...values].sort((a, b) => (direction === 'asc' ? a - b : b - a));
    expect(values).toEqual(expected);
  });

  it('never invents a coach the search did not return', () => {
    const all = route();
    const filtered = applyBusFilters(all, { types: ['AC'], liveTrackable: true });
    for (const bus of filtered) expect(all.some((entry) => entry.id === bus.id)).toBe(true);
  });
});

describe('bus formatting', () => {
  it('reads times as a 12-hour clock', () => {
    expect(formatTime(0)).toBe('12:00 AM');
    expect(formatTime(9 * 60 + 5)).toBe('09:05 AM');
    expect(formatTime(12 * 60)).toBe('12:00 PM');
    expect(formatTime(19 * 60 + 15)).toBe('07:15 PM');
  });

  it('wraps past midnight rather than printing a 25th hour', () => {
    expect(formatTime(25 * 60)).toBe('01:00 AM');
  });

  it('reads durations in hours and minutes', () => {
    expect(formatDuration(49 * 60)).toBe('49h 0m');
    expect(formatDuration(46 * 60 + 15)).toBe('46h 15m');
  });

  it('puts every departure in exactly one window', () => {
    for (const minutes of [0, 5 * 60, 6 * 60, 11 * 60, 12 * 60, 17 * 60, 18 * 60, 23 * 60]) {
      const window = departureWindow(minutes);
      expect(window).toBeGreaterThanOrEqual(0);
      expect(window).toBeLessThan(4);
    }
    expect(departureWindow(7 * 60)).toBe(0);
    expect(departureWindow(13 * 60)).toBe(1);
    expect(departureWindow(21 * 60)).toBe(2);
    expect(departureWindow(3 * 60)).toBe(3);
  });
});

describe('bus data shape', () => {
  it('classifies every operator coach into a known type', () => {
    for (const bus of buses('bengaluru', 'chennai').buses) {
      expect(bus.coachTypes.length).toBeGreaterThan(0);
      for (const type of bus.coachTypes) expect(COACH_TYPES).toContain(type);
    }
  });

  it('only ever lists amenities the filter offers', () => {
    for (const bus of buses('mumbai', 'pune').buses) {
      for (const amenity of bus.amenities) expect(AMENITIES).toContain(amenity);
    }
  });

  it('reads a non-A/C coach as Non AC and never as AC', () => {
    expect(coachTypes('Non A/C Sleeper (2+1)')).toContain('Non AC');
    expect(coachTypes('Non A/C Sleeper (2+1)')).not.toContain('AC');
    expect(coachTypes('A/C Seater / Sleeper (2+1)')).toContain('AC');
  });

  it('prices the calendar strip from the same search the results use', () => {
    const cheapest = cheapestFareFor('bengaluru', 'chennai', '2026-09-21', TODAY);
    const fromResults = Math.min(...buses('bengaluru', 'chennai').buses.map((bus) => bus.fare));
    expect(cheapest).toBe(fromResults);
  });

  it('returns no fare for a route it cannot serve', () => {
    expect(cheapestFareFor('atlantis', 'chennai', '2026-09-21', TODAY)).toBeNull();
  });
});
