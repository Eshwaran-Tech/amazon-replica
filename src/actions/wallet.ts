'use server';

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
import { fieldErrors } from '@/lib/validations/common';
import { formatPaise } from '@/lib/utils/money';
import { giftCardSchema, topUpAmountPaise, topUpSchema, walletCardSchema } from '@/lib/validations/wallet';
import { redeemGiftCard } from '@/services/gift-cards';
import { completeTopUp, createTopUp } from '@/services/wallet';

/**
 * Wallet Server Actions.
 *
 * The amount is parsed by `topUpSchema` and converted to paise here; the card
 * step takes no amount at all, because the pending entry already carries the
 * figure the server itself wrote. So the browser states an amount exactly
 * once, under a strict schema, and can never restate it at payment time.
 */

async function verifyActionCsrf(formData: FormData, surface: string): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);

  const result = verifyCsrf(cookieToken, typeof submitted === 'string' ? submitted : null, subject);
  if (!result.ok) {
    logSecurityEvent({
      type: 'csrf.rejected',
      severity: 'warn',
      detail: { surface, reason: result.reason },
    });
  }
  return result.ok;
}

const CSRF_FAILURE: FormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

/** Opens a pending top-up, then sends the customer to the payment step. */
export async function startTopUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'wallet-topup'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/balance');

  const context = await getRequestContext();
  // Opening top-ups is cheap for us and noisy in a ledger, so it is capped.
  const limit = await checkRateLimit('wallet:topup:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a minute and try again.' };
  }

  const parsed = topUpSchema.safeParse({ amountRupees: formData.get('amountRupees') });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Check the amount and try again.' };
  }

  const result = await createTopUp(session.user.id, topUpAmountPaise(parsed.data));
  if (!result.ok) return { ok: false, message: result.message };

  logSecurityEvent({
    type: 'wallet.topup.created',
    severity: 'info',
    userId: session.user.id,
    ip: context.ip ?? undefined,
  });

  redirect(`/pay/topup/${result.entryId}`);
}

/** Settles a pending top-up with a test card. Outcome is decided server-side. */
export async function payTopUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'wallet-topup-pay'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/balance');

  const context = await getRequestContext();
  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many payment attempts. Please wait a minute and try again.' };
  }

  const parsed = walletCardSchema.safeParse({
    entryId: formData.get('entryId'),
    cardNumber: formData.get('cardNumber'),
    nameOnCard: formData.get('nameOnCard'),
  });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Check the card details.' };
  }

  const result = await completeTopUp(session.user.id, parsed.data.entryId, parsed.data.cardNumber, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/balance');
  revalidatePath('/pay');
  redirect('/pay/balance?added=1');
}

/** Redeems a gift card code into the signed-in customer's balance. */
export async function redeemGiftCardAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'wallet-giftcard'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/gift-cards');

  const context = await getRequestContext();
  const limit = await checkRateLimit('wallet:giftcard:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const parsed = giftCardSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Check the code and try again.' };
  }

  const result = await redeemGiftCard(session.user.id, parsed.data.code, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/gift-cards');
  revalidatePath('/pay/balance');
  revalidatePath('/pay');

  return { ok: true, message: `Gift card added. ${formatPaise(result.amount)} is now in your balance.` };
}
