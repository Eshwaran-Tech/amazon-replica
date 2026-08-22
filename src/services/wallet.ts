import { randomBytes } from 'node:crypto';

import { ObjectId, type ClientSession } from 'mongodb';

import { walletEntriesCollection } from '@/lib/db/collections';
import { evaluateMockCard } from '@/lib/payments/mock';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import { MAX_WALLET_BALANCE_RUPEES } from '@/lib/validations/wallet';
import { toWalletEntry, type WalletEntry, type WalletEntryDoc } from '@/models/wallet';

import '@/lib/server-guard';

/**
 * Wallet operations.
 *
 * `completeTopUp` is the only function that can move an entry to COMPLETED,
 * and it decides the outcome itself from the card number, server-side --
 * exactly the rule `services/payment.ts` follows for orders. There is no
 * argument by which a caller can assert that a payment succeeded.
 */

const MAX_BALANCE_PAISE = rupeesToPaise(MAX_WALLET_BALANCE_RUPEES);

export interface WalletSummary {
  /** Everything spendable: wallet top-ups plus redeemed gift cards. */
  balance: Paise;
  /** The part of `balance` that came from top-ups. */
  wallet: Paise;
  /** The part of `balance` that came from redeemed gift cards. */
  giftCards: Paise;
  /** Opened but unpaid top-ups; deliberately not part of `balance`. */
  pending: Paise;
}

/**
 * Sums the ledger.
 *
 * Aggregated in the database rather than by reading every entry into memory:
 * a wallet with years of history should still cost one indexed group.
 *
 * `session` lets a caller read the balance inside its own transaction, which
 * is how checkout charges the wallet and writes the order as one unit.
 */
export async function getWalletSummary(
  userId: string,
  options: { session?: ClientSession } = {},
): Promise<WalletSummary> {
  const empty: WalletSummary = { balance: 0, wallet: 0, giftCards: 0, pending: 0 };
  if (!ObjectId.isValid(userId)) return empty;

  const entries = await walletEntriesCollection();
  const rows = await entries
    .aggregate<{ _id: { status: string; direction: string; type: string }; total: number }>(
      [
        { $match: { userId: new ObjectId(userId), status: { $in: ['COMPLETED', 'PENDING'] } } },
        {
          $group: {
            _id: { status: '$status', direction: '$direction', type: '$type' },
            total: { $sum: '$amount' },
          },
        },
      ],
      options.session ? { session: options.session } : {},
    )
    .toArray();

  let credited = 0;
  let debited = 0;
  let giftCardCredits = 0;
  let pending = 0;

  for (const row of rows) {
    if (row._id.status === 'PENDING') {
      pending += row.total;
      continue;
    }
    if (row._id.direction === 'CREDIT') {
      credited += row.total;
      if (row._id.type === 'GIFT_CARD') giftCardCredits += row.total;
    } else {
      debited += row.total;
    }
  }

  // Spending is charged against the whole ledger, never against one bucket:
  // clamping the components separately would let a gift-card-funded purchase
  // push the top-up column negative and be forgiven, handing out free goods.
  // A negative total would mean the ledger is corrupt, so that is clamped
  // instead -- the entries stay for inspection either way.
  const balance = Math.max(0, credited - debited);

  // Top-ups are drawn down first, so what remains is gift-card money for as
  // long as any is left. The split is presentational; the total is the truth.
  const giftCards = Math.min(giftCardCredits, balance);
  const wallet = balance - giftCards;

  return { balance, wallet, giftCards, pending };
}

export async function listWalletEntries(userId: string, limit = 10): Promise<WalletEntry[]> {
  if (!ObjectId.isValid(userId)) return [];

  const entries = await walletEntriesCollection();
  const docs = await entries
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toWalletEntry);
}

export type TopUpResult =
  { ok: true; entryId: string } | { ok: false; code: 'OVER_BALANCE_CAP'; message: string };

/** Opens a PENDING top-up. It carries no money until a payment completes it. */
export async function createTopUp(userId: string, amount: Paise): Promise<TopUpResult> {
  const { balance, pending } = await getWalletSummary(userId);

  // Counts pending too: without that, several tabs could each open a top-up
  // that is individually under the cap and collectively over it.
  if (balance + pending + amount > MAX_BALANCE_PAISE) {
    return {
      ok: false,
      code: 'OVER_BALANCE_CAP',
      message: `A wallet can hold up to ₹${MAX_WALLET_BALANCE_RUPEES.toLocaleString('en-IN')}. Reduce the amount and try again.`,
    };
  }

  const entries = await walletEntriesCollection();
  const now = new Date();
  const doc: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'TOP_UP',
    direction: 'CREDIT',
    amount,
    status: 'PENDING',
    currency: 'INR',
    reference: `WT-${randomBytes(4).toString('hex').toUpperCase()}`,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };

  await entries.insertOne(doc);
  return { ok: true, entryId: doc._id.toHexString() };
}

/** A pending top-up belonging to this user, or null. Ownership is in the query. */
export async function findPendingTopUp(
  userId: string,
  entryId: string,
): Promise<WalletEntry | null> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(entryId)) return null;

  const entries = await walletEntriesCollection();
  const doc = await entries.findOne({
    _id: new ObjectId(entryId),
    userId: new ObjectId(userId),
  });

  return doc ? toWalletEntry(doc) : null;
}

export type CompleteTopUpResult =
  | { ok: true; status: 'COMPLETED' }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_PENDING' | 'DECLINED'; message: string };

/**
 * Settles a pending top-up from a test card.
 *
 * The card number never leaves this call: it decides the simulated outcome and
 * is not stored, logged or forwarded, exactly as in the order gateway.
 *
 * The update is conditional on the entry still being PENDING, so two submits
 * racing each other cannot credit the wallet twice -- the second matches no
 * document.
 */
export async function completeTopUp(
  userId: string,
  entryId: string,
  cardNumber: string,
  context: { ip: string | null; userAgent: string | null },
): Promise<CompleteTopUpResult> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(entryId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'We could not find that top-up.' };
  }

  const entries = await walletEntriesCollection();
  const filter = {
    _id: new ObjectId(entryId),
    userId: new ObjectId(userId),
    status: 'PENDING' as const,
  };

  const existing = await entries.findOne(filter);
  if (!existing) {
    return {
      ok: false,
      code: 'NOT_PENDING',
      message: 'That top-up is no longer awaiting payment.',
    };
  }

  const outcome = evaluateMockCard(cardNumber);

  if (outcome.outcome !== 'succeeded') {
    await entries.updateOne(filter, {
      $set: { status: 'FAILED', failureReason: outcome.reason, updatedAt: new Date() },
    });
    return {
      ok: false,
      code: 'DECLINED',
      message: `Payment ${outcome.reason.replace(/_/g, ' ')}. The wallet was not credited.`,
    };
  }

  const updated = await entries.updateOne(filter, {
    $set: { status: 'COMPLETED', failureReason: null, updatedAt: new Date() },
  });

  if (updated.matchedCount === 0) {
    return {
      ok: false,
      code: 'NOT_PENDING',
      message: 'That top-up is no longer awaiting payment.',
    };
  }

  await recordAuditAndAlert(
    {
      action: 'wallet.topup.completed',
      actorId: userId,
      targetType: 'walletEntry',
      targetId: entryId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { amount: existing.amount, reference: existing.reference },
    },
    'info',
  );

  return { ok: true, status: 'COMPLETED' };
}
