'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Container } from '@/components/layout/container';

/**
 * Route-level error boundary.
 *
 * What the customer sees is deliberately generic. Next.js already strips
 * server error messages from the production client payload, leaving only a
 * `digest` hash that correlates to the full entry in the server log -- so
 * support can find the real error without the page ever rendering a stack
 * trace, a database message, or an internal file path to an attacker.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side breadcrumb only. The authoritative record was written on the
    // server when the error was thrown. Log the digest, never `error.message` --
    // in development that message is the real server error.
    console.error('Rendering error', error.digest ?? '(no digest)');
  }, [error]);

  return (
    <main id="main" className="flex flex-1 items-center">
      <Container size="narrow" className="py-16 text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">Something went wrong</h1>
        <p className="text-ink-muted mt-3 text-sm sm:text-base">
          We hit an unexpected problem loading this page. Trying again often works.
        </p>

        {error.digest && (
          <p className="text-ink-subtle mt-4 text-xs">
            Reference code: <code className="font-mono">{error.digest}</code>
          </p>
        )}

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="bg-accent-500 hover:bg-accent-600 text-brand-950 min-h-11 rounded-md px-6 text-sm font-semibold"
          >
            Try again
          </button>
          <Link
            href="/"
            className="border-hairline bg-surface hover:bg-surface-muted inline-flex min-h-11 items-center justify-center rounded-md border px-6 text-sm font-semibold"
          >
            Go to homepage
          </Link>
        </div>
      </Container>
    </main>
  );
}
