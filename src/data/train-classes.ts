/**
 * Travel classes and reservation statuses.
 *
 * The class codes (SL, 3A, 2A, 1A, CC, 2S) and the status vocabulary (AVL, RAC,
 * WL, REGRET) are the public conventions Indian railway booking has used for
 * decades -- they are how a traveller reads a results page, not anyone's mark.
 * The fares they produce are this store's own, from the distance model in
 * `services/trains.ts`.
 */

export type TrainClassCode = '1A' | '2A' | '3A' | 'CC' | 'SL' | '2S';

export interface TrainClass {
  code: TrainClassCode;
  label: string;
  /** Air-conditioned, which is what the "AC Only" toggle filters on. */
  ac: boolean;
  /** Berths rather than seats; a day train offers CC and 2S instead. */
  sleeping: boolean;
  /** Rupees per chargeable kilometre. */
  ratePerKm: number;
  /** Flat reservation and superfast component, in rupees. */
  base: number;
  /** How comfortable, ascending -- the order the tiles are laid out in. */
  order: number;
}

export const TRAIN_CLASSES: readonly TrainClass[] = [
  {
    code: '2S',
    label: 'Second Sitting',
    ac: false,
    sleeping: false,
    ratePerKm: 0.42,
    base: 30,
    order: 0,
  },
  { code: 'SL', label: 'Sleeper', ac: false, sleeping: true, ratePerKm: 0.75, base: 60, order: 1 },
  {
    code: 'CC',
    label: 'AC Chair Car',
    ac: true,
    sleeping: false,
    ratePerKm: 1.55,
    base: 100,
    order: 2,
  },
  {
    code: '3A',
    label: 'AC 3 Tier',
    ac: true,
    sleeping: true,
    ratePerKm: 1.95,
    base: 120,
    order: 3,
  },
  { code: '2A', label: 'AC 2 Tier', ac: true, sleeping: true, ratePerKm: 2.5, base: 180, order: 4 },
  {
    code: '1A',
    label: 'AC First Class',
    ac: true,
    sleeping: true,
    ratePerKm: 4.2,
    base: 300,
    order: 5,
  },
];

export function findClass(code: string | null | undefined): TrainClass | undefined {
  if (!code) return undefined;
  const wanted = code.trim().toUpperCase();
  return TRAIN_CLASSES.find((entry) => entry.code === wanted);
}

/**
 * Reservation status.
 *
 * Only `AVAILABLE` and `RAC` can be booked. A waitlist is a queue, not a seat,
 * and this store will not take money for a place in a queue it cannot clear --
 * so the tile shows the number and refuses the click, which is the honest half
 * of what the reference does.
 */
export type ReservationStatus = 'AVAILABLE' | 'RAC' | 'WAITLIST' | 'REGRET' | 'CLOSED' | 'DEPARTED';

export const BOOKABLE_STATUSES: readonly ReservationStatus[] = ['AVAILABLE', 'RAC'];

export function isBookable(status: ReservationStatus): boolean {
  return BOOKABLE_STATUSES.includes(status);
}

/** The short label a results tile prints, e.g. "AVL 26", "WL 33", "RAC 5". */
export function statusLabel(status: ReservationStatus, count: number): string {
  switch (status) {
    case 'AVAILABLE':
      return `AVL ${count}`;
    case 'RAC':
      return `RAC ${count}`;
    case 'WAITLIST':
      return `WL ${count}`;
    case 'REGRET':
      return 'REGRET';
    case 'DEPARTED':
      return 'TRAIN DEPARTED';
    case 'CLOSED':
    default:
      return 'NOT AVAILABLE';
  }
}

/** Days of the week as the running-days strip prints them, Sunday first. */
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
