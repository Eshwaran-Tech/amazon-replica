import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { giftOrdersCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import type { GiftOrderDoc, GiftOrderView } from '@/models/gift-order';
import type { WalletEntryDoc } from '@/models/wallet';

import { mintGiftCards } from './gift-cards';
import {
  findBrand,
  findDelivery,
  findDesign,
  findVoucherType,
  MAX_AMOUNT_RUPEES,
  MAX_MESSAGE,
  MAX_QUANTITY,
  MIN_AMOUNT_RUPEES,
  quoteGift,
} from './gift-store';
import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Buying a gift card.
 *
 * The loop this closes is the whole point of the storefront: paying debits your
 * Eshwaran Pay balance and mints a real card, whose code someone else can redeem
 * into theirs through the existing `redeemGiftCard`. Nothing here is a mock-up
 * of a purchase -- money moves, a card exists, and the code works exactly once.
 *
 * Three rules carried over from the rest of the store:
 *
 *  1. **The browser sends no amount.** The denomination, the brand discount and
 *     the delivery fee are all re-derived here through `quoteGift`, the same
 *     function the page called to display them.
 *  2. **The codes are returned once and never stored.** `mintGiftCards` keeps an
 *     HMAC; the order record keeps only the last four characters. If the buyer
 *     closes the page without copying them, they are gone -- which is what
 *     "bearer money" means and why the page says so before you pay.
 *  3. **Debit before mint.** A charge with no card is a support ticket; a card
 *     with no charge is free money for anyone who can crash the request at the
 *     right moment.
 */

export type BuyGiftResult =
  | {
      ok: true;
      reference: string;
      amount: Paise;
      /** The only time these exist. Show them and forget them. */
      codes: string[];
      expiresAt: Date;
    }
  | {
      ok: false;
      code: 'BAD_DESIGN' | 'BAD_AMOUNT' | 'BAD_QUANTITY' | 'BAD_RECIPIENT' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface BuyGiftInput {
  /** A design id, or empty when buying a brand card or a voucher. */
  designId: string;
  /** A brand id, or empty. */
  brandId: string;
  /** A voucher kind, or empty. */
  voucherKind: string;
  delivery: string;
  amountRupees: number;
  quantity: number;
  recipientName: string;
  recipientEmail: string;
  message: string;
}

/** An ordinary email shape. Deliberately loose: this is not an auth boundary. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export async function buyGiftCard(
  userId: string,
  input: BuyGiftInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<BuyGiftResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_DESIGN', message: 'Please sign in again.' };
  }

  const delivery = findDelivery(input.delivery);
  if (!delivery) {
    return { ok: false, code: 'BAD_DESIGN', message: 'Choose how the card should be sent.' };
  }

  const brand = findBrand(input.brandId);
  const voucher = findVoucherType(input.voucherKind);
  const design = findDesign(input.designId);

  // Exactly one of the three: a card is a design, a brand card or a voucher.
  const kinds = [design, brand, voucher].filter(Boolean).length;
  if (kinds !== 1) {
    return {
      ok: false,
      code: 'BAD_DESIGN',
      message: 'Choose a design, a brand or a voucher — one of the three.',
    };
  }

  // A brand card is a code, so it cannot be printed and posted.
  if ((brand || voucher) && delivery.id !== 'EMAIL') {
    return {
      ok: false,
      code: 'BAD_DESIGN',
      message: 'Brand cards and vouchers are delivered by email.',
    };
  }

  const amountRupees = Math.round(Number(input.amountRupees));
  if (
    !Number.isInteger(amountRupees) ||
    amountRupees < MIN_AMOUNT_RUPEES ||
    amountRupees > MAX_AMOUNT_RUPEES
  ) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: `Choose an amount between ₹${MIN_AMOUNT_RUPEES} and ₹${MAX_AMOUNT_RUPEES.toLocaleString('en-IN')}.`,
    };
  }

  // A brand sets its own denominations; an arbitrary amount is not one of them.
  if (brand && !brand.denominations.includes(amountRupees)) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: `${brand.name} sells cards at ${brand.denominations.map((value) => `₹${value.toLocaleString('en-IN')}`).join(', ')}.`,
    };
  }

  const quantity = Math.round(Number(input.quantity));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return {
      ok: false,
      code: 'BAD_QUANTITY',
      message: `Order between 1 and ${MAX_QUANTITY} cards at a time.`,
    };
  }

  const recipientName = input.recipientName.trim().replace(/\s+/g, ' ');
  if (recipientName.length === 0) {
    return { ok: false, code: 'BAD_RECIPIENT', message: 'Enter who the card is for.' };
  }
  if (recipientName.length > 60) {
    return {
      ok: false,
      code: 'BAD_RECIPIENT',
      message: 'That name is longer than a card will print.',
    };
  }

  const message = input.message.trim();
  if (message.length > MAX_MESSAGE) {
    return {
      ok: false,
      code: 'BAD_RECIPIENT',
      message: `A message can run to ${MAX_MESSAGE} characters.`,
    };
  }

  // An email is required only when the delivery type actually needs one, and
  // is stored only then. A physical card has no use for it.
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  const needsEmail = delivery.id !== 'PHYSICAL';
  if (needsEmail && !looksLikeEmail(recipientEmail)) {
    return {
      ok: false,
      code: 'BAD_RECIPIENT',
      message: 'Enter the email address the card should be sent to.',
    };
  }

  const quote = quoteGift({ amountRupees, quantity, delivery, brand });

  const { balance } = await getWalletSummary(userId);
  if (balance < quote.total) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough. Add money and try again.',
    };
  }

  const reference = `GC-${randomBytes(3).toString('hex').toUpperCase()}`;

  // Debit first. See the note at the top of this file.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'GIFT_PURCHASE',
    direction: 'DEBIT',
    amount: quote.total,
    status: 'COMPLETED',
    currency: 'INR',
    reference,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const validForDays = brand ? brand.validityMonths * 30 : 365;
  const minted = await mintGiftCards(quote.faceValue, quantity, validForDays);

  const orders = await giftOrdersCollection();
  const doc: GiftOrderDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    reference,
    designId: design?.id ?? null,
    occasionId: design?.occasion.id ?? null,
    brandId: brand?.id ?? null,
    voucherKind: voucher?.id ?? null,
    delivery: delivery.id,
    faceValue: quote.faceValue,
    quantity,
    discount: quote.discount,
    deliveryFee: quote.deliveryFee,
    amount: quote.total,
    recipientName,
    recipientEmail: needsEmail ? recipientEmail : null,
    message,
    // Suffixes only. The order history is not a place to keep spendable value.
    codeSuffixes: minted.map((card) => card.code.slice(-4)),
    createdAt: now,
  };
  await orders.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'giftcard.purchased',
      actorId: userId,
      targetType: 'giftOrder',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reference,
        amount: quote.total,
        faceValue: quote.faceValue,
        quantity,
        delivery: delivery.id,
        design: design?.id ?? null,
        brand: brand?.id ?? null,
        voucher: voucher?.id ?? null,
      },
    },
    'info',
  );

  const expiresAt = minted[0]?.expiresAt ?? now;
  return {
    ok: true,
    reference,
    amount: quote.total,
    codes: minted.map((card) => card.code),
    expiresAt,
  };
}

/** This customer's gift orders, newest first. Ownership is in the query. */
export async function listGiftOrders(userId: string, limit = 5): Promise<GiftOrderView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const orders = await giftOrdersCollection();
  const docs = await orders
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    reference: doc.reference,
    designId: doc.designId,
    occasionId: doc.occasionId,
    brandId: doc.brandId,
    voucherKind: doc.voucherKind,
    delivery: doc.delivery,
    faceValue: doc.faceValue,
    quantity: doc.quantity,
    amount: doc.amount,
    recipientName: doc.recipientName,
    message: doc.message,
    codeSuffixes: doc.codeSuffixes,
    createdAt: doc.createdAt,
  }));
}
