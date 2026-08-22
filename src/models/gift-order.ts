import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';
import type { DeliveryType, VoucherKind } from '@/services/gift-store';

/**
 * A gift card order.
 *
 * The record of a purchase, kept apart from the cards themselves. A card is
 * bearer money and stores only an HMAC of its code (see `models/gift-card.ts`);
 * this is the receipt, and it deliberately does **not** hold the codes either.
 * It holds their suffixes, which is enough to tell one card in an order from
 * another without turning a dumped order history into spendable value.
 *
 * The recipient's name and note are snapshotted because they are what the card
 * was sent with. Nothing else about them is kept: no address book entry, no
 * profile, and an email only when one was actually needed to deliver.
 */
export interface GiftOrderDoc {
  _id: ObjectId;
  /** Who paid. */
  userId: ObjectId;
  /** Human-facing reference, shared with the wallet entry. */
  reference: string;
  /** "birthday-03", or null when the card is a brand card. */
  designId: string | null;
  /** Occasion id, for the order history. */
  occasionId: string | null;
  /** Brand id when this is a brand card, else null. */
  brandId: string | null;
  /** Voucher kind when this is a voucher, else null. */
  voucherKind: VoucherKind | null;
  delivery: DeliveryType;
  /** Face value of one card. */
  faceValue: Paise;
  quantity: number;
  discount: Paise;
  deliveryFee: Paise;
  /** What was actually charged to the balance. */
  amount: Paise;
  recipientName: string;
  /** Only stored when the delivery type needed one. */
  recipientEmail: string | null;
  message: string;
  /** Last four characters of each code minted, in order. Never the codes. */
  codeSuffixes: string[];
  createdAt: Date;
}

export interface GiftOrderView {
  id: string;
  reference: string;
  designId: string | null;
  occasionId: string | null;
  brandId: string | null;
  voucherKind: VoucherKind | null;
  delivery: DeliveryType;
  faceValue: Paise;
  quantity: number;
  amount: Paise;
  recipientName: string;
  message: string;
  codeSuffixes: string[];
  createdAt: Date;
}
