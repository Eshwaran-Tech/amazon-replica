import { z } from 'zod';

import { PAYMENT_METHODS } from '@/models/types';

import { objectIdString } from './common';
import { addressSchema } from './user';

/**
 * Checkout schema.
 *
 * This is the request that turns a cart into a charge, and it accepts exactly
 * three things: which address, which payment method, and an idempotency key.
 *
 * It accepts **no amounts**. Not `subtotal`, not `discount`, not `shipping`,
 * not `tax`, not `total`, not per-item prices, and not the cart contents. The
 * server loads the user's cart by session, re-reads every product's current
 * price and stock from the database, and computes the total with
 * `calculateTotals`. A client that submits `{"total": 1}` gets a 400 for an
 * unrecognised field -- the value is never weighed against anything, because
 * there is no field for it to land in.
 *
 * It also accepts no `userId`. Ownership comes from the session.
 */

export const checkoutSchema = z
  .strictObject({
    /** An existing saved address, by id. */
    addressId: objectIdString.optional(),
    /** Or a new address to use and save. Exactly one of the two. */
    newAddress: addressSchema.optional(),

    paymentMethod: z.enum(PAYMENT_METHODS),

    /**
     * Client-generated key that makes a retried submission safe.
     *
     * Without it, a double-click or a browser retry after a timeout can place
     * two orders and take two payments. The server records the key against the
     * order and returns the original order for a repeat.
     */
    idempotencyKey: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid request key'),
  })
  .refine((data) => Boolean(data.addressId) !== Boolean(data.newAddress), {
    message: 'Select a saved address or enter a new one',
    path: ['addressId'],
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Address chosen during checkout, when the user only picks a saved one. */
export const selectAddressSchema = z.strictObject({
  addressId: objectIdString,
});
