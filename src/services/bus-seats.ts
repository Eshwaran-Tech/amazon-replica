import { rupeesToPaise, type Paise } from '@/lib/utils/money';

import type { BusDeparture } from './buses';

/**
 * Seat maps.
 *
 * Derived from the coach description the search already produced -- "A/C
 * Seater / Sleeper (2+1)" carries everything needed: whether there are berths,
 * and how many seats sit either side of the aisle. That keeps one source of
 * truth: a coach cannot advertise 2+1 in the list and lay out 2+2 on the map.
 *
 * Occupancy is deterministic per departure and per seat, so the map does not
 * reshuffle between a page load and the booking that follows it -- a seat that
 * was free when it was clicked is still free when the form posts.
 *
 * The conventions are real. Indian coaches are described by their across-aisle
 * split; sleepers carry a lower and an upper deck; and operators reserve a
 * handful of berths for women travelling alone, which is why `ladiesOnly`
 * exists rather than being decoration.
 */

export type SeatKind = 'SEATER' | 'SLEEPER';
export type Deck = 'LOWER' | 'UPPER';

export interface Seat {
  /** "L1", "U12" -- the label printed on the ticket. */
  id: string;
  deck: Deck;
  kind: SeatKind;
  /** Zero-based row from the front. */
  row: number;
  /** Column across the coach; the aisle sits between `aisleAfter` and the next. */
  column: number;
  available: boolean;
  ladiesOnly: boolean;
  fare: Paise;
}

export interface DeckLayout {
  deck: Deck;
  rows: number;
  columns: number;
  /** Aisle sits after this column index (zero-based). */
  aisleAfter: number;
  seats: Seat[];
}

export interface SeatMap {
  layouts: DeckLayout[];
  /** Every seat across both decks, for lookups. */
  seats: Seat[];
  totalSeats: number;
  availableSeats: number;
}

/** The largest party one booking may hold, as most operators cap it. */
export const MAX_SEATS_PER_BOOKING = 6;

function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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

/** "(2+1)" -> { left: 2, right: 1 }. Falls back to the commonest layout. */
export function parseSplit(coach: string): { left: number; right: number } {
  const match = /\((\d)\s*\+\s*(\d)\)/.exec(coach);
  const left = Number(match?.[1]);
  const right = Number(match?.[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { left: 2, right: 1 };
  return { left, right };
}

/** Which decks a coach has, and what sits on each. */
export function decksOf(coach: string): Array<{ deck: Deck; kind: SeatKind }> {
  const lower = coach.toLowerCase();
  const hasSleeper = lower.includes('sleeper');
  const hasSeater = lower.includes('seater');

  // "Seater / Sleeper" is the common Indian hybrid: seats below, berths above.
  if (hasSleeper && hasSeater) {
    return [
      { deck: 'LOWER', kind: 'SEATER' },
      { deck: 'UPPER', kind: 'SLEEPER' },
    ];
  }
  if (hasSleeper) {
    return [
      { deck: 'LOWER', kind: 'SLEEPER' },
      { deck: 'UPPER', kind: 'SLEEPER' },
    ];
  }
  return [{ deck: 'LOWER', kind: 'SEATER' }];
}

/** Rows on a deck. A berth takes about twice a seat's floor space. */
function rowsOn(kind: SeatKind): number {
  return kind === 'SLEEPER' ? 6 : 10;
}

/**
 * How many seats a coach description implies.
 *
 * The search uses this to bound the free-seat count it advertises. Without it a
 * coach could be listed with 44 seats left and open a 40-seat map, and the
 * first thing anyone would do on that page is count.
 */
export function coachCapacity(coach: string): number {
  const { left, right } = parseSplit(coach);
  return decksOf(coach).reduce((total, deck) => total + rowsOn(deck.kind) * (left + right), 0);
}

/**
 * The map for one departure.
 *
 * `seatsLeft` from the search is honoured: the map frees exactly that many
 * seats, so the number on the results card and the number on the map agree.
 * Anything else would be the sort of mismatch that makes a booking flow feel
 * fake the moment anyone counts.
 */
export function seatMapFor(bus: BusDeparture): SeatMap {
  const { left, right } = parseSplit(bus.coach);
  const columns = left + right;
  const decks = decksOf(bus.coach);

  // A berth takes about twice a seat's floor space, so a sleeper deck has
  // fewer rows than a seater one of the same length.
  const layouts: DeckLayout[] = [];
  const all: Seat[] = [];

  for (const { deck, kind } of decks) {
    const rows = rowsOn(kind);
    const seats: Seat[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const number = row * columns + column + 1;
        const id = `${deck === 'LOWER' ? 'L' : 'U'}${number}`;
        const random = makeRandom(hash(`${bus.id}:${id}`));

        // Berths and window seats carry a premium, as they do on a real sheet.
        const isWindow = column === 0 || column === columns - 1;
        const multiplier = (kind === 'SLEEPER' ? 1.15 : 1) * (isWindow ? 1.05 : 1);
        const fare = Math.round((bus.fare / 100) * multiplier);

        seats.push({
          id,
          deck,
          kind,
          row,
          column,
          // Filled in below, once the free count is known.
          available: false,
          ladiesOnly: random() < 0.08,
          fare: rupeesToPaise(fare),
        });
      }
    }

    layouts.push({ deck, rows, columns, aisleAfter: left - 1, seats });
    all.push(...seats);
  }

  // Free exactly `seatsLeft` of them, chosen deterministically. Sorting by a
  // per-seat hash gives a scatter rather than a block, which is what a
  // part-sold coach actually looks like.
  const order = [...all].sort(
    (a, b) => hash(`${bus.id}:free:${a.id}`) - hash(`${bus.id}:free:${b.id}`),
  );
  const free = Math.min(bus.seatsLeft, all.length);
  for (let index = 0; index < free; index += 1) {
    const seat = order[index];
    if (seat) seat.available = true;
  }

  return {
    layouts,
    seats: all,
    totalSeats: all.length,
    availableSeats: all.filter((seat) => seat.available).length,
  };
}

/** Looks a seat up on a departure's map. */
export function findSeat(bus: BusDeparture, seatId: string): Seat | undefined {
  return seatMapFor(bus).seats.find((seat) => seat.id === seatId);
}

export type SeatQuoteResult =
  | { ok: true; seats: Seat[]; total: Paise }
  | {
      ok: false;
      code: 'NONE_CHOSEN' | 'TOO_MANY' | 'UNKNOWN_SEAT' | 'TAKEN';
      message: string;
    };

/**
 * Prices a chosen set of seats.
 *
 * The total is summed here, on the server, from the map -- the browser sends
 * seat labels and nothing else. Same rule as the rest of the store: a request
 * has no field in which to assert an amount.
 */
export function quoteSeats(bus: BusDeparture, seatIds: string[]): SeatQuoteResult {
  const unique = Array.from(new Set(seatIds.map((seatId) => seatId.trim()).filter(Boolean)));

  if (unique.length === 0) {
    return { ok: false, code: 'NONE_CHOSEN', message: 'Choose at least one seat.' };
  }
  if (unique.length > MAX_SEATS_PER_BOOKING) {
    return {
      ok: false,
      code: 'TOO_MANY',
      message: `You can book up to ${MAX_SEATS_PER_BOOKING} seats at a time.`,
    };
  }

  const map = seatMapFor(bus);
  const chosen: Seat[] = [];

  for (const seatId of unique) {
    const seat = map.seats.find((entry) => entry.id === seatId);
    if (!seat) {
      return { ok: false, code: 'UNKNOWN_SEAT', message: 'That seat is not on this coach.' };
    }
    if (!seat.available) {
      return {
        ok: false,
        code: 'TAKEN',
        message: `Seat ${seat.id} has already gone. Pick another.`,
      };
    }
    chosen.push(seat);
  }

  return { ok: true, seats: chosen, total: chosen.reduce((sum, seat) => sum + seat.fare, 0) };
}
