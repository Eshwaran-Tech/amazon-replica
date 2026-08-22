/**
 * Shared auth constants.
 *
 * Deliberately dependency-free so `proxy.ts` (which runs at the network
 * boundary) and Client Components can both import it without pulling in the
 * database layer.
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * The `__Host-` prefix is a browser-enforced guarantee, not a convention:
 * a cookie carrying it is rejected unless it is Secure, Path=/, and has no
 * Domain attribute. That blocks a subdomain (or an attacker who controls one)
 * from overwriting our session cookie -- session fixation via cookie tossing.
 *
 * It requires Secure, so it cannot be used on http://localhost in development.
 */
export const SESSION_COOKIE_NAME = isProd ? '__Host-nk_session' : 'nk_session';
export const CSRF_COOKIE_NAME = isProd ? '__Host-nk_csrf' : 'nk_csrf';
/** Signed, HttpOnly state for the multi-step sign-in / sign-up flow. */
export const AUTH_FLOW_COOKIE_NAME = isProd ? '__Host-nk_auth_flow' : 'nk_auth_flow';

/** Header the client echoes the CSRF token back in (double-submit). */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Form field name used by Server Actions, which cannot set request headers. */
export const CSRF_FIELD_NAME = 'csrfToken';

/** Request header the proxy uses to hand the CSP nonce to the render. */
export const NONCE_HEADER_NAME = 'x-nonce';

/** Paths that require a signed-in user. Enforced again in the data layer. */
export const PROTECTED_PATH_PREFIXES = ['/account', '/orders', '/checkout', '/admin'] as const;

/** Paths that additionally require role === 'ADMIN'. */
export const ADMIN_PATH_PREFIXES = ['/admin'] as const;

/** Where an unauthenticated user is sent, with `?next=` carrying the target. */
export const LOGIN_PATH = '/auth/login';
