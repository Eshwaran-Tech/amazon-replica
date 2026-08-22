import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { corporateEnquiriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { MAX_BULK_FACE_VALUE, MAX_BULK_QUANTITY } from '@/data/bulk-gifting';
import type { CorporateEnquiryDoc } from '@/models/corporate-enquiry';

import '@/lib/server-guard';

/**
 * Bulk gifting.
 *
 * Two real things here, and one deliberate absence.
 *
 * The **slab discount** is real arithmetic: order enough cards and the rate
 * improves, and the calculator on the page uses this same function, so what it
 * quotes is what a bulk order would cost.
 *
 * The **enquiry** is really stored, and the page says so in those words. The
 * reference promises a reply within one business day; this store has no sales
 * desk and makes no such promise, because a form that pretends to summon
 * somebody is the sort of fiction that wastes a real person's afternoon.
 */

// The slabs and the arithmetic live in `data/bulk-gifting` so the calculator
// on the corporate page -- a client component -- can import them without
// dragging this file's database and `node:` imports into the browser bundle.
export {
  DISCOUNT_SLABS,
  MAX_BULK_FACE_VALUE,
  MAX_BULK_QUANTITY,
  quoteBulk,
  slabFor,
  type BulkQuote,
  type DiscountSlab,
} from '@/data/bulk-gifting';

export type EnquiryResult =
  { ok: true; reference: string } | { ok: false; code: 'BAD_INPUT'; message: string };

export interface EnquiryInput {
  fullName: string;
  organisation: string;
  email: string;
  phone: string;
  quantity: string;
  faceValue: string;
  notes: string;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** Ten digits, optionally with the country code, spaces or dashes. */
function looksLikePhone(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 10 && digits.length <= 12;
}

export async function recordEnquiry(
  input: EnquiryInput,
  context: { userId: string | null; ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<EnquiryResult> {
  const fullName = input.fullName.trim().replace(/\s+/g, ' ');
  const organisation = input.organisation.trim().replace(/\s+/g, ' ');
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const notes = input.notes.trim();

  if (fullName.length === 0 || fullName.length > 80) {
    return { ok: false, code: 'BAD_INPUT', message: 'Enter your name.' };
  }
  if (organisation.length === 0 || organisation.length > 120) {
    return { ok: false, code: 'BAD_INPUT', message: 'Enter your organisation.' };
  }
  if (!looksLikeEmail(email) || email.length > 160) {
    return { ok: false, code: 'BAD_INPUT', message: 'Enter a working email address.' };
  }
  if (!looksLikePhone(phone)) {
    return { ok: false, code: 'BAD_INPUT', message: 'Enter a phone number of 10 to 12 digits.' };
  }
  if (notes.length > 1000) {
    return { ok: false, code: 'BAD_INPUT', message: 'Keep the note under 1,000 characters.' };
  }

  const quantity = Number(input.quantity.trim());
  const faceValue = Number(input.faceValue.trim());

  const reference = `CG-${randomBytes(3).toString('hex').toUpperCase()}`;

  const enquiries = await corporateEnquiriesCollection();
  const doc: CorporateEnquiryDoc = {
    _id: new ObjectId(),
    reference,
    userId:
      context.userId && ObjectId.isValid(context.userId) ? new ObjectId(context.userId) : null,
    fullName,
    organisation,
    email,
    phone,
    quantity:
      Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, MAX_BULK_QUANTITY) : null,
    faceValueRupees:
      Number.isInteger(faceValue) && faceValue > 0
        ? Math.min(faceValue, MAX_BULK_FACE_VALUE)
        : null,
    notes,
    createdAt: now,
  };
  await enquiries.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'corporate.enquiry',
      actorId: context.userId,
      targetType: 'corporateEnquiry',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // The contact details are in the enquiry itself; the audit trail records
      // that one arrived, not a second copy of who sent it.
      metadata: { reference, organisation, quantity: doc.quantity },
    },
    'info',
  );

  return { ok: true, reference };
}
