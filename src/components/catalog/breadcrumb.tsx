import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumb trail.
 *
 * An ordered list inside a labelled `<nav>`, with `aria-current="page"` on the
 * final item -- so it is announced as a navigation landmark and the current
 * position is unambiguous, rather than being a row of visually separated links.
 *
 * The separators are `aria-hidden`; a screen reader announcing "chevron right"
 * between every crumb is noise.
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="text-ink-muted flex flex-wrap items-center gap-x-1 gap-y-1 text-xs sm:text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link href={item.href} className="text-link hover:text-link-hover hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className="text-ink truncate">
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
