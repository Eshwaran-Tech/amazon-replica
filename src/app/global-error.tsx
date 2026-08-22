'use client';

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, where
 * no shell exists to render into. It must supply its own <html> and <body>.
 *
 * Styling is inline because a root-layout failure may mean the stylesheet never
 * loaded. These are style *attributes*, which the CSP allows via
 * `style-src-attr 'unsafe-inline'` -- see `src/lib/security/csp.ts`.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#eef1f5',
          color: '#12161c',
        }}
      >
        <main style={{ maxWidth: '32rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>Service unavailable</h1>
          <p style={{ margin: '0 0 1.5rem', color: '#565d68', fontSize: '0.95rem' }}>
            amazon could not start rendering this page. Please try again shortly.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#767d88' }}>
              Reference code: <code>{error.digest}</code>
            </p>
          )}
          {/* A plain anchor, not next/link: this boundary renders when the root
              layout itself failed, so the router may not be mounted. A full
              document load is the only reliable way out. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: '1.5rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.375rem',
              background: '#f5a524',
              color: '#0c1522',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Reload homepage
          </a>
        </main>
      </body>
    </html>
  );
}
