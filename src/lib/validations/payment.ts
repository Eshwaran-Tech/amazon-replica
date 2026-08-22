import { z } from 'zod';

import { objectIdString } from './common';

/**
 * Payment schemas.
 *
 * The rule this file encodes: **the browser never states an amount, and never
 * states that a payment succeeded.**
 *
 * `createPaymentIntentSchema` takes an order id. The server looks that order
 * up, reads the total *it* computed, and asks the provider to collect exactly
 * that. There is no `amount` field for a client to send.
 *
 * There is likewise no client-facing "mark this order paid" schema. An order
 * becomes PAID only when a webhook whose signature verifies against our shared
 * secret says so. A request body containing `paymentSuccessful: true` has
 * nowhere to land.
 */

export const createPaymentIntentSchema = z.strictObject({
  orderId: objectIdString,
});

export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

/**
 * Test card input for the built-in mock gateway (development only).
 *
 * Even here the card number is *not* stored, logged, or sent anywhere -- the
 * mock gateway inspects it only to decide which outcome to simulate, so the
 * decline and error paths can be exercised without a payment provider account.
 * A real integration would never let a raw PAN reach the application server;
 * it would be tokenised in the browser by the provider's SDK.
 */
export const mockCardSchema = z.strictObject({
  orderId: objectIdString,
  cardNumber: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{12,19}$/, 'Enter a valid card number')),
  expiryMonth: z.coerce.number().int().min(1).max(12),
  expiryYear: z.coerce.number().int().min(2026).max(2050),
  cvv: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, 'Enter a valid CVV'),
  nameOnCard: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z .'-]+$/, 'Enter the name as printed on the card'),
});

export type MockCardInput = z.infer<typeof mockCardSchema>;

/**
 * Shape of a provider webhook body, validated *after* the signature has been
 * verified. Order matters: an unverified body is attacker-controlled, so it is
 * authenticated first and parsed second.
 */
export const paymentWebhookSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  data: z.object({
    object: z.object({
      id: z.string().min(1).max(200),
      /** Provider's own amount, in minor units. Cross-checked against ours. */
      amount: z.number().int().nonnegative().optional(),
      currency: z.string().max(10).optional(),
      status: z.string().max(50).optional(),
      metadata: z.record(z.string(), z.string().max(200)).optional(),
    }),
  }),
});

export type PaymentWebhookEvent = z.infer<typeof paymentWebhookSchema>;

/** Refund, admin-initiated. Amount is optional; absent means full refund. */
export const refundSchema = z.strictObject({
  orderId: objectIdString,
  reason: z.enum(['requested_by_customer', 'duplicate', 'fraudulent', 'other']),
});
