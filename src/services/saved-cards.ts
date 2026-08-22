import { createHash, randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { savedCardsCollection } from '@/lib/db/collections';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { recordAuditAndAlert } from '@/lib/security/audit';
import {
  CARD_NETWORKS,
  type CardNetwork,
  type SavedCardDoc,
  type SavedCardView,
} from '@/models/saved-card';

import '@/lib/server-guard';

/**
 * Saved payment methods.
 *
 * **No card number reaches this file's storage.** A number is passed in, used
 * once to derive a token and read four digits off, and then dropped. What is
 * written is the token, the last four, the network and the expiry -- which is
 * what a merchant is permitted to keep under the tokenisation rules Indian card
 * networks moved to, and rather less than it is permitted to keep.
 *
 * Only the mock provider's test cards are accepted. That is not a limitation
 * of the demo, it is the point: there is no code path in this repository that
 * takes a real card number and keeps anything derived from it.
 */

export const MAX_CARDS = 6;

export type SaveCardResult =
  | { ok: true; last4: string }
  | {
      ok: false;
      code: 'BAD_CARD' | 'BAD_EXPIRY' | 'BAD_NAME' | 'TOO_MANY' | 'DUPLICATE';
      message: string;
    };

export interface SaveCardInput {
  /** A mock test card number. Used once, never stored. */
  cardNumber: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
  makeDefault: boolean;
}

/**
 * The provider's token.
 *
 * A real provider issues this; here it is derived so the same test card saved
 * twice collides on the unique index rather than making two identical rows.
 * It is a one-way hash: the number cannot be recovered from what is stored.
 */
function tokenFor(userId: string, cardNumber: string): string {
  return createHash('sha256')
    .update(`card:${userId}:${cardNumber}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
}

/** Network from the leading digits, the way any checkout does it. */
export function networkOf(cardNumber: string): CardNetwork {
  if (cardNumber.startsWith('4')) return 'VISA';
  if (cardNumber.startsWith('34') || cardNumber.startsWith('37')) return 'AMEX';
  if (cardNumber.startsWith('60') || cardNumber.startsWith('65')) return 'RUPAY';
  return 'MASTERCARD';
}

function isExpired(month: number, year: number, now: Date): boolean {
  // A card is good through the last day of its expiry month.
  const endOfMonth = new Date(year, month, 1);
  return endOfMonth <= now;
}

function toView(doc: SavedCardDoc, now: Date): SavedCardView {
  return {
    id: doc._id.toHexString(),
    last4: doc.last4,
    network: doc.network,
    holderName: doc.holderName,
    expiryMonth: doc.expiryMonth,
    expiryYear: doc.expiryYear,
    isDefault: doc.isDefault,
    expired: isExpired(doc.expiryMonth, doc.expiryYear, now),
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt,
  };
}

export async function saveCard(
  userId: string,
  input: SaveCardInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<SaveCardResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_CARD', message: 'Please sign in again.' };
  }

  const cardNumber = input.cardNumber.replace(/[^\d]/g, '');

  // Only the provider's test cards. Anything else is refused before it is even
  // looked at, so a real number cannot be tokenised here by accident.
  //
  // Whether the card would *succeed* is deliberately not checked: saving is not
  // charging, and a card that declines at the till is still a card somebody
  // keeps on file. Requiring success here also meant an account could only ever
  // hold one card, since only one test number succeeds.
  const known = Object.values(MOCK_TEST_CARDS) as string[];
  if (!known.includes(cardNumber)) {
    return {
      ok: false,
      code: 'BAD_CARD',
      message:
        'Only this store’s test cards can be saved. Use 4242 4242 4242 4242 — no real card number is accepted anywhere in this codebase.',
    };
  }

  const holderName = input.holderName.trim().replace(/\s+/g, ' ');
  if (holderName.length === 0 || holderName.length > 60) {
    return { ok: false, code: 'BAD_NAME', message: 'Enter the name printed on the card.' };
  }

  const expiryMonth = Number(input.expiryMonth);
  const expiryYear = Number(input.expiryYear);
  if (!Number.isInteger(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) {
    return { ok: false, code: 'BAD_EXPIRY', message: 'Choose an expiry month.' };
  }
  if (
    !Number.isInteger(expiryYear) ||
    expiryYear < now.getFullYear() ||
    expiryYear > now.getFullYear() + 20
  ) {
    return { ok: false, code: 'BAD_EXPIRY', message: 'Choose an expiry year.' };
  }
  if (isExpired(expiryMonth, expiryYear, now)) {
    return { ok: false, code: 'BAD_EXPIRY', message: 'That expiry has already passed.' };
  }

  const cards = await savedCardsCollection();
  const held = await cards.countDocuments({ userId: new ObjectId(userId) });
  if (held >= MAX_CARDS) {
    return {
      ok: false,
      code: 'TOO_MANY',
      message: `You can keep up to ${MAX_CARDS} cards. Remove one first.`,
    };
  }

  const doc: SavedCardDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    token: tokenFor(userId, cardNumber),
    last4: cardNumber.slice(-4),
    network: networkOf(cardNumber),
    holderName,
    expiryMonth,
    expiryYear,
    // The first card saved is the default; after that it is a choice.
    isDefault: input.makeDefault || held === 0,
    createdAt: now,
    lastUsedAt: null,
  };

  try {
    await cards.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return { ok: false, code: 'DUPLICATE', message: 'That card is already saved.' };
    }
    throw error;
  }

  if (doc.isDefault) {
    await cards.updateMany(
      { userId: new ObjectId(userId), _id: { $ne: doc._id } },
      { $set: { isDefault: false } },
    );
  }

  await recordAuditAndAlert(
    {
      action: 'card.saved',
      actorId: userId,
      targetType: 'savedCard',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // Four digits and a network. Nothing here is worth stealing.
      metadata: { last4: doc.last4, network: doc.network },
    },
    'info',
  );

  return { ok: true, last4: doc.last4 };
}

export type RemoveCardResult = { ok: true } | { ok: false; message: string };

/**
 * Removes a card.
 *
 * The owner is in the filter, so somebody else's id matches no document rather
 * than deleting their card. If the default goes, the oldest survivor takes over
 * -- an account with cards and no default is a checkout that cannot pick one.
 */
export async function removeCard(
  userId: string,
  cardId: string,
  context: { ip: string | null; userAgent: string | null },
): Promise<RemoveCardResult> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(cardId)) {
    return { ok: false, message: 'That card is not on your account.' };
  }

  const cards = await savedCardsCollection();
  const removed = await cards.findOneAndDelete({
    _id: new ObjectId(cardId),
    userId: new ObjectId(userId),
  });

  if (!removed) return { ok: false, message: 'That card is not on your account.' };

  if (removed.isDefault) {
    const next = await cards.findOne({ userId: new ObjectId(userId) }, { sort: { createdAt: 1 } });
    if (next) {
      await cards.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }
  }

  await recordAuditAndAlert(
    {
      action: 'card.removed',
      actorId: userId,
      targetType: 'savedCard',
      targetId: cardId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { last4: removed.last4 },
    },
    'info',
  );

  return { ok: true };
}

/** Makes one card the default, and exactly one. */
export async function makeDefault(userId: string, cardId: string): Promise<RemoveCardResult> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(cardId)) {
    return { ok: false, message: 'That card is not on your account.' };
  }

  const cards = await savedCardsCollection();
  const owned = await cards.findOne({
    _id: new ObjectId(cardId),
    userId: new ObjectId(userId),
  });
  if (!owned) return { ok: false, message: 'That card is not on your account.' };

  await cards.updateMany({ userId: new ObjectId(userId) }, { $set: { isDefault: false } });
  await cards.updateOne({ _id: owned._id }, { $set: { isDefault: true } });

  return { ok: true };
}

/** This customer's cards, default first. Ownership is in the query. */
export async function listCards(userId: string, now = new Date()): Promise<SavedCardView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const cards = await savedCardsCollection();
  const docs = await cards
    .find({ userId: new ObjectId(userId) })
    .sort({ isDefault: -1, createdAt: 1 })
    .toArray();

  return docs.map((doc) => toView(doc, now));
}

/** A token to hand a provider, for the card the customer wants charged. */
export async function tokenForCard(userId: string, cardId: string): Promise<string | null> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(cardId)) return null;

  const cards = await savedCardsCollection();
  const doc = await cards.findOne({
    _id: new ObjectId(cardId),
    userId: new ObjectId(userId),
  });
  return doc?.token ?? null;
}

/** A fresh token, for tests that need one that collides with nothing. */
export function randomToken(): string {
  return randomBytes(16).toString('hex');
}

export { CARD_NETWORKS };
