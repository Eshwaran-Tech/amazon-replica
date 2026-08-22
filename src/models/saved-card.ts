import type { ObjectId } from 'mongodb';

/**
 * A saved payment method.
 *
 * **No card number is stored here, ever.** The fields below are the ones a
 * saved-card row is actually made of once tokenisation is in force: a token the
 * provider issued, the last four digits, the network, and the expiry. That is
 * enough to draw the row and to charge through the provider, and not enough to
 * be worth stealing.
 *
 * This mirrors the real rule Indian card networks moved to — merchants may keep
 * a token and the last four digits, and nothing else. This store keeps less
 * than it is allowed to rather than more.
 *
 * The tokens here come from the mock provider in `lib/payments/mock.ts`, so
 * "saving a card" saves a reference to a test card. There is no path in this
 * codebase that accepts a real card number.
 */

export const CARD_NETWORKS = ['VISA', 'MASTERCARD', 'RUPAY', 'AMEX'] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

export interface SavedCardDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** The provider's token. Never a card number. */
  token: string;
  /** Four digits, for the row. */
  last4: string;
  network: CardNetwork;
  /** The name printed on the card, as the customer typed it. */
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  /** Charged first when nothing else is chosen. */
  isDefault: boolean;
  createdAt: Date;
  /** Set when the card was last used to pay. */
  lastUsedAt: Date | null;
}

export interface SavedCardView {
  id: string;
  last4: string;
  network: CardNetwork;
  holderName: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  /** True when the expiry has passed. */
  expired: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export const NETWORK_LABELS: Record<CardNetwork, string> = {
  VISA: 'Visa',
  MASTERCARD: 'Mastercard',
  RUPAY: 'RuPay',
  AMEX: 'American Express',
};
