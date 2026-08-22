import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * The wallet ledger.
 *
 * There is no `balance` column anywhere. A balance is a *derived* figure --
 * the sum of this collection's completed entries for a user -- for the same
 * reason order totals are recomputed from their lines rather than trusted: a
 * stored number and a ledger can disagree, and when they do the money is
 * already wrong and nothing says which one lied. Deriving it means they cannot
 * drift apart.
 *
 * `amount` is always **positive** integer paise; `direction` carries the sign.
 * A negative amount would make "sum the credits" silently wrong if a bug ever
 * wrote one, so the schema makes it unrepresentable.
 *
 * A top-up is written PENDING and only becomes COMPLETED through the same
 * server-side payment evaluation an order uses. Nothing a browser asserts can
 * complete one.
 */

export const WALLET_ENTRY_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;
export type WalletEntryStatus = (typeof WALLET_ENTRY_STATUSES)[number];

export const WALLET_ENTRY_TYPES = [
  'TOP_UP',
  'GIFT_CARD',
  'PRIME',
  'VIDEO',
  'ORDER',
  'REFUND',
  'CASHBACK',
  'RECHARGE',
  'BUS',
  'TRAIN',
  'HOTEL',
  'GIFT_PURCHASE',
  'INSURANCE',
  'FASTAG',
  'METRO',
  'BILL',
  'CONTENT_CREDIT',
] as const;
export type WalletEntryType = (typeof WALLET_ENTRY_TYPES)[number];

export interface WalletEntryDoc {
  _id: ObjectId;
  userId: ObjectId;
  type: WalletEntryType;
  /** CREDIT adds to the balance, DEBIT subtracts. */
  direction: 'CREDIT' | 'DEBIT';
  /** Positive integer paise. Never negative -- see the note above. */
  amount: Paise;
  status: WalletEntryStatus;
  currency: 'INR';
  /** Human-readable reference shown in the ledger, e.g. "WT-8F2A9C". */
  reference: string;
  /** Set when a payment attempt fails, so the UI can explain why. */
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the UI needs; never exposes the raw ObjectId of another user. */
export interface WalletEntry {
  id: string;
  type: WalletEntryType;
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  status: WalletEntryStatus;
  reference: string;
  failureReason: string | null;
  createdAt: Date;
}

export function toWalletEntry(doc: WalletEntryDoc): WalletEntry {
  return {
    id: doc._id.toHexString(),
    type: doc.type,
    direction: doc.direction,
    amount: doc.amount,
    status: doc.status,
    reference: doc.reference,
    failureReason: doc.failureReason ?? null,
    createdAt: doc.createdAt,
  };
}
