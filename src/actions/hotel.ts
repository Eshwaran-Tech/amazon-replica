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
import { bookHotel } from '@/services/hotel-booking';
import { CHILD_MAX_AGE, MAX_CHILDREN } from '@/services/hotels';

/**
 * Hotel booking.
 *
 * The form carries a destination, dates, a party, a property, a room and a
 * guest name. It carries no amount -- the tariff is quoted on the server from
 * the same function the results page called, the rule checkout, Prime, the
 * rentals, the recharge, the bus and the train tickets all follow.
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
      detail: { surface: 'hotel-booking', reason: result.reason },
    });
  }
  return result.ok;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** "5,8" -> [5, 8]. Anything that is not a child's age is dropped. */
function ages(raw: string): number[] {
  return raw
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((age) => Number.isInteger(age) && age >= 0 && age <= CHILD_MAX_AGE)
    .slice(0, MAX_CHILDREN);
}

export async function bookHotelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/hotels');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const context = await getRequestContext();
  const result = await bookHotel(
    session.user.id,
    {
      city: text(formData, 'city'),
      checkIn: text(formData, 'checkIn'),
      checkOut: text(formData, 'checkOut'),
      rooms: Number(text(formData, 'rooms')) || 1,
      adults: Number(text(formData, 'adults')) || 1,
      childAges: ages(text(formData, 'kids')),
      hotelId: text(formData, 'hotel'),
      roomId: text(formData, 'room'),
      guestName: text(formData, 'guest'),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/hotels');
  revalidatePath('/pay/balance');

  return {
    ok: true,
    message: `Booked. ${result.rooms} room${result.rooms === 1 ? '' : 's'} for ${result.nights} night${result.nights === 1 ? '' : 's'}, ${formatPaise(result.amount)} paid from your balance. Reference ${result.reference}.`,
  };
}
