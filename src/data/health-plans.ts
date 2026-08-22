/**
 * Health cover.
 *
 * **This store sells no insurance.** The plan below is invented, the rates are
 * illustrative, and no policy is issued anywhere in this codebase.
 *
 * What is worth having on a page like this is the structure, which the
 * reference's own page gets right and most explanations get wrong: a health
 * policy is a sum insured, a premium banded by age, a list of what is covered,
 * a list of what is not, and -- the part people are caught by -- a set of
 * waiting periods before particular things become claimable at all.
 *
 * All three lists are here because a benefits page that shows only the first is
 * the reason people find out about the third in a hospital.
 */

export const SUM_INSURED_LAKHS = [3, 5, 10, 15, 25, 50, 100] as const;
export type SumInsuredLakhs = (typeof SUM_INSURED_LAKHS)[number];

export interface AgeBand {
  /** Inclusive. */
  from: number;
  to: number;
  label: string;
  /** Annual premium per lakh of cover, in whole rupees. */
  ratePerLakh: number;
}

/**
 * Premium bands.
 *
 * A health premium climbs steeply with age, which is the single most important
 * thing about buying one and the reason the reference's page advertises a
 * lifetime discount for the under-35s.
 */
export const AGE_BANDS: readonly AgeBand[] = [
  { from: 18, to: 25, label: '18 to 25', ratePerLakh: 620 },
  { from: 26, to: 35, label: '26 to 35', ratePerLakh: 780 },
  { from: 36, to: 45, label: '36 to 45', ratePerLakh: 1180 },
  { from: 46, to: 55, label: '46 to 55', ratePerLakh: 1960 },
  { from: 56, to: 65, label: '56 to 65', ratePerLakh: 3240 },
  { from: 66, to: 75, label: '66 to 75', ratePerLakh: 5100 },
  { from: 76, to: 99, label: '76 and above', ratePerLakh: 7400 },
];

export function bandFor(age: number): AgeBand | undefined {
  return AGE_BANDS.find((band) => age >= band.from && age <= band.to);
}

export const MIN_AGE = 18;
export const MAX_AGE = 99;
export const CHILD_MIN_AGE = 0;
export const CHILD_MAX_AGE = 25;

/** How many people one policy may carry. */
export const MAX_ADULTS = 2;
export const MAX_CHILDREN = 4;

export interface Benefit {
  id: string;
  name: string;
  detail: string;
  /** The section it sits under on the benefits page. */
  group: string;
  /** Flagged as a headline feature at the top. */
  highlight?: boolean;
}

/** What the policy covers. */
export const COVERED: readonly Benefit[] = [
  {
    id: 'consumables',
    name: 'Consumables covered',
    detail: 'Gloves, syringes and the rest of the items a hospital bill itemises separately.',
    group: 'Highlighted features',
    highlight: true,
  },
  {
    id: 'no-room-cap',
    name: 'No room rent limit',
    detail: 'Any room category, so a proportionate deduction never applies to the whole bill.',
    group: 'Highlighted features',
    highlight: true,
  },
  {
    id: 'no-copay',
    name: 'No co-payment',
    detail: 'The insurer pays the whole admissible claim; you are not on the hook for a share.',
    group: 'Highlighted features',
    highlight: true,
  },
  {
    id: 'pre-post',
    name: 'Before and after hospital stay',
    detail: 'Related medical costs 60 days before admission and 180 days after discharge.',
    group: 'Before and after hospital stay',
  },
  {
    id: 'health-check',
    name: 'Annual health check-up',
    detail: 'One check-up a year from the second policy year onwards.',
    group: 'Preventive coverage',
  },
  {
    id: 'e-opinion',
    name: 'Second opinion on a critical illness',
    detail: 'One free online consultation across 51 listed critical illnesses.',
    group: 'Preventive coverage',
  },
  {
    id: 'home-treatment',
    name: 'Home treatment',
    detail: 'Care at home when a doctor certifies it is medically necessary.',
    group: 'Cover for special treatments',
  },
  {
    id: 'day-care',
    name: 'Day care treatment',
    detail: 'Procedures that do not need a 24-hour stay, which a plain policy excludes.',
    group: 'Cover for special treatments',
  },
  {
    id: 'ayush',
    name: 'AYUSH treatment',
    detail: 'Ayurveda, Yoga and Naturopathy, Unani, Siddha and Homeopathy.',
    group: 'Cover for special treatments',
  },
  {
    id: 'organ-donor',
    name: 'Organ donor expenses',
    detail: 'The cost of harvesting the organ from the donor.',
    group: 'Cover for special treatments',
  },
  {
    id: 'restore',
    name: 'Restores cover after a claim',
    detail: 'The base cover is reinstated in full after a claim, an unlimited number of times.',
    group: 'Cover beyond the sum insured',
  },
  {
    id: 'daily-cash',
    name: 'Daily cash for a shared room',
    detail: 'A daily allowance if you choose a shared room rather than a private one.',
    group: 'Cover beyond the sum insured',
  },
  {
    id: 'road-ambulance',
    name: 'Road ambulance',
    detail: 'Emergency transport within city limits.',
    group: 'Emergency transport',
  },
  {
    id: 'air-ambulance',
    name: 'Air ambulance',
    detail: 'Air transport in an emergency, where it is the only viable option.',
    group: 'Emergency transport',
  },
];

/**
 * What the policy does not cover.
 *
 * The reference's page has this tab and it is the more useful of the two. A
 * benefits page that only lists inclusions is how somebody discovers an
 * exclusion at the worst possible moment.
 */
export const NOT_COVERED: readonly Benefit[] = [
  {
    id: 'cosmetic',
    name: 'Cosmetic and aesthetic treatment',
    detail: 'Unless it follows an accident or is part of reconstructive treatment after one.',
    group: 'Treatments',
  },
  {
    id: 'obesity',
    name: 'Weight-loss surgery',
    detail: 'Unless medically indicated and certified above a stated body-mass threshold.',
    group: 'Treatments',
  },
  {
    id: 'dental',
    name: 'Routine dental and optical care',
    detail: 'Fillings, cleanings, spectacles and lenses, unless required after an accident.',
    group: 'Treatments',
  },
  {
    id: 'fertility',
    name: 'Fertility and sterility treatment',
    detail: 'Including assisted conception and its complications.',
    group: 'Treatments',
  },
  {
    id: 'self-harm',
    name: 'Deliberate self-injury and substance abuse',
    detail: 'Injury or illness arising from either.',
    group: 'Circumstances',
  },
  {
    id: 'hazardous',
    name: 'Hazardous sports and adventure activities',
    detail: 'Unless a specific add-on for them is in force.',
    group: 'Circumstances',
  },
  {
    id: 'war',
    name: 'War, invasion and nuclear risk',
    detail: 'A standard exclusion on every health policy.',
    group: 'Circumstances',
  },
  {
    id: 'unproven',
    name: 'Unproven or experimental treatment',
    detail: 'Treatment without established medical evidence at the time it is given.',
    group: 'Circumstances',
  },
];

export interface WaitingPeriod {
  id: string;
  name: string;
  detail: string;
  /** Months from the policy start. */
  months: number;
}

/**
 * When each thing becomes claimable.
 *
 * The tab people ignore and then need. A policy bought today does not cover a
 * pre-existing condition today, and saying so plainly is more useful than any
 * benefit on the first tab.
 */
export const WAITING_PERIODS: readonly WaitingPeriod[] = [
  {
    id: 'initial',
    name: 'Everything except accidents',
    detail: 'Illness is not claimable in the first 30 days. An accident is covered from day one.',
    months: 1,
  },
  {
    id: 'specific',
    name: 'Listed conditions',
    detail:
      'Cataract, hernia, joint replacement, kidney stones and other listed conditions wait two years.',
    months: 24,
  },
  {
    id: 'pre-existing',
    name: 'Pre-existing conditions',
    detail:
      'Anything diagnosed or treated before the policy started waits three years from the start date.',
    months: 36,
  },
  {
    id: 'maternity',
    name: 'Maternity',
    detail: 'Delivery and related expenses wait three years, and only on a plan that includes it.',
    months: 36,
  },
];

/** The headline benefits the marketing panel leads with. */
export const HEADLINE_BENEFITS: ReadonlyArray<{ name: string; detail: string }> = [
  {
    name: 'Infinite benefit',
    detail: '100% of the base sum insured added every claim-free year, without a ceiling.',
  },
  {
    name: 'Automatic restore',
    detail: 'The base cover comes back in full after a claim, an unlimited number of times.',
  },
  {
    name: 'Secure benefit',
    detail: 'The base sum insured is doubled from day one.',
  },
  {
    name: 'Lifetime discount',
    detail: '5% off for life if the eldest member is 35 or under when the policy starts.',
  },
];

/** Discounts that actually apply, and the conditions on each. */
export const HEALTH_DISCOUNTS: ReadonlyArray<{
  id: string;
  name: string;
  percent: number;
  condition: string;
}> = [
  { id: 'online', name: 'Bought online', percent: 5, condition: 'Applies to every policy here.' },
  {
    id: 'young',
    name: 'Lifetime discount',
    percent: 5,
    condition: 'Eldest member aged 35 or under at the start.',
  },
  {
    id: 'family',
    name: 'Family cover',
    percent: 10,
    condition: 'Two or more members on one policy.',
  },
  {
    id: 'two-year',
    name: 'Two-year term',
    percent: 7,
    condition: 'Paid for two years up front.',
  },
];

// The cashless hospital count lives on each insurer in `data/insurers.ts`,
// because it is a thing insurers differ on. A plan-wide constant here would
// have quietly contradicted the four figures the quote cards show.
