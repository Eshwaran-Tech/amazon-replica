/**
 * Deriving a bill from a consumer number.
 *
 * **There is no biller integration here, and every page says so.** A real bill
 * payment page asks a discom, a bank or a municipality what you owe. Nothing in
 * this store can ask anybody, so the account behind a consumer number is
 * *derived from the number itself* -- deterministically, so the same number
 * always produces the same account, and the same bill, on every machine.
 *
 * That is a guess dressed as nothing but a guess. What it is not is a random
 * number: a bill that changed on every page load would be worse than useless,
 * and a bill that came from `Math.random()` could not be tested at all. The
 * arithmetic *on top* of the derived reading -- the tariff slabs, the minimum
 * due, the amortisation -- is the real published convention, and that is the
 * part worth getting right.
 *
 * Same technique as `data/catalog.ts`, `services/hotels.ts` and the rest of the
 * project's generators, for the same reasons.
 */

/** FNV-1a, matching the rest of the project's deterministic generators. */
export function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 -- small, fast, seedable. No `Math.random()` anywhere. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One account's PRNG.
 *
 * Seeded on the biller *and* the number, so the same consumer number at two
 * different billers is two different accounts -- which is what it would be.
 */
export function accountRandom(billerId: string, account: string): () => number {
  return makeRandom(hash(`${billerId}:${account.toUpperCase()}`));
}

export function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length) % items.length];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}

/** An integer in [min, max], inclusive. */
export function between(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * A billing cycle that ends in the recent past.
 *
 * `now` is passed in rather than read, so a test can pin it and a generated
 * bill never depends on when the page happened to render.
 */
export interface Cycle {
  from: Date;
  to: Date;
  /** When payment is due. */
  dueOn: Date;
  /** Days late, or 0 if it is not. */
  daysLate: number;
  label: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The cycle a bill covers.
 *
 * `months` is 1 for a monthly bill and 2 for the bi-monthly ones -- water and
 * piped gas are genuinely read every two months in most of the country, and a
 * page that showed a monthly water bill would be quietly wrong about the unit
 * everything else on it is priced in.
 */
export function cycleFor(
  random: () => number,
  now: Date,
  options: { months?: number; dueInDays?: number } = {},
): Cycle {
  const months = options.months ?? 1;
  const dueInDays = options.dueInDays ?? 18;

  // The reading was taken somewhere in the last few weeks, not today.
  const readingLagDays = between(random, 4, 16);

  const to = new Date(now);
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() - readingLagDays);

  const from = new Date(to);
  from.setMonth(from.getMonth() - months);
  from.setDate(from.getDate() + 1);

  const dueOn = new Date(to);
  dueOn.setDate(dueOn.getDate() + dueInDays);

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const daysLate = Math.max(
    0,
    Math.floor((midnight.getTime() - dueOn.getTime()) / (24 * 60 * 60 * 1000)),
  );

  const label =
    months === 1
      ? `${MONTHS[to.getMonth()]} ${to.getFullYear()}`
      : `${MONTHS[from.getMonth()]} to ${MONTHS[to.getMonth()]} ${to.getFullYear()}`;

  return { from, to, dueOn, daysLate, label };
}

/** A name for the account holder, so a fetched bill is recognisable. */
const FIRST = ['A', 'B', 'D', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'V'] as const;
const SURNAMES = [
  'Iyer',
  'Nair',
  'Rao',
  'Sharma',
  'Banerjee',
  'Patel',
  'Reddy',
  'Menon',
  'Joshi',
  'Kulkarni',
  'Ghosh',
  'Chauhan',
  'Pillai',
  'Desai',
  'Bhat',
] as const;

/**
 * The name on the account, initialled.
 *
 * Initials rather than a full first name: a bill is shown to whoever typed the
 * number, and a derived full name would read as a real person's record having
 * been looked up. An initial is enough to recognise your own account by.
 */
export function holderName(random: () => number): string {
  return `${pick(FIRST, random)} ${pick(SURNAMES, random)}`;
}

/**
 * A telescopic slab charge.
 *
 * Telescopic means each slab is charged at *its own* rate for the units that
 * fall inside it -- 250 units is not 250 at the 201-400 rate, it is 100 at the
 * first rate, 100 at the second and 50 at the third. Getting this wrong is the
 * single commonest error in a tariff calculator, and it overcharges by a lot.
 */
export interface Slab {
  /** Inclusive upper bound of this slab, in units. */
  upTo: number;
  /** Rate per unit, in whole rupees (may be fractional). */
  rate: number;
}

export interface SlabLine {
  label: string;
  units: number;
  rate: number;
  /** In whole rupees, not paise -- converted once by the caller. */
  amount: number;
}

export function applySlabs(units: number, slabs: readonly Slab[]): SlabLine[] {
  const lines: SlabLine[] = [];
  let remaining = Math.max(0, units);
  let floor = 0;

  for (const slab of slabs) {
    if (remaining <= 0) break;
    const width = slab.upTo === Number.POSITIVE_INFINITY ? remaining : slab.upTo - floor;
    const inSlab = Math.min(remaining, width);
    if (inSlab > 0) {
      lines.push({
        label:
          slab.upTo === Number.POSITIVE_INFINITY
            ? `Above ${floor}`
            : `${floor + 1} to ${slab.upTo}`,
        units: inSlab,
        rate: slab.rate,
        amount: inSlab * slab.rate,
      });
    }
    remaining -= inSlab;
    floor = slab.upTo;
  }

  return lines;
}

export function slabTotal(lines: readonly SlabLine[]): number {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}
