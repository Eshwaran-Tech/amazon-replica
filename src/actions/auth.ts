'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import {
  clearSessionCookie,
  readSessionCookie,
  setCsrfCookie,
  setSessionCookie,
  readCsrfCookie,
} from '@/lib/auth/cookies';
import { clearAuthFlow, readAuthFlow, setAuthFlow, type AuthFlow } from '@/lib/auth/flow';
import { getRequestContext, getSession } from '@/lib/auth/guards';
import { parseIdentifier } from '@/lib/auth/identifier';
import { revokeSession } from '@/lib/auth/session';
import { clearGuestCartId, readGuestCartId } from '@/lib/cart/guest';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, generateCsrfToken, verifyCsrf } from '@/lib/security/csrf';
import { mergeGuestCartIntoUser } from '@/services/cart';
import { ObjectId } from 'mongodb';
import { logSecurityEvent } from '@/lib/security/logger';
import { safeRedirectPath } from '@/lib/security/redirect';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  identifierInputSchema,
  otpStepSchema,
  passwordStepSchema,
  resetPasswordSchema,
  signUpEmailSchema,
  signUpPhoneSchema,
} from '@/lib/validations/auth';
import { fieldErrors, redirectPathSchema } from '@/lib/validations/common';
import {
  changePassword,
  completeSignUp,
  identifyAccount,
  loginUser,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  sendSignInOtp,
  signInWithOtp,
  startSignUp,
} from '@/services/auth';

/**
 * Authentication Server Actions.
 *
 * A Server Action is a public POST endpoint with a generated URL, not a private
 * function call. Next.js checks the Origin header for us, but that is one
 * control, so each action here independently verifies the double-submit CSRF
 * token, validates with Zod, and delegates to a service that enforces rate
 * limits and business rules. Nothing is assumed safe because it is "internal".
 */

/**
 * Note: this module may export *only* async functions. Next.js turns every
 * export of a `'use server'` file into a callable endpoint, so a constant or a
 * plain object is a runtime error. The shared `FormState` type and its empty
 * value therefore live in `@/lib/forms/state`.
 */
type AuthFormState = FormState;

/**
 * Verifies the CSRF token carried in a hidden form field.
 *
 * A form field rather than a header because Server Actions are submitted by the
 * browser's form machinery, which cannot set custom headers -- that is exactly
 * the request shape a classic CSRF attack uses, so this is the case that most
 * needs covering.
 */
async function verifyActionCsrf(formData: FormData): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);

  const result = verifyCsrf(
    cookieToken,
    typeof submitted === 'string' ? submitted : null,
    subject,
  );

  if (!result.ok) {
    logSecurityEvent({
      type: 'csrf.rejected',
      severity: 'warn',
      detail: { surface: 'server-action', reason: result.reason },
    });
    return false;
  }

  return true;
}

const CSRF_FAILURE: AuthFormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

/** Rotates the CSRF token to match a newly issued session. */
async function issueCsrfForSession(sessionToken: string | null, expiresAt: Date): Promise<void> {
  await setCsrfCookie(generateCsrfToken(csrfSubject(sessionToken)), expiresAt);
}

/**
 * Folds an anonymous cart into the account the visitor just signed in to,
 * then drops the guest cookie. Best-effort: a merge failure must not block a
 * successful sign-in, so errors are swallowed after the attempt -- the guest
 * cart simply survives for next time.
 */
async function absorbGuestCart(userId: string): Promise<void> {
  try {
    const guestId = await readGuestCartId();
    if (!guestId) return;
    await mergeGuestCartIntoUser(guestId, new ObjectId(userId));
    await clearGuestCartId();
  } catch {
    // Sign-in proceeds; the cart merge retries on a future login.
  }
}

// ================================================ sign in or create account
//
// The flow, matching the storefront's sign-in experience:
//
//   /auth/login                 "Sign in or create account" -- one identifier
//        |  identifyAction
//        +-- exists, has password ---> /auth/login/password  (or "Get an OTP")
//        +-- exists, no password ----> /auth/login/otp        (code sent)
//        +-- new ------------------> /auth/register           "It looks like you are new"
//                                      -> /auth/register/details  (name, [password])
//                                      -> /auth/register/verify   (code) -> signed in
//
// The identifier lives in a signed HttpOnly cookie between steps -- never in
// the URL. Every step re-reads it; a missing or stale cookie sends the visitor
// back to the start.

/** Establishes a session and returns where to send the user next. */
async function establishSession(
  token: string,
  expiresAt: Date,
  userId: string,
  fallback: string,
  next: string | undefined,
): Promise<string> {
  await setSessionCookie(token, expiresAt);
  await issueCsrfForSession(token, expiresAt);
  await absorbGuestCart(userId);
  await clearAuthFlow();
  return safeRedirectPath(next, fallback);
}

const FLOW_EXPIRED: AuthFormState = {
  ok: false,
  message: 'Your sign-in session timed out. Please start again.',
};

// ------------------------------------------------------------- step 1: who

export async function identifyAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const raw = identifierInputSchema.safeParse(formData.get('identifier'));
  const identifier = raw.success ? parseIdentifier(raw.data) : null;
  if (!identifier) {
    return {
      ok: false,
      fields: { identifier: 'Enter a valid mobile number or email address' },
    };
  }

  const nextRaw = formData.get('next');
  const next = redirectPathSchema.safeParse(nextRaw);

  const context = await getRequestContext();
  const result = await identifyAccount(identifier, context);
  if (!result.ok) return { ok: false, message: result.message };

  const flow: Omit<AuthFlow, 'iat'> = {
    identifier,
    exists: result.exists,
    hasPassword: result.hasPassword,
    ...(next.success ? { next: next.data } : {}),
  };

  if (!result.exists) {
    await setAuthFlow(flow);
    redirect('/auth/register');
  }

  if (result.hasPassword) {
    await setAuthFlow(flow);
    redirect('/auth/login/password');
  }

  // Passwordless account: the only way in is a code, so send it now.
  const sent = await sendSignInOtp(identifier, context);
  if (!sent.ok) return { ok: false, message: sent.message };
  await setAuthFlow({ ...flow, otpSent: true });
  redirect('/auth/login/otp');
}

// -------------------------------------------------------- step 2: password

export async function passwordSignInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const flow = await readAuthFlow();
  if (!flow || !flow.exists) return FLOW_EXPIRED;

  const parsed = passwordStepSchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { ok: false, message: 'Enter your password.' };

  const context = await getRequestContext();
  const result = await loginUser(
    { identifier: flow.identifier.value, password: parsed.data.password },
    context,
  );
  if (!result.ok) return { ok: false, message: result.message };

  const destination = await establishSession(
    result.token,
    result.expiresAt,
    result.userId,
    result.role === 'ADMIN' ? '/admin' : '/',
    flow.next,
  );
  redirect(destination);
}

/** "Get an OTP" from the password step, or "Resend" from the OTP step. */
export async function sendSignInOtpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const flow = await readAuthFlow();
  if (!flow || !flow.exists) return FLOW_EXPIRED;

  const context = await getRequestContext();
  const sent = await sendSignInOtp(flow.identifier, context);
  if (!sent.ok) return { ok: false, message: sent.message };

  await setAuthFlow({ ...flow, otpSent: true });
  if (formData.get('stay') === '1') {
    return { ok: true, message: 'A new code is on its way.' };
  }
  redirect('/auth/login/otp');
}

// ------------------------------------------------------------- step 2: OTP

export async function otpSignInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const flow = await readAuthFlow();
  if (!flow || !flow.exists) return FLOW_EXPIRED;

  const parsed = otpStepSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const context = await getRequestContext();
  const result = await signInWithOtp(flow.identifier, parsed.data.code, context);
  if (!result.ok) return { ok: false, message: result.message };

  const destination = await establishSession(
    result.token,
    result.expiresAt,
    result.userId,
    result.role === 'ADMIN' ? '/admin' : '/',
    flow.next,
  );
  redirect(destination);
}

// ---------------------------------------------------- sign-up: details

export async function startSignUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const via = formData.get('via') === 'email' ? 'email' : 'phone';
  const parsed =
    via === 'email'
      ? signUpEmailSchema.safeParse({
          via,
          identifier: formData.get('identifier'),
          name: formData.get('name'),
          password: formData.get('password'),
          confirmPassword: formData.get('confirmPassword'),
        })
      : signUpPhoneSchema.safeParse({
          via,
          identifier: formData.get('identifier'),
          name: formData.get('name'),
        });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const identifier = parseIdentifier(parsed.data.identifier);
  if (!identifier || identifier.kind !== via) {
    return {
      ok: false,
      fields: {
        identifier:
          via === 'phone' ? 'Enter a valid 10-digit mobile number' : 'Enter a valid email address',
      },
    };
  }

  const context = await getRequestContext();
  const result = await startSignUp(
    {
      identifier,
      name: parsed.data.name,
      password: parsed.data.via === 'email' ? parsed.data.password : null,
    },
    context,
  );
  if (!result.ok) return { ok: false, message: result.message };

  const previous = await readAuthFlow();
  await setAuthFlow({
    identifier,
    exists: false,
    hasPassword: false,
    name: parsed.data.name,
    otpSent: true,
    ...(previous?.next ? { next: previous.next } : {}),
  });
  redirect('/auth/register/verify');
}

/** "Resend OTP" on the sign-up verification step. */
export async function resendSignUpOtpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const flow = await readAuthFlow();
  if (!flow || flow.exists || !flow.name) return FLOW_EXPIRED;

  // Re-issuing needs the pending details again; a password chosen on the
  // email path was parked on the previous code, which is superseded now.
  // Rather than keep it anywhere else, the email path asks again.
  if (flow.identifier.kind === 'email') {
    return {
      ok: false,
      message: 'To get a new code, please go back and confirm your details.',
    };
  }

  const context = await getRequestContext();
  const result = await startSignUp({ identifier: flow.identifier, name: flow.name }, context);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: 'A new code is on its way.' };
}

// ---------------------------------------------------- sign-up: verify

export async function completeSignUpAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const flow = await readAuthFlow();
  if (!flow || flow.exists) return FLOW_EXPIRED;

  const parsed = otpStepSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const context = await getRequestContext();
  const result = await completeSignUp(flow.identifier, parsed.data.code, context);
  if (!result.ok) return { ok: false, message: result.message };

  const destination = await establishSession(
    result.token,
    result.expiresAt,
    result.userId,
    '/',
    flow.next,
  );
  redirect(destination);
}

// ------------------------------------------------------------------ logout

export async function logoutAction(formData: FormData): Promise<void> {
  // Logout is state-changing, so it is CSRF-protected too. Forced logout is a
  // real nuisance attack, and on a shared device it can be worse.
  if (!(await verifyActionCsrf(formData))) {
    redirect('/');
  }

  const token = await readSessionCookie();
  if (token) {
    await revokeSession(token);
  }

  await clearSessionCookie();
  // Re-bind the CSRF token to the anonymous subject, so the next form on the
  // signed-out page carries a token that verifies.
  await setCsrfCookie(
    generateCsrfToken(csrfSubject(null)),
    new Date(Date.now() + 12 * 60 * 60 * 1000),
  );

  redirect('/');
}

// --------------------------------------------------------- forgot password

export async function forgotPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });

  // Even a malformed address gets the generic confirmation: a validation error
  // for "not an email" is fine, but anything beyond that would differentiate.
  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const context = await getRequestContext();
  await requestPasswordReset(parsed.data.email, context);

  // Always the same response, whether or not the account exists.
  return {
    ok: true,
    message: 'If an account exists for that address, we have sent a password reset link.',
  };
}

// ---------------------------------------------------------- reset password

export async function resetPasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const context = await getRequestContext();
  const result = await resetPassword(parsed.data, context);

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  // Every session was revoked, including any the attacker held. The user signs
  // in again with the new password.
  redirect('/auth/login?reset=1');
}

// --------------------------------------------------------- change password

export async function changePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) {
    return { ok: false, message: 'Please sign in again.' };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { ok: false, fields: fieldErrors(parsed.error) };
  }

  const context = await getRequestContext();
  const result = await changePassword(
    session.user.id,
    { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
    context,
  );

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  // All sessions including this one are gone; send the user back through login.
  await clearSessionCookie();
  redirect('/auth/login?passwordChanged=1');
}

// ----------------------------------------------------- resend verification

export async function resendVerificationAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const session = await getSession();
  if (!session) {
    return { ok: false, message: 'Please sign in again.' };
  }

  const context = await getRequestContext();
  await resendVerification(session.user.id, context);

  return { ok: true, message: 'If your address still needs verifying, a new link is on its way.' };
}
