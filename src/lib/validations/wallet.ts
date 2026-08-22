import { z } from 'zod';

import { rupeesToPaise } from '@/lib/utils/money';

import { objectIdString } from './common';

/**
 * Wallet schemas.
 *
 * The amount is the one figure a browser *is* allowed to state here -- unlike
 * checkout, where the total is computed server-side, a top-up has no source
 * for the number other than the customer. So it is constrained hard rather
 * than trusted: whole rupees only, above zero, and never more than the
 * per-top-up cap the screen advertises. Fractional paise, negatives,
 * exponent notation and `Infinity` are all rejected before any money code
 * sees the value.
 */

/** Matches the cap shown on the balance screen. */
export const MAX_TOP_UP_RUPEES = 10_000;

/** A wallet may not exceed this; keeps a demo store from holding a fortune. */
export const MAX_WALLET_BALANCE_RUPEES = 100_000;

export const topUpSchema = z.strictObject({
  amountRupees: z.coerce
    .number()
    .refine(Number.isFinite, 'Enter an amount.')
    .refine(Number.isInteger, 'Enter a whole rupee amount.')
    .refine((value) => value > 0, 'Enter an amount greater than zero.')
    .refine(
      (value) => value <= MAX_TOP_UP_RUPEES,
      `You can add up to ₹${MAX_TOP_UP_RUPEES.toLocaleString('en-IN')} at a time.`,
    ),
});

export type TopUpInput = z.infer<typeof topUpSchema>;

/** Paise, derived server-side from the validated rupee figure. */
export function topUpAmountPaise(input: TopUpInput): number {
  return rupeesToPaise(input.amountRupees);
}

/** The card form on the top-up payment step. Mirrors `mockCardSchema`. */
export const walletCardSchema = z.strictObject({
  entryId: objectIdString,
  cardNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{12,19}$/, 'Enter a valid card number')),
  nameOnCard: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z .'-]+$/, 'Enter the name as printed on the card'),
});

export type WalletCardInput = z.infer<typeof walletCardSchema>;

/**
 * A gift card code as typed.
 *
 * Separators are allowed and stripped, because people copy codes with the
 * dashes in. The length is checked after normalising, so "8U9S-Y3E8CQ-39MPQ"
 * and "8u9sy3e8cq39mpq" are the same 15 characters either way.
 */
export const giftCardSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .min(1, 'Enter a gift card code.')
    .max(40, 'That is not a gift card code.')
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .refine((value) => value.length === 15, 'A gift card code is 15 characters.'),
});

export type GiftCardInput = z.infer<typeof giftCardSchema>;
