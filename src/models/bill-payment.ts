import type { ObjectId } from 'mongodb';

import type { BillCategory } from '@/data/billers';
import type { Paise } from '@/lib/utils/money';

/**
 * A bill that was paid, and a biller that was saved.
 *
 * The **components are stored, not just the total**, for the same reason an
 * order stores its line prices: a total on its own cannot be checked against
 * anything later. If a tariff changes tomorrow, recomputing the bill gives a
 * different answer and nothing says which one was charged.
 *
 * The consumer number is stored in full because the customer needs to recognise
 * their own payment, and it is theirs. It is never shown to anybody else: every
 * query in `services/bills/pay.ts` carries `userId`, the same rule the orders
 * module follows.
 */

export interface BillComponent {
  label: string;
  /** Negative for a rebate or a discount. */
  amount: Paise;
}

export interface BillPaymentDoc {
  _id: ObjectId;
  userId: ObjectId;
  category: BillCategory;
  billerId: string;
  billerName: string;
  /** Normalised, as the format for the category defines it. */
  account: string;
  /** Whose bill it is, as the biller gave it. */
  holder: string;
  /** The cycle or period the payment settles. */
  period: string;
  components: BillComponent[];
  amount: Paise;
  /** Human-facing reference, also the wallet entry's. */
  reference: string;
  /**
   * Set only for an LPG refill, which is a booking rather than a settlement.
   * Everything else leaves this null rather than carrying empty fields.
   */
  booking: {
    cylinderId: string;
    cylinderLabel: string;
    deliverOn: Date;
    slotId: string;
    slotLabel: string;
    /** Transferred to a bank account afterwards, not deducted here. */
    subsidyTransfer: Paise;
  } | null;
  createdAt: Date;
}

export interface BillPaymentView {
  id: string;
  category: BillCategory;
  billerName: string;
  account: string;
  period: string;
  amount: Paise;
  reference: string;
  booking: BillPaymentDoc['booking'];
  createdAt: Date;
}

/**
 * A biller kept for next time.
 *
 * The point of saving one is that the next bill is a single tap. Nothing
 * sensitive lives here -- a consumer number is printed on the bill itself.
 */
export interface SavedBillerDoc {
  _id: ObjectId;
  userId: ObjectId;
  category: BillCategory;
  billerId: string;
  billerName: string;
  account: string;
  /** What the customer calls it: "Amma's flat", "office fibre". */
  nickname: string;
  /** Set when a payment is made, so the list can show what is stale. */
  lastPaidAt: Date | null;
  lastAmount: Paise | null;
  createdAt: Date;
}

export interface SavedBillerView {
  id: string;
  category: BillCategory;
  billerId: string;
  billerName: string;
  account: string;
  nickname: string;
  lastPaidAt: Date | null;
  lastAmount: Paise | null;
}

export const MAX_SAVED_BILLERS = 25;
