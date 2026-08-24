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
import { buyHealthPolicy, buyMotorPolicy } from '@/services/insurance-purchase';
import type { PlanType } from '@/data/insurers';

/**
 * Paying a premium.
 *
 * The form carries a vehicle, an insurer and a set of add-ons -- **never an
 * amount**. The premium is recomputed from the rate book on the server, so a
 * tampered price field has nowhere to land. Same rule as checkout, Prime and
 * every recharge in this codebase.
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

function intField(formData: FormData, name: string, fallback: number): number {
  const raw = formData.get(name);
  if (typeof raw !== 'string') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function buyMotorPolicyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'insurance-motor'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/insurance');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const modelId = formData.get('modelId');
  const insurerId = formData.get('insurerId');
  const registration = formData.get('registration');
  const plan = formData.get('plan');

  if (
    typeof modelId !== 'string' ||
    typeof insurerId !== 'string' ||
    typeof registration !== 'string'
  ) {
    return { ok: false, message: 'Choose a vehicle and an insurer.' };
  }

  const idvRaw = formData.get('idv');
  const idv = typeof idvRaw === 'string' && idvRaw.trim() ? Number.parseInt(idvRaw, 10) : null;

  const context = await getRequestContext();
  const result = await buyMotorPolicy(
    session.user.id,
    {
      modelId,
      insurerId,
      registration: registration.trim().toUpperCase(),
      ageMonths: intField(formData, 'ageMonths', 12),
      plan: (typeof plan === 'string' ? plan : 'COMPREHENSIVE') as PlanType,
      idv: idv !== null && Number.isFinite(idv) ? idv : null,
      claimFreeYears: intField(formData, 'claimFreeYears', 0),
      addOnIds: formData.getAll('addOnIds').filter((v): v is string => typeof v === 'string'),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/insurance');
  revalidatePath('/pay');
  revalidatePath('/pay/balance');

  return {
    ok: true,
    message:
      'Cover in place. ' +
      formatPaise(result.premium) +
      ' paid from your Eshwaran Pay balance. Policy ' +
      result.policyNumber +
      '.',
  };
}

export async function buyHealthPolicyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData, 'insurance-health'))) {
    return { ok: false, message: 'Your session expired. Please refresh and try again.' };
  }

  const session = await getSession();
  if (!session) redirect('/auth/login?next=/insurance/health');

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' };
  }

  const insurerId = formData.get('insurerId');
  if (typeof insurerId !== 'string') {
    return { ok: false, message: 'Choose an insurer.' };
  }

  // Ages arrive as two parallel lists so the form can add and remove members
  // without the browser having to name a premium.
  const adultAges = formData
    .getAll('adultAge')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => Number.parseInt(value, 10))
    .filter((age) => Number.isFinite(age));
  const childAges = formData
    .getAll('childAge')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => Number.parseInt(value, 10))
    .filter((age) => Number.isFinite(age));

  const members = [
    ...adultAges.map((age) => ({ kind: 'ADULT' as const, age })),
    ...childAges.map((age) => ({ kind: 'CHILD' as const, age })),
  ];

  const termYears = intField(formData, 'termYears', 1) === 2 ? 2 : 1;

  const context = await getRequestContext();
  const result = await buyHealthPolicy(
    session.user.id,
    {
      insurerId,
      sumInsuredLakhs: intField(formData, 'sumInsuredLakhs', 10),
      members,
      termYears,
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/insurance/health');
  revalidatePath('/pay');
  revalidatePath('/pay/balance');

  return {
    ok: true,
    message:
      'Cover in place. ' +
      formatPaise(result.premium) +
      ' paid from your Eshwaran Pay balance. Policy ' +
      result.policyNumber +
      '.',
  };
}
