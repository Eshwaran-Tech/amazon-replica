/**
 * Insurers and cover.
 *
 * **This store sells no insurance.** It is not an insurer, not a broker and not
 * a corporate agent, and no policy is issued anywhere in this codebase. Every
 * insurer below is invented and every rate is illustrative, which the pages say
 * before they show a figure.
 *
 * The *structure* is real, because it is the part worth understanding: a motor
 * premium is own-damage plus a mandatory third-party component plus add-ons,
 * less a no-claim bonus, plus tax. That shape, the depreciation ladder behind
 * an IDV, and the no-claim ladder are all published convention rather than
 * anybody's commercial secret.
 */

export interface Insurer {
  /** URL id, lowercase kebab. */
  id: string;
  name: string;
  /** One line, as the motor quote card carries. */
  tagline: string;
  /**
   * The same, for the health book.
   *
   * Separate rather than shared: a line about declared values or garages beside
   * a health premium is either meaningless or a claim about the wrong product.
   */
  healthTagline: string;
  /** Hospitals in the cashless network, which is the health equivalent. */
  hospitals: number;
  /** Multiplies the own-damage premium. Where insurers differ most. */
  odFactor: number;
  /** Multiplies the computed IDV; insurers value the same car differently. */
  idvFactor: number;
  /** Garages in the cashless network. */
  garages: number;
  /** Claims settled, as a percentage. Illustrative. */
  claimRatio: number;
  /** Hue for the tile mark. */
  hue: number;
}

export const INSURERS: readonly Insurer[] = [
  {
    id: 'meridian-general',
    name: 'Meridian General',
    tagline: 'Cashless at the big chains',
    healthTagline: 'Cashless at the largest hospital chains',
    hospitals: 12800,
    odFactor: 1,
    idvFactor: 1,
    garages: 7400,
    claimRatio: 97.2,
    hue: 210,
  },
  {
    id: 'kestrel-assurance',
    name: 'Kestrel Assurance',
    tagline: 'Cheapest own-damage rate here',
    healthTagline: 'Lowest premium for a young family',
    hospitals: 9400,
    odFactor: 0.86,
    idvFactor: 0.94,
    garages: 4100,
    claimRatio: 95.4,
    hue: 160,
  },
  {
    id: 'halcyon-shield',
    name: 'Halcyon Shield',
    tagline: 'Highest declared value on most cars',
    healthTagline: 'Highest claim settlement rate here',
    hospitals: 16400,
    odFactor: 1.18,
    idvFactor: 1.12,
    garages: 9200,
    claimRatio: 98.1,
    hue: 28,
  },
  {
    id: 'beacon-cover',
    name: 'Beacon Cover',
    tagline: 'Widest garage network',
    healthTagline: 'Widest hospital network',
    hospitals: 18900,
    odFactor: 1.05,
    idvFactor: 1.02,
    garages: 11_500,
    claimRatio: 96.6,
    hue: 285,
  },
];

export function findInsurer(id: string | null | undefined): Insurer | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return INSURERS.find((insurer) => insurer.id === wanted);
}

/**
 * The depreciation ladder behind an IDV.
 *
 * Published convention: an insurer's declared value is the showroom price less
 * a percentage that steps with the vehicle's age. Beyond five years it is
 * negotiated rather than tabled, which the page says instead of inventing a
 * number.
 */
export const DEPRECIATION: ReadonlyArray<{ maxAgeMonths: number; percent: number; label: string }> =
  [
    { maxAgeMonths: 6, percent: 5, label: 'Up to 6 months' },
    { maxAgeMonths: 12, percent: 15, label: '6 months to 1 year' },
    { maxAgeMonths: 24, percent: 20, label: '1 to 2 years' },
    { maxAgeMonths: 36, percent: 30, label: '2 to 3 years' },
    { maxAgeMonths: 48, percent: 40, label: '3 to 4 years' },
    { maxAgeMonths: 60, percent: 50, label: '4 to 5 years' },
  ];

/**
 * The no-claim bonus ladder.
 *
 * Published convention, and it applies to the own-damage part only -- never to
 * the third-party component, which is why a big bonus moves the total less than
 * people expect.
 */
export const NCB_LADDER: ReadonlyArray<{ claimFreeYears: number; percent: number }> = [
  { claimFreeYears: 0, percent: 0 },
  { claimFreeYears: 1, percent: 20 },
  { claimFreeYears: 2, percent: 25 },
  { claimFreeYears: 3, percent: 35 },
  { claimFreeYears: 4, percent: 45 },
  { claimFreeYears: 5, percent: 50 },
];

export const PLAN_TYPES = ['COMPREHENSIVE', 'THIRD_PARTY', 'OWN_DAMAGE'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export interface PlanKind {
  id: PlanType;
  name: string;
  blurb: string;
  covers: readonly string[];
  /** Shown with the "Recommended" flag, as the reference marks one. */
  recommended: boolean;
}

export const PLAN_KINDS: readonly PlanKind[] = [
  {
    id: 'COMPREHENSIVE',
    name: 'Comprehensive Plan',
    blurb: 'Your vehicle and everybody else’s.',
    covers: [
      'Damage to your vehicle',
      'Damage to another vehicle, property and medical expenses',
      'Theft and total loss up to the declared value',
    ],
    recommended: true,
  },
  {
    id: 'THIRD_PARTY',
    name: 'Third Party Only',
    blurb: 'The minimum the law requires. Nothing for your own vehicle.',
    covers: [
      'Damage to another vehicle, property and medical expenses',
      'No cover at all for your own vehicle, including theft',
    ],
    recommended: false,
  },
  {
    id: 'OWN_DAMAGE',
    name: 'Own Damage Only',
    blurb: 'For a vehicle whose third-party cover is already running.',
    covers: [
      'Damage to your vehicle',
      'Theft and total loss up to the declared value',
      'Only valid alongside a live third-party policy',
    ],
    recommended: false,
  },
];

export function findPlanKind(id: string | null | undefined): PlanKind | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toUpperCase();
  return PLAN_KINDS.find((plan) => plan.id === wanted);
}

export interface AddOn {
  id: string;
  name: string;
  blurb: string;
  /** Percentage of the own-damage premium this costs. */
  percentOfOd: number;
  /** Floor in whole rupees, so a small OD premium still prices it sensibly. */
  minRupees: number;
  /** Not offered on a vehicle older than this, in years. */
  maxVehicleAge: number;
  kinds: ReadonlyArray<'CAR' | 'BIKE'>;
}

/**
 * The add-ons worth explaining.
 *
 * Each has an age limit, because that is the real constraint people are
 * surprised by: zero-depreciation is not offered on an old car, and finding
 * that out at renewal is the commonest complaint about it.
 */
export const ADD_ONS: readonly AddOn[] = [
  {
    id: 'zero-dep',
    name: 'Zero depreciation',
    blurb: 'Pays the full cost of replaced parts rather than their depreciated value.',
    percentOfOd: 18,
    minRupees: 900,
    maxVehicleAge: 5,
    kinds: ['CAR', 'BIKE'],
  },
  {
    id: 'engine-protect',
    name: 'Engine protect',
    blurb: 'Covers engine and gearbox damage from water ingress or oil leakage.',
    percentOfOd: 9,
    minRupees: 700,
    maxVehicleAge: 7,
    kinds: ['CAR'],
  },
  {
    id: 'roadside',
    name: 'Roadside assistance',
    blurb: 'Towing, a jump start, fuel delivery and a spare key, around the clock.',
    percentOfOd: 0,
    minRupees: 350,
    maxVehicleAge: 15,
    kinds: ['CAR', 'BIKE'],
  },
  {
    id: 'return-to-invoice',
    name: 'Return to invoice',
    blurb: 'On a total loss, pays the invoice price rather than the declared value.',
    percentOfOd: 12,
    minRupees: 1100,
    maxVehicleAge: 3,
    kinds: ['CAR'],
  },
  {
    id: 'consumables',
    name: 'Consumables',
    blurb: 'Covers oils, coolant, nuts and bolts, which a claim normally excludes.',
    percentOfOd: 6,
    minRupees: 500,
    maxVehicleAge: 5,
    kinds: ['CAR'],
  },
  {
    id: 'ncb-protect',
    name: 'No-claim bonus protection',
    blurb: 'Keeps your bonus after one claim in the year.',
    percentOfOd: 5,
    minRupees: 400,
    maxVehicleAge: 7,
    kinds: ['CAR', 'BIKE'],
  },
];

export function findAddOn(id: string | null | undefined): AddOn | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return ADD_ONS.find((addOn) => addOn.id === wanted);
}

/** Tax on a general insurance premium, as a percentage. */
export const PREMIUM_TAX_PERCENT = 18;
