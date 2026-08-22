import { createHmac, randomBytes } from 'node:crypto';

import { safeEqual } from '@/lib/auth/password';
import { env } from '@/lib/env';

import type { PaymentProvider, WebhookEvent } from './provider';

import '@/lib/server-guard';

/**
 * The built-in development gateway.
 *
 * A complete server-side payment simulator, so the entire checkout -- intent,
 * outcome, webhook, refusal paths -- can be exercised without a provider
 * account. It follows the same trust rules as a real integration: outcomes are
 * decided *here on the server* (by test card number), never by the browser,
 * and the webhook path demands a valid HMAC like any production endpoint.
 *
 * Test cards (the classic sandbox numbers):
 *   4242 4242 4242 4242  payment succeeds
 *   4000 0000 0000 0002  declined by issuing bank
 *   4000 0000 0000 9995  declined, insufficient funds
 *   anything else        rejected as "not a recognised test card"
 *
 * Unknown numbers are *rejected*, not accepted: a permissive default would let
 * a typo in a test read as a passing payment flow.
 */

export const MOCK_TEST_CARDS = {
  success: '4242424242424242',
  declined: '4000000000000002',
  insufficient: '4000000000009995',
} as const;

export type MockCardOutcome =
  | { outcome: 'succeeded' }
  | { outcome: 'failed'; reason: string };

export function evaluateMockCard(cardNumber: string): MockCardOutcome {
  switch (cardNumber) {
    case MOCK_TEST_CARDS.success:
      return { outcome: 'succeeded' };
    case MOCK_TEST_CARDS.declined:
      return { outcome: 'failed', reason: 'card_declined' };
    case MOCK_TEST_CARDS.insufficient:
      return { outcome: 'failed', reason: 'insufficient_funds' };
    default:
      return { outcome: 'failed', reason: 'unrecognised_test_card' };
  }
}

/** HMAC over the raw body -- the same construction a real provider uses. */
export function signMockWebhook(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Signature verification and parsing, with the secret as an explicit
 * parameter. Pure, so the "unconfigured secret fails closed" behaviour is
 * directly unit-testable -- `env()` caches its first read, which would
 * otherwise make that case untestable in-process.
 */
export function parseMockWebhookWithSecret(
  rawBody: string,
  headers: Headers,
  secret: string,
): WebhookEvent | null {
  // No secret configured means the webhook surface is closed, not open.
  if (!secret) return null;

  const signature = headers.get('x-webhook-signature');
  if (!signature) return null;
  if (!safeEqual(signature, signMockWebhook(rawBody, secret))) return null;

    // Only now is the body trusted enough to parse.
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const body = parsed as {
      type?: string;
      data?: { object?: { id?: string; amount?: number; status?: string } };
    };

    const intentId = body.data?.object?.id;
    if (!intentId || typeof intentId !== 'string') return null;

    const succeeded = body.type === 'payment_intent.succeeded';
    const failed = body.type === 'payment_intent.payment_failed';
    if (!succeeded && !failed) return null;

    return {
      intentId,
      outcome: succeeded ? 'succeeded' : 'failed',
      amount: typeof body.data?.object?.amount === 'number' ? body.data.object.amount : undefined,
      failureReason: succeeded ? undefined : 'provider_reported_failure',
    };
}

export const mockProvider: PaymentProvider = {
  name: 'mock',

  async createIntent(order) {
    // Unpredictable suffix so an intent id cannot be derived from an order id.
    return { intentId: `mock_pi_${order.id}_${randomBytes(8).toString('hex')}` };
  },

  parseWebhook(rawBody, headers): WebhookEvent | null {
    return parseMockWebhookWithSecret(rawBody, headers, env().PAYMENT_WEBHOOK_SECRET);
  },

  async refund() {
    // The simulator settles instantly, so it refunds instantly too. Real
    // failure paths (insufficient balance, closed account) belong to the real
    // provider integration.
    return { ok: true };
  },
};
