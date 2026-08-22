/**
 * Money handling.
 *
 * Every monetary amount in this codebase is an **integer number of paise**.
 * There are no floating-point rupees anywhere, and this is not stylistic.
 *
 *   0.1 + 0.2 === 0.30000000000000004
 *
 * Run that through subtotal -> discount -> shipping -> tax -> total across a
 * multi-item cart and the number the customer sees, the number we charge, and
 * the number the payment provider settles can all differ. A one-paisa gap is a
 * reconciliation failure, and rounding drift is a classic way for a cart to be
 * manipulated a fraction at a time.
 *
 * So: `1299.50` is stored, computed and compared as `129950`.
 */

/** An integer count of paise. 100 paise = 1 rupee. */
export type Paise = number;

export const CURRENCY = 'INR' as const;
export const CURRENCY_SYMBOL = '₹';

/** Largest amount we will accept anywhere. Bounds overflow and absurd input. */
export const MAX_PAISE = 100_000_000_00; // 100 crore rupees

export function isValidPaise(value: unknown): value is Paise {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_PAISE
  );
}

/** Rupees -> paise. Only for seed data and admin input, never for arithmetic. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new RangeError('rupeesToPaise: not a finite number');
  // Round *after* scaling: Math.round(19.99 * 100) is 1999, whereas truncating
  // would give 1998 for values that cannot be represented exactly in binary.
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

/**
 * Percentage of an amount, rounded to the nearest paisa.
 *
 * Deliberately takes the percent as a number and rounds once, so a discount and
 * the tax on it cannot drift apart through repeated fractional arithmetic.
 */
export function percentOf(amount: Paise, percent: number): Paise {
  if (!Number.isFinite(percent)) throw new RangeError('percentOf: not a finite percent');
  return Math.round((amount * percent) / 100);
}

/** Discount percentage as a whole number, for display and sorting. */
export function discountPercentage(price: Paise, discountPrice: Paise): number {
  if (price <= 0 || discountPrice >= price) return 0;
  return Math.round(((price - discountPrice) / price) * 100);
}

/**
 * Indian-format currency string: ₹1,23,456.78 (lakh/crore grouping, not
 * thousands). `Intl` with the `en-IN` locale does this grouping correctly.
 */
export function formatPaise(paise: Paise, options?: { withSymbol?: boolean }): string {
  const withSymbol = options?.withSymbol ?? true;

  const formatter = new Intl.NumberFormat('en-IN', {
    style: withSymbol ? 'currency' : 'decimal',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(paiseToRupees(paise));
}

/** Splits an amount for display: `12345` -> `{ whole: '123', fraction: '45' }`. */
export function splitPaise(paise: Paise): { whole: string; fraction: string } {
  const whole = Math.floor(paise / 100);
  const fraction = Math.abs(paise % 100);
  return {
    whole: new Intl.NumberFormat('en-IN').format(whole),
    fraction: fraction.toString().padStart(2, '0'),
  };
}

/** Sums amounts, throwing rather than silently overflowing past MAX_PAISE. */
export function sumPaise(amounts: readonly Paise[]): Paise {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    if (!Number.isSafeInteger(total) || total > MAX_PAISE) {
      throw new RangeError('sumPaise: total exceeds the maximum permitted amount');
    }
  }
  return total;
}
