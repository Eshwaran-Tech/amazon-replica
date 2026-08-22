import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A collected reward offer.
 *
 * Collecting is a promise the store then has to keep, so it is a record rather
 * than a UI state: which offer, when it was taken, when it lapses, and -- once
 * it pays out -- which order spent it and for how much.
 *
 * `status` is the whole point. A claim moves CLAIMED -> REDEEMED exactly once,
 * through a conditional update, so two orders placed at the same moment cannot
 * both spend the same offer.
 */

export const REWARD_CLAIM_STATUSES = ['CLAIMED', 'REDEEMED', 'EXPIRED'] as const;
export type RewardClaimStatus = (typeof REWARD_CLAIM_STATUSES)[number];

export interface RewardClaimDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** Offer id from `data/reward-offers.ts`. */
  offerId: string;
  status: RewardClaimStatus;
  claimedAt: Date;
  expiresAt: Date;
  /** Set when the claim pays out. */
  redeemedAt: Date | null;
  /** The order, recharge or booking reference that spent it. */
  redeemedAgainst: string | null;
  /** What it actually paid. */
  rewardPaid: Paise | null;
}

export interface RewardClaimView {
  id: string;
  offerId: string;
  status: RewardClaimStatus;
  claimedAt: Date;
  expiresAt: Date;
  redeemedAt: Date | null;
  redeemedAgainst: string | null;
  rewardPaid: Paise | null;
}
