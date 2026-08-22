import { createHash, randomBytes } from 'node:crypto';

import { ObjectId, type Collection } from 'mongodb';

import {
  emailVerificationTokensCollection,
  passwordResetTokensCollection,
} from '@/lib/db/collections';
import type { OneTimeTokenDoc } from '@/models/security';

import '@/lib/server-guard';

/**
 * Single-use tokens for password reset and email verification.
 *
 * Same discipline as sessions: the database stores `sha256(token)` and never
 * the token itself. A reset token is a temporary password -- anyone holding one
 * can take over the account -- so a leaked database backup, or an admin
 * browsing the collection, must not yield a usable link.
 *
 * Tokens are consumed atomically. `findOneAndUpdate` with `usedAt: null` in the
 * filter means two concurrent requests with the same token cannot both succeed:
 * exactly one wins the write, the other sees no match. Without that, a
 * double-clicked reset link is a race, and a stolen link could be replayed.
 *
 * `usedAt` is set rather than the row deleted, so a replayed link is
 * recognisable as *used* (worth logging) rather than merely unknown.
 */

const TOKEN_BYTES = 32;

/** Password resets are the higher-value target, so they live briefly. */
export const PASSWORD_RESET_TTL_MINUTES = 30;
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

export type TokenPurpose = 'password-reset' | 'email-verification';

async function collectionFor(purpose: TokenPurpose): Promise<Collection<OneTimeTokenDoc>> {
  return purpose === 'password-reset'
    ? passwordResetTokensCollection()
    : emailVerificationTokensCollection();
}

export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface IssuedToken {
  /** Raw token. Goes in the emailed link and nowhere else. */
  token: string;
  expiresAt: Date;
}

/**
 * Issues a token, invalidating any previous unused one for the same user.
 *
 * Superseding matters: without it, requesting three reset emails leaves three
 * live tokens, and the oldest -- possibly sitting in a mail archive or a
 * forwarded message -- stays valid for its full lifetime.
 */
export async function issueOneTimeToken(
  purpose: TokenPurpose,
  userId: ObjectId,
  email: string,
): Promise<IssuedToken> {
  const collection = await collectionFor(purpose);

  await collection.deleteMany({ userId, usedAt: null });

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const now = new Date();
  const ttlMs =
    purpose === 'password-reset'
      ? PASSWORD_RESET_TTL_MINUTES * 60_000
      : EMAIL_VERIFICATION_TTL_HOURS * 3_600_000;

  const expiresAt = new Date(now.getTime() + ttlMs);

  await collection.insertOne({
    _id: new ObjectId(),
    tokenHash: hashOneTimeToken(token),
    userId,
    email: email.toLowerCase(),
    createdAt: now,
    expiresAt,
    usedAt: null,
  });

  return { token, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: ObjectId; email: string }
  | { ok: false; reason: 'not-found' | 'expired' | 'already-used' };

/**
 * Atomically consumes a token.
 *
 * The `usedAt: null` guard inside the filter is what makes this safe under
 * concurrency -- the check and the write are one operation, so there is no
 * window between "is it unused?" and "mark it used".
 */
export async function consumeOneTimeToken(
  purpose: TokenPurpose,
  token: string,
): Promise<ConsumeResult> {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    return { ok: false, reason: 'not-found' };
  }

  const collection = await collectionFor(purpose);
  const tokenHash = hashOneTimeToken(token);
  const now = new Date();

  const claimed = await collection.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { returnDocument: 'after' },
  );

  if (claimed) {
    return { ok: true, userId: claimed.userId, email: claimed.email };
  }

  // Nothing was claimed. Distinguish why, for logging -- a burst of
  // `already-used` is a replay attempt worth noticing.
  const existing = await collection.findOne({ tokenHash });

  if (!existing) return { ok: false, reason: 'not-found' };
  if (existing.usedAt) return { ok: false, reason: 'already-used' };
  return { ok: false, reason: 'expired' };
}

/** Invalidates every outstanding token for a user, e.g. after a password change. */
export async function invalidateTokensForUser(
  purpose: TokenPurpose,
  userId: ObjectId,
): Promise<void> {
  const collection = await collectionFor(purpose);
  await collection.deleteMany({ userId });
}
