import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeMongoClient } from '@/lib/db/client';
import { sessionsCollection, usersCollection, rateLimitsCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import {
  createSession,
  hashSessionToken,
  resolveSession,
  revokeAllSessionsForUser,
  revokeSession,
} from '@/lib/auth/session';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  safeEqual,
  verifyPassword,
} from '@/lib/auth/password';
import {
  csrfSubject,
  generateCsrfToken,
  verifyCsrf,
  verifyCsrfTokenSignature,
} from '@/lib/security/csrf';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import { clientIp } from '@/lib/security/request';
import { __testing as loggerTesting } from '@/lib/security/logger';
import type { UserDoc } from '@/models/user';

/**
 * Phase 4 verification.
 *
 * Each test corresponds to a specific way the control could fail in production.
 */

async function makeUser(overrides: Partial<UserDoc> = {}): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();

  const user: UserDoc = {
    _id: new ObjectId(),
    name: 'Test User',
    email: `session-${new ObjectId().toHexString()}@example.com`,
    phone: null,
    passwordHash: await hashPassword('ValidPass123'),
    hasPassword: true,
    role: 'USER',
    emailVerified: true,
    emailVerifiedAt: now,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };

  await users.insertOne(user);
  return user;
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('sessions: the happy path', () => {
  it('resolves a freshly issued token to its user', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id, ip: '1.2.3.4' });

    const session = await resolveSession(token);

    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(user._id.toHexString());
    expect(session?.user.email).toBe(user.email);
    expect(session?.user.role).toBe('USER');
  });

  it('never stores the usable token, only its hash', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id });

    const sessions = await sessionsCollection();
    const stored = await sessions.findOne({ userId: user._id });

    expect(stored).not.toBeNull();
    // A dump of this collection must yield nothing presentable as a session.
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('issues a high-entropy token', async () => {
    const user = await makeUser();
    const seen = new Set<string>();

    for (let i = 0; i < 20; i += 1) {
      const { token } = await createSession({ userId: user._id });
      expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
      seen.add(token);
    }

    expect(seen.size).toBe(20);
  });
});

describe('sessions: every reason a valid session must stop working', () => {
  it('rejects a tampered or unknown token', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id });

    expect(await resolveSession(`${token}x`)).toBeNull();
    expect(await resolveSession(token.slice(0, -1))).toBeNull();
    expect(await resolveSession('not-a-real-token-at-all-but-long-enough')).toBeNull();
    expect(await resolveSession('')).toBeNull();
    expect(await resolveSession(undefined)).toBeNull();
  });

  it('rejects an expired session even before the TTL sweeper removes it', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id });

    const sessions = await sessionsCollection();
    await sessions.updateOne(
      { tokenHash: hashSessionToken(token) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    // Never trust the sweeper's timing for an authorisation decision.
    expect(await resolveSession(token)).toBeNull();
  });

  it('rejects after logout', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id });

    expect(await resolveSession(token)).not.toBeNull();
    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it('signs out every device when the password changes', async () => {
    const user = await makeUser();

    const phone = await createSession({ userId: user._id });
    const laptop = await createSession({ userId: user._id });

    expect(await resolveSession(phone.token)).not.toBeNull();
    expect(await resolveSession(laptop.token)).not.toBeNull();

    // The account owner changes their password one second from now.
    const users = await usersCollection();
    await users.updateOne(
      { _id: user._id },
      { $set: { passwordChangedAt: new Date(Date.now() + 1000) } },
    );

    // Both pre-existing sessions must die: either could belong to whoever knew
    // the old password.
    expect(await resolveSession(phone.token)).toBeNull();
    expect(await resolveSession(laptop.token)).toBeNull();
  });

  it('rejects immediately when the account is disabled', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id });

    const users = await usersCollection();
    await users.updateOne({ _id: user._id }, { $set: { isDisabled: true } });

    // A ban must take effect on the next request, not at the next login.
    expect(await resolveSession(token)).toBeNull();
  });

  it('rejects when the user record is gone', async () => {
    const user = await makeUser();
    const { token } = await createSession({ userId: user._id });

    const users = await usersCollection();
    await users.deleteOne({ _id: user._id });

    expect(await resolveSession(token)).toBeNull();
  });

  it('revokes all sessions for a user in one call', async () => {
    const user = await makeUser();
    const a = await createSession({ userId: user._id });
    const b = await createSession({ userId: user._id });

    const removed = await revokeAllSessionsForUser(user._id);
    expect(removed).toBeGreaterThanOrEqual(2);

    expect(await resolveSession(a.token)).toBeNull();
    expect(await resolveSession(b.token)).toBeNull();
  });

  it('does not let one user’s session resolve to another user', async () => {
    const alice = await makeUser();
    const bob = await makeUser();

    const aliceSession = await createSession({ userId: alice._id });
    const resolved = await resolveSession(aliceSession.token);

    expect(resolved?.user.id).toBe(alice._id.toHexString());
    expect(resolved?.user.id).not.toBe(bob._id.toHexString());
  });
});

describe('CSRF', () => {
  // Subjects as the proxy derives them: a hash of the raw session cookie.
  const sessionA = csrfSubject('session-cookie-value-for-alice');
  const sessionB = csrfSubject('session-cookie-value-for-bob');
  const anonymous = csrfSubject(null);

  it('derives a distinct subject per session, and a stable one when signed out', () => {
    expect(sessionA).not.toBe(sessionB);
    expect(anonymous).toBe(csrfSubject(null));
    expect(anonymous).toBe(csrfSubject(undefined));
    // The subject must not be the session token itself.
    expect(sessionA).not.toContain('session-cookie-value-for-alice');
  });

  it('accepts a token that was issued for this session', () => {
    const token = generateCsrfToken(sessionA);
    expect(verifyCsrf(token, token, sessionA)).toEqual({ ok: true });
  });

  it('rejects a token lifted from another session', () => {
    // Binding is what stops a token harvested from one account being replayed
    // against another.
    const token = generateCsrfToken(sessionA);
    expect(verifyCsrf(token, token, sessionB)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a planted cookie whose signature we did not produce', () => {
    // The attack a plain (unsigned) double-submit cannot survive: an attacker
    // who can set a cookie on our domain plants a value they also submit.
    const forged = 'attackerchosen.attackersignature';
    expect(verifyCsrf(forged, forged, sessionA)).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects when the cookie and the submitted value differ', () => {
    const cookie = generateCsrfToken(sessionA);
    const submitted = generateCsrfToken(sessionA);
    expect(verifyCsrf(cookie, submitted, sessionA)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('rejects when either half is missing', () => {
    const token = generateCsrfToken(sessionA);
    expect(verifyCsrf(undefined, token, sessionA).ok).toBe(false);
    expect(verifyCsrf(token, undefined, sessionA).ok).toBe(false);
    expect(verifyCsrf(undefined, undefined, sessionA).ok).toBe(false);
  });

  it('protects anonymous forms (login, registration) before a session exists', () => {
    const token = generateCsrfToken(anonymous);
    expect(verifyCsrf(token, token, anonymous)).toEqual({ ok: true });
    // An anonymous token must not survive into a signed-in session, or a token
    // captured pre-login could be replayed against the resulting account.
    expect(verifyCsrfTokenSignature(token, sessionA)).toBe(false);
  });

  it('rejects structurally malformed tokens', () => {
    for (const token of ['', 'nodot', '.', 'a.', '.b', 'x'.repeat(600)]) {
      expect(verifyCsrfTokenSignature(token, sessionA), token).toBe(false);
    }
  });

  it('issues a distinct token every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateCsrfToken(sessionA)));
    expect(tokens.size).toBe(50);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit, then blocks', async () => {
    const identifier = `probe-${new ObjectId().toHexString()}`;
    const limit = 8; // auth:login:account

    for (let i = 1; i <= limit; i += 1) {
      const result = await checkRateLimit('auth:login:account', identifier);
      expect(result.allowed, `attempt ${i}`).toBe(true);
    }

    const blocked = await checkRateLimit('auth:login:account', identifier);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps buckets independent per identifier', async () => {
    const a = `iso-a-${new ObjectId().toHexString()}`;
    const b = `iso-b-${new ObjectId().toHexString()}`;

    for (let i = 0; i < 8; i += 1) await checkRateLimit('auth:login:account', a);

    expect((await checkRateLimit('auth:login:account', a)).allowed).toBe(false);
    // Exhausting one account must not lock out everyone else.
    expect((await checkRateLimit('auth:login:account', b)).allowed).toBe(true);
  });

  it('keeps buckets independent per rule', async () => {
    const identifier = `rule-${new ObjectId().toHexString()}`;

    for (let i = 0; i < 8; i += 1) await checkRateLimit('auth:login:account', identifier);

    expect((await checkRateLimit('auth:login:account', identifier)).allowed).toBe(false);
    expect((await checkRateLimit('review:user', identifier)).allowed).toBe(true);
  });

  it('clears a bucket on reset, so a user who mistyped is not left throttled', async () => {
    const identifier = `reset-${new ObjectId().toHexString()}`;

    for (let i = 0; i < 8; i += 1) await checkRateLimit('auth:login:account', identifier);
    expect((await checkRateLimit('auth:login:account', identifier)).allowed).toBe(false);

    await resetRateLimit('auth:login:account', identifier);
    expect((await checkRateLimit('auth:login:account', identifier)).allowed).toBe(true);
  });

  it('stores the identifier hashed, not in the clear', async () => {
    const email = `victim-${new ObjectId().toHexString()}@example.com`;
    await checkRateLimit('auth:login:account', email);

    const collection = await rateLimitsCollection();
    const documents = await collection.find({}).toArray();
    const serialised = JSON.stringify(documents);

    // An email address is personal data; it should not sit in a counters table.
    expect(serialised).not.toContain(email);
  });

  it('counts atomically under concurrency', async () => {
    const identifier = `race-${new ObjectId().toHexString()}`;

    // 20 simultaneous requests against a limit of 8. A read-then-write
    // implementation would let far more than 8 through.
    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkRateLimit('auth:login:account', identifier)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(8);
    expect(results.filter((r) => !r.allowed)).toHaveLength(12);
  });
});

describe('client IP attribution', () => {
  const headersWith = (entries: Record<string, string>): Headers => new Headers(entries);

  it('prefers headers the edge sets over ones the client can forge', () => {
    const headers = headersWith({
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-forwarded-for': '1.1.1.1, 203.0.113.9',
      'x-real-ip': '2.2.2.2',
    });
    expect(clientIp(headers)).toBe('203.0.113.9');
  });

  it('counts X-Forwarded-For from the right, so a client-supplied prefix is ignored', () => {
    // An attacker sends `X-Forwarded-For: 9.9.9.9` to fake their address; the
    // proxy appends the real one. Taking the leftmost entry would trust the lie.
    const headers = headersWith({ 'x-forwarded-for': '9.9.9.9, 203.0.113.9' });
    expect(clientIp(headers)).toBe('203.0.113.9');
  });

  it('rejects junk rather than turning it into a rate-limit key', () => {
    expect(clientIp(headersWith({ 'x-real-ip': 'not an ip' }))).toBe('unknown');
    expect(clientIp(headersWith({ 'x-real-ip': 'a'.repeat(500) }))).toBe('unknown');
    expect(clientIp(new Headers())).toBe('unknown');
  });

  it('falls back to a shared bucket, never a unique one', () => {
    // A unique fallback per request would silently disable rate limiting.
    expect(clientIp(new Headers())).toBe(clientIp(new Headers()));
  });
});

describe('password hashing', () => {
  it('honours every byte of a long passphrase', async () => {
    // bcrypt truncates at 72 bytes. Without the SHA-256 pre-hash these two
    // passwords would hash identically and either would unlock the account.
    const base = 'a'.repeat(72);
    const hash = await hashPassword(`${base}X`);

    expect(await verifyPassword(`${base}X`, hash)).toBe(true);
    expect(await verifyPassword(`${base}Y`, hash)).toBe(false);
  });

  it('produces a different hash for the same password each time', async () => {
    const [a, b] = await Promise.all([hashPassword('ValidPass123'), hashPassword('ValidPass123')]);
    expect(a).not.toBe(b); // per-password salt
    expect(await verifyPassword('ValidPass123', a)).toBe(true);
    expect(await verifyPassword('ValidPass123', b)).toBe(true);
  });

  it('uses a cost factor of at least 12', async () => {
    const hash = await hashPassword('ValidPass123');
    expect(Number(hash.split('$')[2])).toBeGreaterThanOrEqual(12);
  });

  it('treats a malformed stored hash as a wrong password, not an exception', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', '')).toBe(false);
  });

  it('ships a real bcrypt hash for the timing-equalisation path', async () => {
    // If this were a placeholder string, bcrypt.compare would return in ~0ms
    // and leak exactly the "no such account" signal it exists to hide.
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);

    const started = Date.now();
    expect(await verifyPassword('anything', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(Date.now() - started).toBeGreaterThan(20);
  });

  it('compares secrets without short-circuiting on length or content', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    // Different lengths must not throw -- the throw would itself be a signal.
    expect(safeEqual('short', 'a-much-longer-value')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('log redaction', () => {
  it('drops values under sensitive key names', () => {
    const redacted = loggerTesting.redact({
      email: 'user@example.com',
      password: 'hunter2',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
      resetToken: 'secret-token-value',
      sessionId: 'abc',
      quantity: 3,
    }) as Record<string, unknown>;

    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.passwordHash).toBe('[REDACTED]');
    expect(redacted.resetToken).toBe('[REDACTED]');
    expect(redacted.sessionId).toBe('[REDACTED]');
    // Non-sensitive fields survive, or the log would be useless.
    expect(redacted.quantity).toBe(3);
    expect(redacted.email).toBe('user@example.com');
  });

  it('scrubs secrets that arrive under an innocent key name', () => {
    const message = loggerTesting.scrubString(
      'connect failed for mongodb+srv://user:pass@cluster0.abc.mongodb.net/db',
    );
    expect(message).not.toContain('pass@');
    expect(message).toContain('[REDACTED]');
  });

  it('scrubs bearer tokens and provider keys from free text', () => {
    expect(loggerTesting.scrubString('Authorization: Bearer abcdefghijklmnop1234')).toContain(
      '[REDACTED]',
    );
    expect(loggerTesting.scrubString('used sk_live_abcdefgh12345678')).toContain('[REDACTED]');
  });
});
