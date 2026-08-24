import { ObjectId } from 'mongodb';

import { ordersCollection } from '@/lib/db/collections';
import { evaluateMockCard } from '@/lib/payments/mock';
import { getPaymentProvider, type WebhookEvent } from '@/lib/payments/provider';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { canTransitionOrderStatus, OFFLINE_PAYMENT_METHODS } from '@/models/types';
import type { OrderDoc } from '@/models/order';

import '@/lib/server-guard';

/**
 * Payment state transitions.
 *
 * `recordPaymentResult` is the only function that can move an order **from
 * PENDING** to PAID. It is reached from exactly two places:
 *
 *  - the webhook route, after the provider's signature verified;
 *  - the mock gateway's server-side card evaluation (development).
 *
 * Neither path carries anything a browser asserted about the payment. A client
 * request saying "paymentSuccessful: true" has no schema field to live in and
 * no code path to reach here.
 *
 * The one order that is never PENDING is a wallet order: `services/checkout.ts`
 * writes it PAID in the same transaction that debits the balance, because
 * there is no external party whose word is being taken -- the money moved in
 * our own ledger, in the same write. Such orders never reach this module;
 * `ensurePaymentIntent` refuses them.
 */

export type PaymentActionResult =
  | { ok: true; orderId: string; status: 'PAID' | 'FAILED' | 'ALREADY_PAID' | 'READY' }
  | {
      ok: false;
      code: 'NOT_FOUND' | 'NOT_PAYABLE' | 'AMOUNT_MISMATCH' | 'WRONG_PROVIDER';
      message: string;
    };

/**
 * Finds a payable order belonging to `userId`.
 *
 * Ownership is part of the *query*, not a later check: an order id belonging
 * to someone else finds nothing, and the caller cannot distinguish "not yours"
 * from "does not exist" -- the safe-404 behaviour, applied to payments.
 */
async function findPayableOrder(userId: ObjectId, orderId: string): Promise<OrderDoc | null> {
  if (!ObjectId.isValid(orderId)) return null;
  const orders = await ordersCollection();
  return orders.findOne({ _id: new ObjectId(orderId), userId });
}

/** Ensures an intent exists for the order, creating one on first use. */
export async function ensurePaymentIntent(
  userId: ObjectId,
  orderId: string,
): Promise<PaymentActionResult & { intentId?: string; total?: number }> {
  const order = await findPayableOrder(userId, orderId);
  if (!order) return { ok: false, code: 'NOT_FOUND', message: 'We could not find that order.' };

  if (order.paymentStatus === 'PAID') {
    return { ok: true, orderId, status: 'ALREADY_PAID' };
  }
  if (OFFLINE_PAYMENT_METHODS.includes(order.paymentMethod)) {
    return {
      ok: false,
      code: 'NOT_PAYABLE',
      message:
        order.paymentMethod === 'COD'
          ? 'This order is payable on delivery.'
          : 'This order was paid from your Eshwaran Pay balance.',
    };
  }

  if (order.payment.intentId) {
    return {
      ok: true,
      orderId,
      status: 'READY',
      intentId: order.payment.intentId,
      total: order.total,
    };
  }

  const provider = getPaymentProvider();
  // The amount handed to the provider is the order's server-computed total.
  const intent = await provider.createIntent({
    id: order._id.toHexString(),
    orderNumber: order.orderNumber,
    total: order.total,
  });

  const orders = await ordersCollection();
  await orders.updateOne(
    { _id: order._id, 'payment.intentId': null },
    { $set: { 'payment.intentId': intent.intentId, updatedAt: new Date() } },
  );

  return { ok: true, orderId, status: 'READY', intentId: intent.intentId, total: order.total };
}

/**
 * The single writer of payment outcomes. Idempotent: a provider retrying a
 * webhook, or a duplicate delivery, finds the order already PAID and changes
 * nothing -- crediting a payment twice is as much a bug as losing one.
 */
export async function recordPaymentResult(
  event: WebhookEvent,
  context: { ip: string; via: 'webhook' | 'mock-gateway' },
): Promise<PaymentActionResult> {
  const orders = await ordersCollection();
  const order = await orders.findOne({ 'payment.intentId': event.intentId });

  if (!order) return { ok: false, code: 'NOT_FOUND', message: 'Unknown payment intent.' };

  if (event.outcome === 'succeeded') {
    // The provider's settled amount must equal the order's total. A mismatch
    // means tampering somewhere between intent and settlement -- the order is
    // NOT marked paid, and someone gets paged.
    if (typeof event.amount === 'number' && event.amount !== order.total) {
      await recordAuditAndAlert(
        {
          action: 'payment.failed',
          targetType: 'order',
          targetId: order._id.toHexString(),
          ip: context.ip,
          metadata: {
            reason: 'amount_mismatch',
            expected: order.total,
            received: event.amount,
            via: context.via,
          },
        },
        'error',
      );
      return {
        ok: false,
        code: 'AMOUNT_MISMATCH',
        message: 'Payment amount did not match the order.',
      };
    }

    const now = new Date();
    const nextStatus =
      order.orderStatus === 'PENDING' && canTransitionOrderStatus('PENDING', 'CONFIRMED')
        ? 'CONFIRMED'
        : order.orderStatus;

    // The PENDING guard in the filter is the idempotency: a second delivery
    // matches nothing and updates nothing. The CANCELLED guard closes a race:
    // a payment settling *after* the customer cancelled must not resurrect the
    // order -- money arriving for a cancelled order is an incident, not a sale.
    const updated = await orders.updateOne(
      { _id: order._id, paymentStatus: 'PENDING', orderStatus: { $ne: 'CANCELLED' } },
      {
        $set: {
          paymentStatus: 'PAID',
          orderStatus: nextStatus,
          'payment.paidAt': now,
          'payment.failureReason': null,
          updatedAt: now,
        },
        $push: {
          statusHistory: { status: nextStatus, at: now, byUserId: null, note: 'Payment received' },
        },
      },
    );

    if (updated.modifiedCount === 0) {
      const current = await orders.findOne(
        { _id: order._id },
        { projection: { paymentStatus: 1, orderStatus: 1 } },
      );
      if (current?.paymentStatus === 'PAID') {
        return { ok: true, orderId: order._id.toHexString(), status: 'ALREADY_PAID' };
      }
      // Settled money with nowhere to land. A human refunds this by hand, so
      // it is recorded at error severity where alerting will find it.
      await recordAuditAndAlert(
        {
          action: 'payment.succeeded',
          targetType: 'order',
          targetId: order._id.toHexString(),
          ip: context.ip,
          metadata: {
            reason: 'order_no_longer_payable',
            orderStatus: current?.orderStatus ?? 'unknown',
            amount: event.amount ?? order.total,
            via: context.via,
          },
        },
        'error',
      );
      return { ok: false, code: 'NOT_PAYABLE', message: 'This order can no longer be paid.' };
    }

    await recordAuditAndAlert(
      {
        action: 'payment.succeeded',
        actorId: order.userId,
        targetType: 'order',
        targetId: order._id.toHexString(),
        ip: context.ip,
        metadata: { orderNumber: order.orderNumber, amount: order.total, via: context.via },
      },
      'info',
    );

    return { ok: true, orderId: order._id.toHexString(), status: 'PAID' };
  }

  // Failure: recorded for the customer and the audit trail; the order stays
  // payable so they can retry. Stock remains reserved until cancellation.
  await orders.updateOne(
    { _id: order._id, paymentStatus: 'PENDING' },
    {
      $set: {
        'payment.failureReason': (event.failureReason ?? 'payment_failed').slice(0, 80),
        updatedAt: new Date(),
      },
    },
  );

  await recordAuditAndAlert({
    action: 'payment.failed',
    actorId: order.userId,
    targetType: 'order',
    targetId: order._id.toHexString(),
    ip: context.ip,
    metadata: { reason: event.failureReason, via: context.via },
  });

  return { ok: true, orderId: order._id.toHexString(), status: 'FAILED' };
}

/**
 * Development gateway: evaluates a test card server-side and records the
 * outcome through the same single writer the webhook uses.
 *
 * Hard-disabled outside the mock provider: with Stripe active, a "test card
 * that marks orders paid" would be a self-service free-purchase button.
 */
export async function processMockCardPayment(
  userId: ObjectId,
  orderId: string,
  cardNumber: string,
  context: { ip: string },
): Promise<PaymentActionResult> {
  if (getPaymentProvider().name !== 'mock') {
    return {
      ok: false,
      code: 'WRONG_PROVIDER',
      message: 'Card payments are handled by the payment provider.',
    };
  }

  const intent = await ensurePaymentIntent(userId, orderId);
  if (!intent.ok) return intent;
  if (intent.status === 'ALREADY_PAID') return intent;
  if (!intent.intentId)
    return { ok: false, code: 'NOT_PAYABLE', message: 'This order cannot be paid.' };

  const evaluation = evaluateMockCard(cardNumber);

  return recordPaymentResult(
    {
      intentId: intent.intentId,
      outcome: evaluation.outcome,
      // The mock provider settles exactly the intent amount -- which exercises
      // the amount cross-check with the true value.
      amount: intent.total,
      failureReason: evaluation.outcome === 'failed' ? evaluation.reason : undefined,
    },
    { ip: context.ip, via: 'mock-gateway' },
  );
}
