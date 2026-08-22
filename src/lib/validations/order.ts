import { z } from 'zod';

import { ORDER_STATUSES, PAYMENT_STATUSES } from '@/models/types';

import { limitSchema, objectIdString, pageSchema, singleLineText } from './common';

/**
 * Order schemas.
 *
 * No schema here accepts a `userId`. A customer's order list is derived from
 * the session, and an order detail request carries only the order id -- which
 * the service then checks ownership on. Accepting a `userId` would make
 * "whose orders?" a client-supplied answer, which is the definition of a
 * broken object-level authorisation bug.
 */

export const orderIdSchema = z.strictObject({
  orderId: objectIdString,
});

/** Human-facing order number, e.g. NK-2A7F3C91. */
export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^NK-[0-9A-F]{8}$/, 'Invalid order number');

export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  page: pageSchema,
  limit: limitSchema,
});

export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** Customer-initiated cancellation. Whether it is *allowed* is a business
 *  rule checked against the current status, not something the schema decides. */
export const cancelOrderSchema = z.strictObject({
  orderId: objectIdString,
  reason: singleLineText(0, 200, 'Reason').optional().or(z.literal('')),
});

// ----------------------------------------------------------------- admin side

export const adminOrderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional().catch(undefined),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional().catch(undefined),
  q: z.string().trim().max(60).optional().catch(undefined),
  page: pageSchema,
  limit: limitSchema,
});

/**
 * Admin status change.
 *
 * The schema validates that `status` is a known value. Whether the *transition*
 * is legal (`DELIVERED -> PENDING` is not) is checked against
 * `ORDER_STATUS_TRANSITIONS` in the service, because that depends on the
 * order's current state, which the request does not and must not supply.
 */
export const updateOrderStatusSchema = z.strictObject({
  orderId: objectIdString,
  status: z.enum(ORDER_STATUSES),
  note: singleLineText(0, 300, 'Note').optional().or(z.literal('')),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
