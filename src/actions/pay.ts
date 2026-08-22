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
import { isPrimeMember } from '@/services/prime';
import { collectOffer } from '@/services/rewards';
import { makeDefault, removeCard, saveCard } from '@/services/saved-cards';
import { raiseTicket, resolveTicket } from '@/services/support';

/**
 * Rewards, saved cards and support tickets.
 *
 * All three change something on the account, so all three verify CSRF, require
 * a session and are rate limited. None of them takes an amount from the
 * browser: collecting a reward reads the offer from the catalogue, and a saved
 * card carries no money at all.
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

export async function collectRewardAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'reward-collect'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/rewards');

  const limit = await checkRateLimit('account:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const context = await getRequestContext();
  const prime = await isPrimeMember(session.user.id);

  const result = await collectOffer(session.user.id, text(formData, 'offer'), prime, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/rewards');

  return {
    ok: true,
    message: `Collected. It applies to your next qualifying order and lapses on ${result.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
  };
}

export async function saveCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'card-save'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/cards');

  const limit = await checkRateLimit('account:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const context = await getRequestContext();
  const result = await saveCard(
    session.user.id,
    {
      cardNumber: text(formData, 'cardNumber'),
      holderName: text(formData, 'holderName'),
      expiryMonth: text(formData, 'expiryMonth'),
      expiryYear: text(formData, 'expiryYear'),
      makeDefault: formData.get('makeDefault') === 'on',
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/cards');
  return {
    ok: true,
    message: `Saved the card ending ${result.last4}. Only a provider token and those four digits are kept — the number itself was never stored.`,
  };
}

export async function removeCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'card-remove'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/cards');

  const context = await getRequestContext();
  const result = await removeCard(session.user.id, text(formData, 'card'), {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/cards');
  return { ok: true, message: 'Card removed.' };
}

export async function makeDefaultCardAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'card-default'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/cards');

  const result = await makeDefault(session.user.id, text(formData, 'card'));
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/cards');
  return { ok: true, message: 'That card is now the default.' };
}

export async function raiseTicketAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'ticket-raise'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/tickets');

  const limit = await checkRateLimit('account:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many tickets. Please wait a few minutes and try again.' };
  }

  const context = await getRequestContext();
  const result = await raiseTicket(
    session.user.id,
    {
      topic: text(formData, 'topic'),
      subject: text(formData, 'subject'),
      body: text(formData, 'body'),
      relatedReference: text(formData, 'related'),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/tickets');
  return {
    ok: true,
    message: `Ticket ${result.reference} raised. It is stored against your account — nobody is on the other end of it, so close it yourself once it is sorted.`,
  };
}

export async function resolveTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'ticket-resolve'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/tickets');

  const result = await resolveTicket(
    session.user.id,
    text(formData, 'ticket'),
    text(formData, 'note'),
  );
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/tickets');
  return { ok: true, message: 'Marked as resolved.' };
}
