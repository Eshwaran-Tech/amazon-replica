import type { CartTotals } from '@/models/cart';
import { percentOf, sumPaise, rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * The single pricing authority.
 *
 * Every total the customer is ever shown or charged comes from this module,
 * computed from prices read out of the `products` collection at that moment.
 * The browser never supplies an amount -- not a unit price, not a subtotal, not
 * a total -- and no request schema has a field for one.
 *
 * The cart page, the checkout summary and the order record all call
 * `calculateTotals`. That is deliberate: if the displayed total and the charged
 * total were computed by two different pieces of code, they would eventually
 * disagree, and the gap between them is exactly where price-manipulation bugs
 * live.
 *
 * Pure functions, no I/O -- so the rules are unit-testable without a database.
 */

/** Orders at or above this qualify for free delivery. */
export const FREE_SHIPPING_THRESHOLD: Paise = rupeesToPaise(499);

/** Flat delivery charge below the threshold. */
export const STANDARD_SHIPPING_FEE: Paise = rupeesToPaise(49);

/**
 * GST, applied to the post-discount amount.
 *
 * Catalogue prices in this project are exclusive of tax and GST is added at
 * checkout, so the order model stays additive:
 *   total = (subtotal - discount) + shipping + tax
 * A production Indian storefront would more likely display tax-inclusive MRP
 * and extract the tax component instead; that is a display and reporting
 * decision, and it changes this function only.
 */
export const GST_RATE_PERCENT = 18;

/** One priced line, after the catalogue has been consulted. */
export interface PricedLine {
  /** Pre-discount catalogue price per unit. */
  listPrice: Paise;
  /** Price actually charged per unit (the discount price when one applies). */
  unitPrice: Paise;
  quantity: number;
}

/**
 * Computes every monetary field of a cart or order.
 *
 * Each step rounds to whole paise exactly once, so no fractional remainder can
 * accumulate across lines and leave the total a paisa away from the sum of its
 * parts.
 */
export interface PricingOptions {
  /**
   * Waives the delivery threshold. Set for Prime members, whose benefit is a
   * real change to the charged total rather than a badge on the page.
   */
  freeShipping?: boolean;
}

export function calculateTotals(
  lines: readonly PricedLine[],
  options: PricingOptions = {},
): CartTotals {
  // Subtotal is at *list* price, so the saving is visible rather than hidden
  // in a lower subtotal.
  const subtotal = sumPaise(lines.map((line) => line.listPrice * line.quantity));

  const discount = sumPaise(
    lines.map((line) => Math.max(0, line.listPrice - line.unitPrice) * line.quantity),
  );

  const payableBeforeExtras = subtotal - discount;

  const shipping =
    lines.length === 0 || options.freeShipping || payableBeforeExtras >= FREE_SHIPPING_THRESHOLD
      ? 0
      : STANDARD_SHIPPING_FEE;

  // Tax on goods only. Shipping is not taxed here; adjust if your jurisdiction
  // differs -- this is the one line to change.
  const tax = percentOf(payableBeforeExtras, GST_RATE_PERCENT);

  const total = payableBeforeExtras + shipping + tax;

  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);

  return { subtotal, discount, shipping, tax, total, itemCount };
}

/**
 * How much more the customer must add to qualify for free delivery.
 *
 * Zero for a member, since they already have it -- prompting someone to spend
 * more to unlock a benefit they are paying for would be nonsense.
 */
export function amountToFreeShipping(totals: CartTotals, freeShipping = false): Paise {
  if (freeShipping) return 0;
  const payable = totals.subtotal - totals.discount;
  return payable >= FREE_SHIPPING_THRESHOLD ? 0 : FREE_SHIPPING_THRESHOLD - payable;
}
