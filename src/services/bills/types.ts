import type { Cycle } from '@/lib/bills/derive';
import type { BillCategory } from '@/data/billers';
import type { Paise } from '@/lib/utils/money';

/**
 * What every bill has in common, and nothing more.
 *
 * Deliberately thin. The temptation on a page like this is a single fat `Bill`
 * type with every field any category might need, and the result is a form that
 * renders "Units consumed: 0" on a credit card bill. Each category returns its
 * own type extending this one, and each page renders its own.
 */

export interface BillLine {
  label: string;
  /** Negative for a rebate, a credit or a discount. */
  amount: Paise;
  /** A note under the line, where the line needs explaining. */
  note?: string;
}

export interface BillBase {
  category: BillCategory;
  billerId: string;
  billerName: string;
  /** Normalised, as it will be stored. */
  account: string;
  /** Initialled -- see the note in `lib/bills/derive.ts`. */
  holder: string;
  cycle: Cycle;
  lines: BillLine[];
  /** What is payable now. */
  total: Paise;
}

export function sumLines(lines: readonly BillLine[]): Paise {
  return lines.reduce((sum, line) => sum + line.amount, 0);
}

/** Rupees to paise, rounded to the whole rupee a bill is actually raised in. */
export function billRupees(rupees: number): Paise {
  return Math.round(rupees) * 100;
}
