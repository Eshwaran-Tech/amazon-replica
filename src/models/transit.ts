import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * FASTags and metro cards.
 *
 * **There is no stored balance on either.** A tag's balance is the sum of its
 * ledger entries, exactly as the wallet's is, and for the same reason: a
 * balance column and a ledger can disagree, and when they do the money is
 * already wrong and neither one says which lied. Deriving it means they cannot
 * drift apart.
 *
 * A tag or card is scoped to one customer. Every query in
 * `services/fastag.ts` and `services/metro.ts` carries `userId`, so a guessed
 * registration number reaches nothing.
 */

export const TRANSIT_KINDS = ['FASTAG', 'METRO'] as const;
export type TransitKind = (typeof TRANSIT_KINDS)[number];

export interface TransitAccountDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: TransitKind;
  /**
   * The tag or card number shown to the customer, and the natural key a
   * recharge looks up. Normalised: a registration without spaces, a card
   * number without them either.
   */
  number: string;
  /** Issuer id for a tag, network id for a metro card. */
  providerId: string;
  providerName: string;

  /** FASTag only. */
  vehicle: {
    registration: string;
    modelId: string | null;
    modelLabel: string | null;
    tollClass: string;
  } | null;

  /**
   * Paid once when the tag is issued; refundable when it is closed.
   *
   * Held rather than spendable, so it is a field on the account and never an
   * entry in the ledger. A deposit showing up as balance would be money the
   * customer believes they can spend at a barrier and cannot.
   */
  securityDeposit: Paise;
  /** Non-refundable. */
  issuanceFee: Paise;
  /** Below this the tag is refused at a barrier / the card at a gate. */
  minBalance: Paise;

  status: 'ACTIVE' | 'CLOSED';
  createdAt: Date;
  updatedAt: Date;
}

export const TRANSIT_ENTRY_TYPES = ['TOP_UP', 'TOLL', 'FARE', 'REFUND'] as const;
export type TransitEntryType = (typeof TRANSIT_ENTRY_TYPES)[number];

/**
 * One movement on a tag or card.
 *
 * `amount` is always positive; `direction` carries the sign -- the same rule
 * the wallet ledger follows, so "sum the credits" cannot be quietly wrong.
 */
export interface TransitEntryDoc {
  _id: ObjectId;
  accountId: ObjectId;
  userId: ObjectId;
  type: TransitEntryType;
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  /** Matches the wallet entry that paid for it, where one did. */
  reference: string;
  note: string;
  createdAt: Date;
}

export interface TransitAccountView {
  id: string;
  kind: TransitKind;
  number: string;
  providerId: string;
  providerName: string;
  vehicleLabel: string | null;
  tollClass: string | null;
  balance: Paise;
  minBalance: Paise;
  /** True when the balance would be refused at a barrier. */
  lowBalance: boolean;
  securityDeposit: Paise;
  status: 'ACTIVE' | 'CLOSED';
  createdAt: Date;
}

export interface TransitEntryView {
  id: string;
  type: TransitEntryType;
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  reference: string;
  note: string;
  createdAt: Date;
}
