'use server';

import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/guards';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import {
  addressSchema,
  deleteAddressSchema,
  setDefaultAddressSchema,
  updateProfileSchema,
} from '@/lib/validations/user';
import { fieldErrors } from '@/lib/validations/common';
import {
  addAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from '@/services/account';

/**
 * Account Server Actions.
 *
 * Note the shape of every parse below: strict Zod objects with no `role`, no
 * `email`, no `emailVerified`, no `_id`. A profile form that submits any of
 * them gets a validation error, not a silently ignored field. The user id
 * always comes from the session, never from the form.
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
      detail: { surface: 'account-action', reason: result.reason },
    });
  }
  return result.ok;
}

const CSRF_FAILURE: FormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

interface ActionContext {
  userId: ObjectId;
}

/** Shared session + rate-limit preamble for every account mutation. */
async function requireAccountContext(): Promise<ActionContext | FormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: 'Please sign in again.' };

  const limit = await checkRateLimit('account:user', session.user.id);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many changes in a short time. Please wait a moment.' };
  }

  return { userId: new ObjectId(session.user.id) };
}

function isFormState(value: ActionContext | FormState): value is FormState {
  return 'ok' in value;
}

/** Pulls the address block out of the flat form encoding. */
function readAddressFields(formData: FormData): Record<string, unknown> {
  return {
    fullName: formData.get('fullName'),
    phone: formData.get('phone'),
    line1: formData.get('line1'),
    line2: formData.get('line2') || undefined,
    city: formData.get('city'),
    state: formData.get('state'),
    postalCode: formData.get('postalCode'),
    type: formData.get('type') ?? 'HOME',
    isDefault: formData.get('isDefault') === 'on',
  };
}

// ----------------------------------------------------------------- profile

export async function updateProfileAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const context = await requireAccountContext();
  if (isFormState(context)) return context;

  const parsed = updateProfileSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const result = await updateProfile(context.userId, parsed.data);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/', 'layout'); // the header greets by first name
  return { ok: true, message: 'Your name has been updated.' };
}

// --------------------------------------------------------------- addresses

export async function addAddressAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const context = await requireAccountContext();
  if (isFormState(context)) return context;

  const parsed = addressSchema.safeParse(readAddressFields(formData));
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await addAddress(context.userId, parsed.data);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/account/addresses');
  redirect('/account/addresses?saved=1');
}

export async function updateAddressAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const context = await requireAccountContext();
  if (isFormState(context)) return context;

  const addressId = formData.get('addressId');
  const parsedId = setDefaultAddressSchema.safeParse({ addressId });
  if (!parsedId.success) return { ok: false, message: 'We could not find that address.' };

  const parsed = addressSchema.safeParse(readAddressFields(formData));
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error), message: 'Please check the highlighted fields.' };
  }

  const result = await updateAddress(context.userId, parsedId.data.addressId, parsed.data);
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath('/account/addresses');
  redirect('/account/addresses?saved=1');
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) redirect('/account/addresses');

  const context = await requireAccountContext();
  if (isFormState(context)) redirect('/account/addresses');

  const parsed = deleteAddressSchema.safeParse({ addressId: formData.get('addressId') });
  if (parsed.success) {
    await deleteAddress(context.userId, parsed.data.addressId);
  }

  revalidatePath('/account/addresses');
  redirect('/account/addresses');
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) redirect('/account/addresses');

  const context = await requireAccountContext();
  if (isFormState(context)) redirect('/account/addresses');

  const parsed = setDefaultAddressSchema.safeParse({ addressId: formData.get('addressId') });
  if (parsed.success) {
    await setDefaultAddress(context.userId, parsed.data.addressId);
  }

  revalidatePath('/account/addresses');
  redirect('/account/addresses');
}
