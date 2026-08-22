import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { rechargesCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import { CIRCLES, findOperator, findPlan } from '@/data/recharge-plans';
import { detectOperator, isValidMobile } from '@/lib/recharge/detect';
import type { RechargeDoc, RechargeView } from '@/models/recharge';
import type { WalletEntryDoc } from '@/models/wallet';

import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Prepaid mobile recharge.
 *
 * Paid out of the Amazon Pay wallet, like Prime and the video rentals, so every
 * rupee this store takes lands in one ledger.
 *
 * **What the operator lookup really is.** A real recharge page asks the
 * operator's number-portability database who owns a number and which circle it
 * belongs to. There is no such integration here, so the answer is derived from
 * the number itself and is stable per number -- and the page says so, rather
 * than letting a guess read as a lookup. The customer can override it, which is
 * what the "Edit" control in the reference is for and what a real page needs
 * anyway once a number has been ported.
 */

/** Recent recharges, newest first. Ownership is in the query. */
export async function listRecharges(userId: string, limit = 5): Promise<RechargeView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const recharges = await rechargesCollection();
  const docs = await recharges
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    mobile: doc.mobile,
    operatorName: findOperator(doc.operatorId)?.name ?? doc.operatorId,
    circle: doc.circle,
    amount: doc.amount,
    reference: doc.reference,
    createdAt: doc.createdAt,
  }));
}

export type RechargeResult =
  | { ok: true; reference: string; amount: Paise; mobile: string }
  | {
      ok: false;
      code: 'INVALID_NUMBER' | 'UNKNOWN_PLAN' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

/**
 * Charges the wallet and records the recharge.
 *
 * The amount comes from the plan on the server, never from the form: the
 * browser sends a plan id, and a tampered price field has nowhere to land --
 * the same rule `placeOrder` and `joinPrime` follow.
 */
export async function rechargeNumber(
  userId: string,
  input: { mobile: string; planId: string; circle?: string },
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<RechargeResult> {
  if (!ObjectId.isValid(userId) || !isValidMobile(input.mobile)) {
    return { ok: false, code: 'INVALID_NUMBER', message: 'Enter a valid 10-digit mobile number.' };
  }

  const plan = findPlan(input.planId);
  if (!plan) {
    return { ok: false, code: 'UNKNOWN_PLAN', message: 'That plan is no longer available.' };
  }

  const amount = rupeesToPaise(plan.rupees);
  const { balance } = await getWalletSummary(userId);
  if (balance < amount) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Amazon Pay balance is not enough. Add money and try again.',
    };
  }

  // The operator comes from the plan, not from the request. Every plan belongs
  // to exactly one operator's book, so accepting a separate operator field
  // would let a Jio pack be filed under Airtel -- the picker changes the
  // book when the customer corrects the operator, and the plan they then choose
  // carries the answer.
  const operatorId = plan.operatorId;

  // The circle is not encoded in a plan, so the customer's correction stands;
  // anything they did not send falls back to what the number resolves to.
  const detected = detectOperator(input.mobile);
  const circle =
    input.circle && CIRCLES.includes(input.circle) ? input.circle : (detected?.circle ?? '');

  const reference = `MR-${randomBytes(3).toString('hex').toUpperCase()}`;

  // Debit first: if the process dies between the two, the customer is charged
  // and the recharge is unrecorded, which support can see and fix. The other
  // order hands out free recharges to anyone who can crash the request.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'RECHARGE',
    direction: 'DEBIT',
    amount,
    status: 'COMPLETED',
    currency: 'INR',
    reference,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const recharges = await rechargesCollection();
  const doc: RechargeDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    mobile: input.mobile,
    operatorId,
    circle,
    planId: plan.id,
    amount,
    reference,
    createdAt: now,
  };
  await recharges.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'recharge.completed',
      actorId: userId,
      targetType: 'recharge',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // The number is deliberately absent: an audit row is read by staff, and
      // it does not need the customer's phone number to be useful.
      metadata: { amount, planId: plan.id, operatorId, circle, reference },
    },
    'info',
  );

  return { ok: true, reference, amount, mobile: input.mobile };
}
