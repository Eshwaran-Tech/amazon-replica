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
import { issueTag, logCrossing, rechargeTag } from '@/services/fastag';
import { addCard, logJourney, rechargeCard } from '@/services/metro';

/**
 * FASTags and metro cards.
 *
 * Every one of these moves money out of the wallet, so every one of them
 * carries the same three guards the rest of the money surfaces do: a CSRF
 * check, a per-user rate limit, and a price the browser never gets to name.
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

async function guard(
  formData: FormData,
  surface: string,
  next: string,
): Promise<{ ok: true; userId: string } | { ok: false; state: FormState }> {
  if (!(await verifyActionCsrf(formData, surface))) {
    return {
      ok: false,
      state: { ok: false, message: 'Your session expired. Please refresh and try again.' },
    };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=' + next);

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      state: {
        ok: false,
        message: 'Too many attempts. Please wait a few minutes and try again.',
      },
    };
  }

  return { ok: true, userId: session.user.id };
}

function rupees(formData: FormData, name: string): number {
  const raw = formData.get(name);
  if (typeof raw !== 'string') return Number.NaN;
  return Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
}

function refresh(): void {
  revalidatePath('/pay/fastag');
  revalidatePath('/pay/metro');
  revalidatePath('/pay/balance');
  revalidatePath('/pay');
}

export async function issueTagAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'fastag-issue', '/pay/fastag');
  if (!gate.ok) return gate.state;

  const registration = formData.get('registration');
  const issuerId = formData.get('issuerId');
  const tollClass = formData.get('tollClass');
  const modelId = formData.get('modelId');

  if (typeof registration !== 'string' || typeof issuerId !== 'string') {
    return { ok: false, message: 'Enter the vehicle registration and choose an issuer.' };
  }

  const context = await getRequestContext();
  const result = await issueTag(
    gate.userId,
    {
      registration,
      issuerId,
      tollClass: typeof tollClass === 'string' ? tollClass : 'CAR',
      ...(typeof modelId === 'string' && modelId ? { modelId } : {}),
      firstTopUpRupees: rupees(formData, 'amount'),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  refresh();
  return {
    ok: true,
    message:
      'Tag active on ' +
      result.number +
      '. ' +
      formatPaise(result.charged) +
      ' paid, ' +
      formatPaise(result.balance) +
      ' on the tag.',
  };
}

export async function rechargeTagAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'fastag-recharge', '/pay/fastag');
  if (!gate.ok) return gate.state;

  const registration = formData.get('registration');
  if (typeof registration !== 'string') {
    return { ok: false, message: 'Enter the vehicle registration.' };
  }

  const context = await getRequestContext();
  const result = await rechargeTag(
    gate.userId,
    { registration, amountRupees: rupees(formData, 'amount') },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  refresh();
  return {
    ok: true,
    message:
      formatPaise(result.amount) +
      ' added to ' +
      result.registration +
      '. Balance ' +
      formatPaise(result.balance) +
      '. Reference ' +
      result.reference +
      '.',
  };
}

export async function logCrossingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'fastag-crossing', '/pay/fastag');
  if (!gate.ok) return gate.state;

  const registration = formData.get('registration');
  const corridorId = formData.get('corridorId');
  if (typeof registration !== 'string' || typeof corridorId !== 'string') {
    return { ok: false, message: 'Choose a tag and a route.' };
  }

  const result = await logCrossing(gate.userId, {
    registration,
    corridorId,
    ...(formData.get('returnTrip') === 'on' ? { returnTrip: true } : {}),
  });

  if (!result.ok) return { ok: false, message: result.message };

  refresh();
  return {
    ok: true,
    message:
      formatPaise(result.charged) +
      ' recorded for ' +
      result.corridor +
      '. Balance ' +
      formatPaise(result.balance) +
      '.',
  };
}

export async function addCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'metro-add', '/pay/metro');
  if (!gate.ok) return gate.state;

  const networkId = formData.get('networkId');
  if (typeof networkId !== 'string') {
    return { ok: false, message: 'Choose a city.' };
  }

  const context = await getRequestContext();
  const result = await addCard(
    gate.userId,
    { networkId, firstTopUpRupees: rupees(formData, 'amount') },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  refresh();
  return {
    ok: true,
    message: 'Card ' + result.pretty + ' issued with ' + formatPaise(result.balance) + ' on it.',
  };
}

export async function rechargeCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'metro-recharge', '/pay/metro');
  if (!gate.ok) return gate.state;

  const number = formData.get('number');
  if (typeof number !== 'string') {
    return { ok: false, message: 'Enter your card number.' };
  }

  const context = await getRequestContext();
  const result = await rechargeCard(
    gate.userId,
    { number, amountRupees: rupees(formData, 'amount') },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  refresh();
  return {
    ok: true,
    message:
      formatPaise(result.amount) +
      ' added to ' +
      result.pretty +
      '. Balance ' +
      formatPaise(result.balance) +
      '.',
  };
}

export async function logJourneyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'metro-journey', '/pay/metro');
  if (!gate.ok) return gate.state;

  const number = formData.get('number');
  const fromId = formData.get('fromId');
  const toId = formData.get('toId');
  if (typeof number !== 'string' || typeof fromId !== 'string' || typeof toId !== 'string') {
    return { ok: false, message: 'Choose a card and two stations.' };
  }

  const result = await logJourney(gate.userId, { number, fromId, toId });
  if (!result.ok) return { ok: false, message: result.message };

  refresh();
  return {
    ok: true,
    message:
      formatPaise(result.charged) +
      ' recorded for ' +
      result.journey +
      '. Balance ' +
      formatPaise(result.balance) +
      '.',
  };
}
