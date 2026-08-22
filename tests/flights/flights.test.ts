import { describe, expect, it } from 'vitest';

import { AIRPORTS, distanceKm, findAirport, searchAirports } from '@/data/airports';
import { AIRLINES } from '@/data/airlines';
import { applyFilters, arrivalOf, searchFlights, type FlightSearchInput } from '@/services/flights';

/**
 * Flight search verification.
 *
 * The generator is the interesting part: it must be reproducible, it must not
 * invent impossible schedules, and its numbers must follow from the route
 * rather than from nowhere.
 */

const TODAY = new Date(2026, 7, 19); // 19 Aug 2026, local.

function input(overrides: Partial<FlightSearchInput> = {}): FlightSearchInput {
  return { from: 'DEL', to: 'BOM', date: '2026-09-01', travellers: 1, cabin: 'ECONOMY', ...overrides };
}

describe('airports', () => {
  it('has unique codes and plausible coordinates', () => {
    const codes = new Set(AIRPORTS.map((airport) => airport.code));
    expect(codes.size).toBe(AIRPORTS.length);

    for (const airport of AIRPORTS) {
      expect(Math.abs(airport.latitude), airport.code).toBeLessThanOrEqual(90);
      expect(Math.abs(airport.longitude), airport.code).toBeLessThanOrEqual(180);
    }
  });

  it('measures known distances about right', () => {
    const del = findAirport('DEL');
    const bom = findAirport('BOM');
    if (!del || !bom) throw new Error('missing airport');

    // Delhi-Mumbai is roughly 1150 km great-circle.
    const km = distanceKm(del, bom);
    expect(km).toBeGreaterThan(1050);
    expect(km).toBeLessThan(1250);
  });

  it('finds an airport by code, city or name', () => {
    expect(searchAirports('BOM')[0]?.code).toBe('BOM');
    expect(searchAirports('mumbai')[0]?.code).toBe('BOM');
    expect(searchAirports('kempegowda')[0]?.code).toBe('BLR');
  });
});

describe('flight search: reproducibility', () => {
  it('returns the same flights for the same search', () => {
    const a = searchFlights(input(), TODAY);
    const b = searchFlights(input(), TODAY);
    if (!a.ok || !b.ok) throw new Error('search failed');

    expect(a.flights.map((flight) => flight.id)).toEqual(b.flights.map((flight) => flight.id));
    expect(a.flights.map((flight) => flight.fare)).toEqual(b.flights.map((flight) => flight.fare));
  });

  it('returns different flights on a different date', () => {
    const a = searchFlights(input({ date: '2026-09-01' }), TODAY);
    const b = searchFlights(input({ date: '2026-09-02' }), TODAY);
    if (!a.ok || !b.ok) throw new Error('search failed');

    expect(a.flights.map((f) => f.flightNumber)).not.toEqual(b.flights.map((f) => f.flightNumber));
  });
});

describe('flight search: the schedules make sense', () => {
  it('never departs outside the day or lands before it leaves', () => {
    const result = searchFlights(input(), TODAY);
    if (!result.ok) throw new Error('search failed');

    for (const flight of result.flights) {
      expect(flight.departureMinutes).toBeGreaterThanOrEqual(0);
      expect(flight.departureMinutes).toBeLessThan(24 * 60);
      expect(flight.durationMinutes).toBeGreaterThan(0);
      expect(arrivalOf(flight).minutes).toBeGreaterThanOrEqual(0);
    }
  });

  it('gives every flight a distinct flight number', () => {
    const result = searchFlights(input(), TODAY);
    if (!result.ok) throw new Error('search failed');

    const numbers = result.flights.map((flight) => flight.flightNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('routes a one-stop flight through neither endpoint', () => {
    const result = searchFlights(input({ from: 'BLR', to: 'JFK' }), TODAY);
    if (!result.ok) throw new Error('search failed');

    for (const flight of result.flights.filter((entry) => entry.stops === 1)) {
      expect(flight.via).not.toBe('BLR');
      expect(flight.via).not.toBe('JFK');
      expect(flight.via).toBeTruthy();
    }
  });

  it('puts only international carriers on an international route', () => {
    const result = searchFlights(input({ from: 'DEL', to: 'SIN' }), TODAY);
    if (!result.ok) throw new Error('search failed');

    for (const flight of result.flights) {
      expect(flight.airline.international, flight.airline.name).toBe(true);
    }
  });

  it('puts only domestic carriers on a domestic route', () => {
    const result = searchFlights(input({ from: 'DEL', to: 'IDR' }), TODAY);
    if (!result.ok) throw new Error('search failed');

    for (const flight of result.flights) {
      expect(flight.airline.domestic, flight.airline.name).toBe(true);
    }
  });
});

describe('flight search: fares follow the route', () => {
  it('charges more for a longer flight', () => {
    const near = searchFlights(input({ from: 'DEL', to: 'JAI' }), TODAY);
    const far = searchFlights(input({ from: 'DEL', to: 'SIN' }), TODAY);
    if (!near.ok || !far.ok) throw new Error('search failed');

    const cheapest = (flights: typeof near.flights) => Math.min(...flights.map((f) => f.fare));
    expect(cheapest(far.flights)).toBeGreaterThan(cheapest(near.flights));
  });

  it('charges more for business than economy on the same flight', () => {
    const economy = searchFlights(input({ cabin: 'ECONOMY' }), TODAY);
    const business = searchFlights(input({ cabin: 'BUSINESS' }), TODAY);
    if (!economy.ok || !business.ok) throw new Error('search failed');

    expect(business.flights[0]?.fare).toBeGreaterThan(economy.flights[0]?.fare ?? 0);
  });

  it('charges more for tomorrow than for a month out', () => {
    const soon = searchFlights(input({ date: '2026-08-20' }), TODAY);
    const later = searchFlights(input({ date: '2026-10-20' }), TODAY);
    if (!soon.ok || !later.ok) throw new Error('search failed');

    const average = (flights: typeof soon.flights) =>
      flights.reduce((sum, flight) => sum + flight.fare, 0) / flights.length;
    expect(average(soon.flights)).toBeGreaterThan(average(later.flights));
  });

  it('quotes whole paise only', () => {
    const result = searchFlights(input(), TODAY);
    if (!result.ok) throw new Error('search failed');

    for (const flight of result.flights) {
      expect(Number.isSafeInteger(flight.fare), flight.flightNumber).toBe(true);
      expect(flight.fare).toBeGreaterThan(0);
    }
  });
});

describe('flight search: bad input', () => {
  it('refuses an unknown airport', () => {
    const result = searchFlights(input({ to: 'ZZZ' }), TODAY);
    expect(result.ok).toBe(false);
  });

  it('refuses the same origin and destination', () => {
    const result = searchFlights(input({ to: 'DEL' }), TODAY);
    expect(result.ok).toBe(false);
  });
});

describe('flight filters', () => {
  it('keeps only non-stop flights when asked', () => {
    const result = searchFlights(input({ from: 'DEL', to: 'SIN' }), TODAY);
    if (!result.ok) throw new Error('search failed');

    for (const flight of applyFilters(result.flights, { stops: 'NONSTOP' })) {
      expect(flight.stops).toBe(0);
    }
  });

  it('sorts by price ascending', () => {
    const result = searchFlights(input(), TODAY);
    if (!result.ok) throw new Error('search failed');

    const fares = applyFilters(result.flights, { sort: 'PRICE_ASC' }).map((f) => f.fare);
    expect([...fares].sort((a, b) => a - b)).toEqual(fares);
  });

  it('keeps only the chosen airline', () => {
    const result = searchFlights(input(), TODAY);
    if (!result.ok) throw new Error('search failed');

    const code = result.flights[0]?.airline.code;
    if (!code) throw new Error('no flights');

    for (const flight of applyFilters(result.flights, { airlines: [code] })) {
      expect(flight.airline.code).toBe(code);
    }
  });

  it('does not mutate the list it was given', () => {
    const result = searchFlights(input(), TODAY);
    if (!result.ok) throw new Error('search failed');

    const before = result.flights.map((flight) => flight.id);
    applyFilters(result.flights, { sort: 'PRICE_DESC' });
    expect(result.flights.map((flight) => flight.id)).toEqual(before);
  });
});

describe('airlines', () => {
  it('has unique codes and a sane fare index', () => {
    const codes = new Set(AIRLINES.map((airline) => airline.code));
    expect(codes.size).toBe(AIRLINES.length);

    for (const airline of AIRLINES) {
      expect(airline.fareIndex, airline.name).toBeGreaterThan(0.5);
      expect(airline.fareIndex, airline.name).toBeLessThan(2);
    }
  });
});
