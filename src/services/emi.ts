import { EMI_ISSUERS, findIssuer, type EmiIssuer } from '@/data/emi';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * EMI arithmetic.
 *
 * **This store lends nothing** -- see the note in `data/emi.ts`. This works out
 * what a plan would cost so the page can show it, and nothing here moves money.
 *
 * The formula is the standard reducing-balance instalment:
 *
 *     E = P · r · (1 + r)^n / ((1 + r)^n − 1)
 *
 * where `r` is the monthly rate and `n` the tenure. Written out rather than
 * approximated, because an EMI that is a few rupees off is the sort of error a
 * reader only finds after they have committed to twelve of them.
 *
 * Every figure is rounded once, at the end, in paise. Rounding the instalment
 * and then multiplying it by the tenure would drift by up to a rupee a month.
 */

export interface EmiPlan {
  issuer: EmiIssuer;
  tenureMonths: number;
  /** The amount being converted. */
  principal: Paise;
  /** One instalment. */
  monthly: Paise;
  /** Interest across the whole plan. */
  totalInterest: Paise;
  /** One-off fee the issuer charges to convert. */
  processingFee: Paise;
  /** Principal + interest + fee. */
  totalPayable: Paise;
  /** What the plan costs above the sticker price. */
  costOfCredit: Paise;
  /** True when the store absorbs the interest as an upfront discount. */
  noCost: boolean;
  /** The discount that makes a no-cost plan no-cost, when it applies. */
  noCostDiscount: Paise;
}

/** One instalment on a reducing balance, in paise, rounded once. */
export function instalment(principal: Paise, annualRate: number, months: number): Paise {
  if (months <= 0) return principal;
  if (annualRate <= 0) return Math.round(principal / months);

  const monthlyRate = annualRate / 100 / 12;
  const growth = (1 + monthlyRate) ** months;
  return Math.round((principal * monthlyRate * growth) / (growth - 1));
}

/** The issuer's conversion fee: a percentage with a floor. */
export function processingFee(issuer: EmiIssuer, principal: Paise): Paise {
  const percentage = Math.round((principal * issuer.processingPercent) / 100);
  return Math.max(percentage, rupeesToPaise(issuer.processingMinRupees));
}

/**
 * Whether an issuer will convert this amount at all.
 *
 * A separate function because the page needs to say *why* a plan is missing,
 * and "below the issuer's minimum" is a better answer than an empty list.
 */
export function eligibleFor(issuer: EmiIssuer, principal: Paise): boolean {
  return principal >= rupeesToPaise(issuer.minAmountRupees);
}

/**
 * One plan, worked out.
 *
 * `noCost` models the real arrangement rather than the marketing: the interest
 * is still charged by the issuer, and the store discounts the order by the same
 * amount up front so the customer pays the sticker price overall. That is why
 * a "no cost" plan still shows interest on a card statement, which is the
 * single most common complaint about them -- so the page says it.
 */
export function planFor(
  issuer: EmiIssuer,
  tenureMonths: number,
  principal: Paise,
  options: { noCost?: boolean } = {},
): EmiPlan {
  const monthly = instalment(principal, issuer.annualRate, tenureMonths);
  const totalInterest = monthly * tenureMonths - principal;
  const fee = processingFee(issuer, principal);
  const noCost = options.noCost === true;

  return {
    issuer,
    tenureMonths,
    principal,
    monthly,
    totalInterest,
    processingFee: fee,
    totalPayable: monthly * tenureMonths + fee,
    // The fee is not waived on a no-cost plan; only the interest is absorbed.
    costOfCredit: noCost ? fee : totalInterest + fee,
    noCost,
    noCostDiscount: noCost ? totalInterest : 0,
  };
}

/** Every plan an issuer offers at this amount. */
export function plansFor(
  issuer: EmiIssuer,
  principal: Paise,
  options: { noCost?: boolean } = {},
): EmiPlan[] {
  if (!eligibleFor(issuer, principal)) return [];
  return issuer.tenures.map((tenure) => planFor(issuer, tenure, principal, options));
}

export interface IssuerOffer {
  issuer: EmiIssuer;
  eligible: boolean;
  /** Empty when the issuer will not convert this amount. */
  plans: EmiPlan[];
  /** Why it is empty, when it is. */
  reason: string | null;
}

/** What every issuer would offer on this amount, eligible or not. */
export function offersFor(principal: Paise, options: { noCost?: boolean } = {}): IssuerOffer[] {
  return EMI_ISSUERS.map((issuer) => {
    const eligible = eligibleFor(issuer, principal);
    return {
      issuer,
      eligible,
      plans: eligible ? plansFor(issuer, principal, options) : [],
      reason: eligible
        ? null
        : `Converts orders from ₹${issuer.minAmountRupees.toLocaleString('en-IN')}`,
    };
  });
}

/** The cheapest plan across every issuer, for the headline figure. */
export function cheapestPlan(principal: Paise, options: { noCost?: boolean } = {}): EmiPlan | null {
  let best: EmiPlan | null = null;

  for (const offer of offersFor(principal, options)) {
    for (const plan of offer.plans) {
      if (!best || plan.monthly < best.monthly) best = plan;
    }
  }

  return best;
}

export { findIssuer };
