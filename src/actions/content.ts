'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { RELOAD_AMOUNTS, RELOAD_THRESHOLDS } from '@/data/content-stores';
import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { formatPaise } from '@/lib/utils/money';
import { CONTENT_STORES, type ContentStore } from '@/models/content-credit';
import { setAutoReload, topUpCredit } from '@/services/content-credit';

/**
 * Buying store credit, and setting it to top itself up.
 *
 * The bonus is never carried by the form -- it is worked out on the server from
 * the amount, so a tampered field has nowhere to land. And the auto-reload rule
 * only accepts a threshold and an amount from the lists the page offers, because
 * this is the one setting in the store that can charge somebody without their
 * pressing anything, and an arbitrary rule is not a setting anybody asked for.
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
): Promise<{ ok: true; userId: string } | { ok: false; state: FormState }> {
  if (!(await verifyActionCsrf(formData, surface))) {
    return {
      ok: false,
      state: { ok: false, message: 'Your session expired. Please refresh and try again.' },
    };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/pay/recharge/credit');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      state: { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
    };
  }

  return { ok: true, userId: session.user.id };
}

function storeOf(formData: FormData): ContentStore | null {
  const raw = formData.get('store');
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase() as ContentStore;
  return (CONTENT_STORES as readonly string[]).includes(upper) ? upper : null;
}

export async function topUpCreditAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'content-credit');
  if (!gate.ok) return gate.state;

  const store = storeOf(formData);
  if (!store) return { ok: false, message: 'Choose a store.' };

  const raw = formData.get('amount');
  const rupees =
    typeof raw === 'string' ? Number.parseInt(raw.replace(/[^\d]/g, ''), 10) : Number.NaN;

  const context = await getRequestContext();
  const result = await topUpCredit(
    gate.userId,
    { store, rupees },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/recharge/credit');
  revalidatePath('/pay/balance');
  revalidatePath('/pay');
  revalidatePath('/prime');

  const bonus =
    result.bonus > 0 ? ` That included ${formatPaise(result.bonus)} of bonus credit.` : '';

  return {
    ok: true,
    message: `${formatPaise(result.credited)} added. Your balance is ${formatPaise(result.balance)}.${bonus}`,
  };
}

export async function setAutoReloadAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const gate = await guard(formData, 'content-autoreload');
  if (!gate.ok) return gate.state;

  const store = storeOf(formData);
  if (!store) return { ok: false, message: 'Choose a store.' };

  const enabled = formData.get('enabled') === 'on';

  // Only the offered values are accepted. An arbitrary rule on the one setting
  // that can charge somebody unprompted is not a setting anybody asked for.
  const threshold = Number.parseInt(String(formData.get('threshold') ?? ''), 10);
  const amount = Number.parseInt(String(formData.get('reloadAmount') ?? ''), 10);

  if (
    !(RELOAD_THRESHOLDS as readonly number[]).includes(threshold) ||
    !(RELOAD_AMOUNTS as readonly number[]).includes(amount)
  ) {
    return { ok: false, message: 'Choose a level and an amount from the lists.' };
  }
  if (amount <= threshold) {
    return {
      ok: false,
      message:
        'The reload has to be larger than the level that triggers it, or it would fire again immediately.',
    };
  }

  await setAutoReload(gate.userId, store, {
    enabled,
    thresholdRupees: threshold,
    amountRupees: amount,
  });

  revalidatePath('/pay/recharge/credit');

  return {
    ok: true,
    message: enabled
      ? `On. When the balance falls below ₹${threshold}, ₹${amount} will be added from your Eshwaran Pay balance.`
      : 'Automatic reload is off. Nothing will be charged without you pressing it.',
  };
}
