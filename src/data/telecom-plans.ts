/**
 * Postpaid, landline and broadband tariff books.
 *
 * Three genuinely different products, and the differences are what the pages
 * are built around:
 *
 *  - A **postpaid** plan is a rental with a data quota, and the bill is the
 *    rental plus whatever went past it. The interesting question is whether a
 *    different plan would have been cheaper for the month you actually had.
 *  - A **landline** is a rental with a free-call allowance, and calls beyond it
 *    are metered *by type* -- local, STD and ISD are three different rates.
 *  - **Broadband** is a speed tier with a fair-use limit, and what happens past
 *    the limit is a throttle, not a charge, on most plans.
 *
 * Operators are the four this project's prepaid book already uses. Prices are
 * illustrative; the structures are how these products really work.
 */

export interface PostpaidPlan {
  id: string;
  name: string;
  /** Monthly rental, before tax, in whole rupees. */
  rentalRupees: number;
  /** Data included, in GB. */
  dataGb: number;
  /** Charged per GB beyond the quota. */
  overagePerGb: number;
  /** Minutes of ISD included; beyond it, metered. */
  isdMinutes: number;
  /** What the plan bundles, for the picker. */
  includes: readonly string[];
  /** Lines this rental covers, for a family plan. */
  connections: number;
}

export const POSTPAID_PLANS: readonly PostpaidPlan[] = [
  {
    id: 'pp-399',
    name: 'Postpaid 399',
    rentalRupees: 399,
    dataGb: 40,
    overagePerGb: 10,
    isdMinutes: 0,
    includes: ['Unlimited calls', '100 SMS a day', 'Data rollover up to 200 GB'],
    connections: 1,
  },
  {
    id: 'pp-599',
    name: 'Postpaid 599',
    rentalRupees: 599,
    dataGb: 75,
    overagePerGb: 10,
    isdMinutes: 0,
    includes: ['Unlimited calls', '100 SMS a day', 'One streaming subscription'],
    connections: 1,
  },
  {
    id: 'pp-799',
    name: 'Family 799',
    rentalRupees: 799,
    dataGb: 115,
    overagePerGb: 8,
    isdMinutes: 30,
    includes: ['Two connections on one pool', 'Unlimited calls', 'Two streaming subscriptions'],
    connections: 2,
  },
  {
    id: 'pp-1099',
    name: 'Family 1099',
    rentalRupees: 1099,
    dataGb: 200,
    overagePerGb: 6,
    isdMinutes: 100,
    includes: ['Three connections on one pool', 'International roaming pack', 'Priority support'],
    connections: 3,
  },
  {
    id: 'pp-1699',
    name: 'Infinity 1699',
    rentalRupees: 1699,
    dataGb: 400,
    overagePerGb: 4,
    isdMinutes: 250,
    includes: ['Four connections', 'Unlimited 5G', 'Airport lounge access'],
    connections: 4,
  },
];

export function findPostpaidPlan(id: string | null | undefined): PostpaidPlan | undefined {
  if (!id) return undefined;
  return POSTPAID_PLANS.find((plan) => plan.id === id.trim().toLowerCase());
}

/** Value-added subscriptions a postpaid bill picks up, priced monthly. */
export const POSTPAID_VAS: ReadonlyArray<{ id: string; label: string; rupees: number }> = [
  { id: 'caller-tune', label: 'Caller tunes', rupees: 39 },
  { id: 'cloud-backup', label: 'Cloud backup, 50 GB', rupees: 75 },
  { id: 'security', label: 'Device security', rupees: 49 },
  { id: 'news', label: 'News bundle', rupees: 29 },
];

/** Charged per minute once the ISD allowance runs out. */
export const ISD_PER_MINUTE = 6.5;

/** National roaming is free; international is not. Per day, per pack. */
export const ROAMING_PER_DAY = 649;

export const TELECOM_GST_PERCENT = 18;

// ---------------------------------------------------------------- landline

export interface LandlinePlan {
  id: string;
  name: string;
  rentalRupees: number;
  /** Free calls included, in minutes. */
  freeMinutes: number;
}

export const LANDLINE_PLANS: readonly LandlinePlan[] = [
  { id: 'll-199', name: 'Landline 199', rentalRupees: 199, freeMinutes: 200 },
  { id: 'll-299', name: 'Landline 299', rentalRupees: 299, freeMinutes: 600 },
  { id: 'll-499', name: 'Landline 499', rentalRupees: 499, freeMinutes: 1500 },
];

/**
 * Call rates, per minute.
 *
 * Three rates rather than one, because that is how a landline has always been
 * metered and it is why the itemised part of the bill is worth reading.
 */
export const CALL_RATES: ReadonlyArray<{ id: string; label: string; perMinute: number }> = [
  { id: 'local', label: 'Local calls', perMinute: 0.6 },
  { id: 'std', label: 'STD calls', perMinute: 1.1 },
  { id: 'isd', label: 'ISD calls', perMinute: 7.2 },
];

// --------------------------------------------------------------- broadband

export interface BroadbandPlan {
  id: string;
  name: string;
  rentalRupees: number;
  speedMbps: number;
  /** Fair-use limit, in GB. */
  fupGb: number;
  /** Speed after the limit is reached. */
  throttledMbps: number;
  includes: readonly string[];
}

export const BROADBAND_PLANS: readonly BroadbandPlan[] = [
  {
    id: 'bb-499',
    name: 'Fibre 40',
    rentalRupees: 499,
    speedMbps: 40,
    fupGb: 750,
    throttledMbps: 2,
    includes: ['Unlimited calls to any network'],
  },
  {
    id: 'bb-799',
    name: 'Fibre 100',
    rentalRupees: 799,
    speedMbps: 100,
    fupGb: 1500,
    throttledMbps: 4,
    includes: ['Unlimited calls', 'One streaming subscription'],
  },
  {
    id: 'bb-1199',
    name: 'Fibre 200',
    rentalRupees: 1199,
    speedMbps: 200,
    fupGb: 3300,
    throttledMbps: 8,
    includes: ['Unlimited calls', 'Three streaming subscriptions'],
  },
  {
    id: 'bb-1999',
    name: 'Fibre 400',
    rentalRupees: 1999,
    speedMbps: 400,
    fupGb: 6600,
    throttledMbps: 15,
    includes: ['Unlimited calls', 'Full streaming bundle', 'Priority fault repair'],
  },
];

export function findBroadbandPlan(id: string | null | undefined): BroadbandPlan | undefined {
  if (!id) return undefined;
  return BROADBAND_PLANS.find((plan) => plan.id === id.trim().toLowerCase());
}

/** Add-ons a broadband account can carry, priced monthly. */
export const BROADBAND_ADDONS: ReadonlyArray<{ id: string; label: string; rupees: number }> = [
  { id: 'static-ip', label: 'Static IP address', rupees: 250 },
  { id: 'mesh', label: 'Mesh extender rental', rupees: 150 },
  { id: 'landline', label: 'Landline bundled', rupees: 99 },
];
