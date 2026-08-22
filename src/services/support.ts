import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { supportTicketsCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import {
  MAX_BODY,
  MAX_SUBJECT,
  TICKET_TOPICS,
  type SupportTicketDoc,
  type SupportTicketView,
  type TicketTopic,
} from '@/models/support-ticket';

import '@/lib/server-guard';

/**
 * Support tickets.
 *
 * A written record attached to the account, which survives a reload and can be
 * closed. There is nobody here to answer it, and the page says so -- what this
 * is not is a form that swallows a complaint and shows a spinner.
 */

export { MAX_BODY, MAX_SUBJECT } from '@/models/support-ticket';

export type RaiseResult =
  { ok: true; reference: string } | { ok: false; code: 'BAD_INPUT'; message: string };

export interface RaiseInput {
  topic: string;
  subject: string;
  body: string;
  relatedReference: string;
}

function isTopic(value: string): value is TicketTopic {
  return (TICKET_TOPICS as readonly string[]).includes(value);
}

function toView(doc: SupportTicketDoc): SupportTicketView {
  return {
    id: doc._id.toHexString(),
    reference: doc.reference,
    topic: doc.topic,
    subject: doc.subject,
    body: doc.body,
    relatedReference: doc.relatedReference,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    resolvedAt: doc.resolvedAt,
    resolvedNote: doc.resolvedNote,
  };
}

export async function raiseTicket(
  userId: string,
  input: RaiseInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<RaiseResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_INPUT', message: 'Please sign in again.' };
  }

  const topic = input.topic.trim().toUpperCase();
  if (!isTopic(topic)) {
    return { ok: false, code: 'BAD_INPUT', message: 'Choose what this is about.' };
  }

  const subject = input.subject.trim().replace(/\s+/g, ' ');
  if (subject.length === 0) {
    return { ok: false, code: 'BAD_INPUT', message: 'Give the ticket a one-line summary.' };
  }
  if (subject.length > MAX_SUBJECT) {
    return {
      ok: false,
      code: 'BAD_INPUT',
      message: `Keep the summary under ${MAX_SUBJECT} characters.`,
    };
  }

  const body = input.body.trim();
  if (body.length < 10) {
    return {
      ok: false,
      code: 'BAD_INPUT',
      message: 'Say a little more about what happened.',
    };
  }
  if (body.length > MAX_BODY) {
    return { ok: false, code: 'BAD_INPUT', message: `Keep it under ${MAX_BODY} characters.` };
  }

  // A reference is a reference, not free text: anything longer is somebody
  // pasting an essay into the wrong box.
  const relatedReference = input.relatedReference.trim().toUpperCase().slice(0, 32);

  const reference = `TK-${randomBytes(3).toString('hex').toUpperCase()}`;
  const tickets = await supportTicketsCollection();

  const doc: SupportTicketDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    reference,
    topic,
    subject,
    body,
    relatedReference: relatedReference.length > 0 ? relatedReference : null,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolvedNote: null,
  };
  await tickets.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'ticket.raised',
      actorId: userId,
      targetType: 'supportTicket',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // The subject can carry anything the customer typed, so the trail records
      // that a ticket exists and what it is about, not a copy of its contents.
      metadata: { reference, topic },
    },
    'info',
  );

  return { ok: true, reference };
}

export type ResolveResult = { ok: true } | { ok: false; code: 'NOT_FOUND'; message: string };

/**
 * Closes a ticket.
 *
 * A conditional update from OPEN, with the owner in the filter: somebody else's
 * reference matches no document, and a second click on an already-closed ticket
 * changes nothing rather than rewriting when it was resolved.
 */
export async function resolveTicket(
  userId: string,
  ticketId: string,
  note: string,
  now = new Date(),
): Promise<ResolveResult> {
  if (!ObjectId.isValid(userId) || !ObjectId.isValid(ticketId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'That ticket is not open.' };
  }

  const tickets = await supportTicketsCollection();
  const result = await tickets.updateOne(
    { _id: new ObjectId(ticketId), userId: new ObjectId(userId), status: 'OPEN' },
    {
      $set: {
        status: 'RESOLVED',
        resolvedAt: now,
        updatedAt: now,
        resolvedNote: note.trim().slice(0, 500) || null,
      },
    },
  );

  if (result.modifiedCount !== 1) {
    return { ok: false, code: 'NOT_FOUND', message: 'That ticket is not open.' };
  }
  return { ok: true };
}

/** This customer's tickets, newest first. Ownership is in the query. */
export async function listTickets(
  userId: string,
  status?: 'OPEN' | 'RESOLVED',
): Promise<SupportTicketView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const tickets = await supportTicketsCollection();
  const docs = await tickets
    .find({ userId: new ObjectId(userId), ...(status ? { status } : {}) })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  return docs.map(toView);
}
