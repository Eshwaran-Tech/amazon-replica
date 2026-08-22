import type { ObjectId } from 'mongodb';

/**
 * A support ticket.
 *
 * The reference's complaint history shows an Ongoing / Resolved split over an
 * empty list. An empty list is only honest if something could have filled it,
 * so this store lets a customer actually raise one, and it is stored, listed
 * and closable.
 *
 * There is nobody here to answer it, and the page says so rather than implying
 * an agent is reading. What the feature is good for is real: a written record
 * of what went wrong, attached to the account, that survives a reload.
 */

/**
 * Field limits.
 *
 * Here rather than in `services/support` because the form that enforces them
 * is a client component: importing them from the service dragged `mongodb` and
 * `node:child_process` into the browser bundle. A number with no I/O behind it
 * belongs on this side of the line.
 */
export const MAX_SUBJECT = 120;
export const MAX_BODY = 2000;

export const TICKET_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_TOPICS = [
  'PAYMENT',
  'REFUND',
  'ORDER',
  'GIFT_CARD',
  'RECHARGE',
  'TRAVEL',
  'OTHER',
] as const;
export type TicketTopic = (typeof TICKET_TOPICS)[number];

export interface SupportTicketDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** Human-facing reference, quoted back to the customer. */
  reference: string;
  topic: TicketTopic;
  subject: string;
  body: string;
  /** An order, booking or payment reference the customer quoted. */
  relatedReference: string | null;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  /** Set when the customer closes it themselves. */
  resolvedNote: string | null;
}

export interface SupportTicketView {
  id: string;
  reference: string;
  topic: TicketTopic;
  subject: string;
  body: string;
  relatedReference: string | null;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  resolvedNote: string | null;
}

export const TOPIC_LABELS: Record<TicketTopic, string> = {
  PAYMENT: 'A payment',
  REFUND: 'A refund',
  ORDER: 'An order',
  GIFT_CARD: 'A gift card or voucher',
  RECHARGE: 'A recharge',
  TRAVEL: 'A travel booking',
  OTHER: 'Something else',
};
