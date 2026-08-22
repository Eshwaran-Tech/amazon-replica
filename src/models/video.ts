import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * What a customer is entitled to watch.
 *
 * One row per (customer, kind, reference). A rental and a channel share the
 * shape because they differ only in what they point at and how long they last,
 * and `expiresAt` is the whole truth for both -- nothing has to run on a
 * schedule to take an entitlement away.
 */

export const VIDEO_ENTITLEMENT_KINDS = ['RENTAL', 'CHANNEL'] as const;
export type VideoEntitlementKind = (typeof VIDEO_ENTITLEMENT_KINDS)[number];

export interface VideoEntitlementDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: VideoEntitlementKind;
  /** Title id for a rental, channel id for a subscription. */
  refId: string;
  pricePaid: Paise;
  startedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
