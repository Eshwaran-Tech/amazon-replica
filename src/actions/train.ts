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
import { bookTrain, MAX_PASSENGERS } from '@/services/train-booking';

/**
 * Train ticket booking.
 *
 * The form carries a route, a date, a train number, a class code and a
 * passenger list. It carries no amount -- the fare is looked up on the server
 * and multiplied by the passenger count there, the same rule checkout, Prime,
 * the rentals, the recharge and the bus tickets follow.
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
      detail: { surface: 'train-booking', reason: result.reason },
    });
  }
  return result.ok;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function bookTrainAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/trains');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  // Passenger rows arrive as parallel fields. Only as many as the ticket can
  // carry are read, so a hand-built form cannot smuggle a seventh in.
  const passengers = Array.from({ length: MAX_PASSENGERS }, (_, index) => ({
    name: text(formData, `name-${index}`),
    age: text(formData, `age-${index}`),
    gender: text(formData, `gender-${index}`),
  })).filter((passenger) => passenger.name.length > 0);

  const context = await getRequestContext();
  const result = await bookTrain(
    session.user.id,
    {
      from: text(formData, 'from'),
      to: text(formData, 'to'),
      date: text(formData, 'date'),
      trainNumber: text(formData, 'train'),
      classCode: text(formData, 'class'),
      passengers,
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/trains');
  revalidatePath('/pay/balance');

  return {
    ok: true,
    message: `Booked. PNR ${result.pnr} for ${result.passengers} passenger${result.passengers === 1 ? '' : 's'}, ${formatPaise(result.amount)} paid from your balance.`,
  };
}
