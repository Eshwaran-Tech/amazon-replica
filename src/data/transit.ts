/**
 * FASTag and metro cards.
 *
 * FASTag is India's electronic toll system: a windscreen tag read over radio at
 * a plaza, drawn against a prepaid balance. The rules modelled here are its
 * real ones -- a per-tag security deposit, a minimum balance below which the
 * tag is blacklisted at the barrier, and a monthly pass on a single plaza.
 *
 * The issuers and the metro networks are this store's own inventions, as every
 * brand added to this store has been. The *plazas* and *fare structure* follow
 * how tolling and metro fares actually work: distance slabs, not flat fares.
 */

export interface TagIssuer {
  /** URL id, lowercase kebab. */
  id: string;
  name: string;
  /** One-off, refundable when the tag is closed. */
  securityDepositRupees: number;
  /** The tag itself, non-refundable. */
  issuanceRupees: number;
  /** Below this the tag is refused at the barrier. */
  minBalanceRupees: number;
  hue: number;
}

export const TAG_ISSUERS: readonly TagIssuer[] = [
  {
    id: 'meridian-tag',
    name: 'Meridian Bank FASTag',
    securityDepositRupees: 200,
    issuanceRupees: 100,
    minBalanceRupees: 150,
    hue: 210,
  },
  {
    id: 'kestrel-tag',
    name: 'Kestrel Bank FASTag',
    securityDepositRupees: 150,
    issuanceRupees: 100,
    minBalanceRupees: 100,
    hue: 160,
  },
  {
    id: 'halcyon-tag',
    name: 'Halcyon Bank FASTag',
    securityDepositRupees: 250,
    issuanceRupees: 99,
    minBalanceRupees: 200,
    hue: 28,
  },
];

export function findIssuer(id: string | null | undefined): TagIssuer | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return TAG_ISSUERS.find((issuer) => issuer.id === wanted);
}

/**
 * Toll vehicle classes.
 *
 * The real classification tolls are charged by: what you pay at a plaza depends
 * on how many axles you have, not on what the vehicle cost.
 */
export const TOLL_CLASSES = [
  { id: 'CAR', label: 'Car, jeep or van', multiplier: 1 },
  { id: 'LCV', label: 'Light commercial vehicle', multiplier: 1.6 },
  { id: 'BUS', label: 'Bus or truck', multiplier: 3.35 },
  { id: 'HEAVY', label: 'Three-axle vehicle', multiplier: 3.65 },
  { id: 'OVERSIZE', label: 'Oversized vehicle', multiplier: 4.45 },
] as const;
export type TollClassId = (typeof TOLL_CLASSES)[number]['id'];

export function findTollClass(id: string | null | undefined) {
  if (!id) return undefined;
  const wanted = id.trim().toUpperCase();
  return TOLL_CLASSES.find((entry) => entry.id === wanted);
}

/** Recharge amounts offered, in whole rupees. */
export const TAG_TOP_UPS = [200, 500, 1000, 2000, 5000] as const;
export const MIN_TAG_TOP_UP = 100;
export const MAX_TAG_TOP_UP = 20_000;

// ---------------------------------------------------------------- the metro

export interface MetroNetwork {
  id: string;
  city: string;
  name: string;
  /** Card issued by the network. */
  cardName: string;
  /** Minimum kept on the card, in whole rupees. */
  minBalanceRupees: number;
  /** Percentage off every fare when paid by card rather than token. */
  cardDiscountPercent: number;
  /** Lines, for the network panel. */
  lines: readonly string[];
  hue: number;
}

/**
 * Metro networks.
 *
 * Invented, in real cities. A metro card is a stored-value card issued by an
 * operator, and putting a real operator's name on one this store issues would
 * be a promise made on their behalf.
 */
export const METRO_NETWORKS: readonly MetroNetwork[] = [
  {
    id: 'delhi',
    city: 'Delhi',
    name: 'Capital Metro',
    cardName: 'Capital Smart Card',
    minBalanceRupees: 50,
    cardDiscountPercent: 10,
    lines: ['Red', 'Blue', 'Yellow', 'Green', 'Violet', 'Magenta', 'Pink', 'Grey'],
    hue: 210,
  },
  {
    id: 'mumbai',
    city: 'Mumbai',
    name: 'Harbour Metro',
    cardName: 'Harbour Travel Card',
    minBalanceRupees: 50,
    cardDiscountPercent: 8,
    lines: ['Line 1', 'Line 2A', 'Line 7', 'Line 3'],
    hue: 12,
  },
  {
    id: 'bengaluru',
    city: 'Bengaluru',
    name: 'Garden Metro',
    cardName: 'Garden Smart Card',
    minBalanceRupees: 50,
    cardDiscountPercent: 5,
    lines: ['Purple', 'Green', 'Yellow'],
    hue: 140,
  },
  {
    id: 'chennai',
    city: 'Chennai',
    name: 'Coromandel Metro',
    cardName: 'Coromandel Travel Card',
    minBalanceRupees: 50,
    cardDiscountPercent: 20,
    lines: ['Blue', 'Green'],
    hue: 190,
  },
  {
    id: 'hyderabad',
    city: 'Hyderabad',
    name: 'Deccan Metro',
    cardName: 'Deccan Smart Card',
    minBalanceRupees: 50,
    cardDiscountPercent: 5,
    lines: ['Red', 'Blue', 'Green'],
    hue: 285,
  },
  {
    id: 'kolkata',
    city: 'Kolkata',
    name: 'Delta Metro',
    cardName: 'Delta Smart Card',
    minBalanceRupees: 50,
    cardDiscountPercent: 10,
    lines: ['Blue', 'Green', 'Purple', 'Orange'],
    hue: 340,
  },
];

export function findNetwork(id: string | null | undefined): MetroNetwork | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return METRO_NETWORKS.find((network) => network.id === wanted);
}

/**
 * Metro fare slabs, by distance.
 *
 * How every Indian metro prices a journey: a slab table, not a per-kilometre
 * rate. The figures are illustrative; the shape is the real one.
 */
export const FARE_SLABS: ReadonlyArray<{ maxKm: number; fareRupees: number }> = [
  { maxKm: 2, fareRupees: 10 },
  { maxKm: 5, fareRupees: 20 },
  { maxKm: 12, fareRupees: 30 },
  { maxKm: 21, fareRupees: 40 },
  { maxKm: 32, fareRupees: 50 },
  { maxKm: Number.POSITIVE_INFINITY, fareRupees: 60 },
];

/** Recharge amounts offered on a metro card, in whole rupees. */
export const METRO_TOP_UPS = [100, 200, 500, 1000, 2000] as const;
export const MIN_METRO_TOP_UP = 50;
export const MAX_METRO_TOP_UP = 3000;

/**
 * The fare for a distance.
 *
 * Slab, not rate: the first matching band wins, so 2.1 km and 4.9 km cost the
 * same, exactly as they do at a real gate.
 */
export function slabFare(km: number): number {
  const distance = Math.max(0, km);
  const slab = FARE_SLABS.find((entry) => distance <= entry.maxKm);
  return slab?.fareRupees ?? FARE_SLABS[FARE_SLABS.length - 1]?.fareRupees ?? 0;
}

/** What the same journey costs on a card rather than a token. */
export function cardFare(km: number, network: MetroNetwork): number {
  const token = slabFare(km);
  return Math.round(token * (1 - network.cardDiscountPercent / 100));
}
