'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { DELIVERY_PIN_COOKIE } from '@/lib/delivery/cookie';
import { estimateDelivery } from '@/services/delivery';

/**
 * The Now store's delivery PIN.
 *
 * A browser preference like language and theme, so it lives in a cookie rather
 * than on the account: a signed-out visitor gets the same behaviour, and
 * someone shopping for two addresses is not editing their profile to do it.
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
      detail: { surface: 'delivery-pin', reason: result.reason },
    });
  }
  return result.ok;
}

export async function setDeliveryPinAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const raw = formData.get('pin');
  const pin = typeof raw === 'string' ? raw.trim() : '';

  // Validated by the same function the page reads with, so a PIN that is
  // stored is always a PIN that resolves.
  const estimate = estimateDelivery(pin);
  if (!estimate) {
    return { ok: false, message: 'Enter a six-digit PIN code.' };
  }

  const store = await cookies();
  store.set(DELIVERY_PIN_COOKIE, estimate.pin, {
    // Not httpOnly: a postcode the visitor typed into a visible field is not a
    // secret, and nothing is authorised by it. Still SameSite=Lax, path-scoped.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });

  revalidatePath('/now');
  return { ok: true, message: `Delivering to ${estimate.label}.` };
}
