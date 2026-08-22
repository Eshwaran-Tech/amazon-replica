/**
 * Open-redirect protection.
 *
 * The login flow carries a `?next=` parameter so the user lands back where they
 * were. That parameter is fully attacker-controlled, and a phishing link like
 *
 *   https://our-shop.example/auth/login?next=https://our-shop.evil/login
 *
 * is credible precisely because the visible domain is ours. So `next` is never
 * used as given -- it is run through `safeRedirectPath`, which returns a
 * relative in-app path or the fallback, and nothing else.
 */

const DEFAULT_FALLBACK = '/';

/** Cannot start with '/', so it can never be mistaken for a valid result. */
const REJECTED = '!rejected!';

/**
 * C0 controls, DEL, and C1 controls. Written as a codepoint scan rather than a
 * regex character class so the source stays plain ASCII and reviewable.
 * CR and LF here would mean HTTP response splitting or log injection.
 */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Returns a safe, same-origin, absolute-path redirect target.
 *
 * Rejected, in order:
 *  - control characters (header and log injection)
 *  - anything not starting with a single `/`
 *  - protocol-relative URLs (`//evil.com` -- a classic filter bypass)
 *  - backslash variants (`/\evil.com`, `\\evil.com`) which some browsers
 *    normalise to `//`
 *  - a scheme smuggled into the first path segment
 *
 * Absolute URLs (`https://evil`, `javascript:`, `data:`) fail the leading-slash
 * test, so they are covered by the same rule.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (typeof candidate !== 'string') return fallback;

  const value = candidate.trim();
  if (value.length === 0 || value.length > 512) return fallback;

  if (hasControlCharacters(value)) return fallback;

  // Normalise backslashes before the structural checks so `/\evil.com` and
  // `\\evil.com` cannot slip past the `//` test.
  const normalised = value.replace(/\\/g, '/');

  if (!normalised.startsWith('/')) return fallback;
  if (normalised.startsWith('//')) return fallback;

  // A colon inside the first segment would mean a scheme sneaked in.
  const firstSegment = normalised.split(/[/?#]/)[1] ?? '';
  if (firstSegment.includes(':')) return fallback;

  return normalised;
}

/** True when `candidate` is a path we are willing to redirect to. */
export function isSafeRedirectPath(candidate: string | null | undefined): boolean {
  return safeRedirectPath(candidate, REJECTED) !== REJECTED;
}
