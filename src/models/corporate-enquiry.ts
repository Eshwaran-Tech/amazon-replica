import type { ObjectId } from 'mongodb';

/**
 * A bulk-gifting enquiry.
 *
 * The corporate form on the reference promises somebody will be in touch within
 * a business day. This store has no sales desk, so it does not make that
 * promise -- what it does instead is genuinely record the enquiry and say
 * plainly that it has been recorded and nothing more will happen. A form that
 * quietly discards what it collects is worse than no form.
 *
 * Contact details are the whole point of an enquiry, so they are kept. What is
 * *not* kept is anything the enquiry did not need: no tracking id, no referrer,
 * no marketing flags. And because these are contact details rather than
 * credentials, they are stored plainly and are visible to nobody but an
 * administrator reading the collection.
 */
export interface CorporateEnquiryDoc {
  _id: ObjectId;
  /** Human-facing reference, shown once so the sender can quote it. */
  reference: string;
  /** Set when the sender happened to be signed in. */
  userId: ObjectId | null;
  fullName: string;
  organisation: string;
  email: string;
  phone: string;
  /** Cards wanted, when the sender gave a figure. */
  quantity: number | null;
  /** Face value per card in whole rupees, when given. */
  faceValueRupees: number | null;
  notes: string;
  createdAt: Date;
}
