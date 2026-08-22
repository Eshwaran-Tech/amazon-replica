import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * Claimable cashback offers.
 *
 * The reference's rewards page is a wall of "GET UP TO ₹50 / Min order ₹100 /
 * Collect Now" tiles. Here those tiles are real: collecting one records a claim
 * against your account, and the next qualifying order pays it out of the same
 * ledger everything else in this store is paid from.
 *
 * Two rules make that honest rather than decorative:
 *
 *  1. **One offer per order.** They do not stack with each other or with the
 *     order tiers in `services/cashback.ts` -- the better of the two applies.
 *     Stacking is how "up to ₹50" quietly becomes ₹150.
 *  2. **"Up to" means capped.** A percentage offer pays the percentage or the
 *     cap, whichever is smaller, and the cap is on the tile.
 */

/** Where an offer can be spent. */
export const REWARD_SURFACES = ['SHOPPING', 'RECHARGE', 'TRAVEL', 'GIFT_CARD', 'PRIME'] as const;
export type RewardSurface = (typeof REWARD_SURFACES)[number];

export interface RewardOffer {
  /** URL id, lowercase kebab. */
  id: string;
  /** "Get up to ₹50" -- the headline on the tile. */
  headline: string;
  /** The line under it. */
  terms: string;
  surface: RewardSurface;
  /** Percentage of the order, or zero for a flat reward. */
  percent: number;
  /** Flat reward, or the cap when `percent` is set. */
  rewardRupees: number;
  /** Smallest order that qualifies. */
  minOrderRupees: number;
  /** Days the claim stays live once collected. */
  validForDays: number;
  /** Prime-only offers are invisible to everyone else. */
  primeOnly: boolean;
  /** Hue for the tile artwork. */
  hue: number;
}

export const REWARD_OFFERS: readonly RewardOffer[] = [
  {
    id: 'shop-50',
    headline: 'Get up to ₹50 back',
    terms: '10% back on a shopping order',
    surface: 'SHOPPING',
    percent: 10,
    rewardRupees: 50,
    minOrderRupees: 100,
    validForDays: 30,
    primeOnly: false,
    hue: 34,
  },
  {
    id: 'shop-flat-25',
    headline: 'Get flat ₹25 back',
    terms: 'On any shopping order above ₹199',
    surface: 'SHOPPING',
    percent: 0,
    rewardRupees: 25,
    minOrderRupees: 199,
    validForDays: 30,
    primeOnly: false,
    hue: 20,
  },
  {
    id: 'shop-100',
    headline: 'Get up to ₹100 back',
    terms: '10% back above ₹899',
    surface: 'SHOPPING',
    percent: 10,
    rewardRupees: 100,
    minOrderRupees: 899,
    validForDays: 30,
    primeOnly: false,
    hue: 8,
  },
  {
    id: 'shop-200-prime',
    headline: 'Get flat ₹200 back',
    terms: 'Prime members, on orders above ₹1,499',
    surface: 'SHOPPING',
    percent: 0,
    rewardRupees: 200,
    minOrderRupees: 1499,
    validForDays: 45,
    primeOnly: true,
    hue: 200,
  },
  {
    id: 'recharge-40',
    headline: 'Get flat ₹40 back',
    terms: 'On a mobile recharge above ₹299',
    surface: 'RECHARGE',
    percent: 0,
    rewardRupees: 40,
    minOrderRupees: 299,
    validForDays: 30,
    primeOnly: false,
    hue: 265,
  },
  {
    id: 'recharge-5pc',
    headline: 'Get up to ₹55 back',
    terms: '5% back on any recharge',
    surface: 'RECHARGE',
    percent: 5,
    rewardRupees: 55,
    minOrderRupees: 149,
    validForDays: 30,
    primeOnly: false,
    hue: 288,
  },
  {
    id: 'travel-500',
    headline: 'Get up to ₹500 back',
    terms: '5% back on a flight, bus, train or hotel',
    surface: 'TRAVEL',
    percent: 5,
    rewardRupees: 500,
    minOrderRupees: 1000,
    validForDays: 60,
    primeOnly: false,
    hue: 190,
  },
  {
    id: 'travel-150',
    headline: 'Get flat ₹150 back',
    terms: 'On a bus or train ticket above ₹800',
    surface: 'TRAVEL',
    percent: 0,
    rewardRupees: 150,
    minOrderRupees: 800,
    validForDays: 45,
    primeOnly: false,
    hue: 168,
  },
  {
    id: 'gift-100',
    headline: 'Get up to ₹100 back',
    terms: '5% back when you send a gift card',
    surface: 'GIFT_CARD',
    percent: 5,
    rewardRupees: 100,
    minOrderRupees: 500,
    validForDays: 30,
    primeOnly: false,
    hue: 340,
  },
  {
    id: 'prime-99',
    headline: 'Get flat ₹99 back',
    terms: 'When you join or renew Prime',
    surface: 'PRIME',
    percent: 0,
    rewardRupees: 99,
    minOrderRupees: 299,
    validForDays: 90,
    primeOnly: false,
    hue: 210,
  },
];

export function findOffer(id: string | null | undefined): RewardOffer | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return REWARD_OFFERS.find((offer) => offer.id === wanted);
}

/** What one offer would pay on an order of this size, in paise. */
export function offerReward(offer: RewardOffer, orderTotal: Paise): Paise {
  if (orderTotal < rupeesToPaise(offer.minOrderRupees)) return 0;

  const cap = rupeesToPaise(offer.rewardRupees);
  if (offer.percent === 0) return cap;

  // "Up to" means capped: the percentage or the cap, whichever is smaller.
  return Math.min(cap, Math.round((orderTotal * offer.percent) / 100));
}

/** The surfaces an offer applies to, as the tile prints them. */
export const SURFACE_LABELS: Record<RewardSurface, string> = {
  SHOPPING: 'Shopping',
  RECHARGE: 'Recharges',
  TRAVEL: 'Travel',
  GIFT_CARD: 'Gift cards',
  PRIME: 'Prime',
};

/**
 * The ways to earn, as the reference's second row shows them.
 *
 * Each one points at a surface of this store that genuinely pays cashback, so
 * a tile that says "earn every time you shop" is describing something that
 * happens.
 */
export const EARN_TILES: ReadonlyArray<{
  label: string;
  blurb: string;
  href: string;
  surface: RewardSurface;
}> = [
  {
    label: 'Shop',
    blurb: 'Cashback on qualifying orders, credited when the order is placed.',
    href: '/products',
    surface: 'SHOPPING',
  },
  {
    label: 'Recharge',
    blurb: 'Top up any number and take the offer with it.',
    href: '/pay/recharge',
    surface: 'RECHARGE',
  },
  {
    label: 'Book travel',
    blurb: 'Flights, buses, trains and hotels all draw on the same balance.',
    href: '/buses',
    surface: 'TRAVEL',
  },
  {
    label: 'Send a gift card',
    blurb: 'Cashback on what you pay, not on what they get.',
    href: '/gift-cards',
    surface: 'GIFT_CARD',
  },
  {
    label: 'Join Prime',
    blurb: 'One reward on joining or renewing.',
    href: '/prime',
    surface: 'PRIME',
  },
];
