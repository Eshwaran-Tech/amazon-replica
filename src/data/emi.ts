/**
 * EMI plans.
 *
 * **This store lends nothing.** It has no credit licence, no lending partner
 * and no way to advance anybody money. What lives here is the arithmetic an EMI
 * plan is made of, so the page can show what a plan would cost rather than
 * repeat a number somebody else quoted.
 *
 * The issuers are invented, and the rates are illustrative and labelled as
 * such on the page. The reference lists real banks against real processing
 * fees; reproducing those would be quoting one bank's commercial terms on
 * another company's storefront, and a reader who acted on a stale figure would
 * have been misled by this page rather than by the bank.
 *
 * The *formula* is the real one, because arithmetic is not anybody's property:
 * the standard reducing-balance instalment.
 */

export interface EmiIssuer {
  /** URL id, lowercase kebab. */
  id: string;
  name: string;
  /** Credit card, debit card, or the store's own pay-later line. */
  kind: 'CREDIT' | 'DEBIT' | 'PAY_LATER';
  /** Annual rate, per cent. */
  annualRate: number;
  /** One-off fee on the transaction, per cent of the principal. */
  processingPercent: number;
  /** Floor on that fee, in whole rupees. */
  processingMinRupees: number;
  /** Smallest transaction the issuer will convert. */
  minAmountRupees: number;
  /** Tenures offered, in months. */
  tenures: readonly number[];
}

const STANDARD_TENURES = [3, 6, 9, 12, 18, 24] as const;
const SHORT_TENURES = [3, 6, 9, 12] as const;

export const EMI_ISSUERS: readonly EmiIssuer[] = [
  {
    id: 'meridian-credit',
    name: 'Meridian Bank credit card',
    kind: 'CREDIT',
    annualRate: 14,
    processingPercent: 1,
    processingMinRupees: 199,
    minAmountRupees: 3000,
    tenures: STANDARD_TENURES,
  },
  {
    id: 'kestrel-credit',
    name: 'Kestrel Bank credit card',
    kind: 'CREDIT',
    annualRate: 15,
    processingPercent: 1,
    processingMinRupees: 249,
    minAmountRupees: 3000,
    tenures: STANDARD_TENURES,
  },
  {
    id: 'halcyon-credit',
    name: 'Halcyon Bank credit card',
    kind: 'CREDIT',
    annualRate: 16,
    processingPercent: 2,
    processingMinRupees: 149,
    minAmountRupees: 2500,
    tenures: STANDARD_TENURES,
  },
  {
    id: 'meridian-debit',
    name: 'Meridian Bank debit card',
    kind: 'DEBIT',
    annualRate: 15,
    processingPercent: 2,
    processingMinRupees: 249,
    minAmountRupees: 5000,
    tenures: SHORT_TENURES,
  },
  {
    id: 'kestrel-debit',
    name: 'Kestrel Bank debit card',
    kind: 'DEBIT',
    annualRate: 16,
    processingPercent: 2,
    processingMinRupees: 199,
    minAmountRupees: 5000,
    tenures: SHORT_TENURES,
  },
  {
    id: 'pay-later',
    name: 'Eshwaran Pay Later',
    kind: 'PAY_LATER',
    annualRate: 18,
    processingPercent: 2,
    processingMinRupees: 0,
    minAmountRupees: 1000,
    tenures: [3, 6, 9, 12],
  },
];

export function findIssuer(id: string | null | undefined): EmiIssuer | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return EMI_ISSUERS.find((issuer) => issuer.id === wanted);
}

export const ISSUER_KIND_LABELS: Record<EmiIssuer['kind'], string> = {
  CREDIT: 'Credit card',
  DEBIT: 'Debit card',
  PAY_LATER: 'Pay Later',
};

/**
 * Why a product might not be convertible.
 *
 * Real constraints that real EMI programmes carry, worth listing because "EMI
 * not available" with no reason is the most irritating message on any checkout.
 */
export const EMI_EXCLUSIONS: readonly string[] = [
  'Gift cards and vouchers, which are cash equivalents',
  'Digital downloads and subscriptions',
  'Orders below the issuer’s minimum transaction value',
  'Orders paid partly from the Eshwaran Pay balance',
  'Items sold by a seller who has not enabled instalments',
];
