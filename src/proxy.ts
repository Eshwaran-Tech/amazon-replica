import { NextResponse, type NextRequest } from 'next/server';

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  LOGIN_PATH,
  NONCE_HEADER_NAME,
  PROTECTED_PATH_PREFIXES,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/constants';
import { buildContentSecurityPolicy, generateNonce } from '@/lib/security/csp';
import { csrfSubject, generateCsrfToken, verifyCsrfTokenSignature } from '@/lib/security/csrf';
import { checkRequestOrigin } from '@/lib/security/origin';

/**
 * Network-boundary request filter. (Next.js 16 renamed `middleware.ts` to
 * `proxy.ts`; it runs on the Node.js runtime by default.)
 *
 * This layer does three things, all of them cheap and none of them the final
 * word on anything:
 *
 *   1. Mints a per-request CSP nonce and attaches the policy.
 *   2. Rejects state-changing requests from a foreign origin (CSRF layer 1).
 *   3. Bounces anonymous visitors away from protected sections.
 *
 * (3) is a *user-experience* redirect, not an authorisation control. It checks
 * only that a session cookie is present -- it does not validate it. The Next.js
 * docs are explicit that a matcher change can silently drop proxy coverage for
 * a Server Function, so every page, action and route handler re-derives the
 * session and re-checks the role from the database. Deleting this file should
 * cost the app nice redirects, not its security.
 *
 * Reading `process.env` directly (rather than the Zod-validated `env()`) keeps
 * the proxy bundle free of the database and validation layers.
 */

const isDev = process.env.NODE_ENV !== 'production';

/** Blank is not a configured value; `??` alone would accept `''` as an origin. */
function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

const APP_URL = configured(process.env.NEXT_PUBLIC_APP_URL) ?? 'http://localhost:3000';

/**
 * The other names this same deployment answers to.
 *
 * Vercel serves a project on its production alias, on a unique per-deployment
 * URL and on a branch URL simultaneously. `NEXT_PUBLIC_APP_URL` names only one
 * of them, so without this every mutation performed from any other name is
 * rejected as `untrusted-origin` -- sign-in, add-to-cart, checkout, all of it,
 * with nothing in the UI to explain why.
 *
 * These come from the deployment's environment, never from the request, which
 * is what separates them from the `Host` header the check deliberately
 * distrusts in production.
 */
const PLATFORM_ORIGINS = [
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
  process.env.NEXT_PUBLIC_VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
]
  .map(configured)
  .filter((host): host is string => host !== null)
  .map((host) => `https://${host}`);

const PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'mock';

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev,
    paymentProvider: PAYMENT_PROVIDER,
  });

  // --- 0. Provider webhooks --------------------------------------------------
  // Payment webhooks are server-to-server POSTs: they carry no Origin or
  // Referer header, so the browser-origin check below would reject every
  // legitimate delivery. The exemption is safe because the webhook route
  // authenticates each request cryptographically (HMAC over the raw body,
  // verified before parsing) and never reads cookies -- there is no ambient
  // credential for a cross-site request to ride on, which is the attack the
  // origin check exists to stop.
  if (pathname === '/api/payments/webhook') {
    const webhookResponse = NextResponse.next();
    webhookResponse.headers.set('Content-Security-Policy', csp);
    webhookResponse.headers.set('Cache-Control', 'no-store');
    return webhookResponse;
  }

  // --- 1. Cross-origin state change -----------------------------------------
  // Runs before anything else so a forged POST is rejected without touching
  // routing or the database.
  const originCheck = checkRequestOrigin({
    method: request.method,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    host: request.headers.get('host'),
    appUrl: APP_URL,
    extraOrigins: PLATFORM_ORIGINS,
    isDev,
  });

  if (!originCheck.ok) {
    const rejected = NextResponse.json(
      {
        ok: false,
        error: { code: 'CSRF_ORIGIN_REJECTED', message: 'Request origin is not allowed.' },
      },
      { status: 403 },
    );
    rejected.headers.set('Content-Security-Policy', csp);
    rejected.headers.set('Cache-Control', 'no-store');
    return rejected;
  }

  // --- 2. Anonymous visitor on a protected path ------------------------------
  // Cookie *presence* only. Validity is decided server-side by `requireUser()`.
  if (isProtectedPath(pathname) && !request.cookies.has(SESSION_COOKIE_NAME)) {
    const loginUrl = new URL(LOGIN_PATH, request.nextUrl.origin);
    // Same-origin by construction: we pass a path, and `safeRedirectPath`
    // re-validates it on the way back out of the login page.
    loginUrl.searchParams.set('next', `${pathname}${search}`);

    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set('Content-Security-Policy', csp);
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  }

  // --- 3. CSRF cookie lifecycle ----------------------------------------------
  // The proxy owns this cookie because a Server Component can read cookies but
  // cannot set them -- so a page rendering a form has no way to mint a token
  // for itself. Issuing it here means every form has a valid token available on
  // first paint, with no extra round trip.
  //
  // The token is re-minted whenever it does not verify against the *current*
  // session cookie. That covers sign-in and sign-out, where the session changes
  // and a token bound to the previous one must stop being accepted.
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const subject = csrfSubject(sessionToken);

  const existingCsrf = request.cookies.get(CSRF_COOKIE_NAME)?.value ?? null;
  const csrfIsValid = existingCsrf !== null && verifyCsrfTokenSignature(existingCsrf, subject);
  const csrfToken = csrfIsValid && existingCsrf ? existingCsrf : generateCsrfToken(subject);

  // --- 4. Normal request -----------------------------------------------------
  // Next.js parses the nonce out of the CSP header on the request and applies
  // it to framework and page scripts automatically. `x-nonce` is for our own
  // components (JSON-LD) to read via `headers()`.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER_NAME, nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // Hand the render the token, so a form can embed the value that is being set
  // on this very response rather than the stale one still in the request.
  requestHeaders.set(CSRF_HEADER_NAME, csrfToken);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  if (!csrfIsValid) {
    // Readable by script on purpose: the double-submit pattern needs the client
    // to echo it back. It is not a credential -- on its own it authorises
    // nothing, and it is bound to the session by an HMAC the client cannot forge.
    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      secure: !isDev,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, which are covered by the static headers
     * in `next.config.ts` and need no nonce.
     *
     * `/api` is deliberately *included*: that is where the state-changing
     * requests are, and the origin check above is their first line of defence.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf)$).*)',
  ],
};
