import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * robots.txt
 *
 * A crawler directive, not an access control. Everything listed here is also
 * protected server-side -- `robots.txt` is a public file, so naming a path in
 * it tells an attacker exactly where to look. The paths below are already
 * guarded by `requireUser` / `requireAdmin`; disallowing them saves crawl
 * budget and keeps private pages out of search results, nothing more.
 *
 * `/api` is disallowed for the same reason: no crawler benefits from it, and
 * every endpoint enforces its own authentication regardless.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/account',
          '/orders',
          '/cart',
          '/checkout',
          '/admin',
          '/auth/',
          // Filtered and sorted listings are an infinite URL space that
          // duplicates the canonical category pages.
          '/search',
          '/products?',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
