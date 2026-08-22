import Link from 'next/link';

import { buildCatalogUrl } from '@/lib/utils/search-params';
import type { ProductSearchInput } from '@/lib/validations/search';
import { cn } from '@/lib/utils/cn';

interface PaginationProps {
  basePath: string;
  input: ProductSearchInput;
  page: number;
  totalPages: number;
}

/**
 * Page links with a sliding window.
 *
 * Rendered as real anchors so each page is crawlable and shareable, wrapped in
 * a labelled `<nav>` so a screen reader can jump to it, with `aria-current` on
 * the active page.
 *
 * The window is narrower on mobile (handled with `hidden sm:inline-flex` on the
 * outer numbers) because eleven tap targets do not fit on a 360px screen.
 */
export function Pagination({ basePath, input, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;

  const windowSize = 2;
  const start = Math.max(1, page - windowSize);
  const end = Math.min(totalPages, page + windowSize);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  const linkClass =
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm';

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex flex-wrap items-center justify-center gap-1.5"
    >
      <Link
        href={buildCatalogUrl(basePath, input, { page: Math.max(1, page - 1) })}
        aria-disabled={page === 1}
        tabIndex={page === 1 ? -1 : undefined}
        className={cn(
          linkClass,
          page === 1
            ? 'border-hairline text-ink-subtle pointer-events-none opacity-50'
            : 'border-hairline bg-surface hover:bg-surface-muted',
        )}
      >
        Previous
      </Link>

      {start > 1 && (
        <>
          <Link
            href={buildCatalogUrl(basePath, input, { page: 1 })}
            className={cn(
              linkClass,
              'border-hairline bg-surface hover:bg-surface-muted hidden sm:inline-flex',
            )}
          >
            1
          </Link>
          {start > 2 && (
            <span className="text-ink-subtle hidden px-1 sm:inline" aria-hidden="true">
              &hellip;
            </span>
          )}
        </>
      )}

      {pages.map((entry) => (
        <Link
          key={entry}
          href={buildCatalogUrl(basePath, input, { page: entry })}
          aria-current={entry === page ? 'page' : undefined}
          className={cn(
            linkClass,
            entry === page
              ? 'border-accent-500 bg-accent-500 text-brand-950 font-bold'
              : 'border-hairline bg-surface hover:bg-surface-muted',
          )}
        >
          {entry}
        </Link>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span className="text-ink-subtle hidden px-1 sm:inline" aria-hidden="true">
              &hellip;
            </span>
          )}
          <Link
            href={buildCatalogUrl(basePath, input, { page: totalPages })}
            className={cn(
              linkClass,
              'border-hairline bg-surface hover:bg-surface-muted hidden sm:inline-flex',
            )}
          >
            {totalPages}
          </Link>
        </>
      )}

      <Link
        href={buildCatalogUrl(basePath, input, { page: Math.min(totalPages, page + 1) })}
        aria-disabled={page === totalPages}
        tabIndex={page === totalPages ? -1 : undefined}
        className={cn(
          linkClass,
          page === totalPages
            ? 'border-hairline text-ink-subtle pointer-events-none opacity-50'
            : 'border-hairline bg-surface hover:bg-surface-muted',
        )}
      >
        Next
      </Link>
    </nav>
  );
}
