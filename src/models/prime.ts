import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A Prime membership.
 *
 * One row per customer, replaced when they rejoin. `expiresAt` is the whole
 * truth about whether the membership is live: there is no `isActive` flag to
 * fall out of step with the date, and nothing has to run on a schedule to
 * expire anybody -- a membership lapses simply by the clock passing it.
 *
 * `cancelledAt` records that a member turned off renewal; it does *not* end
 * the membership, because they paid for the term and keep it to the end.
 */

export const PRIME_PLANS = ['LITE_ANNUAL', 'ANNUAL', 'MONTHLY'] as const;
export type PrimePlan = (typeof PRIME_PLANS)[number];

export interface PrimeMembershipDoc {
  _id: ObjectId;
  userId: ObjectId;
  plan: PrimePlan;
  /** What was actually charged, snapshotted against later price changes. */
  pricePaid: Paise;
  startedAt: Date;
  expiresAt: Date;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrimeMembership {
  plan: PrimePlan;
  pricePaid: Paise;
  startedAt: Date;
  expiresAt: Date;
  cancelledAt: Date | null;
  /** Derived from `expiresAt`, never stored. */
  active: boolean;
  daysLeft: number;
}

export function toPrimeMembership(doc: PrimeMembershipDoc, now: Date): PrimeMembership {
  const active = doc.expiresAt > now;
  return {
    plan: doc.plan,
    pricePaid: doc.pricePaid,
    startedAt: doc.startedAt,
    expiresAt: doc.expiresAt,
    cancelledAt: doc.cancelledAt ?? null,
    active,
    daysLeft: active
      ? Math.ceil((doc.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0,
  };
}
