import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A completed prepaid recharge.
 *
 * The number is stored in full because the customer needs to recognise it in
 * their history, and it is theirs. It is never shown to anyone else: every
 * query in `services/recharge.ts` carries `userId`, the same rule the orders
 * module follows.
 */
export interface RechargeDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** Ten digits, no country code. */
  mobile: string;
  operatorId: string;
  circle: string;
  planId: string;
  amount: Paise;
  /** Human-facing reference, also the wallet entry's. */
  reference: string;
  createdAt: Date;
}

export interface RechargeView {
  id: string;
  mobile: string;
  operatorName: string;
  circle: string;
  amount: Paise;
  reference: string;
  createdAt: Date;
}
