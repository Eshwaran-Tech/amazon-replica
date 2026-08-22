'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { BILL_CATEGORIES, CATEGORY_META, type BillCategory } from '@/data/billers';
import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { formatPaise } from '@/lib/utils/money';
import { renewPolicy } from '@/services/bills/insurance-renewal';
import { payBill, payDth, removeSavedBiller, saveBiller } from '@/services/bills/pay';
import type { PayOption } from '@/services/bills/quote';

/**
 * Paying a bill.
 *
 * Every form under Bill Payments funnels through one action, because every one
 * of them carries the same three things: a biller, an account and a **named
 * choice**. Never an amount. The figure is recomputed by `quoteBill` on the
 * server, so a tampered field has nowhere to land.
 *
 * The choice travels as an option name (`MINIMUM`, `FULL_YEAR`, `FORECLOSE`)
 * rather than as a number, which is what lets one action serve thirteen pages
 * without any of them being able to name its own price.
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
  if (!session) redirect(`/auth/login?next=${next}`);

  const limit = await checkRateLimit('wallet:pay:user', session.user.id);
  if (!limit.allowed) {
    return {
      ok: false,
      state: { ok: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
    };
  }

  return { ok: true, userId: session.user.id };
}

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === 'string' ? value : null;
}

function rupees(formData: FormData, name: string): number {
  const raw = text(formData, name);
  if (raw === null) return Number.NaN;
  return Number.parseInt(raw.replace(/[^\d]/g, ''), 10);
}

function categoryOf(value: string | null): BillCategory | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase() as BillCategory;
  return (BILL_CATEGORIES as readonly string[]).includes(upper) ? upper : null;
}

/** Rebuilds the option from the form, never trusting an amount alongside it. */
function optionFrom(formData: FormData): PayOption {
  const kind = (text(formData, 'option') ?? 'FULL').toUpperCase();

  switch (kind) {
    case 'MINIMUM':
      return { kind: 'MINIMUM' };
    case 'CUSTOM':
      return { kind: 'CUSTOM', rupees: rupees(formData, 'amount') };
    case 'INSTALMENT':
      return { kind: 'INSTALMENT', id: text(formData, 'instalment') ?? '' };
    case 'FULL_YEAR':
      return { kind: 'FULL_YEAR' };
    case 'FORECLOSE':
      return { kind: 'FORECLOSE' };
    case 'PREPAY':
      return { kind: 'PREPAY', rupees: rupees(formData, 'amount') };
    case 'DTH':
      return {
        kind: 'DTH',
        bouquets: formData.getAll('bouquet').filter((v): v is string => typeof v === 'string'),
        channels: formData.getAll('channel').filter((v): v is string => typeof v === 'string'),
        months: Number.parseInt(text(formData, 'months') ?? '1', 10) || 1,
      };
    case 'REFILL':
      return {
        kind: 'REFILL',
        cylinderId: text(formData, 'cylinder') ?? '',
        date: text(formData, 'date') ?? '',
        slotId: text(formData, 'slot') ?? '',
      };
    default:
      return { kind: 'FULL' };
  }
}

export async function payBillAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const category = categoryOf(text(formData, 'category'));
  const backTo = category ? CATEGORY_META[category].href : '/pay/bills';

  const gate = await guard(formData, 'bills', backTo);
  if (!gate.ok) return gate.state;

  if (!category) return { ok: false, message: 'Choose what kind of bill this is.' };

  const billerId = text(formData, 'biller');
  const account = text(formData, 'account');
  if (!billerId || !account) {
    return { ok: false, message: 'Choose a biller and enter the account number.' };
  }

  const saveAs = text(formData, 'saveAs');

  const context = await getRequestContext();
  const result = await payBill(
    gate.userId,
    {
      category,
      billerId,
      account,
      option: optionFrom(formData),
      ...(saveAs !== null && saveAs.trim() !== '' ? { saveAs: saveAs.trim() } : {}),
    },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath(backTo);
  revalidatePath('/pay/bills');
  revalidatePath('/pay/balance');
  revalidatePath('/pay');

  if (result.booking) {
    const on = result.booking.deliverOn.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return {
      ok: true,
      message: `${result.booking.cylinderLabel} booked for ${on}, ${result.booking.slotLabel.toLowerCase()}. ${formatPaise(result.amount)} paid. Reference ${result.reference}.`,
    };
  }

  return {
    ok: true,
    message: `${formatPaise(result.amount)} paid — ${result.summary}. Reference ${result.reference}.`,
  };
}

export async function rechargeDthAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'dth', '/pay/recharge/dth');
  if (!gate.ok) return gate.state;

  const billerId = text(formData, 'biller');
  const account = text(formData, 'account');
  if (!billerId || !account) {
    return { ok: false, message: 'Choose an operator and enter your subscriber id.' };
  }

  const option = optionFrom(formData);
  if (option.kind !== 'DTH') {
    return { ok: false, message: 'Choose a pack and how long to recharge for.' };
  }

  const context = await getRequestContext();
  const result = await payDth(
    gate.userId,
    { operatorId: billerId, subscriberId: account, option },
    { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
  );

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/recharge/dth');
  revalidatePath('/pay/balance');
  revalidatePath('/pay');

  return {
    ok: true,
    message: `${formatPaise(result.amount)} recharged — ${result.summary}. Reference ${result.reference}.`,
  };
}

export async function renewPolicyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'insurance-renewal', '/pay/bills/insurance');
  if (!gate.ok) return gate.state;

  const policyNumber = text(formData, 'policyNumber');
  if (!policyNumber) return { ok: false, message: 'Choose a policy to renew.' };

  const context = await getRequestContext();
  const result = await renewPolicy(gate.userId, policyNumber, {
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/bills/insurance');
  revalidatePath('/insurance');
  revalidatePath('/pay/balance');

  return {
    ok: true,
    message: `Renewed. ${formatPaise(result.premium)} paid from your Amazon Pay balance, and the new policy is ${result.policyNumber}.`,
  };
}

export async function saveBillerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'bills-save', '/pay/bills');
  if (!gate.ok) return gate.state;

  const category = categoryOf(text(formData, 'category'));
  const billerId = text(formData, 'biller');
  const billerName = text(formData, 'billerName');
  const account = text(formData, 'account');
  if (!category || !billerId || !billerName || !account) {
    return { ok: false, message: 'Choose a biller and enter the account number.' };
  }

  const result = await saveBiller(gate.userId, {
    category,
    billerId,
    billerName,
    account,
    nickname: text(formData, 'nickname') ?? billerName,
  });

  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/pay/bills');
  revalidatePath(CATEGORY_META[category].href);

  return { ok: true, message: 'Saved. It will be one tap next time.' };
}

export async function removeBillerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const gate = await guard(formData, 'bills-remove', '/pay/bills');
  if (!gate.ok) return gate.state;

  const id = text(formData, 'id');
  if (!id) return { ok: false, message: 'Nothing to remove.' };

  const removed = await removeSavedBiller(gate.userId, id);
  if (!removed) return { ok: false, message: 'That biller is not on your list.' };

  revalidatePath('/pay/bills');
  return { ok: true, message: 'Removed.' };
}
