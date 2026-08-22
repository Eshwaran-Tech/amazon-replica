import { findBiller } from '@/data/billers';
import {
  BOOKING_HORIZON_DAYS,
  BOOKING_LEAD_DAYS,
  CYLINDERS,
  DELIVERY_SLOTS,
  findCylinder,
  findSlot,
  MIN_REFILL_GAP_DAYS,
  SUBSIDISED_PER_YEAR,
  SUBSIDY_PER_KG,
  type Cylinder,
  type DeliverySlot,
} from '@/data/lpg';
import { accountRandom, between, holderName } from '@/lib/bills/derive';
import type { Paise } from '@/lib/utils/money';

import { billRupees } from './types';
import { financialYear } from './civic';

/**
 * Booking an LPG refill.
 *
 * Not a bill. There is nothing outstanding, nothing accruing and no due date --
 * there is a cylinder, a price, and a question about when somebody can be at
 * home. So this surface has a date and a slot where the others have a consumer
 * number and a total, and it can **refuse** a booking, which none of the bill
 * pages can.
 */

export interface LpgConnection {
  distributorId: string;
  distributorName: string;
  lpgId: string;
  holder: string;
  /** The last delivery, which is what the minimum gap is measured from. */
  lastDeliveredOn: Date;
  /** Subsidised refills taken this financial year. */
  refillsThisYear: number;
  subsidisedRemaining: number;
  /** Days before another subsidised refill may be booked. Zero when it may. */
  daysUntilEligible: number;
  /** The bank account the subsidy is transferred to, masked. */
  subsidyAccount: string;
}

export function lpgConnection(
  distributorId: string,
  lpgId: string,
  now = new Date(),
): LpgConnection | null {
  const biller = findBiller(distributorId);
  if (!biller || biller.category !== 'LPG') return null;

  const random = accountRandom(distributorId, lpgId);
  const holder = holderName(random);

  const sinceLast = between(random, 3, 70);
  const lastDeliveredOn = new Date(now);
  lastDeliveredOn.setHours(0, 0, 0, 0);
  lastDeliveredOn.setDate(lastDeliveredOn.getDate() - sinceLast);

  const refillsThisYear = between(random, 0, SUBSIDISED_PER_YEAR);

  return {
    distributorId,
    distributorName: biller.name,
    lpgId,
    holder,
    lastDeliveredOn,
    refillsThisYear,
    subsidisedRemaining: Math.max(0, SUBSIDISED_PER_YEAR - refillsThisYear),
    daysUntilEligible: Math.max(0, MIN_REFILL_GAP_DAYS - sinceLast),
    // Masked, because a bank account number is not something to print in full
    // on a page anybody can reach by typing a seventeen-digit number.
    subsidyAccount: `XXXXXX${between(random, 1000, 9999)}`,
  };
}

export interface BookingDay {
  date: Date;
  /**
   * The day as YYYY-MM-DD in *local* terms.
   *
   * Not `toISOString().slice(0, 10)`: a date set to local midnight rolls back to
   * the previous day in any timezone ahead of UTC, so in India that helper
   * silently books the day before the one on the button.
   */
  key: string;
  label: string;
  slots: Array<{ slot: DeliverySlot; available: boolean; note: string | null }>;
}

/**
 * The delivery calendar.
 *
 * Availability is derived from the date and the distributor, so it is the same
 * for everybody looking at the same day -- which is what a real slot board is.
 * Sunday is closed and the evening slot fills first, both of which are true of
 * how distributors actually run.
 */
/** YYYY-MM-DD from the local calendar date, never from UTC. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** And back again, as a local date rather than a UTC instant. */
export function fromDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function deliveryCalendar(distributorId: string, now = new Date()): BookingDay[] {
  const days: BookingDay[] = [];

  for (let offset = BOOKING_LEAD_DAYS; offset <= BOOKING_HORIZON_DAYS; offset += 1) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);

    const closed = date.getDay() === 0;
    const key = dayKey(date);
    const random = accountRandom(distributorId, key);

    days.push({
      date,
      key,
      label: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      slots: DELIVERY_SLOTS.map((slot) => {
        if (closed) return { slot, available: false, note: 'Closed on Sunday' };
        // The evening slot is the one everybody wants, so it is the one that
        // is full more often. That is not a quirk, it is the actual pattern.
        const pressure = slot.id === 'evening' ? 0.45 : 0.15;
        const full = random() < pressure;
        return { slot, available: !full, note: full ? 'Full' : null };
      }),
    });
  }

  return days;
}

export interface RefillQuote {
  cylinder: Cylinder;
  /** What is charged today, at the door price. */
  payable: Paise;
  /**
   * What comes back afterwards, if anything.
   *
   * Shown as a separate figure, never as a discount: the subsidy is a bank
   * transfer that arrives later, and netting it off would misstate what is
   * being paid now.
   */
  subsidyTransfer: Paise;
  subsidyApplies: boolean;
  subsidyReason: string;
}

export function quoteRefill(cylinderId: string, connection: LpgConnection): RefillQuote | null {
  const cylinder = findCylinder(cylinderId);
  if (!cylinder) return null;

  const withinCap = connection.subsidisedRemaining > 0;
  const applies = cylinder.subsidised && withinCap;

  return {
    cylinder,
    payable: billRupees(cylinder.priceRupees),
    subsidyTransfer: applies ? billRupees(cylinder.kg * SUBSIDY_PER_KG) : 0,
    subsidyApplies: applies,
    subsidyReason: !cylinder.subsidised
      ? 'A commercial cylinder carries no subsidy.'
      : withinCap
        ? `Transferred to your bank account after delivery. ${connection.subsidisedRemaining} subsidised refill${connection.subsidisedRemaining === 1 ? '' : 's'} left this year.`
        : `All ${SUBSIDISED_PER_YEAR} subsidised refills for ${financialYear(new Date()).label} have been used. This one is at the market rate.`,
  };
}

export type BookingCheck =
  { ok: true } | { ok: false; code: 'TOO_SOON' | 'NO_SLOT' | 'PAST' | 'UNKNOWN'; message: string };

/**
 * Whether this booking may be placed at all.
 *
 * Checked on the server, not just greyed out in the browser -- a slot board is
 * a hint, and the rule is the rule.
 */
export function checkBooking(
  connection: LpgConnection,
  cylinderId: string,
  dateIso: string,
  slotId: string,
  now = new Date(),
): BookingCheck {
  const cylinder = findCylinder(cylinderId);
  const slot = findSlot(slotId);
  if (!cylinder || !slot) {
    return { ok: false, code: 'UNKNOWN', message: 'Choose a cylinder and a delivery slot.' };
  }

  // The minimum gap applies to subsidised cylinders. A commercial refill is
  // sold at the market rate, so nothing stops you buying one today.
  if (cylinder.subsidised && connection.daysUntilEligible > 0) {
    return {
      ok: false,
      code: 'TOO_SOON',
      message: `Your last refill was ${MIN_REFILL_GAP_DAYS - connection.daysUntilEligible} days ago. A subsidised cylinder may be booked ${MIN_REFILL_GAP_DAYS} days apart, so this one is available in ${connection.daysUntilEligible} day${connection.daysUntilEligible === 1 ? '' : 's'}.`,
    };
  }

  const day = deliveryCalendar(connection.distributorId, now).find(
    (entry) => entry.key === dateIso,
  );
  if (!day) {
    return {
      ok: false,
      code: 'PAST',
      message: `Deliveries can be booked from tomorrow up to ${BOOKING_HORIZON_DAYS} days ahead.`,
    };
  }

  const chosen = day.slots.find((entry) => entry.slot.id === slot.id);
  if (!chosen?.available) {
    return { ok: false, code: 'NO_SLOT', message: 'That slot is full. Choose another.' };
  }

  return { ok: true };
}

export { CYLINDERS, DELIVERY_SLOTS, findCylinder, findSlot };
