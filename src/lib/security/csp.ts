/**
 * Content-Security-Policy builder.
 *
 * Pure function, no I/O, no module state -- `proxy.ts` runs at the network
 * boundary and must not depend on shared mutable state.
 *
 * Design notes:
 *
 * - `default-src 'none'` is the baseline, so every resource type has to be
 *   named explicitly below. A directive we forget fails closed instead of
 *   silently inheriting a permissive default.
 *
 * - `script-src` uses a per-request nonce plus `'strict-dynamic'`. With
 *   `strict-dynamic`, host allowlists are ignored by supporting browsers and
 *   trust propagates only through scripts the nonce already authorised. That
 *   is what makes an injected `<script src=...>` useless to an attacker.
 *
 * - `style-src-attr 'unsafe-inline'` is a deliberate, narrow exception.
 *   A nonce cannot apply to an inline `style=""` *attribute*, and React and
 *   `next/image` both emit them. Style attributes cannot execute script in any
 *   browser we target, so the residual risk is CSS-based UI redressing -- which
 *   `frame-ancestors 'none'` and same-origin isolation already address.
 *   `<style>` *elements* remain nonce-gated.
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** Stripe injects an iframe and loads its own script host. */
  paymentProvider: 'mock' | 'stripe';
}

const STRIPE_SCRIPT = 'https://js.stripe.com';
const STRIPE_FRAME = ['https://js.stripe.com', 'https://hooks.stripe.com'];
const STRIPE_API = 'https://api.stripe.com';

export function buildContentSecurityPolicy({
  nonce,
  isDev,
  paymentProvider,
}: CspOptions): string {
  const stripe = paymentProvider === 'stripe';

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // React reconstructs server stack traces in the browser via eval in dev.
    // Production builds of both React and Next.js do not use eval.
    ...(isDev ? ["'unsafe-eval'"] : []),
    ...(stripe ? [STRIPE_SCRIPT] : []),
  ];

  const connectSrc = [
    "'self'",
    // Turbopack's hot-reload channel.
    ...(isDev ? ['ws:', 'wss:'] : []),
    ...(stripe ? [STRIPE_API] : []),
  ];

  const directives: Array<[string, string[]] | [string]> = [
    ['default-src', ["'none'"]],

    ['script-src', scriptSrc],

    // Next.js injects inline <style> during development only.
    ['style-src', ["'self'", isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`]],
    ['style-src-attr', ["'unsafe-inline'"]],

    // `data:` covers inline SVG data URIs; `blob:` covers client-side previews
    // of an image the admin has selected but not yet uploaded.
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],

    ['connect-src', connectSrc],
    ['media-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['worker-src', ["'self'", 'blob:']],

    ['frame-src', stripe ? STRIPE_FRAME : ["'none'"]],

    // Clickjacking: this page may not be framed by anyone.
    ['frame-ancestors', ["'none'"]],

    // Stops `<base href="//evil">` from rewriting every relative URL on the page.
    ['base-uri', ["'none'"]],

    // Stops an injected form from POSTing the user's session to another origin.
    ['form-action', ["'self'"]],

    ['object-src', ["'none'"]],

    ['report-uri', ['/api/security/csp-report']],
  ];

  // Only meaningful over TLS, and on http://localhost it would rewrite every
  // dev request to https and break the site.
  if (!isDev) {
    directives.push(['upgrade-insecure-requests']);
  }

  return directives
    .map(([name, values]) => (values && values.length > 0 ? `${name} ${values.join(' ')}` : name))
    .join('; ');
}

/**
 * 128 bits of CSPRNG output, base64. The whole security property of a nonce is
 * that an attacker cannot predict it, so this must never be seeded from a
 * timestamp, a counter, or `Math.random`.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
