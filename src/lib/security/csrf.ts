import { createHash, createHmac, randomBytes } from 'node:crypto';

import { safeEqual } from '@/lib/auth/password';
import { env } from '@/lib/env';

import '@/lib/server-guard';

/**
 * CSRF tokens -- the second of two layers.
 *
 * Layer one is the `Origin` check in `src/proxy.ts`, which a cross-site form
 * POST cannot forge. This layer covers what that one cannot: requests where the
 * browser omits `Origin`, and any deployment where a proxy rewrites it.
 *
 * The scheme is a *signed* double-submit token:
 *
 *     token = <random>.<HMAC-SHA256(AUTH_SECRET, random + ":" + subject)>
 *
 * The token goes in a readable cookie and is echoed back in a header (fetch) or
 * a hidden form field (Server Actions, which cannot set headers). Both copies
 * must be present, identical, and carry a signature that verifies.
 *
 * **Why signed rather than plain random double-submit.** An attacker who can
 * set a cookie on our domain -- via a subdomain takeover, or an unrelated app
 * on a sibling host -- can otherwise plant a value they know and submit it in
 * both places, and a plain comparison passes. Signing binds the token to our
 * secret, so a planted cookie fails.
 *
 * **Why the subject is derived from the session *cookie*, not the session id.**
 * The proxy issues this cookie and must be able to compute the same subject
 * without a database round trip on every request. Hashing the session token
 * gives both sides the same value from data they already hold, and still binds
 * the CSRF token to one specific session: a token minted for session A fails
 * against session B, so one lifted from another account is useless.
 */

const RANDOM_BYTES = 24;
const ANONYMOUS_SUBJECT = 'anonymous';

/**
 * Derives the binding subject from the raw session cookie.
 *
 * Hashed, never the raw token: this value is not secret in the way the session
 * token is, and it must not become a second place the session token exists.
 */
export function csrfSubject(sessionToken: string | null | undefined): string {
  if (!sessionToken) return ANONYMOUS_SUBJECT;
  return createHash('sha256').update(sessionToken, 'utf8').digest('base64url').slice(0, 32);
}

function sign(random: string, subject: string): string {
  return createHmac('sha256', env().AUTH_SECRET)
    .update(`${random}:${subject}`, 'utf8')
    .digest('base64url');
}

/** Mints a token bound to a subject from `csrfSubject`. */
export function generateCsrfToken(subject: string): string {
  const random = randomBytes(RANDOM_BYTES).toString('base64url');
  return `${random}.${sign(random, subject)}`;
}

/** True when the token's signature verifies for this subject. */
export function verifyCsrfTokenSignature(token: string, subject: string): boolean {
  if (typeof token !== 'string' || token.length < 16 || token.length > 512) return false;

  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const random = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (random.length === 0 || signature.length === 0) return false;

  // Constant-time: `===` would leak how much of a forged signature is correct.
  return safeEqual(signature, sign(random, subject));
}

export type CsrfFailure = 'missing-cookie' | 'missing-token' | 'mismatch' | 'bad-signature';

export type CsrfResult = { ok: true } | { ok: false; reason: CsrfFailure };

/**
 * Full double-submit check.
 *
 * All four outcomes are rejections; the distinct reasons exist for logging, so
 * a spike of `bad-signature` (an attempted forgery) can be told apart from a
 * spike of `missing-cookie` (usually a stale open tab).
 */
export function verifyCsrf(
  cookieToken: string | undefined | null,
  submittedToken: string | undefined | null,
  subject: string,
): CsrfResult {
  if (!cookieToken) return { ok: false, reason: 'missing-cookie' };
  if (!submittedToken) return { ok: false, reason: 'missing-token' };

  if (!safeEqual(cookieToken, submittedToken)) {
    return { ok: false, reason: 'mismatch' };
  }

  if (!verifyCsrfTokenSignature(cookieToken, subject)) {
    return { ok: false, reason: 'bad-signature' };
  }

  return { ok: true };
}
