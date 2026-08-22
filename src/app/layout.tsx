import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';

import { I18nProvider } from '@/lib/i18n/client';
import { LANGUAGE_COOKIE_NAME, languageByCode } from '@/lib/i18n/languages';
import { THEME_COOKIE_NAME, themeAttribute, themeFromCookie } from '@/lib/theme';
import { MESSAGES } from '@/lib/i18n/messages';

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

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: 'amazon - Online Shopping for Electronics, Fashion, Home and more',
    template: '%s | amazon',
  },
  description:
    'Shop electronics, computers, mobiles, fashion, home, kitchen, books, beauty, sports, toys, grocery and automotive on amazon. Fast delivery and secure checkout.',
  applicationName: 'amazon',
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: 'website',
    siteName: 'amazon',
    url: appUrl,
    title: 'amazon - Online Shopping',
    description: 'Shop millions of products with fast delivery and secure checkout.',
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
