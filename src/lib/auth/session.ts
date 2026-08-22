import { createHash, randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { sessionsCollection, usersCollection } from '@/lib/db/collections';
import { env } from '@/lib/env';
import type { SessionDoc } from '@/models/security';
import type { UserDoc } from '@/models/user';

import '@/lib/server-guard';

/**
 * Session management.
 *
 * Opaque database-backed sessions, not JWTs. The deciding factor is
 * revocation: a JWT stays valid until it expires, so "change my password and
 * sign out my other devices" cannot be honoured. Here, a session is a row --
 * deleting it ends the session immediately, everywhere.
 *
 * The database stores only `sha256(token)`. The usable token exists in the
 * user's cookie and, for microseconds, in memory. A dump of the `sessions`
 * collection yields nothing an attacker can present -- the same reasoning as
 * password hashing, applied to a bearer credential.
 *
 * SHA-256 rather than bcrypt is correct for this: the token is 256 bits of
 * CSPRNG output, so there is no dictionary to attack, and paying a bcrypt work
 * factor on every single request would be a self-inflicted denial of service.
 */

/** 32 bytes = 256 bits. Guessing is not a viable attack at this size. */
const TOKEN_BYTES = 32;

/**
 * Sliding expiry: once a session is more than halfway through its life, a
 * request extends it. Active users stay signed in; abandoned sessions still
 * expire on schedule, and the TTL index removes them without a cron job.
 */
const REFRESH_THRESHOLD_RATIO = 0.5;

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserDoc['role'];
  emailVerified: boolean;
  phoneVerified: boolean;
  /**
   * The gate for placing orders and writing reviews: the account has proved
   * control of at least one contact channel (email link/OTP, or mobile OTP).
   */
  verified: boolean;
  /** False for accounts that sign in with a one-time code only. */
  hasPassword: boolean;
}

export interface ResolvedSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
}

export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Tokens are looked up by hash, so this is also the index key. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface CreateSessionInput {
  userId: ObjectId;
  ip?: string | null;
  userAgent?: string | null;
}

/** Creates a session and returns the raw token. Store it in the cookie only. */
export async function createSession(
  input: CreateSessionInput,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env().SESSION_MAX_AGE_SECONDS * 1000);

  const sessions = await sessionsCollection();
  await sessions.insertOne({
    _id: new ObjectId(),
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    createdAt: now,
    expiresAt,
    lastUsedAt: now,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });

  return { token, expiresAt };
}

/**
 * Resolves a raw token to a user, or null.
 *
 * Every check here is a reason a *previously valid* session must stop working:
 *
 *  - expired            -- TTL index also removes it, but never trust the
 *                          sweeper's timing for an authorisation decision
 *  - user deleted       -- orphaned session
 *  - user disabled      -- a ban must take effect on the next request, not at
 *                          the next login
 *  - password changed   -- `passwordChangedAt` after the session was created
 *                          means this session predates the change and belongs
 *                          to whoever knew the old password
 *
 * That last one is what makes "changing your password signs out other devices"
 * true without a bulk delete that could race with an in-flight request.
 */
export async function resolveSession(token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token || token.length < 16 || token.length > 128) return null;

  const sessions = await sessionsCollection();
  const session = await sessions.findOne({ tokenHash: hashSessionToken(token) });
  if (!session) return null;

  const now = new Date();

  if (session.expiresAt.getTime() <= now.getTime()) {
    await sessions.deleteOne({ _id: session._id });
    return null;
  }

  const users = await usersCollection();
  const user = await users.findOne({ _id: session.userId });

  if (!user || user.isDisabled) {
    await sessions.deleteOne({ _id: session._id });
    return null;
  }

  if (user.passwordChangedAt.getTime() > session.createdAt.getTime()) {
    await sessions.deleteOne({ _id: session._id });
    return null;
  }

  await touchSession(session, now);

  // Accounts written before mobile sign-in existed lack the newer fields;
  // defaults here keep them signing in exactly as before.
  const phoneVerified = user.phoneVerified ?? false;

  return {
    sessionId: session._id.toHexString(),
    user: {
      id: user._id.toHexString(),
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified,
      verified: user.emailVerified || phoneVerified,
      hasPassword: user.hasPassword ?? true,
    },
    expiresAt: session.expiresAt,
  };
}

/** Updates `lastUsedAt`, and extends expiry once past the halfway mark. */
async function touchSession(session: SessionDoc, now: Date): Promise<void> {
  const lifetimeMs = env().SESSION_MAX_AGE_SECONDS * 1000;
  const elapsed = now.getTime() - session.createdAt.getTime();

  const sessions = await sessionsCollection();

  if (elapsed > lifetimeMs * REFRESH_THRESHOLD_RATIO) {
    await sessions.updateOne(
      { _id: session._id },
      { $set: { lastUsedAt: now, expiresAt: new Date(now.getTime() + lifetimeMs) } },
    );
    return;
  }

  // Cheap path: one field, no expiry rewrite.
  await sessions.updateOne({ _id: session._id }, { $set: { lastUsedAt: now } });
}

/** Ends one session (logout). */
export async function revokeSession(token: string): Promise<void> {
  const sessions = await sessionsCollection();
  await sessions.deleteOne({ tokenHash: hashSessionToken(token) });
}

/**
 * Ends every session for a user.
 *
 * Called on password change, password reset, role change and account
 * disable -- all of which are moments where any existing session may belong to
 * an attacker rather than the owner.
 */
export async function revokeAllSessionsForUser(userId: ObjectId): Promise<number> {
  const sessions = await sessionsCollection();
  const result = await sessions.deleteMany({ userId });
  return result.deletedCount;
}

/** Ends every session for a user except the one making the request. */
export async function revokeOtherSessionsForUser(
  userId: ObjectId,
  keepSessionId: string,
): Promise<number> {
  const sessions = await sessionsCollection();
  const result = await sessions.deleteMany({
    userId,
    _id: { $ne: new ObjectId(keepSessionId) },
  });
  return result.deletedCount;
}

/** Active sessions, for the account security screen. Never exposes the hash. */
export async function listSessionsForUser(
  userId: ObjectId,
): Promise<Array<{ id: string; createdAt: Date; lastUsedAt: Date; ip: string | null; userAgent: string | null }>> {
  const sessions = await sessionsCollection();
  const docs = await sessions.find({ userId }).sort({ lastUsedAt: -1 }).limit(20).toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt,
    ip: doc.ip ?? null,
    userAgent: doc.userAgent ?? null,
  }));
}
