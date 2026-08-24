/**
 * Origin validation -- the first of two CSRF layers.
 *
 * A cross-site form POST cannot forge the `Origin` header: the browser sets it
 * and script cannot override it. So for any state-changing request we require
 * the origin to be one we recognise. The second layer (a signed double-submit
 * token, see `src/lib/security/csrf.ts`) covers the cases this one cannot --
 * chiefly requests where the browser omits `Origin`.
 *
 * Pure functions only; `proxy.ts` imports this.
 */

/** Methods that can change server state and therefore need CSRF defence. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isStateChangingMethod(method: string): boolean {
  return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

/**
 * Extracts the origin (scheme://host[:port]) from a URL string.
 * Returns null for anything unparseable rather than throwing.
 */
function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export interface AllowedOriginOptions {
  /** Canonical origin from NEXT_PUBLIC_APP_URL. */
  appUrl: string;
  /** Request `Host` header, only trusted in development. */
  host?: string | null;
  /**
   * Additional origins this same deployment is served on, supplied by the
   * hosting platform rather than by the request. See `checkRequestOrigin`.
   */
  extraOrigins?: readonly string[];
  isDev: boolean;
}

/**
 * The set of origins we accept mutations from.
 *
 * In production this is the configured app URL plus any `extraOrigins` the
 * platform reports for this same deployment. The `Host` header is
 * attacker-controllable in some proxy setups, so trusting it in production
 * would let `Host: evil.com` + `Origin: https://evil.com` satisfy its own
 * check. In development we do trust it, because localhost is reached under
 * several names (localhost, 127.0.0.1, a LAN IP for device testing).
 *
 * `extraOrigins` is a different case from `host`, and safe for the same reason
 * `host` is not: it comes from the deployment's own environment, which the
 * request cannot influence. It exists because a host serves one site under
 * several names -- on Vercel a project answers on its production alias, its
 * per-deployment URL and its branch URL at once -- and a single configured
 * origin makes every mutation from the other names fail closed.
 */
export function allowedOrigins({
  appUrl,
  host,
  extraOrigins,
  isDev,
}: AllowedOriginOptions): Set<string> {
  const origins = new Set<string>();

  const canonical = originOf(appUrl);
  if (canonical) origins.add(canonical);

  for (const extra of extraOrigins ?? []) {
    const parsed = originOf(extra);
    if (parsed) origins.add(parsed);
  }

  if (isDev && host) {
    origins.add(`http://${host}`);
    origins.add(`https://${host}`);
  }

  return origins;
}

export interface OriginCheckInput {
  method: string;
  origin: string | null;
  referer: string | null;
  host: string | null;
  appUrl: string;
  extraOrigins?: readonly string[];
  isDev: boolean;
}

export type OriginCheckResult =
  | { ok: true }
  | { ok: false; reason: 'missing-origin' | 'untrusted-origin' };

/**
 * Note the fail-closed default: a state-changing request with neither `Origin`
 * nor `Referer` is rejected. Every browser released in the last decade sends
 * `Origin` on cross-origin POSTs, so the practical cost is nil and the
 * alternative ("allow when we cannot tell") is how CSRF filters get bypassed.
 */
export function checkRequestOrigin(input: OriginCheckInput): OriginCheckResult {
  if (!isStateChangingMethod(input.method)) {
    return { ok: true };
  }

  const allowed = allowedOrigins({
    appUrl: input.appUrl,
    host: input.host,
    extraOrigins: input.extraOrigins,
    isDev: input.isDev,
  });

  // `Origin: null` is sent by sandboxed iframes and some redirects; treat the
  // literal string as absent rather than as a value to compare.
  const rawOrigin = input.origin === 'null' ? null : input.origin;
  const candidate = originOf(rawOrigin) ?? originOf(input.referer);

  if (!candidate) {
    return { ok: false, reason: 'missing-origin' };
  }

  if (!allowed.has(candidate)) {
    return { ok: false, reason: 'untrusted-origin' };
  }

  return { ok: true };
}
