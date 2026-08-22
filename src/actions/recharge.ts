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
import { rechargeNumber } from '@/services/recharge';

/**
 * Mobile recharge.
 *
 * The form carries a number and a plan id and nothing else. The price is read
 * from the plan book on the server, so a tampered amount field has nowhere to
 * land -- the same rule checkout, Prime and the video rentals follow.
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
      detail: { surface: 'recharge', reason: result.reason },
    });
  }
  return result.ok;
}

export async function rechargeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/recharge');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const mobile = formData.get('mobile');
  const planId = formData.get('planId');
  const circle = formData.get('circle');

  if (typeof mobile !== 'string' || typeof planId !== 'string') {
    return { ok: false, message: 'Choose a number and a plan.' };
  }

  const context = await getRequestContext();
  const result = await rechargeNumber(
    session.user.id,
    {
      mobile: mobile.trim(),
      planId,
      ...(typeof circle === 'string' ? { circle } : {}),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/recharge');
  revalidatePath('/pay/balance');
  revalidatePath('/pay');

  return {
    ok: true,
    message: `${formatPaise(result.amount)} recharge done for ${result.mobile}. Reference ${result.reference}.`,
  };
}
