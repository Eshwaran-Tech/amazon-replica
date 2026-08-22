'use server';

import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { cancelOrder } from '@/services/orders';

/**
 * Order Server Actions.
 *
 * Cancellation is the only customer-side order mutation. Everything it needs
 * beyond the order id -- who is cancelling, whether they own the order, what
 * stock to restore, whether money moves -- is derived server-side; the form
 * contributes an id and nothing else.
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
      detail: { surface: 'orders-action', reason: result.reason },
    });
  }
  return result.ok;
}

export async function cancelOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) {
    return { ok: false, message: 'Your session expired. Please refresh the page and try again.' };
  }

  const session = await getSession();
  if (!session) return { ok: false, message: 'Please sign in again.' };

  const limit = await checkRateLimit('orders:cancel:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a moment and try again.' };
  }

  const orderId = formData.get('orderId');
  if (typeof orderId !== 'string' || !ObjectId.isValid(orderId)) {
    return { ok: false, message: 'We could not find that order.' };
  }

  const context = await getRequestContext();
  const result = await cancelOrder(new ObjectId(session.user.id), orderId, context);

  if (!result.ok) return { ok: false, message: result.message };

  // Stock went back to the catalogue and the order list changed.
  revalidatePath('/', 'layout');

  redirect(`/orders/${orderId}?cancelled=1`);
}
