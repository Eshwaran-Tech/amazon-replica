import 'server-only';

import { cookies } from 'next/headers';

import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from './constants';

/**
 * Cookie handling for the session and CSRF tokens.
 *
 * `cookies()` is writable only inside a Server Action or a Route Handler.
 * Server Components get a read-only view, which is why sign-in and sign-out
 * live in actions and handlers rather than in a page.
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Session cookie attributes.
 *
 * - `httpOnly`  script cannot read it, so an XSS bug cannot exfiltrate the
 *               session. This is why the token is not in localStorage.
 * - `secure`    in production; the `__Host-` prefix requires it, and without
 *               TLS the cookie travels in clear text.
 * - `sameSite: 'lax'`
 *               the browser withholds this cookie on cross-site POSTs, which is
 *               the first CSRF layer. `strict` would break the common case of
 *               following a link from an email into a signed-in page.
 * - `path: '/'` required by the `__Host-` prefix.
 * - no `domain` also required by `__Host-`; it is what stops a compromised
 *               subdomain from overwriting our session cookie.
 */
function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(expiresAt));
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // Overwrite with an expired empty value rather than only calling delete, so
  // the browser is told unambiguously to drop it.
  store.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/**
 * CSRF cookie.
 *
 * Deliberately **not** `httpOnly`: the double-submit pattern requires client
 * script to read this value and echo it back in a header. That is safe because
 * the token is not a credential -- on its own it authorises nothing, and it is
 * bound to the session by an HMAC the client cannot compute.
 */
export async function setCsrfCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function readCsrfCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(CSRF_COOKIE_NAME)?.value;
}

export async function clearCsrfCookie(): Promise<void> {
  const store = await cookies();
  store.set(CSRF_COOKIE_NAME, '', {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
