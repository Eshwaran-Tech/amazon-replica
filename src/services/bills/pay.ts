import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { findBiller, normaliseAccount, type BillCategory } from '@/data/billers';
import {
  billPaymentsCollection,
  savedBillersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import {
  MAX_SAVED_BILLERS,
  type BillPaymentDoc,
  type BillPaymentView,
  type SavedBillerView,
} from '@/models/bill-payment';
import type { WalletEntryDoc } from '@/models/wallet';

import { findDthOperator } from '@/data/television';

import { quoteBill, quoteDth, type PayOption, type Quote } from './quote';
import { getWalletSummary } from '../wallet';

import '@/lib/server-guard';

/**
 * Paying a bill.
 *
 * **The amount is never taken from the form.** It is recomputed by
 * `quoteBill`, the same function that produced the figure on the page, from a
 * biller, an account and a named choice. A tampered amount field has nowhere to
 * land -- the same rule checkout, Prime, the recharge book and the insurance
 * quotes all follow.
 *
 * **Nothing here is settled with any biller.** This store has no integration
 * with a discom, a bank or a municipality, and every page says so. What is real
 * is that the money leaves the Eshwaran Pay balance and lands in the same ledger
 * as everything else, with a reference that ties the two together.
 */

function reference(category: BillCategory): string {
  const prefix = category === 'LPG' ? 'LP' : 'BP';
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export type PayBillResult =
  | {
      ok: true;
      reference: string;
      amount: Paise;
      summary: string;
      booking: BillPaymentDoc['booking'];
    }
  | {
      ok: false;
      code: 'BAD_ACCOUNT' | 'NO_BILL' | 'BAD_OPTION' | 'BAD_AMOUNT' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface PayBillInput {
  category: BillCategory;
  billerId: string;
  account: string;
  option: PayOption;
  /** Save the biller for next time, under this name. */
  saveAs?: string;
}

export async function payBill(
  userId: string,
  input: PayBillInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<PayBillResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_ACCOUNT', message: 'Sign in and try again.' };
  }

  const biller = findBiller(input.billerId);
  if (!biller || biller.category !== input.category) {
    return { ok: false, code: 'NO_BILL', message: 'Choose a biller from the list.' };
  }

  const account = normaliseAccount(input.category, input.account);
  if (!account) {
    return {
      ok: false,
      code: 'BAD_ACCOUNT',
      message: 'That does not look like a valid number for this kind of bill.',
    };
  }

  // Recomputed here, whatever the page showed.
  const quoted = quoteBill(input.category, input.billerId, account, input.option, now);
  if (!quoted.ok) return { ok: false, code: quoted.code, message: quoted.message };

  return settle(
    userId,
    {
      category: input.category,
      billerId: biller.id,
      billerName: biller.name,
      account,
      quote: quoted.quote,
      ...(input.saveAs !== undefined ? { saveAs: input.saveAs } : {}),
    },
    context,
    now,
  );
}

export interface PayDthInput {
  operatorId: string;
  subscriberId: string;
  option: Extract<PayOption, { kind: 'DTH' }>;
  saveAs?: string;
}

/**
 * Recharging a DTH account.
 *
 * Resolved against the DTH operator book rather than the biller book, because a
 * DTH operator is not a biller: there is nothing owed, only a balance running
 * down. Everything after the quote is identical, so it shares the settlement.
 */
export async function payDth(
  userId: string,
  input: PayDthInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<PayBillResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_ACCOUNT', message: 'Sign in and try again.' };
  }

  const operator = findDthOperator(input.operatorId);
  if (!operator) {
    return { ok: false, code: 'NO_BILL', message: 'Choose an operator from the list.' };
  }

  const account = normaliseAccount('DTH', input.subscriberId);
  if (!account) {
    return { ok: false, code: 'BAD_ACCOUNT', message: 'A subscriber id is ten to twelve digits.' };
  }

  const quoted = quoteDth(operator.id, account, input.option);
  if (!quoted.ok) return { ok: false, code: quoted.code, message: quoted.message };

  return settle(
    userId,
    {
      category: 'DTH',
      billerId: operator.id,
      billerName: operator.name,
      account,
      quote: quoted.quote,
      ...(input.saveAs !== undefined ? { saveAs: input.saveAs } : {}),
    },
    context,
    now,
  );
}

interface SettleInput {
  category: BillCategory;
  billerId: string;
  billerName: string;
  account: string;
  quote: Quote;
  saveAs?: string;
}

/** The half that is identical whatever was paid: money out, record in. */
async function settle(
  userId: string,
  input: SettleInput,
  context: { ip: string | null; userAgent: string | null },
  now: Date,
): Promise<PayBillResult> {
  const quote = input.quote;
  const account = input.account;

  if (quote.amount <= 0) {
    return { ok: false, code: 'BAD_AMOUNT', message: 'There is nothing outstanding to pay.' };
  }

  const { balance } = await getWalletSummary(userId);
  if (balance < quote.amount) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough. Add money and try again.',
    };
  }

  const ref = reference(input.category);

  // Debit first: if the process dies between the two writes the customer is
  // charged with the payment unrecorded, which support can see and put right.
  // The other order pays bills for anyone who can crash a request.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'BILL',
    direction: 'DEBIT',
    amount: quote.amount,
    status: 'COMPLETED',
    currency: 'INR',
    reference: ref,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const payments = await billPaymentsCollection();
  const doc: BillPaymentDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    category: input.category,
    billerId: input.billerId,
    billerName: quote.billerName,
    account,
    holder: quote.holder,
    period: quote.period,
    // Stored, not just the total: a total on its own cannot be checked against
    // anything once the tariff moves.
    components: quote.components.map((line) => ({ label: line.label, amount: line.amount })),
    amount: quote.amount,
    reference: ref,
    booking: quote.booking,
    createdAt: now,
  };
  await payments.insertOne(doc);

  if (input.saveAs !== undefined) {
    await saveBiller(userId, {
      category: input.category,
      billerId: input.billerId,
      billerName: input.billerName,
      account,
      nickname: input.saveAs,
      lastPaidAt: now,
      lastAmount: quote.amount,
    });
  } else {
    await touchSavedBiller(userId, input.category, input.billerId, account, quote.amount, now);
  }

  await recordAuditAndAlert(
    {
      action: input.category === 'LPG' ? 'lpg.booked' : 'bill.paid',
      actorId: userId,
      targetType: 'billPayment',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // No consumer number: an audit row is read by staff and does not need
      // the customer's account number to be useful.
      metadata: {
        category: input.category,
        billerId: input.billerId,
        amount: quote.amount,
        reference: ref,
      },
    },
    'info',
  );

  return {
    ok: true,
    reference: ref,
    amount: quote.amount,
    summary: quote.summary,
    booking: quote.booking,
  };
}

/** Recent payments, newest first. Ownership is in the query. */
export async function listBillPayments(userId: string, limit = 12): Promise<BillPaymentView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const payments = await billPaymentsCollection();
  const docs = await payments
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toView);
}

/** Payments on one account, so a page can show what was paid last time. */
export async function paymentsForAccount(
  userId: string,
  category: BillCategory,
  account: string,
  limit = 6,
): Promise<BillPaymentView[]> {
  if (!ObjectId.isValid(userId)) return [];
  const normalised = normaliseAccount(category, account);
  if (!normalised) return [];

  const payments = await billPaymentsCollection();
  const docs = await payments
    .find({ userId: new ObjectId(userId), category, account: normalised })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toView);
}

function toView(doc: BillPaymentDoc): BillPaymentView {
  return {
    id: doc._id.toHexString(),
    category: doc.category,
    billerName: doc.billerName,
    account: doc.account,
    period: doc.period,
    amount: doc.amount,
    reference: doc.reference,
    booking: doc.booking,
    createdAt: doc.createdAt,
  };
}

// ----------------------------------------------------------- saved billers

interface SaveInput {
  category: BillCategory;
  billerId: string;
  billerName: string;
  account: string;
  nickname: string;
  lastPaidAt?: Date | null;
  lastAmount?: Paise | null;
}

export type SaveBillerResult =
  { ok: true } | { ok: false; code: 'TOO_MANY' | 'BAD_ACCOUNT'; message: string };

export async function saveBiller(userId: string, input: SaveInput): Promise<SaveBillerResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_ACCOUNT', message: 'Sign in and try again.' };
  }

  const account = normaliseAccount(input.category, input.account);
  if (!account) {
    return { ok: false, code: 'BAD_ACCOUNT', message: 'That account number is not valid.' };
  }

  const collection = await savedBillersCollection();
  const held = await collection.countDocuments({ userId: new ObjectId(userId) });
  if (held >= MAX_SAVED_BILLERS) {
    return {
      ok: false,
      code: 'TOO_MANY',
      message: `You can keep ${MAX_SAVED_BILLERS} billers. Remove one first.`,
    };
  }

  const nickname = input.nickname.trim().slice(0, 40) || input.billerName;

  // Upsert against the unique index, so saving the same account twice updates
  // the nickname rather than failing or duplicating.
  await collection.updateOne(
    {
      userId: new ObjectId(userId),
      category: input.category,
      billerId: input.billerId,
      account,
    },
    {
      $set: {
        billerName: input.billerName,
        nickname,
        ...(input.lastPaidAt !== undefined ? { lastPaidAt: input.lastPaidAt } : {}),
        ...(input.lastAmount !== undefined ? { lastAmount: input.lastAmount } : {}),
      },
      $setOnInsert: {
        userId: new ObjectId(userId),
        category: input.category,
        billerId: input.billerId,
        account,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );

  return { ok: true };
}

/** Records a payment against a biller already saved, without creating one. */
async function touchSavedBiller(
  userId: string,
  category: BillCategory,
  billerId: string,
  account: string,
  amount: Paise,
  now: Date,
): Promise<void> {
  const collection = await savedBillersCollection();
  await collection.updateOne(
    { userId: new ObjectId(userId), category, billerId, account },
    { $set: { lastPaidAt: now, lastAmount: amount } },
  );
}

export async function listSavedBillers(
  userId: string,
  category?: BillCategory,
): Promise<SavedBillerView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const collection = await savedBillersCollection();
  const docs = await collection
    .find({ userId: new ObjectId(userId), ...(category ? { category } : {}) })
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    category: doc.category,
    billerId: doc.billerId,
    billerName: doc.billerName,
    account: doc.account,
    nickname: doc.nickname,
    lastPaidAt: doc.lastPaidAt,
    lastAmount: doc.lastAmount,
  }));
}

export async function removeSavedBiller(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(id)) return false;

  const collection = await savedBillersCollection();
  // The owner is in the filter, so a guessed id deletes nothing.
  const result = await collection.deleteOne({
    _id: new ObjectId(id),
    userId: new ObjectId(userId),
  });
  return result.deletedCount === 1;
}
