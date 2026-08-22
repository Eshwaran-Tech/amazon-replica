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
import { formatPaise } from '@/lib/utils/money';
import { recordEnquiry } from '@/services/corporate-gifting';
import { buyGiftCard } from '@/services/gift-purchase';

/**
 * Buying a gift card, and asking about a bulk order.
 *
 * The buy form carries a design, an amount, a quantity and a recipient. It
 * carries no total -- the price is re-derived on the server through the same
 * `quoteGift` the page displayed, the rule every paid surface in this store
 * follows.
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

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function buyGiftCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'gift-purchase'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/gift-cards');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const context = await getRequestContext();
  const result = await buyGiftCard(
    session.user.id,
    {
      designId: text(formData, 'design'),
      brandId: text(formData, 'brand'),
      voucherKind: text(formData, 'voucher'),
      delivery: text(formData, 'delivery'),
      amountRupees: Number(text(formData, 'amount')) || 0,
      quantity: Number(text(formData, 'quantity')) || 1,
      recipientName: text(formData, 'recipient'),
      recipientEmail: text(formData, 'email'),
      message: text(formData, 'message'),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/gift-cards');
  revalidatePath('/pay/balance');

  // The codes ride back in the message because this is the only moment they
  // exist: `mintGiftCards` keeps an HMAC and the order keeps four characters.
  // Nothing can show them again, which the page warns about before you pay.
  const plural = result.codes.length === 1 ? 'code' : 'codes';
  return {
    ok: true,
    message: `Paid ${formatPaise(result.amount)} from your balance. Reference ${result.reference}. Copy the ${plural} now — they cannot be shown again: ${result.codes.join('  ')}`,
  };
}

export async function corporateEnquiryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'corporate-enquiry'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const context = await getRequestContext();
  const session = await getSession();

  // Rate limited by address rather than by account: this form is open to
  // anyone, which is exactly why it needs a bound.
  const limit = await checkRateLimit('contact:ip', context.ip ?? 'unknown');
  if (!limit.allowed) {
    return { ok: false, message: 'Too many enquiries from here. Please try again later.' };
  }

  const result = await recordEnquiry(
    {
      fullName: text(formData, 'fullName'),
      organisation: text(formData, 'organisation'),
      email: text(formData, 'email'),
      phone: text(formData, 'phone'),
      quantity: text(formData, 'quantity'),
      faceValue: text(formData, 'faceValue'),
      notes: text(formData, 'notes'),
    },
    {
      userId: session?.user.id ?? null,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  );

  if (!result.ok) return { ok: false, message: result.message };

  return {
    ok: true,
    message: `Enquiry ${result.reference} recorded. This store has no sales desk, so nobody will call — the enquiry is saved and that is all that happens.`,
  };
}
