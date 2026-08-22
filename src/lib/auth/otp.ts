import { createHmac, randomInt } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { safeEqual } from '@/lib/auth/password';
import { otpCodesCollection } from '@/lib/db/collections';
import { env } from '@/lib/env';
import type { OtpCodeDoc } from '@/models/security';

import type { Identifier } from './identifier';

import '@/lib/server-guard';

/**
 * One-time passwords.
 *
 * A six-digit numeric code, delivered by SMS or email, valid for ten minutes,
 * usable once. Three properties carry the security:
 *
 *  1. **HMAC at rest, not a hash.** The code space is a million values; a
 *     plain SHA-256 in a leaked database is reversed by a laptop in under a
 *     second. Keying the digest with `AUTH_SECRET` means the stored value is
 *     useless without the server's secret.
 *  2. **Bounded guessing.** Five wrong attempts destroy the code (and the
 *     verify endpoint is rate-limited on top). At five tries per code and one
 *     code per five minutes per identifier, brute force is not a strategy.
 *  3. **Atomic single use.** The successful path is a `findOneAndDelete` on
 *     the exact hash: two racing submissions of the right code cannot both
 *     succeed, and there is no window between "is it valid" and "consume it".
 *
 * Issuing a new code supersedes any outstanding one for the same identifier
 * and purpose, so "resend" never leaves two live codes in flight.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpPurpose = OtpCodeDoc['purpose'];

function hashCode(identifier: Identifier, purpose: OtpPurpose, code: string): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`${purpose}:${identifier.kind}:${identifier.value}:${code}`, 'utf8')
    .digest('hex');
}

function generateCode(): string {
  // randomInt is CSPRNG-backed and unbiased over the range.
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

export interface IssuedOtp {
  /** The raw code. Deliver it and forget it -- it is never stored. */
  code: string;
  expiresAt: Date;
}

export async function issueOtp(
  identifier: Identifier,
  purpose: OtpPurpose,
  pending?: OtpCodeDoc['pending'],
): Promise<IssuedOtp> {
  const codes = await otpCodesCollection();
  await codes.deleteMany({ identifier: identifier.value, purpose });

  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);

  await codes.insertOne({
    _id: new ObjectId(),
    identifier: identifier.value,
    kind: identifier.kind,
    purpose,
    codeHash: hashCode(identifier, purpose, code),
    attempts: 0,
    pending: pending ?? null,
    createdAt: now,
    expiresAt,
  });

  return { code, expiresAt };
}

export type VerifyOtpResult =
  | { ok: true; pending: OtpCodeDoc['pending'] }
  | { ok: false; reason: 'not-found' | 'expired' | 'too-many-attempts' | 'invalid' };

/**
 * Checks a code and, if it matches, consumes it.
 *
 * Every failure reason maps to the same user-facing message ("that code is not
 * valid"); the distinction exists for the audit log, where a burst of
 * `too-many-attempts` is worth seeing.
 */
export async function verifyOtp(
  identifier: Identifier,
  purpose: OtpPurpose,
  code: string,
): Promise<VerifyOtpResult> {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'invalid' };

  const codes = await otpCodesCollection();
  const now = new Date();
  const expected = hashCode(identifier, purpose, code);

  // Happy path first, atomically: delete the exact live record if it matches.
  const consumed = await codes.findOneAndDelete({
    identifier: identifier.value,
    purpose,
    codeHash: expected,
    expiresAt: { $gt: now },
    attempts: { $lt: OTP_MAX_ATTEMPTS },
  });
  if (consumed) return { ok: true, pending: consumed.pending ?? null };

  // Not consumed. Work out why -- and charge an attempt to the live code.
  const current = await codes.findOne({ identifier: identifier.value, purpose });
  if (!current) return { ok: false, reason: 'not-found' };

  if (current.expiresAt.getTime() <= now.getTime()) {
    await codes.deleteOne({ _id: current._id });
    return { ok: false, reason: 'expired' };
  }

  // Constant-time even here: the length is fixed, but the habit is cheap.
  const matched = safeEqual(current.codeHash, expected);
  const attempts = current.attempts + 1;

  if (matched && attempts <= OTP_MAX_ATTEMPTS) {
    // Matched but the atomic delete above lost a race with another correct
    // submission -- it has already been used.
    return { ok: false, reason: 'not-found' };
  }

  if (attempts >= OTP_MAX_ATTEMPTS) {
    await codes.deleteOne({ _id: current._id });
    return { ok: false, reason: 'too-many-attempts' };
  }

  await codes.updateOne({ _id: current._id }, { $set: { attempts } });
  return { ok: false, reason: 'invalid' };
}

/** Drops any outstanding code, e.g. once an account has been created. */
export async function discardOtp(identifier: Identifier, purpose: OtpPurpose): Promise<void> {
  const codes = await otpCodesCollection();
  await codes.deleteMany({ identifier: identifier.value, purpose });
}
