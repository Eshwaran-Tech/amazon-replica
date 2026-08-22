import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { displayIdentifier, parseIdentifier, type Identifier } from '@/lib/auth/identifier';
import { OTP_TTL_MINUTES, discardOtp, issueOtp, verifyOtp } from '@/lib/auth/otp';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth/password';
import { createSession, revokeAllSessionsForUser } from '@/lib/auth/session';
import {
  consumeOneTimeToken,
  invalidateTokensForUser,
  issueOneTimeToken,
} from '@/lib/auth/tokens';
import { usersCollection } from '@/lib/db/collections';
import {
  sendExistingAccountEmail,
  sendOtpEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '@/lib/email';
import { recordAudit, recordAuditAndAlert } from '@/lib/security/audit';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import { sendOtpSms } from '@/lib/sms';
import type { UserDoc } from '@/models/user';

import '@/lib/server-guard';

/**
 * Authentication business logic.
 *
 * The recurring theme: **never let the response distinguish "this account
 * exists" from "it does not".** Registration, login and password reset are all
 * account-enumeration surfaces, and the usual leaks are a different message, a
 * different status code, and a different response time. All three are addressed
 * below.
 */

/**
 * Account lock after repeated failures.
 *
 * This threshold **must stay below** the `auth:login:account` rate limit
 * (currently 8 per 15 minutes). The two controls sit in the same path, and the
 * rate limiter rejects before the password is ever checked -- so a lock
 * threshold at or above the rate limit is unreachable, and the lock silently
 * becomes dead code. (A test caught exactly that: attempts plateaued at 8 and
 * the account was never locked.)
 *
 * Ordering them deliberately: the lock is the precise, per-account control that
 * persists and is visible to the user and to an admin; the rate limit is the
 * cheaper outer bound that also covers attempts against accounts that do not
 * exist.
 */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

export interface AuthContext {
  ip: string;
  userAgent: string | null;
}

export type RegisterResult =
  | { ok: true; token: string; expiresAt: Date; userId: string }
  | { ok: false; code: 'EMAIL_TAKEN' | 'RATE_LIMITED'; message: string };

/**
 * Registration.
 *
 * The duplicate-email case is the awkward one. Telling the user "that address
 * is already registered" is an enumeration oracle; saying nothing at all makes
 * for a terrible experience when someone genuinely forgot they have an account.
 *
 * The compromise used here: a duplicate does not create an account and does not
 * sign anyone in, and the *caller* is instructed to render the same
 * "check your email" screen as a success. The existing account holder receives
 * a "someone tried to register with your address" mail, which is useful to
 * them and invisible to the attacker.
 */
export async function registerUser(
  input: { name: string; email: string; password: string },
  context: AuthContext,
): Promise<RegisterResult> {
  const limit = await checkRateLimit('auth:register:ip', context.ip);
  if (!limit.allowed) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please try later.' };
  }

  const users = await usersCollection();
  const email = input.email.toLowerCase();

  const existing = await users.findOne({ email });

  if (existing) {
    // Do the same work as a real registration so the timing matches, then tell
    // the existing owner rather than the caller.
    await hashPassword(input.password);

    // A notification, not an invitation: the recipient already has an account,
    // so there is nothing to verify -- they are pointed at sign-in and reset.
    // Looked up by email, so it is present; the type simply cannot know that.
    await sendExistingAccountEmail(email, existing.name).catch(() => undefined);

    await recordAudit({
      action: 'auth.register',
      targetType: 'user',
      targetId: existing._id.toHexString(),
      ip: context.ip,
      metadata: { outcome: 'duplicate-email' },
    });

    return { ok: false, code: 'EMAIL_TAKEN', message: 'Account already exists.' };
  }

  const now = new Date();
  const user: UserDoc = {
    _id: new ObjectId(),
    name: input.name,
    email,
    phone: null,
    passwordHash: await hashPassword(input.password),
    hasPassword: true,
    // Role is assigned by the server, always USER. There is no code path that
    // reads a role from a request.
    role: 'USER',
    emailVerified: false,
    emailVerifiedAt: null,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await users.insertOne(user);
  } catch (error) {
    // The unique index is the real guarantee -- two simultaneous registrations
    // for the same address both pass the `findOne` above, and exactly one wins
    // this insert.
    if ((error as { code?: number }).code === 11000) {
      return { ok: false, code: 'EMAIL_TAKEN', message: 'Account already exists.' };
    }
    throw error;
  }

  const verification = await issueOneTimeToken('email-verification', user._id, email);
  await sendVerificationEmail(email, user.name, verification.token);

  const session = await createSession({
    userId: user._id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  await recordAudit({
    action: 'auth.register',
    actorId: user._id,
    actorRole: 'USER',
    targetType: 'user',
    targetId: user._id.toHexString(),
    ip: context.ip,
    metadata: { outcome: 'created' },
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    userId: user._id.toHexString(),
  };
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; userId: string; role: UserDoc['role'] }
  | { ok: false; code: 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | 'LOCKED' | 'DISABLED'; message: string };

/**
 * Login.
 *
 * Every failure below returns the *same* message. Distinguishing "no such
 * account" from "wrong password" hands an attacker a free account-enumeration
 * oracle, and distinguishing "locked" from "wrong password" confirms the
 * address is real.
 *
 * Timing is equalised too: when the address does not exist we still run a
 * bcrypt comparison against `DUMMY_PASSWORD_HASH`. Measured on this machine,
 * a real comparison is ~239ms and a skipped one is ~0ms -- a gap trivially
 * visible to a script with a stopwatch.
 */
export async function loginUser(
  input: { email?: string; identifier?: string; password: string },
  context: AuthContext,
): Promise<LoginResult> {
  const generic = {
    ok: false as const,
    code: 'INVALID_CREDENTIALS' as const,
    message: 'Your password is incorrect.',
  };

  // Either an email (the original API) or any identifier the sign-in page
  // accepts -- both normalise to the same lookup.
  const identifier = parseIdentifier(input.identifier ?? input.email ?? '');
  // An unparseable identifier still pays the bcrypt cost, so a malformed
  // string cannot be told apart from an unknown one by timing.
  const key = identifier?.value ?? `invalid:${(input.identifier ?? input.email ?? '').slice(0, 64)}`;

  // Two independent budgets. Per-IP alone is defeated by a proxy pool; per-account
  // alone is defeated by spraying one password across many accounts.
  const ipLimit = await checkRateLimit('auth:login:ip', context.ip);
  const accountLimit = await checkRateLimit('auth:login:account', key);

  if (!ipLimit.allowed || !accountLimit.allowed) {
    await recordAuditAndAlert({
      action: 'auth.login.failed',
      ip: context.ip,
      metadata: { reason: 'rate-limited' },
    });
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Please wait a few minutes and try again.',
    };
  }

  const users = await usersCollection();
  const user = identifier ? await findUserByIdentifier(identifier) : null;

  if (!user) {
    // Burn the same CPU a real check would.
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    await recordAuditAndAlert({
      action: 'auth.login.failed',
      ip: context.ip,
      metadata: { reason: 'unknown-identifier' },
    });
    return generic;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    await recordAuditAndAlert({
      action: 'auth.login.failed',
      actorId: user._id,
      ip: context.ip,
      metadata: { reason: 'locked' },
    });
    // Same message as a bad password: revealing the lock confirms the account.
    return generic;
  }

  // A passwordless account carries an unusable random hash, so this is false
  // for it regardless -- the flag makes the intent explicit and survives any
  // future change to how such accounts are stored. The bcrypt call still runs
  // first, so timing does not reveal which kind of account this is.
  const passwordOk =
    (await verifyPassword(input.password, user.passwordHash)) && (user.hasPassword ?? true);

  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60_000)
            : user.lockedUntil ?? null,
          updatedAt: new Date(),
        },
      },
    );

    await recordAuditAndAlert({
      action: 'auth.login.failed',
      actorId: user._id,
      ip: context.ip,
      metadata: { reason: 'bad-password', attempts, locked: shouldLock },
    });

    return generic;
  }

  if (user.isDisabled) {
    // Only reachable with the correct password, so naming the reason here
    // discloses nothing an attacker did not already have.
    await recordAuditAndAlert({
      action: 'auth.login.failed',
      actorId: user._id,
      ip: context.ip,
      metadata: { reason: 'disabled' },
    });
    return {
      ok: false,
      code: 'DISABLED',
      message: 'This account has been disabled. Please contact support.',
    };
  }

  // Success. Clear the counters so an earlier typo does not leave the user
  // throttled, and upgrade the hash if the cost factor has since risen.
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(needsRehash(user.passwordHash)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
        updatedAt: new Date(),
      },
    },
  );

  await resetRateLimit('auth:login:account', key);

  const session = await createSession({
    userId: user._id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  await recordAudit({
    action: 'auth.login',
    actorId: user._id,
    actorRole: user.role,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { method: 'password' },
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    userId: user._id.toHexString(),
    role: user.role,
  };
}

// =========================================================== identifier flow

/**
 * Looks an account up by whichever identifier the visitor typed. Emails and
 * phones are already normalised by `parseIdentifier`, matching the unique
 * indexes exactly.
 */
export async function findUserByIdentifier(identifier: Identifier): Promise<UserDoc | null> {
  const users = await usersCollection();
  return identifier.kind === 'email'
    ? users.findOne({ email: identifier.value })
    : users.findOne({ phone: identifier.value });
}

export type IdentifyResult =
  | { ok: true; exists: boolean; hasPassword: boolean }
  | { ok: false; code: 'RATE_LIMITED'; message: string };

/**
 * Step one of the sign-in / sign-up flow: does this identifier have an
 * account?
 *
 * **This deliberately reveals whether an account exists.** It is the
 * storefront's chosen sign-in experience ("It looks like you are new" vs a
 * password prompt), and it is an account-enumeration oracle by construction.
 * The mitigation is throttling: a tight per-IP budget and a per-identifier
 * budget, so probing a list of addresses is slow and loud. Everything after
 * this step is still enumeration-neutral (wrong-password and unknown-account
 * responses are identical, as before).
 */
export async function identifyAccount(
  identifier: Identifier,
  context: AuthContext,
): Promise<IdentifyResult> {
  const ipLimit = await checkRateLimit('auth:identify:ip', context.ip);
  const idLimit = await checkRateLimit('auth:identify:identifier', identifier.value);
  if (!ipLimit.allowed || !idLimit.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a few minutes and try again.',
    };
  }

  const user = await findUserByIdentifier(identifier);
  return {
    ok: true,
    exists: user !== null,
    hasPassword: user ? (user.hasPassword ?? true) : false,
  };
}

/** Delivers a code to wherever the identifier points. */
async function deliverOtp(identifier: Identifier, code: string): Promise<void> {
  if (identifier.kind === 'phone') {
    await sendOtpSms(identifier.value, code, OTP_TTL_MINUTES);
  } else {
    await sendOtpEmail(identifier.value, code, OTP_TTL_MINUTES);
  }
}

export type OtpSendResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; code: 'RATE_LIMITED' | 'NOT_FOUND' | 'DISABLED'; message: string };

/**
 * Sends a sign-in code to an existing account's identifier.
 *
 * Only for accounts that exist -- there is nothing to sign in to otherwise,
 * and the identifier step has already said so. Rate-limited per identifier
 * (SMS costs money and unsolicited codes are harassment) and per IP.
 */
export async function sendSignInOtp(
  identifier: Identifier,
  context: AuthContext,
): Promise<OtpSendResult> {
  const ipLimit = await checkRateLimit('auth:otp:send:ip', context.ip);
  const idLimit = await checkRateLimit('auth:otp:send:identifier', identifier.value);
  if (!ipLimit.allowed || !idLimit.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many codes requested. Please wait a while before asking for another.',
    };
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: 'We could not find that account.' };
  if (user.isDisabled) {
    return { ok: false, code: 'DISABLED', message: 'This account has been disabled. Please contact support.' };
  }

  const issued = await issueOtp(identifier, 'signin');
  await deliverOtp(identifier, issued.code);

  await recordAudit({
    action: 'auth.otp.sent',
    actorId: user._id,
    targetType: 'user',
    targetId: user._id.toHexString(),
    ip: context.ip,
    metadata: { purpose: 'signin', channel: identifier.kind },
  });

  return { ok: true, expiresAt: issued.expiresAt };
}

/**
 * Completes an OTP sign-in.
 *
 * A correct code proves control of the identifier at this moment, so it also
 * marks that channel verified -- an account that had never clicked its email
 * link is verified the first time it signs in with a code.
 */
export async function signInWithOtp(
  identifier: Identifier,
  code: string,
  context: AuthContext,
): Promise<LoginResult> {
  const generic = {
    ok: false as const,
    code: 'INVALID_CREDENTIALS' as const,
    message: 'That code is not valid. Check it and try again, or request a new one.',
  };

  const limit = await checkRateLimit('auth:otp:verify:identifier', identifier.value);
  if (!limit.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please request a new code in a few minutes.',
    };
  }

  const verified = await verifyOtp(identifier, 'signin', code);
  if (!verified.ok) {
    await recordAuditAndAlert({
      action: 'auth.otp.failed',
      ip: context.ip,
      metadata: { purpose: 'signin', reason: verified.reason, channel: identifier.kind },
    });
    return generic;
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) return generic;
  if (user.isDisabled) {
    return { ok: false, code: 'DISABLED', message: 'This account has been disabled. Please contact support.' };
  }

  const now = new Date();
  const users = await usersCollection();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(identifier.kind === 'phone' && !(user.phoneVerified ?? false)
          ? { phoneVerified: true, phoneVerifiedAt: now }
          : {}),
        ...(identifier.kind === 'email' && !user.emailVerified
          ? { emailVerified: true, emailVerifiedAt: now }
          : {}),
        updatedAt: now,
      },
    },
  );

  const session = await createSession({
    userId: user._id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  await recordAudit({
    action: 'auth.login',
    actorId: user._id,
    actorRole: user.role,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata: { method: 'otp', channel: identifier.kind },
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    userId: user._id.toHexString(),
    role: user.role,
  };
}

export type SignUpStartResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; code: 'RATE_LIMITED' | 'EXISTS'; message: string };

/**
 * Step two of sign-up: takes the details, sends the code.
 *
 * The details are parked on the OTP record (server-side, TTL-bounded), never
 * in a cookie: a password, even hashed, has no business in the browser.
 */
export async function startSignUp(
  input: { identifier: Identifier; name: string; password?: string | null },
  context: AuthContext,
): Promise<SignUpStartResult> {
  const ipLimit = await checkRateLimit('auth:otp:send:ip', context.ip);
  const idLimit = await checkRateLimit('auth:otp:send:identifier', input.identifier.value);
  if (!ipLimit.allowed || !idLimit.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many codes requested. Please wait a while before asking for another.',
    };
  }

  const existing = await findUserByIdentifier(input.identifier);
  if (existing) {
    return {
      ok: false,
      code: 'EXISTS',
      message: `An account already exists for ${displayIdentifier(input.identifier)}. Sign in instead.`,
    };
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const issued = await issueOtp(input.identifier, 'signup', { name: input.name, passwordHash });
  await deliverOtp(input.identifier, issued.code);

  await recordAudit({
    action: 'auth.otp.sent',
    ip: context.ip,
    metadata: { purpose: 'signup', channel: input.identifier.kind },
  });

  return { ok: true, expiresAt: issued.expiresAt };
}

/**
 * Step three of sign-up: the code verifies, the account is created, verified
 * on the channel that proved itself, and signed in.
 */
export async function completeSignUp(
  identifier: Identifier,
  code: string,
  context: AuthContext,
): Promise<RegisterResult | { ok: false; code: 'INVALID_CODE'; message: string }> {
  const limit = await checkRateLimit('auth:otp:verify:identifier', identifier.value);
  if (!limit.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many attempts. Please request a new code in a few minutes.',
    };
  }

  const verified = await verifyOtp(identifier, 'signup', code);
  if (!verified.ok || !verified.pending) {
    await recordAuditAndAlert({
      action: 'auth.otp.failed',
      ip: context.ip,
      metadata: { purpose: 'signup', reason: verified.ok ? 'no-pending' : verified.reason, channel: identifier.kind },
    });
    return {
      ok: false,
      code: 'INVALID_CODE',
      message: 'That code is not valid. Check it and try again, or request a new one.',
    };
  }

  const now = new Date();
  const { name, passwordHash } = verified.pending;
  const user: UserDoc = {
    _id: new ObjectId(),
    name,
    email: identifier.kind === 'email' ? identifier.value : null,
    phone: identifier.kind === 'phone' ? identifier.value : null,
    // No password chosen: store a hash of a secret nobody knows, so the
    // account is functionally passwordless without a nullable hash column.
    passwordHash: passwordHash ?? (await hashPassword(randomBytes(32).toString('base64url'))),
    hasPassword: passwordHash !== null,
    role: 'USER',
    emailVerified: identifier.kind === 'email',
    emailVerifiedAt: identifier.kind === 'email' ? now : null,
    phoneVerified: identifier.kind === 'phone',
    phoneVerifiedAt: identifier.kind === 'phone' ? now : null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const users = await usersCollection();
  try {
    await users.insertOne(user);
  } catch (error) {
    // Two racing sign-ups for the same identifier: the unique index decides.
    if ((error as { code?: number }).code === 11000) {
      return { ok: false, code: 'EMAIL_TAKEN', message: 'Account already exists.' };
    }
    throw error;
  }
  await discardOtp(identifier, 'signup');

  const session = await createSession({
    userId: user._id,
    ip: context.ip,
    userAgent: context.userAgent,
  });

  await recordAudit({
    action: 'auth.register',
    actorId: user._id,
    actorRole: 'USER',
    targetType: 'user',
    targetId: user._id.toHexString(),
    ip: context.ip,
    metadata: { outcome: 'created', method: 'otp', channel: identifier.kind },
  });

  return {
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    userId: user._id.toHexString(),
  };
}

/**
 * Forgot password.
 *
 * Returns void by design: the caller has nothing to branch on, so it cannot
 * accidentally render a different screen for a registered address. Both paths
 * do comparable work, and the response is always the same generic message.
 */
export async function requestPasswordReset(email: string, context: AuthContext): Promise<void> {
  const normalised = email.toLowerCase();

  const ipLimit = await checkRateLimit('auth:forgot-password:ip', context.ip);
  const accountLimit = await checkRateLimit('auth:forgot-password:account', normalised);
  if (!ipLimit.allowed || !accountLimit.allowed) return;

  const users = await usersCollection();
  const user = await users.findOne({ email: normalised });

  if (!user || user.isDisabled) {
    await recordAudit({
      action: 'auth.password.reset',
      ip: context.ip,
      metadata: { outcome: 'no-account' },
    });
    return;
  }

  const { token } = await issueOneTimeToken('password-reset', user._id, normalised);
  await sendPasswordResetEmail(normalised, user.name, token);

  await recordAudit({
    action: 'auth.password.reset',
    actorId: user._id,
    ip: context.ip,
    metadata: { outcome: 'email-sent' },
  });
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_TOKEN' | 'RATE_LIMITED'; message: string };

/**
 * Completes a password reset.
 *
 * Invalidating every session afterwards is the point of the flow: a reset is
 * usually a response to a suspected compromise, so any session an attacker
 * still holds must die with the old password.
 */
export async function resetPassword(
  input: { token: string; password: string },
  context: AuthContext,
): Promise<ResetPasswordResult> {
  const limit = await checkRateLimit('auth:reset-password:ip', context.ip);
  if (!limit.allowed) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please try later.' };
  }

  const consumed = await consumeOneTimeToken('password-reset', input.token);

  if (!consumed.ok) {
    await recordAuditAndAlert({
      action: 'auth.password.reset',
      ip: context.ip,
      metadata: { outcome: consumed.reason },
    });
    return {
      ok: false,
      code: 'INVALID_TOKEN',
      message: 'This reset link is invalid or has expired. Please request a new one.',
    };
  }

  const users = await usersCollection();
  const now = new Date();

  await users.updateOne(
    { _id: consumed.userId },
    {
      $set: {
        passwordHash: await hashPassword(input.password),
        // Bumping this invalidates every session created before now.
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
        // Completing a reset proves control of the mailbox.
        emailVerified: true,
        emailVerifiedAt: now,
        updatedAt: now,
      },
    },
  );

  await revokeAllSessionsForUser(consumed.userId);
  await invalidateTokensForUser('password-reset', consumed.userId);

  const user = await users.findOne({ _id: consumed.userId });
  if (user?.email) await sendPasswordChangedEmail(user.email, user.name);

  await recordAuditAndAlert(
    {
      action: 'auth.password.changed',
      actorId: consumed.userId,
      ip: context.ip,
      metadata: { via: 'reset-link' },
    },
    'info',
  );

  return { ok: true };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_CURRENT' | 'RATE_LIMITED'; message: string };

/**
 * Changes the password for a signed-in user.
 *
 * The current password is required even though the caller is authenticated:
 * it stops an attacker who has a hijacked session -- but not the password --
 * from locking the real owner out.
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  context: AuthContext,
  keepSessionToken?: string,
): Promise<ChangePasswordResult> {
  const limit = await checkRateLimit('auth:change-password:user', userId);
  if (!limit.allowed) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please try later.' };
  }

  const users = await usersCollection();
  const user = await users.findOne({ _id: new ObjectId(userId) });

  // A passwordless account has no "current password" to present; the OTP it
  // signed in with is its credential. Setting a first password is a separate
  // (future) flow, so this one is refused rather than accepting anything.
  const currentOk =
    user !== null &&
    (user.hasPassword ?? true) &&
    (await verifyPassword(input.currentPassword, user.passwordHash));

  if (!user || !currentOk) {
    await recordAuditAndAlert({
      action: 'auth.password.changed',
      actorId: userId,
      ip: context.ip,
      metadata: { outcome: 'wrong-current-password' },
    });
    return {
      ok: false,
      code: 'INVALID_CURRENT',
      message: 'Your current password is incorrect.',
    };
  }

  const now = new Date();
  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await hashPassword(input.newPassword),
        hasPassword: true,
        passwordChangedAt: now,
        updatedAt: now,
      },
    },
  );

  // Every existing session is now invalid because `passwordChangedAt` moved.
  // Issue a fresh one so the user is not signed out of the tab they are using.
  await revokeAllSessionsForUser(user._id);
  await invalidateTokensForUser('password-reset', user._id);
  void keepSessionToken;

  if (user.email) await sendPasswordChangedEmail(user.email, user.name);

  await recordAuditAndAlert(
    {
      action: 'auth.password.changed',
      actorId: user._id,
      actorRole: user.role,
      ip: context.ip,
      metadata: { via: 'account-settings' },
    },
    'info',
  );

  return { ok: true };
}

export type VerifyEmailResult = { ok: true } | { ok: false; message: string };

export async function verifyEmail(token: string, context: AuthContext): Promise<VerifyEmailResult> {
  const limit = await checkRateLimit('auth:verify-email:ip', context.ip);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please try again later.' };
  }

  const consumed = await consumeOneTimeToken('email-verification', token);

  if (!consumed.ok) {
    return {
      ok: false,
      message: 'This verification link is invalid or has expired. Request a new one from your account page.',
    };
  }

  const users = await usersCollection();
  const now = new Date();

  await users.updateOne(
    { _id: consumed.userId },
    { $set: { emailVerified: true, emailVerifiedAt: now, updatedAt: now } },
  );

  await recordAudit({
    action: 'auth.email.verified',
    actorId: consumed.userId,
    ip: context.ip,
  });

  return { ok: true };
}

/** Issues a fresh verification email for a signed-in, still-unverified user. */
export async function resendVerification(userId: string, context: AuthContext): Promise<void> {
  const limit = await checkRateLimit('auth:verify-email:ip', context.ip);
  if (!limit.allowed) return;

  const users = await usersCollection();
  const user = await users.findOne({ _id: new ObjectId(userId) });

  // Nothing to verify without an email address (mobile-only accounts prove
  // their number by OTP instead), and nothing to do once it is verified.
  if (!user || !user.email || user.emailVerified) return;

  const { token } = await issueOneTimeToken('email-verification', user._id, user.email);
  await sendVerificationEmail(user.email, user.name, token);
}
