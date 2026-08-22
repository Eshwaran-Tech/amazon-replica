import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { displayIdentifier, parseIdentifier } from '@/lib/auth/identifier';
import { OTP_MAX_ATTEMPTS, issueOtp, verifyOtp } from '@/lib/auth/otp';
import { closeMongoClient } from '@/lib/db/client';
import { otpCodesCollection, usersCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { resolveSession } from '@/lib/auth/session';
import {
  completeSignUp,
  identifyAccount,
  loginUser,
  sendSignInOtp,
  signInWithOtp,
  startSignUp,
} from '@/services/auth';

/**
 * The mobile-number / OTP sign-in and sign-up flow.
 *
 * Codes are delivered through the console transports in tests, so the suite
 * captures them from the transport spy rather than reading the database (the
 * database only ever holds an HMAC of the code).
 */

const ctx = () => ({ ip: `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, userAgent: 'vitest' });

let seq = 0;
function freshPhone(): string {
  seq += 1;
  // 9 + 9 digits, unique per call within a run.
  return `9${String(Date.now() % 1_000_000_000).padStart(9, '0').slice(-6)}${String(seq).padStart(3, '0')}`;
}
function freshEmail(): string {
  seq += 1;
  return `otp-${Date.now()}-${seq}@example.com`;
}

/** Captures the last OTP code printed by either console transport. */
function captureCode(): { read: () => string } {
  let last = '';
  const spy = vi.spyOn(console, 'info').mockImplementation((message: unknown) => {
    const text = String(message);
    const match = /\b(\d{6})\b is your amazon/.exec(text) ?? /OTP\) is: (\d{6})/.exec(text);
    if (match?.[1]) last = match[1];
  });
  return {
    read: () => {
      spy.mockRestore();
      return last;
    },
  };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

// ------------------------------------------------------------ identifiers

describe('identifier parsing', () => {
  it('normalises phones to E.164 and emails to lowercase', () => {
    expect(parseIdentifier('98765 43210')).toEqual({ kind: 'phone', value: '+919876543210' });
    expect(parseIdentifier('+91-98765-43210')).toEqual({ kind: 'phone', value: '+919876543210' });
    expect(parseIdentifier('09876543210')).toEqual({ kind: 'phone', value: '+919876543210' });
    expect(parseIdentifier('  Ramesh@Example.COM ')).toEqual({ kind: 'email', value: 'ramesh@example.com' });
  });

  it('rejects things that are neither', () => {
    expect(parseIdentifier('12345')).toBeNull(); // too short
    expect(parseIdentifier('1234567890')).toBeNull(); // Indian mobiles start 6-9
    expect(parseIdentifier('not an email@')).toBeNull();
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier(null)).toBeNull();
  });

  it('displays phones with the country code', () => {
    expect(displayIdentifier({ kind: 'phone', value: '+919111111111' })).toBe('+91 9111111111');
    expect(displayIdentifier({ kind: 'email', value: 'a@b.co' })).toBe('a@b.co');
  });
});

// ------------------------------------------------------------ OTP core

describe('one-time passwords', () => {
  const who = { kind: 'phone', value: `+91${freshPhone()}` } as const;

  it('accepts the right code exactly once, and never stores it in the clear', async () => {
    const issued = await issueOtp(who, 'signin');
    expect(issued.code).toMatch(/^\d{6}$/);

    const codes = await otpCodesCollection();
    const stored = await codes.findOne({ identifier: who.value, purpose: 'signin' });
    expect(stored?.codeHash).toBeDefined();
    expect(stored?.codeHash).not.toContain(issued.code);
    expect(JSON.stringify(stored)).not.toContain(issued.code);

    expect(await verifyOtp(who, 'signin', issued.code)).toMatchObject({ ok: true });
    // Second use: gone.
    expect(await verifyOtp(who, 'signin', issued.code)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('caps wrong guesses and destroys the code', async () => {
    const issued = await issueOtp(who, 'signin');
    const wrong = issued.code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      expect(await verifyOtp(who, 'signin', wrong)).toMatchObject({ ok: false, reason: 'invalid' });
    }
    expect(await verifyOtp(who, 'signin', wrong)).toMatchObject({ ok: false, reason: 'too-many-attempts' });
    // Even the right code is dead now.
    expect(await verifyOtp(who, 'signin', issued.code)).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('a new code supersedes the old one', async () => {
    const first = await issueOtp(who, 'signin');
    const second = await issueOtp(who, 'signin');
    expect(await verifyOtp(who, 'signin', first.code)).toMatchObject({ ok: false });
    expect(await verifyOtp(who, 'signin', second.code)).toMatchObject({ ok: true });
  });

  it('rejects an expired code', async () => {
    const issued = await issueOtp(who, 'signin');
    const codes = await otpCodesCollection();
    await codes.updateOne(
      { identifier: who.value, purpose: 'signin' },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect(await verifyOtp(who, 'signin', issued.code)).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('two racing correct submissions: exactly one wins', async () => {
    const issued = await issueOtp(who, 'signin');
    const [a, b] = await Promise.all([
      verifyOtp(who, 'signin', issued.code),
      verifyOtp(who, 'signin', issued.code),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });
});

// ------------------------------------------------------------ sign-up

describe('sign-up with a mobile number', () => {
  it('creates a verified, passwordless account and signs it in', async () => {
    const identifier = parseIdentifier(freshPhone());
    expect(identifier).not.toBeNull();
    if (!identifier) return;

    // Step 1: no account yet.
    expect(await identifyAccount(identifier, ctx())).toMatchObject({ ok: true, exists: false });

    // Step 2: details -> code.
    const capture = captureCode();
    const started = await startSignUp({ identifier, name: 'Priya Verma', password: null }, ctx());
    const code = capture.read();
    expect(started.ok).toBe(true);
    expect(code).toMatch(/^\d{6}$/);

    // Step 3: code -> account + session.
    const done = await completeSignUp(identifier, code, ctx());
    expect(done.ok).toBe(true);
    if (!done.ok) return;

    const users = await usersCollection();
    const user = await users.findOne({ phone: identifier.value });
    expect(user).toMatchObject({
      name: 'Priya Verma',
      email: null,
      phone: identifier.value,
      phoneVerified: true,
      emailVerified: false,
      hasPassword: false,
      role: 'USER',
    });

    const session = await resolveSession(done.token);
    expect(session?.user).toMatchObject({ phone: identifier.value, verified: true, hasPassword: false });

    // A password can never sign this account in -- there is none.
    const byPassword = await loginUser({ identifier: identifier.value, password: 'AnythingAtAll1' }, ctx());
    expect(byPassword.ok).toBe(false);

    // The same number cannot sign up twice.
    expect(await startSignUp({ identifier, name: 'Again', password: null }, ctx())).toMatchObject({
      ok: false,
      code: 'EXISTS',
    });
    expect(await identifyAccount(identifier, ctx())).toMatchObject({ ok: true, exists: true, hasPassword: false });
  });

  it('a wrong code does not create anything', async () => {
    const identifier = parseIdentifier(freshPhone());
    if (!identifier) return;
    const capture = captureCode();
    await startSignUp({ identifier, name: 'Nobody Yet', password: null }, ctx());
    const code = capture.read();
    const wrong = code === '000000' ? '111111' : '000000';

    const done = await completeSignUp(identifier, wrong, ctx());
    expect(done.ok).toBe(false);

    const users = await usersCollection();
    expect(await users.findOne({ phone: identifier.value })).toBeNull();
  });
});

describe('sign-up with an email', () => {
  it('creates a verified account with the chosen password', async () => {
    const identifier = parseIdentifier(freshEmail());
    if (!identifier) return;

    const capture = captureCode();
    const started = await startSignUp(
      { identifier, name: 'Email Person', password: 'ChosenPass123' },
      ctx(),
    );
    const code = capture.read();
    expect(started.ok).toBe(true);

    const done = await completeSignUp(identifier, code, ctx());
    expect(done.ok).toBe(true);

    const users = await usersCollection();
    const user = await users.findOne({ email: identifier.value });
    expect(user).toMatchObject({ emailVerified: true, phone: null, hasPassword: true });

    // Password sign-in works with the chosen password...
    expect((await loginUser({ email: identifier.value, password: 'ChosenPass123' }, ctx())).ok).toBe(true);
    // ...and the pending password hash never sits on the user as plain text.
    expect(user?.passwordHash).not.toContain('ChosenPass123');
  });
});

// ------------------------------------------------------------ sign-in

describe('sign-in with an OTP', () => {
  it('signs an existing account in and verifies the channel that proved itself', async () => {
    // A legacy-style email account that never verified its address.
    const email = freshEmail();
    const users = await usersCollection();
    const now = new Date();
    await users.insertOne({
      _id: new ObjectId(),
      name: 'Legacy User',
      email,
      phone: null,
      passwordHash: '$2b$12$WR9scyvnEDSgM/pOKrqve.GVF3bUY93X7I73aX3tqEDnwbYRuLV4m',
      hasPassword: true,
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
    });
    const identifier = parseIdentifier(email);
    if (!identifier) return;

    expect(await identifyAccount(identifier, ctx())).toMatchObject({ ok: true, exists: true, hasPassword: true });

    const capture = captureCode();
    expect((await sendSignInOtp(identifier, ctx())).ok).toBe(true);
    const code = capture.read();

    const wrong = await signInWithOtp(identifier, code === '000000' ? '111111' : '000000', ctx());
    expect(wrong.ok).toBe(false);

    const result = await signInWithOtp(identifier, code, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const session = await resolveSession(result.token);
    expect(session?.user.emailVerified).toBe(true);
    expect(session?.user.verified).toBe(true);
  });

  it('will not send a code to an identifier with no account', async () => {
    const identifier = parseIdentifier(freshPhone());
    if (!identifier) return;
    expect(await sendSignInOtp(identifier, ctx())).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
