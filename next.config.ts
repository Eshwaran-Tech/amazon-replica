import type { NextConfig } from 'next';

/**
 * Static security headers.
 *
 * These live in `next.config.ts` (not `proxy.ts`) on purpose: headers declared
 * here are applied to *every* response, including static assets under
 * `/_next/static` and files in `public/`, which the proxy matcher deliberately
 * skips. The one header that cannot live here is `Content-Security-Policy`,
 * because it carries a per-request nonce -- that is set in `proxy.ts`.
 */
const securityHeaders = [
  // Clickjacking. `frame-ancestors 'none'` in the CSP is the modern control;
  // this is the legacy fallback for older browsers.
  { key: 'X-Frame-Options', value: 'DENY' },

  // Stop the browser from MIME-sniffing a response away from its declared type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Don't leak full URLs (which can contain product/order ids) to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Drop powerful browser APIs we never use.
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=(self)',
      'usb=()',
      'xr-spatial-tracking=()',
    ].join(', '),
  },

  // Cross-origin isolation: keep other origins from getting a handle on our
  // window object or hot-linking our resources.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },

  // Legacy Adobe cross-domain policy files.
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },

  // Don't resolve DNS for links the user never clicked.
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

// HSTS is only meaningful over TLS and actively harmful on http://localhost
// (it would pin the browser to https for every localhost project on the machine).
const hstsHeader = {
  key: 'Strict-Transport-Security',
  value: 'max-age=63072000; includeSubDomains; preload',
};

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Don't advertise the framework version to attackers scanning for known CVEs.
  poweredByHeader: false,

  // Native/heavy server-only packages must not be traced into the client or
  // serverless bundle by the compiler.
  serverExternalPackages: ['mongodb', 'bcryptjs', 'nodemailer'],

  typedRoutes: true,

  images: {
    // Explicit allowlist. It is intentionally empty: every image this app serves
    // is a local asset under `public/`. Adding a wildcard here would turn
    // `/_next/image?url=...` into an open image proxy (an SSRF primitive).
    remotePatterns: [],

    // The image optimizer refuses SVG unless this is enabled, because an
    // optimized-and-cached SVG served from our origin could carry a script.
    // We keep it off and render our SVG artwork through `<Image unoptimized>`,
    // which emits a plain `<img>` -- and browsers script-sandbox SVG in `<img>`.
    dangerouslyAllowSVG: false,

    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    const isProd = process.env.NODE_ENV === 'production';

    return [
      {
        source: '/:path*',
        headers: isProd ? [...securityHeaders, hstsHeader] : securityHeaders,
      },
      {
        // Nothing under /api is ever cacheable: it is either personal data
        // (cart, orders, account) or a mutation.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
