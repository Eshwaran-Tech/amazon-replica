import { env } from '@/lib/env';

import { mockProvider } from './mock';
import { stripeProvider } from './stripe';

import '@/lib/server-guard';

/**
 * Payment provider abstraction.
 *
 * The trust rules every implementation must obey:
 *
 *  1. The amount comes from the *order document* the server wrote -- providers
 *     never receive an amount from anything a browser sent.
 *  2. An order becomes PAID only through `recordPaymentResult` in
 *     `src/services/payment.ts`, reached either by a signature-verified
 *     webhook or by the mock gateway's own server-side processing. There is no
 *     code path from "the browser says the payment succeeded" to a paid order.
 *  3. Webhook signatures are verified over the *raw* body bytes, before any
 *     parsing -- an unverified body is attacker-controlled input.
 */

export interface IntentOrder {
  /** Order id, hex string. */
  id: string;
  orderNumber: string;
  /** Integer paise, straight from the order document. */
  total: number;
}

export interface PaymentIntentResult {
  intentId: string;
}

export interface WebhookEvent {
  intentId: string;
  outcome: 'succeeded' | 'failed';
  /** Amount the provider settled, in minor units. Cross-checked by the service. */
  amount?: number;
  failureReason?: string;
}

export type RefundResult = { ok: true } | { ok: false; reason: string };

export interface PaymentProvider {
  readonly name: 'mock' | 'stripe';
  createIntent(order: IntentOrder): Promise<PaymentIntentResult>;
  /**
   * Verifies the webhook signature and extracts a normalised event.
   * Returns null on any verification or parse failure -- the route treats
   * null as a 400 and never touches an order.
   */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
  /**
   * Returns the captured amount to the customer. The amount is the order
   * document's total, same trust rule as `createIntent`. A failure result is
   * surfaced, never swallowed: the order stays marked PAID until the provider
   * actually confirms the money is on its way back.
   */
  refund(intentId: string, amount: number): Promise<RefundResult>;
}

export function getPaymentProvider(): PaymentProvider {
  return env().PAYMENT_PROVIDER === 'stripe' ? stripeProvider : mockProvider;
}
