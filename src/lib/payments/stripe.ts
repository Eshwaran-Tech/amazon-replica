import { createHmac } from 'node:crypto';

import { safeEqual } from '@/lib/auth/password';
import { env } from '@/lib/env';

import type { PaymentProvider, WebhookEvent } from './provider';

import '@/lib/server-guard';

/**
 * Stripe integration over the REST API.
 *
 * Deliberately SDK-free: the two operations this app needs -- create a
 * PaymentIntent and verify a webhook -- are one HTTPS call and one HMAC, and
 * skipping the SDK keeps the dependency surface (and its supply-chain risk)
 * smaller. Active only when `PAYMENT_PROVIDER=stripe` with keys configured;
 * `src/lib/env.ts` refuses to boot that configuration incomplete.
 *
 * The secret key never leaves this module and is never logged -- the logger's
 * redaction patterns cover `sk_live_`/`sk_test_` as a second line of defence.
 */

const API_BASE = 'https://api.stripe.com/v1';

/** Webhook timestamps older than this are replays and are rejected. */
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export const stripeProvider: PaymentProvider = {
  name: 'stripe',

  async createIntent(order) {
    const body = new URLSearchParams({
      // The amount is the order document's total. Nothing here ever reads an
      // amount from a request.
      amount: String(order.total),
      currency: 'inr',
      'metadata[orderId]': order.id,
      'metadata[orderNumber]': order.orderNumber,
      'automatic_payment_methods[enabled]': 'true',
    });

    const response = await fetch(`${API_BASE}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env().PAYMENT_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      // The provider's error body can echo request details; keep it out of
      // anything a customer sees. The caller logs a generic failure.
      throw new Error(`Stripe intent creation failed with HTTP ${response.status}`);
    }

    const intent = (await response.json()) as { id: string };
    return { intentId: intent.id };
  },

  /**
   * Verifies Stripe's `Stripe-Signature: t=<ts>,v1=<hmac>` scheme: the HMAC is
   * SHA-256 over `"<ts>.<rawBody>"` with the webhook secret, and the timestamp
   * must be recent -- the signature covers it, so a replayed capture fails the
   * tolerance check without the attacker being able to re-stamp it.
   */
  parseWebhook(rawBody, headers): WebhookEvent | null {
    const secret = env().PAYMENT_WEBHOOK_SECRET;
    if (!secret) return null;

    const header = headers.get('stripe-signature');
    if (!header) return null;

    const parts = new Map(
      header.split(',').map((part) => part.split('=', 2) as [string, string]),
    );
    const timestamp = Number(parts.get('t'));
    const signature = parts.get('v1');
    if (!Number.isFinite(timestamp) || !signature) return null;

    if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return null;

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    if (!safeEqual(signature, expected)) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const event = parsed as {
      type?: string;
      data?: { object?: { id?: string; amount?: number; last_payment_error?: { code?: string } } };
    };

    const intentId = event.data?.object?.id;
    if (!intentId) return null;

    if (event.type === 'payment_intent.succeeded') {
      return {
        intentId,
        outcome: 'succeeded',
        amount: typeof event.data?.object?.amount === 'number' ? event.data.object.amount : undefined,
      };
    }
    if (event.type === 'payment_intent.payment_failed') {
      return {
        intentId,
        outcome: 'failed',
        failureReason: event.data?.object?.last_payment_error?.code ?? 'payment_failed',
      };
    }

    // Other event types are acknowledged but change nothing.
    return null;
  },

  async refund(intentId, amount) {
    const body = new URLSearchParams({
      payment_intent: intentId,
      // The amount refunded is the amount the order document says was paid.
      amount: String(amount),
    });

    const response = await fetch(`${API_BASE}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env().PAYMENT_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      // Status code only -- the error body can echo account details.
      return { ok: false, reason: `stripe_refund_http_${response.status}` };
    }
    return { ok: true };
  },
};
