import type { ObjectId } from 'mongodb';

import type { AuditAction, UserRole } from './types';

/**
 * A session.
 *
 * The database stores `tokenHash`, never the token. The raw token exists only
 * in the user's cookie and in memory for the microseconds it takes to hash an
 * incoming request. A dump of this collection therefore yields nothing an
 * attacker can present as a session -- the same reasoning as password hashing,
 * applied to bearer credentials.
 *
 * SHA-256 (not bcrypt) is correct here: the token is 256 bits of CSPRNG output,
 * so there is no dictionary to attack and no reason to pay a work factor on
 * every single request.
 */
export interface SessionDoc {
  _id: ObjectId;
  /** SHA-256 of the raw session token, hex. Unique index. */
  tokenHash: string;
  userId: ObjectId;
  createdAt: Date;
  /** TTL index target: MongoDB deletes the row itself once this passes. */
  expiresAt: Date;
  lastUsedAt: Date;
  /** Coarse client fingerprint for the "your sessions" screen and for logs. */
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Single-use token, hashed at rest, short-lived.
 *
 * `usedAt` rather than immediate deletion so a replayed link can be recognised
 * as *used* (and logged) instead of merely *unknown*.
 */
export interface OneTimeTokenDoc {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
  /** Which email the link was sent to, to detect address changes mid-flow. */
  email: string;
}

export type PasswordResetTokenDoc = OneTimeTokenDoc;
export type EmailVerificationTokenDoc = OneTimeTokenDoc;

/**
 * A one-time password (OTP) sent to a mobile number or email address.
 *
 * Stored as an HMAC of the code keyed with the server secret, not a plain
 * hash: a six-digit code has only a million possibilities, so a plain SHA-256
 * in a leaked database is reversible in under a second. With the secret it is
 * not. `attempts` caps online guessing; the TTL index removes stale codes.
 */
export interface OtpCodeDoc {
  _id: ObjectId;
  /** Normalised identifier: lowercase email or E.164 phone. */
  identifier: string;
  kind: 'email' | 'phone';
  purpose: 'signin' | 'signup';
  codeHash: string;
  attempts: number;
  /** For sign-up: what the account will be created with once the code verifies. */
  pending?: { name: string; passwordHash: string | null } | null;
  createdAt: Date;
  /** TTL index target. */
  expiresAt: Date;
}

/**
 * Append-only record of security-sensitive actions.
 *
 * `metadata` is redacted before write (see `src/lib/security/audit.ts`) --
 * an audit log that contains a password reset token is a liability, not a
 * control.
 */
export interface AuditLogDoc {
  _id: ObjectId;
  action: AuditAction;
  actorId?: ObjectId | null;
  actorRole?: UserRole | null;
  /** e.g. 'product', 'order', 'user'. */
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogView {
  id: string;
  action: AuditAction;
  actorId: string | null;
  actorRole: UserRole | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function toAuditLogView(doc: AuditLogDoc): AuditLogView {
  return {
    id: doc._id.toHexString(),
    action: doc.action,
    actorId: doc.actorId ? doc.actorId.toHexString() : null,
    actorRole: doc.actorRole ?? null,
    targetType: doc.targetType ?? null,
    targetId: doc.targetId ?? null,
    ip: doc.ip ?? null,
    metadata: doc.metadata ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Distributed rate-limit counter.
 *
 * Lives in MongoDB rather than process memory because serverless deployments
 * run many isolated instances: an in-memory counter would let an attacker get
 * N times the allowance simply by being load-balanced across N instances. One
 * atomic `$inc` per request against a shared document is the correctness
 * requirement; Redis is the performance upgrade, not the security one.
 */
export interface RateLimitDoc {
  _id: ObjectId;
  /** `${bucket}:${identifier}:${windowStartEpoch}` -- unique index. */
  key: string;
  count: number;
  windowStart: Date;
  /** TTL index target. */
  expiresAt: Date;
}
