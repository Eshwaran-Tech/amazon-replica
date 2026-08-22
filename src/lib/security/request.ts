import '@/lib/server-guard';

/**
 * Client identification for rate limiting and audit logs.
 *
 * Getting this wrong is a real bypass: if the client IP is read from a header
 * the client controls, an attacker rotates `X-Forwarded-For` and every
 * per-IP rate limit becomes decorative.
 *
 * The order below is by trustworthiness:
 *
 *  1. `x-vercel-forwarded-for` -- set by Vercel's edge, which strips any
 *     client-supplied copy. Trustworthy when deployed there.
 *  2. `x-real-ip` -- the conventional single-value header a reverse proxy sets
 *     from the socket peer. Trustworthy when your proxy sets it.
 *  3. `x-forwarded-for` -- a comma-separated chain that the *client* can
 *     pre-populate. Only the entries appended by your own infrastructure are
 *     meaningful, so we count hops from the right.
 *
 * `TRUST_PROXY_HOPS` says how many proxies sit in front of the app. With the
 * default of 1, we take the last entry -- the address the nearest proxy
 * actually observed, which a client cannot forge by sending its own header.
 *
 * Behind no proxy at all, or a misconfigured one, IP attribution is
 * best-effort. That is why every sensitive limiter in this app is keyed on the
 * *account* as well as the IP: the account key cannot be rotated by header
 * manipulation.
 */

const TRUST_PROXY_HOPS = Math.max(1, Number(process.env.TRUST_PROXY_HOPS ?? '1') || 1);

/** Rejects garbage so a crafted header cannot become an unbounded rate-limit key. */
function normaliseIp(value: string | undefined | null): string | null {
  if (!value) return null;

  const candidate = value.trim().replace(/^\[|\]$/g, '');
  if (candidate.length === 0 || candidate.length > 45) return null;

  // IPv4, IPv4-mapped IPv6, or IPv6. Deliberately permissive on shape but
  // strict on charset -- this value becomes part of a database key.
  if (!/^[0-9a-fA-F:.]+$/.test(candidate)) return null;

  return candidate.toLowerCase();
}

export function clientIp(headers: Headers): string {
  const vercel = normaliseIp(headers.get('x-vercel-forwarded-for'));
  if (vercel) return vercel;

  const realIp = normaliseIp(headers.get('x-real-ip'));
  if (realIp) return realIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((entry) => normaliseIp(entry))
      .filter((entry): entry is string => entry !== null);

    // Count from the right: entries to the left may have been supplied by the
    // client, entries to the right were appended by infrastructure we control.
    const index = chain.length - TRUST_PROXY_HOPS;
    const chosen = chain[Math.max(0, index)];
    if (chosen) return chosen;
  }

  // No usable header. Returning a constant is deliberate: it degrades to a
  // shared bucket (stricter) rather than to a unique bucket per request, which
  // would disable rate limiting entirely.
  return 'unknown';
}

/** Truncated user agent, for session records and audit logs. */
export function clientUserAgent(headers: Headers): string | null {
  const value = headers.get('user-agent');
  if (!value) return null;
  return value.slice(0, 256);
}
