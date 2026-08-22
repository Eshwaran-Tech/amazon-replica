import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';

import { I18nProvider } from '@/lib/i18n/client';
import { LANGUAGE_COOKIE_NAME, languageByCode } from '@/lib/i18n/languages';
import { THEME_COOKIE_NAME, themeAttribute, themeFromCookie } from '@/lib/theme';
import { MESSAGES } from '@/lib/i18n/messages';

import { BRAND_DESCRIPTION, BRAND_NAME, BRAND_TAGLINE, SITE_URL } from '@/lib/brand';

import './globals.css';

/**
 * Self-hosted at build time by `next/font`, so there is no request to a font
 * CDN at runtime -- which keeps `font-src 'self'` in the CSP honest and avoids
 * leaking every visitor's IP to a third party.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * Site-wide metadata.
 *
 * `metadataBase` is what makes every relative URL below -- and every canonical
 * and Open Graph image on every nested page -- resolve to one absolute origin.
 * Without it Next emits relative OG URLs, which most crawlers and every social
 * scraper drop on the floor.
 *
 * The title is `Brand - what the shop sells`, in that order, because the brand
 * has to be the first thing readable in a 60-character search result and in a
 * browser tab cropped to twenty. Nested pages get `Page | Brand` from the
 * template, which keeps the brand present without repeating it into stuffing.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} - ${BRAND_TAGLINE}`,
    template: `%s | ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },

  // The homepage is the canonical root. Nested pages override this with their
  // own path; without it, the same page reachable with a tracking parameter
  // would compete against itself in the index.
  alternates: { canonical: '/' },

  openGraph: {
    type: 'website',
    siteName: BRAND_NAME,
    url: SITE_URL,
    locale: 'en_IN',
    title: `${BRAND_NAME} - ${BRAND_TAGLINE}`,
    description: BRAND_DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: BRAND_NAME }],
  },

  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} - ${BRAND_TAGLINE}`,
    description: BRAND_DESCRIPTION,
    images: ['/opengraph-image'],
  },

  // Explicit rather than implied. `max-image-preview: large` is what allows a
  // product photo to appear at full size in Google Images and Discover; the
  // default is a thumbnail.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

/**
 * Every route renders per-request. This is a direct consequence of the
 * nonce-based CSP: Next.js stamps the nonce onto its script tags during
 * server rendering, so a page prerendered at build time would ship HTML whose
 * scripts carry no nonce -- and `'strict-dynamic'` would then block all of
 * them, leaving a page that paints but never hydrates. (Verified: a static `/`
 * produced 0 of 11 script tags with a nonce.)
 *
 * Route segment config on the root layout applies to every nested segment.
 *
 * The cost is real -- no full-page static optimisation or CDN HTML caching --
 * and it is paid back at the data layer instead: catalogue reads are cached
 * with `use cache`, so dynamic HTML does not mean a database round trip per
 * request. Most pages here are personalised (header cart count, account state)
 * and would opt out of static rendering regardless.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately no `maximumScale` / `userScalable: false`. Locking zoom is a
  // WCAG 1.4.4 failure and makes the site unusable for low-vision customers.
  themeColor: '#152238',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The language picker in the header stores its choice in a cookie; the
  // document language follows it (screen readers and hyphenation honour it).
  const cookieStore = await cookies();
  const language = languageByCode(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value);

  // Resolved on the server so the first paint is already the right theme.
  // Reading it on the client would render dark, then flip -- a flash that is
  // worst on the slow connections least able to afford it.
  const theme = themeFromCookie(cookieStore.get(THEME_COOKIE_NAME)?.value);

  return (
    <html lang={language.code} data-theme={themeAttribute(theme)} className={inter.variable}>
      <body className="flex min-h-dvh flex-col font-sans">
        {/* First tabbable element on every page: lets keyboard and screen-reader
            users jump the header navigation instead of tabbing through it. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <I18nProvider lang={language.code} messages={MESSAGES[language.code]}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
