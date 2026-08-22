import type { ContentStore } from '@/models/content-credit';

/**
 * App store and Play credit.
 *
 * **This is not the wallet with a different label.** It is a *scoped* balance:
 * it buys digital content on this store and nothing else, it cannot be
 * withdrawn, and it is spent before the wallet is when a rental is paid for.
 * That is precisely what a store credit is, and the scope is what makes it
 * worth having as its own instrument rather than as another way to hold money.
 *
 * The two mechanics here are the ones store credit actually has and the wallet
 * does not:
 *
 *  - **A bonus for topping up more at once.** Real, and it is why anybody buys
 *    credit rather than paying per rental. Shown as a rate, not as "save big".
 *  - **Automatic reload.** Genuinely useful and genuinely awkward, because it
 *    has to be checked at the moment of *spending* rather than at top-up. It is
 *    also the one feature on this store that can charge you without your having
 *    pressed anything, so it carries a monthly cap and says so.
 */

export interface StoreInfo {
  id: ContentStore;
  name: string;
  blurb: string;
  /** What the credit may be spent on here, in the customer's terms. */
  spendableOn: readonly string[];
  hue: number;
}

export const STORES: readonly StoreInfo[] = [
  {
    id: 'APPSTORE',
    name: 'App Store credit',
    blurb: 'For apps, subscriptions and in-app purchases.',
    spendableOn: ['Film and series rentals', 'Channel subscriptions', 'In-app purchases'],
    hue: 210,
  },
  {
    id: 'PLAY',
    name: 'Play credit',
    blurb: 'For games, add-ons and season passes.',
    spendableOn: ['Games and add-ons', 'Channel subscriptions', 'Film and series rentals'],
    hue: 140,
  },
];

export function findStore(id: string | null | undefined): StoreInfo | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toUpperCase();
  return STORES.find((store) => store.id === wanted);
}

export interface Denomination {
  rupees: number;
  /** Extra credit added on top, in whole rupees. */
  bonusRupees: number;
}

/**
 * What a top-up costs and what it puts on.
 *
 * The bonus rises with the amount, which is the whole mechanic. The percentage
 * is shown on the page rather than the rupee figure alone, because ₹250 free
 * reads as generous until you notice it is on ₹5,000.
 */
export const DENOMINATIONS: readonly Denomination[] = [
  { rupees: 100, bonusRupees: 0 },
  { rupees: 300, bonusRupees: 0 },
  { rupees: 500, bonusRupees: 15 },
  { rupees: 1000, bonusRupees: 40 },
  { rupees: 2000, bonusRupees: 110 },
  { rupees: 5000, bonusRupees: 350 },
];

export function findDenomination(rupees: number): Denomination | undefined {
  return DENOMINATIONS.find((entry) => entry.rupees === rupees);
}

export const MIN_TOP_UP = 100;
export const MAX_TOP_UP = 10_000;
export const MAX_BALANCE_RUPEES = 50_000;

/**
 * The bonus on an amount that is not one of the listed denominations.
 *
 * A custom top-up earns the bonus rate of the largest denomination it clears,
 * rather than nothing -- which is what a customer would reasonably expect, and
 * the opposite of what a badly built ladder does at ₹999.
 */
export function bonusFor(rupees: number): number {
  let rate = 0;
  for (const entry of DENOMINATIONS) {
    if (rupees >= entry.rupees && entry.rupees > 0) {
      rate = entry.bonusRupees / entry.rupees;
    }
  }
  return Math.floor(rupees * rate);
}

/** Auto-reload thresholds and amounts a customer may choose between. */
export const RELOAD_THRESHOLDS = [50, 100, 200, 500] as const;
export const RELOAD_AMOUNTS = [200, 500, 1000, 2000] as const;

/** However it is configured, it may not fire more than this in a month. */
export const MAX_RELOADS_PER_MONTH = 3;
