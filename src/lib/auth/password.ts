import { createHash, timingSafeEqual } from 'node:crypto';

import bcrypt from 'bcryptjs';

import '@/lib/server-guard';

/**
 * Password hashing.
 *
 * Cost factor 12: roughly 250ms per hash on current server hardware. High
 * enough that an offline attacker with a leaked table gets a few thousand
 * guesses per second per core rather than billions, low enough that a login
 * request is not itself a denial-of-service lever.
 */
const BCRYPT_COST = 12;

/**
 * bcrypt silently truncates input at 72 bytes.
 *
 * That is a real weakness, not a curiosity: without handling it, the
 * passphrases "correct horse battery staple correct horse battery staple ..."
 * and the same string with a different 73rd character onward hash identically,
 * and a user who chose a long passphrase gets far less security than they think.
 *
 * The fix is the standard pre-hash construction: SHA-256 the password, base64
 * the digest (44 characters, comfortably under 72), then bcrypt that. Every
 * byte of the original password contributes to the result at any length.
 *
 * Base64 rather than hex because hex would be 64 characters of a 16-symbol
 * alphabet -- still under the limit, but with less entropy per byte fed to
 * bcrypt.
 */
function prehash(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('base64');
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('hashPassword: password must be a non-empty string');
  }
  return bcrypt.hash(prehash(password), BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== 'string' || typeof hash !== 'string' || hash.length === 0) {
    return false;
  }

  try {
    return await bcrypt.compare(prehash(password), hash);
  } catch {
    // A malformed hash in the database must read as "wrong password", never as
    // an exception that a caller might treat as success.
    return false;
  }
}

/**
 * A genuine cost-12 bcrypt hash of 32 random bytes that were discarded, so no
 * input can ever match it.
 *
 * Login compares against this when the email does not exist, making the "no
 * such account" path cost the same as "wrong password". Otherwise an attacker
 * enumerates registered addresses with a stopwatch.
 *
 * It has to be a *valid* hash. Measured on this machine:
 *   bcrypt.compare(x, <real hash>)  -> 239 ms
 *   bcrypt.compare(x, <malformed>)  ->   0 ms
 * A placeholder string would return instantly and leak exactly the signal this
 * constant exists to hide.
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$12$WR9scyvnEDSgM/pOKrqve.GVF3bUY93X7I73aX3tqEDnwbYRuLV4m';

/** Burns the same CPU as a real verification, then reports failure. */
export async function fakeVerifyPassword(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_PASSWORD_HASH);
  return false;
}

/**
 * True when a stored hash was produced with a weaker cost than we now require,
 * so it can be upgraded transparently on the user's next successful login.
 */
export function needsRehash(hash: string): boolean {
  const parts = hash.split('$');
  const cost = Number(parts[2]);
  return !Number.isInteger(cost) || cost < BCRYPT_COST;
}

/**
 * Constant-time string comparison for non-password secrets: CSRF tokens,
 * webhook signatures, session token hashes. `===` on strings short-circuits at
 * the first differing byte, which leaks the length of a correct prefix.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  // `timingSafeEqual` throws on length mismatch, and the throw itself is a
  // timing signal. Hash both sides to a fixed 32 bytes first, so the comparison
  // is always over equal-length buffers.
  const digestA = createHash('sha256').update(bufferA).digest();
  const digestB = createHash('sha256').update(bufferB).digest();

  return timingSafeEqual(digestA, digestB);
}
