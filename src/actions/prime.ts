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
import { PRIME_PLANS, type PrimePlan } from '@/models/prime';
import { cancelPrime, joinPrime } from '@/services/prime';
import {
  CHANNEL_WINDOW_DAYS,
  RENTAL_WINDOW_HOURS,
  rentTitle,
  subscribeChannel,
} from '@/services/video';

/**
 * Prime Server Actions.
 *
 * The plan is the only thing the browser states, and it is checked against the
 * enum before anything is charged. The price is never accepted from the form --
 * it comes from `PRIME_PLANS_DETAILS` on the server, so a tampered field has
 * nowhere to land.
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

function isPlan(value: unknown): value is PrimePlan {
  return typeof value === 'string' && (PRIME_PLANS as readonly string[]).includes(value);
}

export async function joinPrimeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'prime-join'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/prime');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const plan = formData.get('plan');
  if (!isPlan(plan)) return { ok: false, message: 'Choose one of the plans listed.' };

  const context = await getRequestContext();
  const result = await joinPrime(session.user.id, plan, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  // The benefit changes cart and checkout totals, so those must not serve a
  // cached non-member figure.
  revalidatePath('/prime');
  revalidatePath('/cart');
  revalidatePath('/pay');
  revalidatePath('/pay/balance');

  return { ok: true, message: 'You are a Prime member. Delivery is now free on every order.' };
}

export async function cancelPrimeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'prime-cancel'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/prime');

  const context = await getRequestContext();
  const result = await cancelPrime(session.user.id, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/prime');
  return {
    ok: true,
    message: 'Renewal is off. Your membership runs to the end of the paid term.',
  };
}

export async function rentTitleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'video-rent'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/prime');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const titleId = formData.get('titleId');
  if (typeof titleId !== 'string') return { ok: false, message: 'Choose a title to rent.' };

  const context = await getRequestContext();
  const result = await rentTitle(session.user.id, titleId, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/prime');
  revalidatePath('/pay/balance');
  return {
    ok: true,
    message: `Rented. Watch any time in the next ${RENTAL_WINDOW_HOURS} hours.`,
  };
}

export async function subscribeChannelAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'video-channel'))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/prime');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const channelId = formData.get('channelId');
  if (typeof channelId !== 'string') return { ok: false, message: 'Choose a channel.' };

  const context = await getRequestContext();
  const result = await subscribeChannel(session.user.id, channelId, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/prime');
  revalidatePath('/pay/balance');
  return { ok: true, message: `Subscribed for ${CHANNEL_WINDOW_DAYS} days.` };
}
