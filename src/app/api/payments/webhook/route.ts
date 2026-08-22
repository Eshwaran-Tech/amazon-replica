import { NextResponse, type NextRequest } from 'next/server';

import { getPaymentProvider } from '@/lib/payments/provider';
import { logSecurityEvent } from '@/lib/security/logger';
import { clientIp } from '@/lib/security/request';
import { recordPaymentResult } from '@/services/payment';

/**
 * Payment provider webhook.
 *
 * Deliberately NOT built on `defineHandler`: this endpoint's authentication is
 * the HMAC over the **raw body bytes**, and the wrapper's conveniences (JSON
 * parsing, CSRF) are wrong here -- parsing before verification would mean
 * running JSON.parse on attacker-controlled input, and CSRF tokens do not
 * apply to a server calling a server.
 *
 * Response codes follow webhook convention:
 *  - 200 for everything processed OR knowingly ignored, so the provider stops
 *    retrying events we have consciously handled;
 *  - 400 only for signature/parse failures;
 *  - errors while *applying* a valid event return 500 so the provider retries,
 *    which `recordPaymentResult`'s idempotency makes safe.
 */

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = clientIp(request.headers);

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  if (rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const provider = getPaymentProvider();
  const event = provider.parseWebhook(rawBody, request.headers);

  if (!event) {
    // Unverifiable or unparseable. Worth watching: a burst of these is someone
    // probing for a forgeable webhook.
    logSecurityEvent({
      type: 'payment.webhook.rejected',
      severity: 'warn',
      ip,
      route: '/api/payments/webhook',
      detail: { provider: provider.name, bytes: rawBody.length },
    });
    return NextResponse.json({ received: false }, { status: 400 });
  }

  try {
    const result = await recordPaymentResult(event, { ip, via: 'webhook' });

    // Unknown intent gets a 200: it is not retryable into existence, and 4xx
    // loops here just fill the provider's dead-letter queue.
    return NextResponse.json(
      { received: true, applied: result.ok },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    // Transient failure applying a *valid* event: ask the provider to retry.
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
