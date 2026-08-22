import 'server-only';

import { cookies, headers } from 'next/headers';

import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './constants';

/**
 * Reads the CSRF token for embedding in a form.
 *
 * Prefers the value the proxy put on the *request* headers over the one in the
 * cookie jar. On the first request of a session -- or right after sign-in --
 * the proxy is setting a new cookie on the response, so the cookie still
 * visible to this render is the stale one. Embedding that would produce a form
 * that fails verification exactly once, which reads to the user as a random
 * "your session expired" on their first action.
 */
export async function getCsrfToken(): Promise<string> {
  const requestHeaders = await headers();
  const fromProxy = requestHeaders.get(CSRF_HEADER_NAME);
  if (fromProxy) return fromProxy;

  const store = await cookies();
  return store.get(CSRF_COOKIE_NAME)?.value ?? '';
}
