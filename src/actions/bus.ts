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
import { bookBus } from '@/services/bus-booking';

/**
 * Bus ticket booking.
 *
 * The form carries a route, a date, a coach id, seat labels and two stop names.
 * It carries no amount -- the fare is summed on the server from the seat map,
 * the same rule checkout, Prime, the rentals and the recharge follow.
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
      detail: { surface: 'bus-booking', reason: result.reason },
    });
  }
  return result.ok;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function bookBusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/buses');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const seatIds = text(formData, 'seats')
    .split(',')
    .map((seat) => seat.trim())
    .filter(Boolean);

  const context = await getRequestContext();
  const result = await bookBus(
    session.user.id,
    {
      from: text(formData, 'from'),
      to: text(formData, 'to'),
      date: text(formData, 'date'),
      busId: text(formData, 'busId'),
      seatIds,
      boardingPoint: text(formData, 'boarding'),
      dropPoint: text(formData, 'drop'),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/buses');
  revalidatePath('/pay/balance');

  return {
    ok: true,
    message: `Booked. ${result.seatIds.length} seat${result.seatIds.length === 1 ? '' : 's'} (${result.seatIds.join(', ')}) for ${formatPaise(result.amount)}. Reference ${result.reference}.`,
  };
}
