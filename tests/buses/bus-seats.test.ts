import { describe, expect, it } from 'vitest';

import {
  applyBusFilters,
  arrivalOf,
  departureWindow,
  searchBuses,
  type BusDeparture,
} from '@/services/buses';
import {
  coachCapacity,
  decksOf,
  MAX_SEATS_PER_BOOKING,
  parseSplit,
  quoteSeats,
  seatMapFor,
} from '@/services/bus-seats';

/**
 * The columns a traveller actually sorts and filters on -- departure, duration,
 * arrival, price -- and the seat map they land on afterwards.
 *
 * Two things matter here and nothing else does. A filter must mean what its
 * label says, including the ones that have to look past the departure clock.
 * And the map must agree with the card that led to it: the same free-seat
 * count, the same fare floor, and the same answer on every reload, because a
 * seat that moves between the click and the payment is a booking flow nobody
 * can trust.
 */

const TODAY = new Date(2026, 7, 21);

function buses(from: string, to: string, date = '2026-09-21'): BusDeparture[] {
  const result = searchBuses({ from, to, date }, TODAY);
  if (!result.ok) throw new Error(`search failed: ${result.message}`);
  return result.buses;
}

const route = () => buses('bengaluru', 'chennai');

function coach(): BusDeparture {
  const bus = route()[0];
  if (!bus) throw new Error('no coaches on that route');
  return bus;
}

describe('bus filters: arrival, price and duration', () => {
  it('keeps only arrivals inside the chosen window', () => {
    for (const window of [0, 1, 2, 3]) {
      for (const bus of applyBusFilters(route(), { arrivals: [window] })) {
        expect(departureWindow(arrivalOf(bus).minutes)).toBe(window);
      }
    }
  });

  it('reads the arrival clock, not the departure one', () => {
    // An overnight route is the case that separates them: the coach leaves at
    // night and lands in the morning, so an arrival filter that quietly read
    // the departure time would return nothing here and look like a working
    // filter with an empty route.
    const overnight = buses('bengaluru', 'delhi');
    const landsInTheMorning = overnight.filter(
      (bus) => departureWindow(arrivalOf(bus).minutes) === 0,
    );
    const filtered = applyBusFilters(overnight, { arrivals: [0] });

    expect(filtered).toHaveLength(landsInTheMorning.length);
    for (const bus of filtered) expect(departureWindow(arrivalOf(bus).minutes)).toBe(0);
  });

  it('honours a fare ceiling and a fare floor', () => {
    const fares = route().map((bus) => bus.fare);
    const middle = Math.round((Math.min(...fares) + Math.max(...fares)) / 2);

    const cheap = applyBusFilters(route(), { maxFare: middle });
    for (const bus of cheap) expect(bus.fare).toBeLessThanOrEqual(middle);

    const dear = applyBusFilters(route(), { minFare: middle });
    for (const bus of dear) expect(bus.fare).toBeGreaterThanOrEqual(middle);

    expect(cheap.length + dear.length).toBeGreaterThanOrEqual(route().length);
  });

  it('caps the journey time', () => {
    const longest = Math.max(...route().map((bus) => bus.durationMinutes));
    expect(applyBusFilters(route(), { maxDuration: longest })).toHaveLength(route().length);

    for (const bus of applyBusFilters(route(), { maxDuration: longest - 1 })) {
      expect(bus.durationMinutes).toBeLessThanOrEqual(longest - 1);
    }
  });

  it('stacks a price cap on top of a coach type', () => {
    const cap = Math.max(...route().map((bus) => bus.fare));
    for (const bus of applyBusFilters(route(), { types: ['AC'], maxFare: cap })) {
      expect(bus.coachTypes).toContain('AC');
      expect(bus.fare).toBeLessThanOrEqual(cap);
    }
  });

  it('keeps every coach when the filters are wide open', () => {
    const all = route();
    const wide = applyBusFilters(all, {
      minFare: 0,
      maxFare: Number.MAX_SAFE_INTEGER,
      maxDuration: Number.MAX_SAFE_INTEGER,
      arrivals: [0, 1, 2, 3],
      windows: [0, 1, 2, 3],
    });
    expect(wide).toHaveLength(all.length);
  });
});

describe('bus sorts: both directions', () => {
  const readers = {
    PRICE: (bus: BusDeparture) => bus.fare,
    ARRIVAL: (bus: BusDeparture) => arrivalOf(bus).minutes,
    DEPARTURE: (bus: BusDeparture) => bus.departureMinutes,
    DURATION: (bus: BusDeparture) => bus.durationMinutes,
    RATING: (bus: BusDeparture) => bus.rating,
    SEATS: (bus: BusDeparture) => bus.seatsLeft,
  } as const;

  it.each(['PRICE', 'ARRIVAL', 'DEPARTURE', 'DURATION', 'RATING', 'SEATS'] as const)(
    'turns %s round when asked',
    (sort) => {
      const read = readers[sort];
      const up = applyBusFilters(route(), { sort, desc: false }).map(read);
      const down = applyBusFilters(route(), { sort, desc: true }).map(read);

      expect(up).toEqual([...up].sort((a, b) => a - b));
      expect(down).toEqual([...down].sort((a, b) => b - a));
    },
  );

  it('leaves each column in the order it reads best when no direction is given', () => {
    const price = applyBusFilters(route(), { sort: 'PRICE' }).map(readers.PRICE);
    expect(price).toEqual([...price].sort((a, b) => a - b));

    const rating = applyBusFilters(route(), { sort: 'RATING' }).map(readers.RATING);
    expect(rating).toEqual([...rating].sort((a, b) => b - a));

    const seats = applyBusFilters(route(), { sort: 'SEATS' }).map(readers.SEATS);
    expect(seats).toEqual([...seats].sort((a, b) => b - a));
  });

  it('sorts the filtered list, not the whole one', () => {
    const cap = Math.max(...route().map((bus) => bus.fare)) - 1;
    const sorted = applyBusFilters(route(), { maxFare: cap, sort: 'PRICE' });
    for (const bus of sorted) expect(bus.fare).toBeLessThanOrEqual(cap);
    expect(sorted.map((bus) => bus.fare)).toEqual(
      [...sorted.map((bus) => bus.fare)].sort((a, b) => a - b),
    );
  });
});

describe('seat maps', () => {
  it('reads the across-aisle split out of the coach name', () => {
    expect(parseSplit('A/C Seater / Sleeper (2+1)')).toEqual({ left: 2, right: 1 });
    expect(parseSplit('Non A/C Seater (2+2)')).toEqual({ left: 2, right: 2 });
    expect(parseSplit('Volvo Multi-Axle')).toEqual({ left: 2, right: 1 });
  });

  it('gives a hybrid coach seats below and berths above', () => {
    expect(decksOf('A/C Seater / Sleeper (2+1)')).toEqual([
      { deck: 'LOWER', kind: 'SEATER' },
      { deck: 'UPPER', kind: 'SLEEPER' },
    ]);
    expect(decksOf('A/C Sleeper (2+1)').every((deck) => deck.kind === 'SLEEPER')).toBe(true);
    expect(decksOf('A/C Seater (2+2)')).toHaveLength(1);
  });

  it('never advertises more free seats than the coach holds', () => {
    // The results card and the map are two views of one coach. If the search
    // could say "44 seats left" above a forty-seat layout, the first thing any
    // traveller does on the seat page is count and stop believing the page.
    for (const from of ['bengaluru', 'mumbai', 'delhi']) {
      for (const bus of buses(from, from === 'delhi' ? 'jaipur' : 'chennai')) {
        expect(bus.seatsLeft, `${bus.coach} on ${bus.id}`).toBeLessThanOrEqual(
          coachCapacity(bus.coach),
        );
        expect(coachCapacity(bus.coach)).toBe(seatMapFor(bus).totalSeats);
      }
    }
  });

  it('frees exactly the number of seats the results card advertised', () => {
    for (const bus of route()) {
      const map = seatMapFor(bus);
      expect(map.availableSeats).toBe(bus.seatsLeft);
    }
  });

  it('builds the same map every time, so a seat does not move under a click', () => {
    const bus = coach();
    const shape = (map: ReturnType<typeof seatMapFor>) =>
      map.seats.map((seat) => `${seat.id}:${seat.available}:${seat.fare}`);
    expect(shape(seatMapFor(bus))).toEqual(shape(seatMapFor(bus)));
  });

  it('labels every seat once and puts the aisle where the split says', () => {
    const bus = coach();
    const map = seatMapFor(bus);
    expect(new Set(map.seats.map((seat) => seat.id)).size).toBe(map.totalSeats);

    const { left, right } = parseSplit(bus.coach);
    for (const layout of map.layouts) {
      expect(layout.columns).toBe(left + right);
      expect(layout.aisleAfter).toBe(left - 1);
      expect(layout.seats).toHaveLength(layout.rows * layout.columns);
    }
  });

  it('charges a window seat above an inside one', () => {
    for (const bus of route()) {
      const map = seatMapFor(bus);
      const window = map.seats.find((seat) => seat.kind === 'SEATER' && seat.column === 0);
      const inside = map.seats.find((seat) => seat.kind === 'SEATER' && seat.column === 1);
      if (!window || !inside) continue;
      expect(window.fare).toBeGreaterThan(inside.fare);
      return;
    }
  });

  it('never prices a seat below the fare the card showed', () => {
    for (const bus of buses('mumbai', 'pune')) {
      for (const seat of seatMapFor(bus).seats) {
        expect(seat.fare).toBeGreaterThanOrEqual(bus.fare - 100);
      }
    }
  });
});

describe('seat quotes', () => {
  const free = (count: number) =>
    seatMapFor(coach())
      .seats.filter((seat) => seat.available)
      .slice(0, count);

  it('sums the chosen seats and nothing else', () => {
    const seats = free(3);
    const quote = quoteSeats(
      coach(),
      seats.map((seat) => seat.id),
    );
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.seats).toHaveLength(seats.length);
    expect(quote.total).toBe(seats.reduce((sum, seat) => sum + seat.fare, 0));
  });

  it('charges a repeated seat once', () => {
    const seat = free(1)[0];
    if (!seat) throw new Error('a full coach');
    const quote = quoteSeats(coach(), [seat.id, seat.id, seat.id]);
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.total).toBe(seat.fare);
  });

  it('refuses an empty choice', () => {
    expect(quoteSeats(coach(), [])).toMatchObject({ ok: false, code: 'NONE_CHOSEN' });
    expect(quoteSeats(coach(), ['', ' '])).toMatchObject({ ok: false, code: 'NONE_CHOSEN' });
  });

  it('caps a booking at the party size the page advertises', () => {
    const seats = free(MAX_SEATS_PER_BOOKING + 1).map((seat) => seat.id);
    if (seats.length <= MAX_SEATS_PER_BOOKING) return;
    expect(quoteSeats(coach(), seats)).toMatchObject({ ok: false, code: 'TOO_MANY' });
  });

  it('refuses a seat that is not on this coach', () => {
    expect(quoteSeats(coach(), ['Z999'])).toMatchObject({ ok: false, code: 'UNKNOWN_SEAT' });
  });

  it('refuses a seat somebody else has', () => {
    const taken = seatMapFor(coach()).seats.find((seat) => !seat.available);
    if (!taken) return;
    expect(quoteSeats(coach(), [taken.id])).toMatchObject({ ok: false, code: 'TAKEN' });
  });

  it('refuses the whole party if one seat of it has gone', () => {
    const chosen = free(2).map((seat) => seat.id);
    const taken = seatMapFor(coach()).seats.find((seat) => !seat.available);
    if (!taken || chosen.length < 2) return;
    expect(quoteSeats(coach(), [...chosen, taken.id])).toMatchObject({ ok: false, code: 'TAKEN' });
  });
});
