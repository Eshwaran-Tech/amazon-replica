import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils/cn';

interface SectionHeadingProps {
  id: string;
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
}

/**
 * Section heading with the short accent rule beneath and a trailing
 * "View all" link, matching the reference template.
 *
 * The rule is `aria-hidden` decoration -- it carries no meaning that the
 * heading text does not already convey.
 *
 * The link text includes the section name for screen readers ("View all
 * Shop by Category") because a page full of links that all say "View all" is
 * useless when navigating by link list.
 */
export function SectionHeading({
  id,
  title,
  viewAllHref,
  viewAllLabel = 'View all',
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('mb-5 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
          {title}
        </h2>
        <span
          aria-hidden="true"
          className="bg-accent-500 mt-2 block h-1 w-14 rounded-full sm:w-16"
        />
      </div>

      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="text-accent-400 hover:text-accent-300 mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold whitespace-nowrap"
        >
          {viewAllLabel}
          <span className="sr-only"> {title}</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
