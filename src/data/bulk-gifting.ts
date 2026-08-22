/**
 * Bulk-order discount slabs, and the arithmetic on them.
 *
 * Deliberately data rather than service: the calculator on the corporate page
 * is a client component, and importing this from `services/corporate-gifting`
 * dragged `mongodb` and `node:child_process` into the browser bundle. Pure
 * arithmetic with no I/O belongs on this side of the line, where both the page
 * and the server can reach it.
 */

export interface DiscountSlab {
  /** Order value at or above this, in whole rupees. */
  fromRupees: number;
  percent: number;
}

/**
 * The published slabs.
 *
 * Ascending by threshold and read from the top down, so adding one in the
 * middle cannot silently change what a large order pays.
 */
export const DISCOUNT_SLABS: readonly DiscountSlab[] = [
  { fromRupees: 25_000, percent: 1 },
  { fromRupees: 100_000, percent: 2 },
  { fromRupees: 500_000, percent: 3 },
  { fromRupees: 2_000_000, percent: 4 },
  { fromRupees: 10_000_000, percent: 5 },
];

export const MAX_BULK_QUANTITY = 100_000;
export const MAX_BULK_FACE_VALUE = 10_000;

/** The best slab an order value qualifies for; null below the first. */
export function slabFor(orderRupees: number): DiscountSlab | null {
  let best: DiscountSlab | null = null;
  for (const slab of DISCOUNT_SLABS) {
    if (orderRupees >= slab.fromRupees) best = slab;
  }
  return best;
}

export interface BulkQuote {
  quantity: number;
  faceValueRupees: number;
  /** Quantity times face value, in whole rupees. */
  orderRupees: number;
  percent: number;
  /** What the discount is worth, in whole rupees. */
  savingRupees: number;
  payableRupees: number;
  /** The next slab up, and what it would take to reach it. */
  nextSlab: DiscountSlab | null;
  toNextRupees: number;
}

/**
 * What a bulk order would cost.
 *
 * Whole rupees, because a quotation with paise on it invites a question nobody
 * wants to answer.
 */
export function quoteBulk(quantity: number, faceValueRupees: number): BulkQuote {
  const count = Math.min(MAX_BULK_QUANTITY, Math.max(0, Math.floor(quantity || 0)));
  const face = Math.min(MAX_BULK_FACE_VALUE, Math.max(0, Math.floor(faceValueRupees || 0)));
  const orderRupees = count * face;

  const slab = slabFor(orderRupees);
  const percent = slab?.percent ?? 0;
  const savingRupees = Math.round((orderRupees * percent) / 100);

  const nextSlab = DISCOUNT_SLABS.find((entry) => entry.fromRupees > orderRupees) ?? null;

  return {
    quantity: count,
    faceValueRupees: face,
    orderRupees,
    percent,
    savingRupees,
    payableRupees: orderRupees - savingRupees,
    nextSlab,
    toNextRupees: nextSlab ? nextSlab.fromRupees - orderRupees : 0,
  };
}
