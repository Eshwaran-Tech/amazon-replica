import { createHmac, randomBytes, randomInt } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { giftCardsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { env } from '@/lib/env';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import { rupeesToPaise } from '@/lib/utils/money';
import { MAX_WALLET_BALANCE_RUPEES } from '@/lib/validations/wallet';
import type { GiftCardDoc } from '@/models/gift-card';
import type { WalletEntryDoc } from '@/models/wallet';

import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Gift cards.
 *
 * A code is bearer money: whoever holds it can spend it. Three consequences
 * are built in here rather than bolted on:
 *
 *  1. **The code is never stored.** Only an HMAC keyed with `AUTH_SECRET`, the
 *     same treatment one-time passwords get. A dumped `giftCards` collection
 *     is worthless without the server's secret.
 *  2. **Redemption is a conditional update from ACTIVE.** Two tabs, or two
 *     people with the same code, race to one `findOneAndUpdate`; the loser
 *     matches no document and is told the card is already used. There is no
 *     read-then-write window to exploit.
 *  3. **Wrong codes are indistinguishable from used ones** in what the caller
 *     is told, so the form cannot be used to discover which codes exist.
 */

const MAX_BALANCE_PAISE = rupeesToPaise(MAX_WALLET_BALANCE_RUPEES);

/** Deliberately excludes I, O, 0 and 1: they are misread off a card. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUPS = [4, 6, 5] as const;

/** Uppercased with separators stripped, so "8u9s y3e8cq-39mpq" still works. */
export function normaliseGiftCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashGiftCode(code: string): string {
  return createHmac('sha256', env().AUTH_SECRET).update(`giftcard:${code}`, 'utf8').digest('hex');
}

function generateCode(): string {
  return GROUPS.map((length) =>
    Array.from({ length }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join(''),
  ).join('-');
}

export interface MintedGiftCard {
  /** The only time the plain code exists. Deliver it and forget it. */
  code: string;
  amount: Paise;
  expiresAt: Date;
}

/**
 * Mints cards. Used by the CLI that hands codes to a tester; a real store
 * would call this from an admin screen or a fulfilment job.
 */
export async function mintGiftCards(
  amount: Paise,
  count: number,
  validForDays = 365,
): Promise<MintedGiftCard[]> {
  const cards = await giftCardsCollection();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + validForDays * 24 * 60 * 60 * 1000);

  const minted: MintedGiftCard[] = [];
  const docs: GiftCardDoc[] = [];

  for (let index = 0; index < count; index += 1) {
    const code = generateCode();
    const normalised = normaliseGiftCode(code);

    docs.push({
      _id: new ObjectId(),
      codeHash: hashGiftCode(normalised),
      codeSuffix: normalised.slice(-4),
      amount,
      currency: 'INR',
      status: 'ACTIVE',
      expiresAt,
      redeemedByUserId: null,
      redeemedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    minted.push({ code, amount, expiresAt });
  }

  await cards.insertMany(docs);
  return minted;
}

export type RedeemResult =
  | { ok: true; amount: Paise; balance: Paise }
  | {
      ok: false;
      code: 'INVALID' | 'EXPIRED' | 'OVER_BALANCE_CAP';
      message: string;
    };

/** One message for "no such card" and "already redeemed" -- see the note above. */
const INVALID_MESSAGE =
  'That gift card code is not valid, or it has already been redeemed. Check the code and try again.';

/**
 * Redeems a card into the signed-in customer's balance.
 *
 * The card is marked REDEEMED *before* the ledger entry is written. If the
 * process died between the two the customer would be short, which a support
 * ticket can fix; the other order could be redeemed repeatedly by crashing at
 * the right moment, which nothing can fix.
 */
export async function redeemGiftCard(
  userId: string,
  rawCode: string,
  context: { ip: string | null; userAgent: string | null },
): Promise<RedeemResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'INVALID', message: INVALID_MESSAGE };
  }

  const normalised = normaliseGiftCode(rawCode);
  const cards = await giftCardsCollection();
  const now = new Date();

  // Peeked first only to separate "expired" from "invalid" in the message; the
  // claim itself is the conditional update below, which is what actually
  // decides. An expired card is never claimable either way.
  const existing = await cards.findOne({ codeHash: hashGiftCode(normalised) });
  if (!existing) return { ok: false, code: 'INVALID', message: INVALID_MESSAGE };

  if (existing.status === 'ACTIVE' && existing.expiresAt <= now) {
    return {
      ok: false,
      code: 'EXPIRED',
      message: 'That gift card has expired and can no longer be redeemed.',
    };
  }

  const { balance } = await getWalletSummary(userId);
  if (balance + existing.amount > MAX_BALANCE_PAISE) {
    return {
      ok: false,
      code: 'OVER_BALANCE_CAP',
      message: `Your balance can hold up to ₹${MAX_WALLET_BALANCE_RUPEES.toLocaleString('en-IN')}. Spend some of it before redeeming this card.`,
    };
  }

  // The claim. Conditional on ACTIVE and unexpired, so a race has exactly one
  // winner and an expired card cannot slip through between the check above and
  // this write.
  const claimed = await cards.findOneAndUpdate(
    { _id: existing._id, status: 'ACTIVE', expiresAt: { $gt: now } },
    {
      $set: {
        status: 'REDEEMED',
        redeemedByUserId: new ObjectId(userId),
        redeemedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: 'after' },
  );

  if (!claimed) return { ok: false, code: 'INVALID', message: INVALID_MESSAGE };

  const entries = await walletEntriesCollection();
  const entry: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'GIFT_CARD',
    direction: 'CREDIT',
    amount: claimed.amount,
    // Nothing to settle: the card itself was the payment.
    status: 'COMPLETED',
    currency: 'INR',
    reference: `GC-${randomBytes(3).toString('hex').toUpperCase()}${claimed.codeSuffix}`,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await entries.insertOne(entry);

  await recordAuditAndAlert(
    {
      action: 'wallet.giftcard.redeemed',
      actorId: userId,
      targetType: 'giftCard',
      targetId: claimed._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // The code itself is never logged -- only its last four characters.
      metadata: { amount: claimed.amount, suffix: claimed.codeSuffix },
    },
    'info',
  );

  return { ok: true, amount: claimed.amount, balance: balance + claimed.amount };
}
