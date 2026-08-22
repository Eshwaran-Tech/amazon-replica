import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeMongoClient } from '@/lib/db/client';
import {
  passwordResetTokensCollection,
  sessionsCollection,
  usersCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { resolveSession } from '@/lib/auth/session';
import { consumeOneTimeToken, issueOneTimeToken } from '@/lib/auth/tokens';
import {
  changePassword,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from '@/services/auth';
import type { UserDoc } from '@/models/user';

/**
 * Phase 5 verification.
 *
 * Rate limits are keyed on IP and email, so every test uses a fresh pair --
 * otherwise the tests throttle each other and fail for the wrong reason.
 */

let counter = 0;
const uniqueEmail = (): string => `flow-${Date.now()}-${(counter += 1)}@example.com`;
const uniqueIp = (): string => `10.${(counter += 1) % 250}.${counter % 250}.${counter % 250}`;
const ctx = () => ({ ip: uniqueIp(), userAgent: 'vitest' });

const PASSWORD = 'ValidPass123';

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('registration', () => {
  it('creates an unverified USER and signs them in', async () => {
    const email = uniqueEmail();
    const result = await registerUser({ name: 'Test Person', email, password: PASSWORD }, ctx());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const users = await usersCollection();
    const user = await users.findOne({ email });

    expect(user).not.toBeNull();
    // Role is assigned by the server. There is no path that reads it from input.
    expect(user?.role).toBe('USER');
    expect(user?.emailVerified).toBe(false);
    expect(user?.isDisabled).toBe(false);
    expect(user?.passwordHash).not.toBe(PASSWORD);

    const session = await resolveSession(result.token);
    expect(session?.user.email).toBe(email);
  });

  it('normalises the email so one address cannot become two accounts', async () => {
    const base = uniqueEmail();
    const upper = base.toUpperCase();

    const first = await registerUser({ name: 'A', email: base, password: PASSWORD }, ctx());
    expect(first.ok).toBe(true);

    const second = await registerUser({ name: 'B', email: upper, password: PASSWORD }, ctx());
    expect(second.ok).toBe(false);

    const users = await usersCollection();
    expect(await users.countDocuments({ email: base })).toBe(1);
  });

  it('does not create a second account for a duplicate address', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'First', email, password: PASSWORD }, ctx());

    const duplicate = await registerUser({ name: 'Second', email, password: PASSWORD }, ctx());

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe('EMAIL_TAKEN');

    const users = await usersCollection();
    const found = await users.find({ email }).toArray();
    expect(found).toHaveLength(1);
    // The original account is untouched -- a duplicate registration must not
    // overwrite the existing user's name or password.
    expect(found[0]?.name).toBe('First');
  });

  it('lets the unique index settle a race that both callers pass', async () => {
    const email = uniqueEmail();

    const [a, b] = await Promise.all([
      registerUser({ name: 'A', email, password: PASSWORD }, ctx()),
      registerUser({ name: 'B', email, password: PASSWORD }, ctx()),
    ]);

    // Both find no existing user, both attempt an insert; exactly one wins.
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);

    const users = await usersCollection();
    expect(await users.countDocuments({ email })).toBe(1);
  });
});

describe('login: account enumeration resistance', () => {
  it('returns an identical message for an unknown email and a wrong password', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Real', email, password: PASSWORD }, ctx());

    const wrongPassword = await loginUser({ email, password: 'WrongPass123' }, ctx());
    const unknownEmail = await loginUser({ email: uniqueEmail(), password: PASSWORD }, ctx());

    expect(wrongPassword.ok).toBe(false);
    expect(unknownEmail.ok).toBe(false);
    if (wrongPassword.ok || unknownEmail.ok) return;

    // Byte-identical, so the response cannot be used to test whether an address
    // is registered.
    expect(unknownEmail.message).toBe(wrongPassword.message);
    expect(unknownEmail.code).toBe(wrongPassword.code);
  });

  it('takes comparable time for an unknown email and a wrong password', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Real', email, password: PASSWORD }, ctx());

    const timeIt = async (fn: () => Promise<unknown>): Promise<number> => {
      const started = process.hrtime.bigint();
      await fn();
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    const wrongPasswordMs = await timeIt(() =>
      loginUser({ email, password: 'WrongPass123' }, ctx()),
    );
    const unknownEmailMs = await timeIt(() =>
      loginUser({ email: uniqueEmail(), password: PASSWORD }, ctx()),
    );

    // Both paths run a real bcrypt comparison. Without the dummy-hash
    // equalisation the unknown-email path returns in ~0ms against ~240ms, which
    // a script can measure trivially.
    expect(unknownEmailMs).toBeGreaterThan(20);
    expect(wrongPasswordMs).toBeGreaterThan(20);

    const ratio = Math.max(unknownEmailMs, wrongPasswordMs) / Math.min(unknownEmailMs, wrongPasswordMs);
    expect(ratio).toBeLessThan(3);
  });

  it('hides an account lock behind the same generic message', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Locked', email, password: PASSWORD }, ctx());

    const users = await usersCollection();
    await users.updateOne(
      { email },
      { $set: { lockedUntil: new Date(Date.now() + 600_000), failedLoginAttempts: 10 } },
    );

    const locked = await loginUser({ email, password: PASSWORD }, ctx());

    expect(locked.ok).toBe(false);
    // Revealing "your account is locked" would confirm the address is real.
    if (!locked.ok) expect(locked.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('login: brute force controls', () => {
  it('locks the account before the rate limit makes the lock unreachable', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Target', email, password: PASSWORD }, ctx());

    // 5 failures, which is below the per-account rate limit of 8. If the lock
    // threshold ever drifts above that limit, the limiter starts rejecting
    // first and this assertion fails -- which is the point.
    for (let i = 0; i < 5; i += 1) {
      await loginUser({ email, password: `Wrong${i}Pass1` }, ctx());
    }

    const users = await usersCollection();
    const user = await users.findOne({ email });

    expect(user?.failedLoginAttempts).toBeGreaterThanOrEqual(5);
    expect(user?.lockedUntil).toBeInstanceOf(Date);
    expect(user?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // Even the correct password is refused while the lock holds.
    const correct = await loginUser({ email, password: PASSWORD }, ctx());
    expect(correct.ok).toBe(false);
  });

  it('clears the failure counter after a successful sign-in', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Typo', email, password: PASSWORD }, ctx());

    await loginUser({ email, password: 'WrongPass123' }, ctx());
    await loginUser({ email, password: 'WrongPass123' }, ctx());

    const success = await loginUser({ email, password: PASSWORD }, ctx());
    expect(success.ok).toBe(true);

    const users = await usersCollection();
    const user = await users.findOne({ email });
    // A user who mistyped twice should not stay one attempt from a lockout.
    expect(user?.failedLoginAttempts).toBe(0);
    expect(user?.lockedUntil).toBeNull();
  });

  it('refuses a disabled account that has the correct password', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Banned', email, password: PASSWORD }, ctx());

    const users = await usersCollection();
    await users.updateOne({ email }, { $set: { isDisabled: true } });

    const result = await loginUser({ email, password: PASSWORD }, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('DISABLED');
  });
});

describe('password reset', () => {
  async function makeUserWithToken(): Promise<{ user: UserDoc; token: string }> {
    const email = uniqueEmail();
    await registerUser({ name: 'Resetter', email, password: PASSWORD }, ctx());

    const users = await usersCollection();
    const user = await users.findOne({ email });
    if (!user) throw new Error('user not created');

    const { token } = await issueOneTimeToken('password-reset', user._id, email);
    return { user, token };
  }

  it('accepts a valid token exactly once', async () => {
    const { token } = await makeUserWithToken();

    const first = await resetPassword({ token, password: 'BrandNewPass9' }, ctx());
    expect(first.ok).toBe(true);

    // Replaying the same link must fail -- otherwise a link sitting in a mail
    // archive stays a permanent account takeover.
    const second = await resetPassword({ token, password: 'AnotherPass9' }, ctx());
    expect(second.ok).toBe(false);
  });

  it('lets only one of two concurrent consumers win', async () => {
    const { user } = await makeUserWithToken();
    const { token } = await issueOneTimeToken('password-reset', user._id, user.email ?? '');

    const [a, b] = await Promise.all([
      consumeOneTimeToken('password-reset', token),
      consumeOneTimeToken('password-reset', token),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it('rejects an expired token', async () => {
    const { user } = await makeUserWithToken();
    const { token } = await issueOneTimeToken('password-reset', user._id, user.email ?? '');

    const tokens = await passwordResetTokensCollection();
    await tokens.updateOne(
      { userId: user._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const result = await resetPassword({ token, password: 'BrandNewPass9' }, ctx());
    expect(result.ok).toBe(false);
  });

  it('supersedes an older unused token when a new one is issued', async () => {
    const { user } = await makeUserWithToken();
    const older = await issueOneTimeToken('password-reset', user._id, user.email ?? '');
    const newer = await issueOneTimeToken('password-reset', user._id, user.email ?? '');

    // Otherwise requesting three reset emails leaves three live tokens, and the
    // oldest -- possibly forwarded or archived -- stays valid.
    expect((await consumeOneTimeToken('password-reset', older.token)).ok).toBe(false);
    expect((await consumeOneTimeToken('password-reset', newer.token)).ok).toBe(true);
  });

  it('kills every existing session, including an attacker’s', async () => {
    const email = uniqueEmail();
    const registration = await registerUser(
      { name: 'Compromised', email, password: PASSWORD },
      ctx(),
    );
    expect(registration.ok).toBe(true);
    if (!registration.ok) return;

    // Simulate the attacker's live session alongside the owner's.
    const attacker = await loginUser({ email, password: PASSWORD }, ctx());
    expect(attacker.ok).toBe(true);
    if (!attacker.ok) return;

    const users = await usersCollection();
    const user = await users.findOne({ email });
    if (!user) throw new Error('missing user');

    const { token } = await issueOneTimeToken('password-reset', user._id, email);
    await resetPassword({ token, password: 'RecoveredPass9' }, ctx());

    // A reset is usually a response to a compromise, so both must die.
    expect(await resolveSession(registration.token)).toBeNull();
    expect(await resolveSession(attacker.token)).toBeNull();

    const sessions = await sessionsCollection();
    expect(await sessions.countDocuments({ userId: user._id })).toBe(0);
  });

  it('marks the address verified, since completing a reset proves mailbox control', async () => {
    const { user } = await makeUserWithToken();
    const { token } = await issueOneTimeToken('password-reset', user._id, user.email ?? '');

    await resetPassword({ token, password: 'BrandNewPass9' }, ctx());

    const users = await usersCollection();
    const updated = await users.findOne({ _id: user._id });
    expect(updated?.emailVerified).toBe(true);
  });

  it('reveals nothing about whether an address is registered', async () => {
    // Returns void by design: the caller has nothing to branch on, so the UI
    // cannot accidentally render a different screen for a real account.
    await expect(requestPasswordReset(uniqueEmail(), ctx())).resolves.toBeUndefined();

    const email = uniqueEmail();
    await registerUser({ name: 'Real', email, password: PASSWORD }, ctx());
    await expect(requestPasswordReset(email, ctx())).resolves.toBeUndefined();
  });
});

describe('change password', () => {
  it('requires the current password, blocking a hijacked session', async () => {
    const email = uniqueEmail();
    const registration = await registerUser({ name: 'Owner', email, password: PASSWORD }, ctx());
    expect(registration.ok).toBe(true);
    if (!registration.ok) return;

    const wrong = await changePassword(
      registration.userId,
      { currentPassword: 'NotTheirPassword1', newPassword: 'AttackerPass9' },
      ctx(),
    );

    // An attacker with the session cookie but not the password must not be able
    // to lock the real owner out.
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.code).toBe('INVALID_CURRENT');

    const stillWorks = await loginUser({ email, password: PASSWORD }, ctx());
    expect(stillWorks.ok).toBe(true);
  });

  it('signs out every device on success', async () => {
    const email = uniqueEmail();
    const registration = await registerUser({ name: 'Owner', email, password: PASSWORD }, ctx());
    expect(registration.ok).toBe(true);
    if (!registration.ok) return;

    const other = await loginUser({ email, password: PASSWORD }, ctx());
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    const changed = await changePassword(
      registration.userId,
      { currentPassword: PASSWORD, newPassword: 'FreshPass2026' },
      ctx(),
    );
    expect(changed.ok).toBe(true);

    expect(await resolveSession(registration.token)).toBeNull();
    expect(await resolveSession(other.token)).toBeNull();

    // And the new password is the one that works.
    expect((await loginUser({ email, password: PASSWORD }, ctx())).ok).toBe(false);
    expect((await loginUser({ email, password: 'FreshPass2026' }, ctx())).ok).toBe(true);
  });
});

describe('email verification', () => {
  it('verifies with a valid token and refuses a replay', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Verifier', email, password: PASSWORD }, ctx());

    const users = await usersCollection();
    const user = await users.findOne({ email });
    if (!user) throw new Error('missing user');
    expect(user.emailVerified).toBe(false);

    const { token } = await issueOneTimeToken('email-verification', user._id, email);

    expect((await verifyEmail(token, ctx())).ok).toBe(true);
    expect((await users.findOne({ email }))?.emailVerified).toBe(true);

    expect((await verifyEmail(token, ctx())).ok).toBe(false);
  });

  it('rejects a token from a different purpose', async () => {
    const email = uniqueEmail();
    await registerUser({ name: 'Crosser', email, password: PASSWORD }, ctx());

    const users = await usersCollection();
    const user = await users.findOne({ email });
    if (!user) throw new Error('missing user');

    // Separate collections per purpose, so a reset token cannot be presented
    // as a verification token or vice versa.
    const reset = await issueOneTimeToken('password-reset', user._id, email);
    expect((await verifyEmail(reset.token, ctx())).ok).toBe(false);
  });
});
