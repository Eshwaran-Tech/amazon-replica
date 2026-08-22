/**
 * LPG cylinders.
 *
 * **A refill is a booking, not a bill.** That is the whole reason this tile
 * gets its own surface rather than a consumer-number form: you are not settling
 * something you owe, you are ordering a physical object and choosing when
 * somebody carries it up your stairs.
 *
 * The rules modelled here are the real ones:
 *
 *  - There is a **minimum gap between subsidised refills**. Book too soon and
 *    the booking is refused, which surprises people every single time.
 *  - There is a **cap on subsidised refills in a year**. Past it you pay the
 *    market rate for the same cylinder.
 *  - The **subsidy is not a discount.** You pay the full price at the door and
 *    the subsidy is transferred to your bank account afterwards. A page that
 *    showed it as money off the total would be wrong about what you are paying
 *    today, which is the number that matters when you are paying today.
 *
 * The distributors are this store's own.
 */

export interface Cylinder {
  id: string;
  label: string;
  /** Net weight of gas, in kilograms. */
  kg: number;
  /** What you pay at the door, in whole rupees. */
  priceRupees: number;
  /** Whether a subsidy transfer applies to this size. */
  subsidised: boolean;
  blurb: string;
}

export const CYLINDERS: readonly Cylinder[] = [
  {
    id: 'domestic-14',
    label: 'Domestic refill, 14.2 kg',
    kg: 14.2,
    priceRupees: 903,
    subsidised: true,
    blurb: 'The standard household cylinder.',
  },
  {
    id: 'composite-10',
    label: 'Composite refill, 10 kg',
    kg: 10,
    priceRupees: 668,
    subsidised: true,
    blurb: 'Translucent and lighter; you can see how much is left.',
  },
  {
    id: 'small-5',
    label: 'Small refill, 5 kg',
    kg: 5,
    priceRupees: 356,
    subsidised: true,
    blurb: 'For a small kitchen, or a second cylinder.',
  },
  {
    id: 'commercial-19',
    label: 'Commercial refill, 19 kg',
    kg: 19,
    priceRupees: 1745,
    subsidised: false,
    blurb: 'For shops and kitchens. No subsidy applies.',
  },
];

export function findCylinder(id: string | null | undefined): Cylinder | undefined {
  if (!id) return undefined;
  return CYLINDERS.find((cylinder) => cylinder.id === id.trim().toLowerCase());
}

/** What the subsidy transfer is worth on a subsidised cylinder, per kg. */
export const SUBSIDY_PER_KG = 21.5;

/** Days that must pass between two subsidised refills. */
export const MIN_REFILL_GAP_DAYS = 21;

/** Subsidised refills allowed in a financial year. */
export const SUBSIDISED_PER_YEAR = 12;

export interface DeliverySlot {
  id: string;
  label: string;
  /** Hours from the start of the day. */
  from: number;
  to: number;
}

/**
 * Delivery windows.
 *
 * Three a day, which is what a distributor actually runs -- and the evening one
 * is the one everybody wants, so it is the one that fills.
 */
export const DELIVERY_SLOTS: readonly DeliverySlot[] = [
  { id: 'morning', label: 'Morning, 8am to 12pm', from: 8, to: 12 },
  { id: 'afternoon', label: 'Afternoon, 12pm to 4pm', from: 12, to: 16 },
  { id: 'evening', label: 'Evening, 4pm to 8pm', from: 16, to: 20 },
];

export function findSlot(id: string | null | undefined): DeliverySlot | undefined {
  if (!id) return undefined;
  return DELIVERY_SLOTS.find((slot) => slot.id === id.trim().toLowerCase());
}

/** How far ahead a booking can be placed. */
export const BOOKING_HORIZON_DAYS = 7;

/** The earliest a cylinder goes out, because it has to be loaded first. */
export const BOOKING_LEAD_DAYS = 1;
