import { ObjectId } from 'mongodb';

import { getMongoClient, getDb } from '@/lib/db/client';
import {
  COLLECTIONS,
  ordersCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { sendOrderCancelledEmail } from '@/lib/email';
import { getPaymentProvider } from '@/lib/payments/provider';
import { recordAudit, recordAuditAndAlert } from '@/lib/security/audit';
import { canTransitionOrderStatus } from '@/models/types';
import {
  toOrderDetailView,
  toOrderSummaryView,
  type OrderDetailView,
  type OrderDoc,
  type OrderSummaryView,
} from '@/models/order';
import type { ProductDoc } from '@/models/product';

import '@/lib/server-guard';

/**
 * Customer order reads and cancellation.
 *
 * Every function takes the session's `userId` and puts it **in the query**.
 * There is no "fetch order then check owner" anywhere in this module: an order
 * id that is not yours matches nothing, and the page renders the same 404 it
 * would for an id that never existed.
 */

export const ORDERS_PAGE_SIZE = 10;

export interface OrderHistory {
  orders: OrderSummaryView[];
  page: number;
  hasMore: boolean;
}

export async function listOrdersForUser(userId: ObjectId, page = 1): Promise<OrderHistory> {
  const safePage = Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
  const orders = await ordersCollection();

  // One extra document decides `hasMore` without a second count query.
  const docs = await orders
    .find({ userId })
    .sort({ createdAt: -1, _id: -1 })
    .skip((safePage - 1) * ORDERS_PAGE_SIZE)
    .limit(ORDERS_PAGE_SIZE + 1)
    .toArray();

  return {
    orders: docs.slice(0, ORDERS_PAGE_SIZE).map(toOrderSummaryView),
    page: safePage,
    hasMore: docs.length > ORDERS_PAGE_SIZE,
  };
}

/** Detail view, ownership in the query. Null renders as 404. */
export async function getOrderForUser(
  userId: ObjectId,
  orderId: string,
): Promise<OrderDetailView | null> {
  if (!ObjectId.isValid(orderId)) return null;
  const orders = await ordersCollection();
  const doc = await orders.findOne({ _id: new ObjectId(orderId), userId });
  return doc ? toOrderDetailView(doc) : null;
}

/** Whether the customer-facing cancel control should exist for this status. */
export function isCancellableStatus(status: OrderDoc['orderStatus']): boolean {
  return canTransitionOrderStatus(status, 'CANCELLED');
}

export type CancelOrderResult =
  | { ok: true; orderNumber: string; refund: 'NONE' | 'REFUNDED' | 'REFUND_PENDING' }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_CANCELLABLE' | 'CONFLICT'; message: string };

export interface CancellationActor {
  /** Who is cancelling -- the customer, or an admin. Recorded in the history. */
  actorId: ObjectId;
  note: string;
  ip: string;
}

/**
 * Customer-facing cancellation: ownership is part of the order filter.
 */
export async function cancelOrder(
  userId: ObjectId,
  orderId: string,
  context: { ip: string },
): Promise<CancelOrderResult> {
  if (!ObjectId.isValid(orderId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'We could not find that order.' };
  }
  return executeCancellation(
    { _id: new ObjectId(orderId), userId },
    { actorId: userId, note: 'Cancelled by customer', ip: context.ip },
  );
}

/**
 * Cancels an order and releases its stock, atomically. Shared by the customer
 * path above (which adds ownership to the filter) and the admin status change
 * (which does not, but is itself behind the admin guard).
 *
 * Inside one transaction:
 *  - the order moves to CANCELLED, guarded on the status it was read at, so a
 *    concurrent transition (an admin marking it SHIPPED) aborts this instead of
 *    being silently overwritten;
 *  - every item's stock is incremented back -- but only when `stockCommitted`
 *    was still true, and the same write flips it false, so a double cancel
 *    cannot restock twice.
 *
 * The refund, if one is owed, happens *after* commit. For a gateway payment
 * that is forced: it is an external call that cannot participate in the
 * transaction, and a cancelled order with a pending refund is a recoverable
 * state, whereas stock restored for an order that then failed to cancel is
 * not. A wallet refund could join the transaction, but is kept on the same
 * path so there is one place where "money went back" is decided; it is made
 * exactly-once by flipping the payment status conditionally before writing
 * the credit.
 */
export async function executeCancellation(
  filter: { _id: ObjectId; userId?: ObjectId },
  actor: CancellationActor,
): Promise<CancelOrderResult> {
  const client = await getMongoClient();
  const db = await getDb();
  const session = client.startSession();

  let cancelled: OrderDoc | null = null;
  let failure: CancelOrderResult | null = null;

  try {
    await session.withTransaction(async () => {
      const ordersC = db.collection<OrderDoc>(COLLECTIONS.orders);
      const productsC = db.collection<ProductDoc>(COLLECTIONS.products);

      const order = await ordersC.findOne(filter, { session });
      if (!order) {
        failure = { ok: false, code: 'NOT_FOUND', message: 'We could not find that order.' };
        await session.abortTransaction();
        return;
      }

      if (!canTransitionOrderStatus(order.orderStatus, 'CANCELLED')) {
        failure = {
          ok: false,
          code: 'NOT_CANCELLABLE',
          message:
            order.orderStatus === 'CANCELLED'
              ? 'This order is already cancelled.'
              : 'This order has already been shipped and can no longer be cancelled.',
        };
        await session.abortTransaction();
        return;
      }

      const now = new Date();
      const updated = await ordersC.updateOne(
        // Guarded on the status just read: if it changed underneath us, this
        // matches nothing and the whole cancellation aborts.
        { ...filter, orderStatus: order.orderStatus },
        {
          $set: { orderStatus: 'CANCELLED', stockCommitted: false, updatedAt: now },
          $push: {
            statusHistory: {
              status: 'CANCELLED' as const,
              at: now,
              byUserId: actor.actorId,
              note: actor.note,
            },
          },
        },
        { session },
      );

      if (updated.modifiedCount === 0) {
        failure = {
          ok: false,
          code: 'CONFLICT',
          message: 'The order changed while cancelling. Please try again.',
        };
        await session.abortTransaction();
        return;
      }

      if (order.stockCommitted) {
        for (const item of order.items) {
          await productsC.updateOne(
            { _id: item.productId },
            { $inc: { stock: item.quantity }, $set: { updatedAt: now } },
            { session },
          );
        }
      }

      cancelled = order;
    });
  } finally {
    await session.endSession();
  }

  if (failure) return failure;
  if (!cancelled) {
    return {
      ok: false,
      code: 'CONFLICT',
      message: 'The order could not be cancelled. Please try again.',
    };
  }
  const order: OrderDoc = cancelled;

  await recordAudit({
    action: 'order.cancelled',
    actorId: actor.actorId,
    targetType: 'order',
    targetId: order._id.toHexString(),
    ip: actor.ip,
    metadata: {
      orderNumber: order.orderNumber,
      previousStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      note: actor.note,
    },
  });

  // ---- cashback, taken back with the order it was earned on ----------------
  // Every payment method, not just the wallet: cashback is credited when the
  // order is placed, so a cancelled COD order would otherwise leave the
  // customer paid for a purchase that never happened. The unique `reference`
  // index is the exactly-once guard -- a second attempt hits a duplicate key,
  // which is caught rather than allowed to fail the cancellation the customer
  // has already been told succeeded.
  const entriesForCashback = await walletEntriesCollection();
  const earned = await entriesForCashback.findOne({
    userId: order.userId,
    type: 'CASHBACK',
    reference: `${order.orderNumber}-CB`,
  });

  if (earned) {
    const now = new Date();
    try {
      await entriesForCashback.insertOne({
        _id: new ObjectId(),
        userId: order.userId,
        type: 'CASHBACK',
        direction: 'DEBIT',
        amount: earned.amount,
        status: 'COMPLETED',
        currency: 'INR',
        reference: `${order.orderNumber}-CBR`,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  // ---- refund, when money actually changed hands ---------------------------
  let refund: 'NONE' | 'REFUNDED' | 'REFUND_PENDING' = 'NONE';

  if (order.paymentStatus === 'PAID' && order.paymentMethod === 'WALLET') {
    // Money paid from the wallet goes back to the wallet. There is no external
    // call that can fail here, so the only hazard is doing it twice -- and the
    // conditional flip below is the guard: whoever wins it writes the credit,
    // and a second cancellation matches nothing and writes nothing.
    const orders = await ordersCollection();
    const flipped = await orders.updateOne(
      { _id: order._id, paymentStatus: 'PAID' },
      { $set: { paymentStatus: 'REFUNDED', updatedAt: new Date() } },
    );

    if (flipped.modifiedCount === 1) {
      const now = new Date();
      const entries = await walletEntriesCollection();
      await entries.insertOne({
        _id: new ObjectId(),
        userId: order.userId,
        type: 'REFUND',
        direction: 'CREDIT',
        amount: order.total,
        status: 'COMPLETED',
        currency: 'INR',
        // The debit already claimed the bare order number, and `reference` is
        // unique across the ledger -- which is what makes a second refund for
        // this order impossible even if the status guard above were bypassed.
        reference: `${order.orderNumber}-R`,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      });

      await recordAuditAndAlert(
        {
          action: 'payment.refunded',
          actorId: actor.actorId,
          targetType: 'order',
          targetId: order._id.toHexString(),
          ip: actor.ip,
          metadata: { orderNumber: order.orderNumber, amount: order.total, to: 'wallet' },
        },
        'info',
      );
    }

    // Either this call refunded it or a concurrent one did; the customer's
    // money is back either way.
    refund = 'REFUNDED';
  } else if (order.paymentStatus === 'PAID' && order.payment.intentId) {
    const provider = getPaymentProvider();
    const result = await provider
      .refund(order.payment.intentId, order.total)
      .catch((error: unknown) => ({
        ok: false as const,
        reason: error instanceof Error ? error.message.slice(0, 80) : 'refund_call_failed',
      }));

    if (result.ok) {
      const orders = await ordersCollection();
      // PAID in the filter: if something already refunded it, do not do it twice.
      await orders.updateOne(
        { _id: order._id, paymentStatus: 'PAID' },
        { $set: { paymentStatus: 'REFUNDED', updatedAt: new Date() } },
      );
      refund = 'REFUNDED';
      await recordAuditAndAlert(
        {
          action: 'payment.refunded',
          actorId: actor.actorId,
          targetType: 'order',
          targetId: order._id.toHexString(),
          ip: actor.ip,
          metadata: { orderNumber: order.orderNumber, amount: order.total },
        },
        'info',
      );
    } else {
      // The order is cancelled but the money has not moved. Deliberately loud:
      // this state needs a human, and it must not look like a completed refund
      // to the customer -- the UI says "refund is being processed".
      refund = 'REFUND_PENDING';
      await recordAuditAndAlert(
        {
          action: 'payment.refunded',
          actorId: actor.actorId,
          targetType: 'order',
          targetId: order._id.toHexString(),
          ip: actor.ip,
          metadata: {
            orderNumber: order.orderNumber,
            amount: order.total,
            failed: true,
            reason: result.reason,
          },
        },
        'error',
      );
    }
  }

  // Best-effort notification to the order's owner (who may not be the actor,
  // when an admin cancels), never blocking the cancellation result.
  const users = await usersCollection();
  const user = await users.findOne({ _id: order.userId }, { projection: { email: 1, name: 1 } });
  if (user?.email) {
    await sendOrderCancelledEmail(user.email, user.name, order.orderNumber, refund).catch(
      () => undefined,
    );
  }

  return { ok: true, orderNumber: order.orderNumber, refund };
}
