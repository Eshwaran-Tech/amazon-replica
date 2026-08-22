import { ObjectId, type ClientSession } from 'mongodb';

import {
  findOffer,
  offerReward,
  REWARD_OFFERS,
  type RewardOffer,
  type RewardSurface,
} from '@/data/reward-offers';
import { rewardClaimsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import type { RewardClaimDoc, RewardClaimView } from '@/models/reward-claim';

import '@/lib/server-guard';

/**
 * Collected rewards.
 *
 * The reference's rewards page is a wall of "Collect Now" buttons. Collecting
 * here writes a claim, and the claim is what a later order actually spends --
 * so the button is a promise the store keeps rather than a state that resets on
 * reload.
 *
 * Three things make it safe to hand out money this way:
 *
 *  1. **One claim per offer per customer.** A unique index on
 *     `(userId, offerId)` enforces it, so double-clicking Collect cannot mint
 *     two claims.
 *  2. **Redemption is a conditional update from CLAIMED.** Two orders racing
 *     the same claim: the loser matches no document and pays nothing.
 *  3. **Expiry is checked at redemption, not just displayed.** A lapsed claim
 *     is worth nothing even if the page still shows it.
 */

export interface ClaimableOffer {
  offer: RewardOffer;
  /** Null when the customer has not collected it. */
  claim: RewardClaimView | null;
  /** True when it can be collected right now. */
  collectable: boolean;
}

export type CollectResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; code: 'UNKNOWN_OFFER' | 'ALREADY_CLAIMED' | 'NOT_ELIGIBLE'; message: string };

function toView(doc: RewardClaimDoc): RewardClaimView {
  return {
    id: doc._id.toHexString(),
    offerId: doc.offerId,
    status: doc.status,
    claimedAt: doc.claimedAt,
    expiresAt: doc.expiresAt,
    redeemedAt: doc.redeemedAt,
    redeemedAgainst: doc.redeemedAgainst,
    rewardPaid: doc.rewardPaid,
  };
}

/** Every offer this customer can see, with whatever they have collected. */
export async function listOffers(
  userId: string | null,
  isPrime: boolean,
  now = new Date(),
): Promise<ClaimableOffer[]> {
  const visible = REWARD_OFFERS.filter((offer) => !offer.primeOnly || isPrime);

  if (!userId || !ObjectId.isValid(userId)) {
    return visible.map((offer) => ({ offer, claim: null, collectable: false }));
  }

  const claims = await rewardClaimsCollection();
  const mine = await claims.find({ userId: new ObjectId(userId) }).toArray();
  const byOffer = new Map(mine.map((doc) => [doc.offerId, doc]));

  return visible.map((offer) => {
    const doc = byOffer.get(offer.id);
    if (!doc) return { offer, claim: null, collectable: true };

    // A lapsed claim reads as expired here even before the sweep marks it, so
    // the page never offers to spend something that is already dead.
    const claim = toView(doc);
    if (claim.status === 'CLAIMED' && claim.expiresAt <= now) {
      return { offer, claim: { ...claim, status: 'EXPIRED' }, collectable: false };
    }
    return { offer, claim, collectable: false };
  });
}

export async function collectOffer(
  userId: string,
  offerId: string,
  isPrime: boolean,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<CollectResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN_OFFER', message: 'Please sign in again.' };
  }

  const offer = findOffer(offerId);
  if (!offer) {
    return { ok: false, code: 'UNKNOWN_OFFER', message: 'That offer is no longer running.' };
  }
  if (offer.primeOnly && !isPrime) {
    return {
      ok: false,
      code: 'NOT_ELIGIBLE',
      message: 'That offer is for Prime members.',
    };
  }

  const claims = await rewardClaimsCollection();
  const expiresAt = new Date(now.getTime() + offer.validForDays * 24 * 60 * 60 * 1000);

  const doc: RewardClaimDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    offerId: offer.id,
    status: 'CLAIMED',
    claimedAt: now,
    expiresAt,
    redeemedAt: null,
    redeemedAgainst: null,
    rewardPaid: null,
  };

  try {
    await claims.insertOne(doc);
  } catch (error) {
    // The unique index is the guard, not a prior read: two clicks racing each
    // other both reach here, and exactly one wins.
    if ((error as { code?: number }).code === 11000) {
      return {
        ok: false,
        code: 'ALREADY_CLAIMED',
        message: 'You have already collected that offer.',
      };
    }
    throw error;
  }

  await recordAuditAndAlert(
    {
      action: 'reward.collected',
      actorId: userId,
      targetType: 'rewardClaim',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { offer: offer.id, expiresAt: expiresAt.toISOString() },
    },
    'info',
  );

  return { ok: true, expiresAt };
}

export interface BestClaim {
  claimId: ObjectId;
  offer: RewardOffer;
  reward: Paise;
}

/**
 * The best live claim this order could spend, if any.
 *
 * Read-only: it picks a candidate, and `spendClaim` below is what actually
 * commits it. Splitting the two means the caller can compare this against the
 * order tiers and use whichever pays more, without having burnt a claim to
 * find out.
 */
export async function bestClaimFor(
  userId: string,
  surface: RewardSurface,
  orderTotal: Paise,
  options: { session?: ClientSession; now?: Date } = {},
): Promise<BestClaim | null> {
  if (!ObjectId.isValid(userId)) return null;
  const now = options.now ?? new Date();

  const claims = await rewardClaimsCollection();
  const live = await claims
    .find(
      {
        userId: new ObjectId(userId),
        status: 'CLAIMED',
        expiresAt: { $gt: now },
      },
      options.session ? { session: options.session } : {},
    )
    .toArray();

  let best: BestClaim | null = null;

  for (const doc of live) {
    const offer = findOffer(doc.offerId);
    if (!offer || offer.surface !== surface) continue;

    const reward = offerReward(offer, orderTotal);
    if (reward <= 0) continue;
    if (!best || reward > best.reward) {
      best = { claimId: doc._id, offer, reward };
    }
  }

  return best;
}

/**
 * Spends a claim.
 *
 * A conditional update from CLAIMED: two orders racing the same claim, and the
 * loser modifies nothing and is told so by the count. The caller must not
 * credit anything when this returns false.
 */
export async function spendClaim(
  claimId: ObjectId,
  reward: Paise,
  against: string,
  options: { session?: ClientSession; now?: Date } = {},
): Promise<boolean> {
  const now = options.now ?? new Date();
  const claims = await rewardClaimsCollection();

  const result = await claims.updateOne(
    { _id: claimId, status: 'CLAIMED', expiresAt: { $gt: now } },
    {
      $set: {
        status: 'REDEEMED',
        redeemedAt: now,
        redeemedAgainst: against,
        rewardPaid: reward,
      },
    },
    options.session ? { session: options.session } : {},
  );

  return result.modifiedCount === 1;
}

/**
 * What this customer has actually earned in cashback, from the ledger.
 *
 * Summed from the wallet rather than from the claims, because the ledger is
 * what was paid -- a claim marked REDEEMED with no matching credit would be a
 * bug, and reading the claims would hide it.
 */
export async function cashbackEarned(userId: string): Promise<Paise> {
  if (!ObjectId.isValid(userId)) return 0;

  const entries = await walletEntriesCollection();
  const rows = await entries
    .aggregate<{ _id: null; total: number }>([
      {
        $match: {
          userId: new ObjectId(userId),
          type: 'CASHBACK',
          direction: 'CREDIT',
          status: 'COMPLETED',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])
    .toArray();

  return rows[0]?.total ?? 0;
}

/** This customer's claims, newest first. Ownership is in the query. */
export async function listClaims(userId: string, limit = 20): Promise<RewardClaimView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const claims = await rewardClaimsCollection();
  const docs = await claims
    .find({ userId: new ObjectId(userId) })
    .sort({ claimedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toView);
}
