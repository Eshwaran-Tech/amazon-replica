import 'server-only';

import { createHmac } from 'node:crypto';

import { cookies } from 'next/headers';

import { safeEqual } from '@/lib/auth/password';
import { env } from '@/lib/env';

import { AUTH_FLOW_COOKIE_NAME } from './constants';
import type { Identifier } from './identifier';

/**
 * The multi-step sign-in / sign-up flow needs to remember which identifier the
 * visitor typed on step one while they are on steps two and three.
 *
 * That state travels in a short-lived, HttpOnly, HMAC-signed cookie -- not in
 * the URL, where an email address or phone number would land in browser
 * history, proxy logs and `Referer` headers, and not in the database, which
 * would turn every visitor who types an identifier into a write.
 *
 * Nothing secret goes in here: no password, no session token. It is only the
 * shape of the conversation so far. The signature stops the client from editing
 * it (e.g. flipping `exists` or swapping the identifier after the server
 * checked it); the expiry bounds how long a half-finished flow lingers.
 *
 * The one exception is `demoOtp`, and only when DEMO_SHOW_OTP=true -- see the
 * note on the field.
 */

const FLOW_TTL_SECONDS = 15 * 60;
const isProduction = process.env.NODE_ENV === 'production';

export interface AuthFlow {
  identifier: Identifier;
  /** Whether an account exists for the identifier (decided server-side). */
  exists: boolean;
  /** For existing accounts: whether a password sign-in is possible at all. */
  hasPassword: boolean;
  /** Sign-up details collected so far. */
  name?: string;
  /** Whether a code has been sent in this flow (drives "resend" copy). */
  otpSent?: boolean;
  /**
   * The one-time password, in clear, for DEMO_SHOW_OTP deployments only.
   *
   * This cookie is the right carrier for it and the database is not: it is
   * HttpOnly, signed, expires in fifteen minutes, and above all it exists only
   * in the browser that asked for the code. The server keeps nothing -- the
   * `otpCodes` document still stores an HMAC and nothing else -- so enabling
   * the demo view never turns a database dump into a pile of live codes.
   *
   * It also has to be here rather than in a module-level cache, because the
   * action that sends the code and the request that renders the verify page are
   * two separate serverless invocations that need not share a process.
   */
  demoOtp?: string;
  /** Where to go after sign-in, already validated by `safeRedirectPath`. */
  next?: string;
  /** Issued-at, epoch seconds. */
  iat: number;
}

function sign(payload: string): string {
  return createHmac('sha256', env().AUTH_SECRET).update(payload, 'utf8').digest('base64url');
}

export async function setAuthFlow(flow: Omit<AuthFlow, 'iat'>): Promise<void> {
  const payload = Buffer.from(
    JSON.stringify({ ...flow, iat: Math.floor(Date.now() / 1000) } satisfies AuthFlow),
    'utf8',
  ).toString('base64url');

  const store = await cookies();
  store.set(AUTH_FLOW_COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: FLOW_TTL_SECONDS,
  });
}

/** Reads and verifies the flow cookie; null when absent, tampered or stale. */
export async function readAuthFlow(): Promise<AuthFlow | null> {
  const store = await cookies();
  const raw = store.get(AUTH_FLOW_COOKIE_NAME)?.value;
  if (!raw || raw.length > 2048) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;
  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AuthFlow;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.identifier ||
      (parsed.identifier.kind !== 'email' && parsed.identifier.kind !== 'phone') ||
      typeof parsed.identifier.value !== 'string' ||
      typeof parsed.iat !== 'number'
    ) {
      return null;
    }
    if (Math.floor(Date.now() / 1000) - parsed.iat > FLOW_TTL_SECONDS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearAuthFlow(): Promise<void> {
  const store = await cookies();
  store.set(AUTH_FLOW_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
