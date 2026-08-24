import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { primeMembershipsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import { toPrimeMembership, type PrimeMembership, type PrimePlan } from '@/models/prime';
import type { WalletEntryDoc } from '@/models/wallet';

import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Prime membership.
 *
 * Paid for out of the Eshwaran Pay wallet, which is why this store's wallet had
 * to be real before this could be: joining writes a DEBIT to the same ledger
 * top-ups credit, so the balance on `/pay` and the membership here can never
 * disagree about whether the money moved.
 *
 * The membership benefit is likewise real rather than a badge --
 * `services/pricing.ts` waives the delivery threshold for members, so a
 * member's basket is genuinely cheaper at checkout.
 */

export interface PrimePlanDetails {
  plan: PrimePlan;
  name: string;
  price: Paise;
  months: number;
  /** Monthly equivalent, for the "Effectively ..." line. */
  perMonth: Paise;
}

function planOf(plan: PrimePlan, name: string, rupees: number, months: number): PrimePlanDetails {
  return {
    plan,
    name,
    price: rupeesToPaise(rupees),
    months,
    // Rounded to the rupee: a monthly equivalent quoted to the paisa is
    // precision the figure does not have.
    perMonth: rupeesToPaise(Math.round(rupees / months)),
  };
}

export const PRIME_PLANS_DETAILS: PrimePlanDetails[] = [
  planOf('LITE_ANNUAL', 'Prime Lite', 799, 12),
  planOf('ANNUAL', 'Prime Annual', 1499, 12),
  planOf('MONTHLY', 'Prime Monthly', 299, 1),
];

export function findPlan(plan: PrimePlan): PrimePlanDetails | undefined {
  return PRIME_PLANS_DETAILS.find((entry) => entry.plan === plan);
}

/** The membership row for a customer, active or lapsed. */
export async function getMembership(userId: string, now = new Date()): Promise<PrimeMembership | null> {
  if (!ObjectId.isValid(userId)) return null;

  const memberships = await primeMembershipsCollection();
  const doc = await memberships.findOne({ userId: new ObjectId(userId) });
  return doc ? toPrimeMembership(doc, now) : null;
}

/**
 * Whether a customer is a member *right now*.
 *
 * Read straight from the expiry date, so a lapsed membership stops conferring
 * its benefit the moment it lapses without anything having to sweep the
 * collection.
 */
export async function isPrimeMember(userId: string | null | undefined, now = new Date()): Promise<boolean> {
  if (!userId || !ObjectId.isValid(userId)) return false;

  const memberships = await primeMembershipsCollection();
  const doc = await memberships.findOne({ userId: new ObjectId(userId), expiresAt: { $gt: now } });
  return doc !== null;
}

export type JoinResult =
  | { ok: true; membership: PrimeMembership }
  | { ok: false; code: 'UNKNOWN_PLAN' | 'ALREADY_MEMBER' | 'INSUFFICIENT_BALANCE'; message: string };

/**
 * Starts a membership, charging the wallet.
 *
 * The debit is written before the membership, so a failure between the two
 * leaves the customer charged and un-enrolled -- recoverable by support. The
 * other order would hand out memberships whenever the process died at the
 * right moment, which is not recoverable at all.
 */
export async function joinPrime(
  userId: string,
  plan: PrimePlan,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<JoinResult> {
  const details = findPlan(plan);
  if (!details || !ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN_PLAN', message: 'Choose one of the plans listed.' };
  }

  const existing = await getMembership(userId, now);
  if (existing?.active) {
    return {
      ok: false,
      code: 'ALREADY_MEMBER',
      message: 'You are already a Prime member. Your plan renews or ends on the date shown.',
    };
  }

  const { balance } = await getWalletSummary(userId);
  if (balance < details.price) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough for this plan. Add money and try again.',
    };
  }

  const entries = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'PRIME',
    direction: 'DEBIT',
    amount: details.price,
    status: 'COMPLETED',
    currency: 'INR',
    reference: `PR-${randomBytes(3).toString('hex').toUpperCase()}`,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await entries.insertOne(debit);

  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + details.months);

  const memberships = await primeMembershipsCollection();
  await memberships.updateOne(
    { userId: new ObjectId(userId) },
    {
      $set: {
        userId: new ObjectId(userId),
        plan,
        pricePaid: details.price,
        startedAt: now,
        expiresAt,
        cancelledAt: null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  await recordAuditAndAlert(
    {
      action: 'prime.joined',
      actorId: userId,
      targetType: 'primeMembership',
      targetId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { plan, price: details.price },
    },
    'info',
  );

  const membership = await getMembership(userId, now);
  if (!membership) {
    return { ok: false, code: 'UNKNOWN_PLAN', message: 'We could not start the membership.' };
  }
  return { ok: true, membership };
}

export type CancelResult = { ok: true } | { ok: false; message: string };

/**
 * Turns off renewal.
 *
 * Deliberately does **not** end the membership or refund it: the term was paid
 * for and runs to its expiry date. Cutting it short on cancellation would take
 * money for time not given.
 */
export async function cancelPrime(
  userId: string,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<CancelResult> {
  if (!ObjectId.isValid(userId)) return { ok: false, message: 'We could not find your membership.' };

  const memberships = await primeMembershipsCollection();
  const result = await memberships.updateOne(
    { userId: new ObjectId(userId), expiresAt: { $gt: now }, cancelledAt: null },
    { $set: { cancelledAt: now, updatedAt: now } },
  );

  if (result.matchedCount === 0) {
    return { ok: false, message: 'There is no active membership to cancel.' };
  }

  await recordAuditAndAlert(
    {
      action: 'prime.cancelled',
      actorId: userId,
      targetType: 'primeMembership',
      targetId: userId,
      ip: context.ip,
      userAgent: context.userAgent,
    },
    'info',
  );

  return { ok: true };
}
