import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A gift card.
 *
 * **The code is never stored.** Only an HMAC of it, keyed with `AUTH_SECRET`,
 * exactly as one-time passwords are handled: a gift card code is bearer
 * money, so a leaked database must not hand an attacker a pile of redeemable
 * value. The plain code is shown once, when the card is minted, and after
 * that it exists only wherever the recipient keeps it.
 *
 * Redemption is a conditional update from ACTIVE, so two people racing the
 * same code cannot both be credited -- the loser matches no document.
 */

export const GIFT_CARD_STATUSES = ['ACTIVE', 'REDEEMED'] as const;
export type GiftCardStatus = (typeof GIFT_CARD_STATUSES)[number];

export interface GiftCardDoc {
  _id: ObjectId;
  /** HMAC-SHA256 of the normalised code. Never the code itself. */
  codeHash: string;
  /** Last four characters, so a redeemed card is identifiable in a list. */
  codeSuffix: string;
  amount: Paise;
  currency: 'INR';
  status: GiftCardStatus;
  expiresAt: Date;
  redeemedByUserId?: ObjectId | null;
  redeemedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
