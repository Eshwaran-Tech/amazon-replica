import { randomBytes } from 'node:crypto';

import { ObjectId, type ClientSession } from 'mongodb';

import {
  transitAccountsCollection,
  transitEntriesCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import type { Paise } from '@/lib/utils/money';
import type {
  TransitAccountDoc,
  TransitAccountView,
  TransitEntryDoc,
  TransitEntryType,
  TransitEntryView,
  TransitKind,
} from '@/models/transit';
import type { WalletEntryDoc, WalletEntryType } from '@/models/wallet';

import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * The shared half of FASTag and metro.
 *
 * Both are the same object with a different label on it: a prepaid account with
 * a derived balance, topped up out of the Eshwaran Pay wallet. Everything that is
 * identical between them lives here so the two services differ only where they
 * actually differ -- a tag is keyed by a registration number, a card by a card
 * number, and their fare rules have nothing in common.
 *
 * **The balance is derived, never stored.** Same rule as the wallet: a balance
 * column and a ledger can disagree, and when they do the money is already wrong
 * and neither says which one lied.
 */

export function transitReference(kind: TransitKind): string {
  const prefix = kind === 'FASTAG' ? 'FT' : 'MC';
  return prefix + '-' + randomBytes(3).toString('hex').toUpperCase();
}

/** Sums an account's ledger. CREDIT adds, DEBIT subtracts. */
export async function balanceOf(accountId: ObjectId, session?: ClientSession): Promise<Paise> {
  const entries = await transitEntriesCollection();
  const rows = await entries
    .aggregate<{ _id: 'CREDIT' | 'DEBIT'; total: number }>(
      [{ $match: { accountId } }, { $group: { _id: '$direction', total: { $sum: '$amount' } } }],
      session ? { session } : {},
    )
    .toArray();

  let balance = 0;
  for (const row of rows) {
    balance += row._id === 'CREDIT' ? row.total : -row.total;
  }
  return balance;
}

export async function toAccountView(doc: TransitAccountDoc): Promise<TransitAccountView> {
  const balance = await balanceOf(doc._id);
  return {
    id: doc._id.toHexString(),
    kind: doc.kind,
    number: doc.number,
    providerId: doc.providerId,
    providerName: doc.providerName,
    vehicleLabel: doc.vehicle?.modelLabel ?? null,
    tollClass: doc.vehicle?.tollClass ?? null,
    balance,
    minBalance: doc.minBalance,
    lowBalance: balance < doc.minBalance,
    securityDeposit: doc.securityDeposit,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

/** A customer's tags or cards, newest first. Ownership is in the query. */
export async function listAccounts(
  userId: string,
  kind: TransitKind,
): Promise<TransitAccountView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const accounts = await transitAccountsCollection();
  const docs = await accounts
    .find({ userId: new ObjectId(userId), kind, status: 'ACTIVE' })
    .sort({ createdAt: -1 })
    .toArray();

  return Promise.all(docs.map((doc) => toAccountView(doc)));
}

/**
 * One account, by number.
 *
 * `userId` is in the filter rather than checked afterwards, so a guessed
 * registration number reaches nothing at all -- the same rule the orders module
 * follows.
 */
export async function findAccount(
  userId: string,
  kind: TransitKind,
  number: string,
): Promise<TransitAccountDoc | null> {
  if (!ObjectId.isValid(userId)) return null;

  const accounts = await transitAccountsCollection();
  return accounts.findOne({
    userId: new ObjectId(userId),
    kind,
    number: number.trim().toUpperCase(),
    status: 'ACTIVE',
  });
}

export async function listEntries(accountId: ObjectId, limit = 12): Promise<TransitEntryView[]> {
  const entries = await transitEntriesCollection();
  const docs = await entries.find({ accountId }).sort({ createdAt: -1 }).limit(limit).toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    type: doc.type,
    direction: doc.direction,
    amount: doc.amount,
    reference: doc.reference,
    note: doc.note,
    createdAt: doc.createdAt,
  }));
}

export type TopUpResult =
  | { ok: true; reference: string; charged: Paise; credited: Paise; balance: Paise }
  | { ok: false; code: 'INSUFFICIENT_BALANCE' | 'DUPLICATE'; message: string };

export interface TopUpInput {
  /** Taken out of the wallet. */
  charge: Paise;
  /**
   * Put onto the tag or card. Defaults to the charge, and is smaller only when
   * part of what was paid is not spendable -- a security deposit and an
   * issuance fee leave the wallet but never reach the barrier.
   */
  credit?: Paise;
  walletType: WalletEntryType;
  note: string;
}

/**
 * Moves money from the wallet onto a tag or card.
 *
 * Wallet debit first: if the process dies between the two writes the customer
 * is charged with nothing credited, which support can see and put right. The
 * other order tops up tags for anyone who can crash a request.
 *
 * The credit's `reference` is uniquely indexed, so a retry that gets as far as
 * the second write is rejected by the database rather than topping up twice.
 */
export async function topUp(
  account: TransitAccountDoc,
  input: TopUpInput,
  now: Date,
): Promise<TopUpResult> {
  const credit = input.credit ?? input.charge;

  const { balance: walletBalance } = await getWalletSummary(account.userId.toHexString());
  if (walletBalance < input.charge) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough. Add money and try again.',
    };
  }

  const reference = transitReference(account.kind);

  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: account.userId,
    type: input.walletType,
    direction: 'DEBIT',
    amount: input.charge,
    status: 'COMPLETED',
    currency: 'INR',
    reference,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const written = await writeEntry(account, {
    type: 'TOP_UP',
    direction: 'CREDIT',
    amount: credit,
    reference,
    note: input.note,
    now,
  });
  if (!written) {
    return { ok: false, code: 'DUPLICATE', message: 'That recharge has already gone through.' };
  }

  return {
    ok: true,
    reference,
    charged: input.charge,
    credited: credit,
    balance: await balanceOf(account._id),
  };
}

/**
 * Writes one ledger entry, returning false if its reference already exists.
 *
 * The uniqueness is the index's, not a read-then-write -- a check here could be
 * raced past by a second click on a slow connection.
 */
export async function writeEntry(
  account: TransitAccountDoc,
  input: {
    type: TransitEntryType;
    direction: 'CREDIT' | 'DEBIT';
    amount: Paise;
    reference: string;
    note: string;
    now: Date;
  },
): Promise<boolean> {
  const entries = await transitEntriesCollection();
  const doc: TransitEntryDoc = {
    _id: new ObjectId(),
    accountId: account._id,
    userId: account.userId,
    type: input.type,
    direction: input.direction,
    amount: input.amount,
    reference: input.reference,
    note: input.note,
    createdAt: input.now,
  };

  try {
    await entries.insertOne(doc);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}
