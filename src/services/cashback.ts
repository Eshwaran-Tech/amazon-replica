import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * Order cashback.
 *
 * The Now store's savings panel advertises "₹50 above ₹499" and the tiers
 * beside it. This is where those numbers live, and crediting them is a real
 * ledger write in `services/checkout.ts` -- the coins on that panel are not
 * decoration, and the money lands in the same wallet Prime and rentals are paid
 * from.
 *
 * One tier applies per order: the highest whose threshold the order clears.
 * They do not stack, which is the rule every real programme uses and the only
 * one that keeps "₹100 above ₹899" from silently meaning "₹150".
 */

export interface CashbackTier {
  /** Order total at or above which the reward applies. */
  minOrder: Paise;
  reward: Paise;
  /** Prime-only tiers are invisible to everyone else. */
  primeOnly: boolean;
}

export const CASHBACK_TIERS: readonly CashbackTier[] = [
  { minOrder: rupeesToPaise(499), reward: rupeesToPaise(50), primeOnly: false },
  { minOrder: rupeesToPaise(899), reward: rupeesToPaise(100), primeOnly: false },
  { minOrder: rupeesToPaise(1499), reward: rupeesToPaise(200), primeOnly: true },
];

export interface CashbackResult {
  reward: Paise;
  tier: CashbackTier | null;
}

/** The single tier an order earns, or none. */
export function cashbackFor(total: Paise, isPrime: boolean): CashbackResult {
  let best: CashbackTier | null = null;

  for (const tier of CASHBACK_TIERS) {
    if (tier.primeOnly && !isPrime) continue;
    if (total < tier.minOrder) continue;
    if (!best || tier.reward > best.reward) best = tier;
  }

  return { reward: best?.reward ?? 0, tier: best };
}

/** The tiers a given customer can actually reach, for display. */
export function visibleTiers(isPrime: boolean): CashbackTier[] {
  return CASHBACK_TIERS.filter((tier) => !tier.primeOnly || isPrime);
}

/**
 * How much more this basket needs for the next tier up, and what it would earn.
 * Null once the top tier available to this customer is already reached.
 */
export function nextTier(
  total: Paise,
  isPrime: boolean,
): { tier: CashbackTier; shortfall: Paise } | null {
  const reachable = CASHBACK_TIERS.filter((tier) => !tier.primeOnly || isPrime);
  const upcoming = reachable.filter((tier) => total < tier.minOrder);
  const tier = upcoming[0];
  return tier ? { tier, shortfall: tier.minOrder - total } : null;
}
