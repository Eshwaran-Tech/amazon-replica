import { z } from 'zod';

import { objectIdString, quantitySchema } from './common';

/**
 * Cart schemas.
 *
 * Notice what a cart mutation accepts: a product id and a quantity. That is
 * all. There is no `price`, no `lineTotal`, no `subtotal` field -- not because
 * they are ignored, but because a strict object *rejects* them.
 *
 * There is also no `userId`. Cart ownership is derived from the session on the
 * server; a client-supplied owner id is the classic IDOR entry point, so the
 * field does not exist in the contract at all.
 */

export const addToCartSchema = z.strictObject({
  productId: objectIdString,
  quantity: quantitySchema.default(1),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.strictObject({
  productId: objectIdString,
  quantity: quantitySchema,
});

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const removeCartItemSchema = z.strictObject({
  productId: objectIdString,
});

export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;

/** Guest cart identifier, generated server-side and stored in a cookie. */
export const guestCartIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{21,64}$/, 'Invalid cart identifier');
