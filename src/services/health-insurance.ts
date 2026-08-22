import {
  AGE_BANDS,
  bandFor,
  CHILD_MAX_AGE,
  COVERED,
  HEALTH_DISCOUNTS,
  MAX_ADULTS,
  MAX_AGE,
  MAX_CHILDREN,
  MIN_AGE,
  NOT_COVERED,
  SUM_INSURED_LAKHS,
  WAITING_PERIODS,
  type Benefit,
} from '@/data/health-plans';
import { findInsurer, PREMIUM_TAX_PERCENT, type Insurer } from '@/data/insurers';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * Health quotes.
 *
 * **This store sells no insurance** -- see the note in `data/health-plans.ts`.
 * This works out what a premium is made of so the page can show the parts.
 *
 * Two rules that make the figure honest rather than flattering:
 *
 *  1. **A family is priced on its eldest member**, not on an average. That is
 *     how a floater actually works, and averaging would understate a premium by
 *     a long way on any family with one older member.
 *  2. **Discounts are multiplicative, not additive.** 5% and 10% is 14.5% off,
 *     not 15%. Adding them is the commonest way a quoted premium comes out
 *     lower than the one that gets charged.
 */

export interface Member {
  /** "adult" or "child", which changes only how the page labels them. */
  kind: 'ADULT' | 'CHILD';
  age: number;
}

export interface HealthQuoteInput {
  sumInsuredLakhs: number;
  members: Member[];
  /** Two-year policies are cheaper per year. */
  termYears: 1 | 2;
  /**
   * Whose book to price on. Insurers differ in appetite, so the same cover
   * costs different amounts at each.
   *
   * This is on the *input* rather than applied by the page afterwards on
   * purpose: a loading the page knew about and the server did not would mean
   * the figure on the card and the figure charged were two different numbers.
   */
  insurerId?: string;
}

export interface AppliedDiscount {
  id: string;
  name: string;
  percent: number;
}

export interface HealthQuote {
  sumInsuredLakhs: number;
  /** Null when no insurer was named and the band rate stands unloaded. */
  insurer: Insurer | null;
  /** The band the whole policy is priced on. */
  ratedAge: number;
  ratedBand: string;
  members: Member[];
  termYears: number;
  /** Before any discount. */
  basePremium: Paise;
  discounts: AppliedDiscount[];
  /** What the discounts are worth in total. */
  discountAmount: Paise;
  netPremium: Paise;
  taxPercent: number;
  tax: Paise;
  total: Paise;
  /** Per year, for a two-year policy. */
  perYear: Paise;
}

export type HealthQuoteResult =
  | { ok: true; quote: HealthQuote }
  | { ok: false; code: 'BAD_SUM' | 'BAD_MEMBERS' | 'BAD_AGE' | 'UNKNOWN_INSURER'; message: string };

function wholeRupees(paise: number): Paise {
  return Math.round(paise / 100) * 100;
}

export function quoteHealth(input: HealthQuoteInput): HealthQuoteResult {
  if (!(SUM_INSURED_LAKHS as readonly number[]).includes(input.sumInsuredLakhs)) {
    return { ok: false, code: 'BAD_SUM', message: 'Choose a sum insured from the list.' };
  }

  const adults = input.members.filter((member) => member.kind === 'ADULT');
  const children = input.members.filter((member) => member.kind === 'CHILD');

  if (adults.length < 1 || adults.length > MAX_ADULTS) {
    return {
      ok: false,
      code: 'BAD_MEMBERS',
      message: `A policy carries one or ${MAX_ADULTS} adults.`,
    };
  }
  if (children.length > MAX_CHILDREN) {
    return {
      ok: false,
      code: 'BAD_MEMBERS',
      message: `Up to ${MAX_CHILDREN} children on one policy.`,
    };
  }

  for (const adult of adults) {
    if (!Number.isInteger(adult.age) || adult.age < MIN_AGE || adult.age > MAX_AGE) {
      return {
        ok: false,
        code: 'BAD_AGE',
        message: `An adult must be between ${MIN_AGE} and ${MAX_AGE}.`,
      };
    }
  }
  for (const child of children) {
    if (!Number.isInteger(child.age) || child.age < 0 || child.age > CHILD_MAX_AGE) {
      return {
        ok: false,
        code: 'BAD_AGE',
        message: `A child must be under ${CHILD_MAX_AGE + 1}.`,
      };
    }
  }

  // A floater is priced on its eldest member. Averaging would understate it.
  const ratedAge = Math.max(...input.members.map((member) => member.age), MIN_AGE);
  const band = bandFor(ratedAge);
  if (!band) {
    return { ok: false, code: 'BAD_AGE', message: 'No band covers that age.' };
  }

  // Each additional member adds less than a policy of their own would cost --
  // which is the whole point of a floater.
  const extra = input.members.length - 1;
  const memberFactor = 1 + extra * 0.55;

  const insurer = input.insurerId ? findInsurer(input.insurerId) : null;
  if (input.insurerId && !insurer) {
    return { ok: false, code: 'UNKNOWN_INSURER', message: 'That insurer is no longer quoting.' };
  }

  const oneYear = wholeRupees(
    rupeesToPaise(band.ratePerLakh * input.sumInsuredLakhs) *
      memberFactor *
      (insurer?.odFactor ?? 1),
  );
  const basePremium = oneYear * input.termYears;

  const discounts: AppliedDiscount[] = [];
  const add = (id: string): void => {
    const discount = HEALTH_DISCOUNTS.find((entry) => entry.id === id);
    if (discount)
      discounts.push({ id: discount.id, name: discount.name, percent: discount.percent });
  };

  add('online');
  if (ratedAge <= 35) add('young');
  if (input.members.length >= 2) add('family');
  if (input.termYears === 2) add('two-year');

  // Multiplicative: 5% and 10% is 14.5% off, not 15%. Adding them is how a
  // quoted premium ends up lower than the one that gets charged.
  const retained = discounts.reduce((factor, entry) => factor * (1 - entry.percent / 100), 1);
  const netPremium = wholeRupees(basePremium * retained);
  const discountAmount = basePremium - netPremium;

  const tax = wholeRupees((netPremium * PREMIUM_TAX_PERCENT) / 100);
  const total = netPremium + tax;

  return {
    ok: true,
    quote: {
      sumInsuredLakhs: input.sumInsuredLakhs,
      insurer: insurer ?? null,
      ratedAge,
      ratedBand: band.label,
      members: input.members,
      termYears: input.termYears,
      basePremium,
      discounts,
      discountAmount,
      netPremium,
      taxPercent: PREMIUM_TAX_PERCENT,
      tax,
      total,
      perYear: wholeRupees(total / input.termYears),
    },
  };
}

/** The covered benefits, grouped as the page lists them. */
export function coveredGroups(): Array<{ group: string; benefits: Benefit[] }> {
  return groupBy(COVERED);
}

export function notCoveredGroups(): Array<{ group: string; benefits: Benefit[] }> {
  return groupBy(NOT_COVERED);
}

function groupBy(benefits: readonly Benefit[]): Array<{ group: string; benefits: Benefit[] }> {
  const order: string[] = [];
  const buckets = new Map<string, Benefit[]>();

  for (const benefit of benefits) {
    if (!buckets.has(benefit.group)) {
      buckets.set(benefit.group, []);
      order.push(benefit.group);
    }
    buckets.get(benefit.group)?.push(benefit);
  }

  return order.map((group) => ({ group, benefits: buckets.get(group) ?? [] }));
}

/** The waiting periods, soonest first. */
export function waitingPeriods(): typeof WAITING_PERIODS {
  return [...WAITING_PERIODS].sort((a, b) => a.months - b.months);
}

export { AGE_BANDS, SUM_INSURED_LAKHS };
