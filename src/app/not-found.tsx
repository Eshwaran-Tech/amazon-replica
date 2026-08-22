import Link from 'next/link';

import { Container } from '@/components/layout/container';

export const metadata = {
  title: 'Page not found',
};

/**
 * 404 page.
 *
 * Also the response for resources that exist but do not belong to the current
 * user, where returning 404 rather than 403 avoids confirming that a given
 * order or address id is real. See `notFoundForForbidden` in
 * `src/lib/auth/guards.ts` for where that decision is made.
 */
export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 items-center">
      <Container size="narrow" className="py-16 text-center">
        <p className="text-accent-600 text-sm font-semibold tracking-wide uppercase">Error 404</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">We could not find that page</h1>
        <p className="text-ink-muted mt-3 text-sm sm:text-base">
          The link may be broken, or the product may no longer be available.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="bg-accent-500 hover:bg-accent-600 text-brand-950 inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold"
          >
            Go to homepage
          </Link>
          <Link
            href="/products"
            className="border-hairline bg-surface hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-md border px-6 text-sm font-semibold"
          >
            Browse all products
          </Link>
        </div>
      </Container>
    </main>
  );
}
