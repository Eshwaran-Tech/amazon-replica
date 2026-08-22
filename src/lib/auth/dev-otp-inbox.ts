import { isProduction } from '@/lib/env';

import '@/lib/server-guard';

/**
 * A development-only view of the last OTP sent to an address.
 *
 * Why this exists: the raw code is never stored. `otp.ts` keeps only an HMAC
 * keyed with `AUTH_SECRET`, precisely so a leaked database does not hand over
 * a million-value code space -- and that property is worth keeping. So the
 * code cannot be read back out of MongoDB, and this buffer captures it on the
 * way past instead: in memory, in this process, never written anywhere.
 *
 * **Showing a one-time password to whoever asks for it is account takeover.**
 * Anyone who can see the code for an address can complete sign-in as its
 * owner, so this is refused outright when `NODE_ENV=production`, and the
 * refusal is here in the store rather than left to each caller to remember.
 * `next start` sets NODE_ENV=production, so a real deployment cannot switch it
 * on by mistake.
 *
 * Entries are dropped once used or expired, and the map is capped, so a long
 * development session cannot grow it without bound.
 */

interface DevOtpEntry {
  code: string;
  expiresAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 50;

const inbox = new Map<string, DevOtpEntry>();

/** Normalised so "Ramesh21@Gmail.com" and "ramesh21@gmail.com" are one key. */
function keyFor(recipient: string): string {
  return recipient.trim().toLowerCase();
}

function prune(now: number): void {
  for (const [key, entry] of inbox) {
    if (entry.expiresAt <= now) inbox.delete(key);
  }
  // Oldest-first eviction if it is still over the cap.
  while (inbox.size > MAX_ENTRIES) {
    const oldest = inbox.keys().next();
    if (oldest.done) break;
    inbox.delete(oldest.value);
  }
}

/** Records a code. A no-op in production. */
export function rememberDevOtp(recipient: string, code: string): void {
  if (isProduction()) return;

  const now = Date.now();
  prune(now);
  inbox.set(keyFor(recipient), { code, expiresAt: now + TTL_MS });
}

/** The current code for an address, or null. Always null in production. */
export function peekDevOtp(recipient: string): string | null {
  if (isProduction()) return null;

  const now = Date.now();
  prune(now);

  const entry = inbox.get(keyFor(recipient));
  return entry && entry.expiresAt > now ? entry.code : null;
}

/** Drops a code once it has been used, so a stale one is never shown. */
export function forgetDevOtp(recipient: string): void {
  inbox.delete(keyFor(recipient));
}

/** Whether the on-screen helper may render at all. */
export function devOtpAvailable(): boolean {
  return !isProduction();
}
