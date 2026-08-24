import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * App store and Play credit.
 *
 * A **scoped balance**, and the scope is the whole point. This is not the
 * Eshwaran Pay wallet with a different label on it: it buys digital content and
 * nothing else, it cannot be withdrawn, and it is spent before the wallet is
 * when a rental is paid for. That is exactly what a store credit is, and
 * pretending it were interchangeable with money would be the lie.
 *
 * **No stored balance.** Summed from this ledger, the same rule the wallet and
 * the FASTag ledger follow: a balance column and a ledger can disagree, and
 * when they do the money is already wrong and neither says which one lied.
 */

export const CONTENT_STORES = ['APPSTORE', 'PLAY'] as const;
export type ContentStore = (typeof CONTENT_STORES)[number];

export const CREDIT_ENTRY_TYPES = ['TOP_UP', 'BONUS', 'SPEND', 'AUTO_RELOAD'] as const;
export type CreditEntryType = (typeof CREDIT_ENTRY_TYPES)[number];

export interface ContentCreditDoc {
  _id: ObjectId;
  userId: ObjectId;
  store: ContentStore;
  type: CreditEntryType;
  /** CREDIT adds, DEBIT subtracts. `amount` is always positive. */
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  /** Shared with the wallet entry that paid for it, where one did. */
  reference: string;
  note: string;
  createdAt: Date;
}

/**
 * Automatic reload.
 *
 * A real store-credit feature, and the one thing on this surface that has to be
 * checked at *spend* time rather than at top-up time -- which is what makes it
 * worth building rather than describing.
 */
export interface AutoReloadDoc {
  _id: ObjectId;
  userId: ObjectId;
  store: ContentStore;
  enabled: boolean;
  /** Reload when the balance falls below this. */
  thresholdRupees: number;
  /** And put this much on. */
  amountRupees: number;
  /** Guards against a runaway loop of reloads in one day. */
  maxPerMonth: number;
  reloadsThisMonth: number;
  monthKey: string;
  updatedAt: Date;
}

export interface CreditEntryView {
  id: string;
  store: ContentStore;
  type: CreditEntryType;
  direction: 'CREDIT' | 'DEBIT';
  amount: Paise;
  reference: string;
  note: string;
  createdAt: Date;
}

export const STORE_LABELS: Record<ContentStore, string> = {
  APPSTORE: 'App Store credit',
  PLAY: 'Play credit',
};
