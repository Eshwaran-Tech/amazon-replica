'use server';

import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { checkoutSchema } from '@/lib/validations/checkout';
import { fieldErrors } from '@/lib/validations/common';
import { mockCardSchema } from '@/lib/validations/payment';
import { OFFLINE_PAYMENT_METHODS } from '@/models/types';
import { placeOrder } from '@/services/checkout';
import {
  processMockCardPayment,
  recordPaymentResult,
  ensurePaymentIntent,
} from '@/services/payment';
import { getPaymentProvider } from '@/lib/payments/provider';

/**
 * Checkout Server Actions.
 *
 * Note what is absent from every parse below: prices, totals, payment status.
 * `checkoutSchema` is a strict object -- a form submitting `total=1` is a
 * validation error, not an ignored field. Money is computed inside
 * `placeOrder`'s transaction and nowhere else.
 */

async function verifyActionCsrf(formData: FormData): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);

  const result = verifyCsrf(cookieToken, typeof submitted === 'string' ? submitted : null, subject);
  if (!result.ok) {
    logSecurityEvent({
      type: 'csrf.rejected',
      severity: 'warn',
      detail: { surface: 'checkout-action', reason: result.reason },
    });
  }
  return result.ok;
}

const CSRF_FAILURE: FormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

/** Pulls the optional new-address block out of the flat form encoding. */
function readNewAddress(formData: FormData): Record<string, FormDataEntryValue | null | undefined> {
  return {
    fullName: formData.get('new_fullName'),
    phone: formData.get('new_phone'),
    line1: formData.get('new_line1'),
    // Empty string -> undefined so the optional schema treats it as absent.
    line2: formData.get('new_line2') || undefined,
    city: formData.get('new_city'),
    state: formData.get('new_state'),
    postalCode: formData.get('new_postalCode'),
  };
}

export async function placeOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) return { ok: false, message: 'Please sign in again.' };
  if (!session.user.verified) {
    return {
      ok: false,
      message: 'Please verify your mobile number or email address before placing an order.',
    };
  }

  const limit = await checkRateLimit('checkout:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many checkout attempts. Please wait a moment.' };
  }

  const choseNew = formData.get('addressChoice') === 'new';
  const parsed = checkoutSchema.safeParse({
    ...(choseNew
      ? { newAddress: readNewAddress(formData) }
      : { addressId: formData.get('addressChoice') }),
    paymentMethod: formData.get('paymentMethod'),
    idempotencyKey: formData.get('idempotencyKey'),
  });

  if (!parsed.success) {
    return {
      ok: false,
      fields: fieldErrors(parsed.error),
      message: 'Please check the highlighted fields.',
    };
  }

  const context = await getRequestContext();
  const result = await placeOrder(new ObjectId(session.user.id), parsed.data, context);

  if (!result.ok) {
    return {
      ok: false,
      message: result.shortages?.length
        ? `${result.message} (${result.shortages.join(', ')})`
        : result.message,
    };
  }

  // Cart badge and cart page are now stale everywhere.
  revalidatePath('/', 'layout');

  redirect(
    OFFLINE_PAYMENT_METHODS.includes(result.paymentMethod)
      ? `/checkout/confirmation/${result.orderId}`
      : `/checkout/pay/${result.orderId}`,
  );
}

export async function payWithMockCardAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) return { ok: false, message: 'Please sign in again.' };

  const limit = await checkRateLimit('payment:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many payment attempts. Please wait a moment.' };
  }

  const parsed = mockCardSchema.safeParse({
    orderId: formData.get('orderId'),
    cardNumber: formData.get('cardNumber'),
    expiryMonth: formData.get('expiryMonth'),
    expiryYear: formData.get('expiryYear'),
    cvv: formData.get('cvv'),
    nameOnCard: formData.get('nameOnCard'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      fields: fieldErrors(parsed.error),
      message: 'Please check the card details.',
    };
  }

  const context = await getRequestContext();
  const result = await processMockCardPayment(
    new ObjectId(session.user.id),
    parsed.data.orderId,
    parsed.data.cardNumber,
    context,
  );

  if (!result.ok) return { ok: false, message: result.message };

  if (result.status === 'PAID' || result.status === 'ALREADY_PAID') {
    revalidatePath('/', 'layout');
    redirect(`/checkout/confirmation/${result.orderId}`);
  }

  return {
    ok: false,
    message:
      'The payment was declined by the (simulated) bank. Try the 4242 test card, or a different method.',
  };
}

/**
 * Simulated non-card gateway (UPI / netbanking) for the development provider.
 *
 * The browser chooses which sandbox button it pressed -- exactly as it would
 * on a bank's test page -- but the *outcome is recorded server-side* through
 * the same single writer the webhook uses, with the same ownership and
 * amount checks. Refuses outright when a real provider is active.
 */
export async function simulateGatewayAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) return { ok: false, message: 'Please sign in again.' };

  if (getPaymentProvider().name !== 'mock') {
    return { ok: false, message: 'Payments are handled by the payment provider.' };
  }

  const limit = await checkRateLimit('payment:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many payment attempts. Please wait a moment.' };
  }

  const orderId = formData.get('orderId');
  const succeed = formData.get('outcome') === 'success';
  if (typeof orderId !== 'string') return { ok: false, message: 'Invalid request.' };

  const context = await getRequestContext();
  const intent = await ensurePaymentIntent(new ObjectId(session.user.id), orderId);
  if (!intent.ok) return { ok: false, message: intent.message };
  if (intent.status === 'ALREADY_PAID') redirect(`/checkout/confirmation/${orderId}`);
  if (!intent.intentId) return { ok: false, message: 'This order cannot be paid.' };

  const result = await recordPaymentResult(
    {
      intentId: intent.intentId,
      outcome: succeed ? 'succeeded' : 'failed',
      amount: intent.total,
      failureReason: succeed ? undefined : 'simulated_gateway_failure',
    },
    { ip: context.ip, via: 'mock-gateway' },
  );

  if (result.ok && (result.status === 'PAID' || result.status === 'ALREADY_PAID')) {
    revalidatePath('/', 'layout');
    redirect(`/checkout/confirmation/${orderId}`);
  }

  return { ok: false, message: 'The (simulated) payment did not complete. You can retry.' };
}
