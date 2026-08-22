'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils/cn';
import type { HotelReview } from '@/services/hotels';

/**
 * Guest reviews, with the reference's three orderings.
 *
 * "Positive First" and "Negative First" sort; they do not filter. A tab that
 * quietly hid every complaint would make the score above it a lie, and the
 * count would stop matching the list.
 *
 * The relative date is computed in the browser because it is relative to *now*
 * -- rendering "4 months ago" on the server would freeze at build time and
 * would not survive the page being cached.
 */

const TABS = ['Latest First', 'Positive First', 'Negative First'] as const;
type Tab = (typeof TABS)[number];

function ago(days: number): string {
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function ReviewList({ reviews }: { reviews: HotelReview[] }) {
  const [tab, setTab] = useState<Tab>('Latest First');

  const ordered = [...reviews].sort((a, b) => {
    if (tab === 'Positive First') return b.rating - a.rating || a.daysAgo - b.daysAgo;
    if (tab === 'Negative First') return a.rating - b.rating || a.daysAgo - b.daysAgo;
    return a.daysAgo - b.daysAgo;
  });

  return (
    <>
      <div role="tablist" aria-label="Order reviews" className="mt-3 flex flex-wrap gap-2">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === option
                ? 'border-accent-500 bg-accent-500/10 text-ink'
                : 'border-hairline text-ink-muted hover:border-accent-500',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <ul className="divide-hairline mt-3 divide-y">
        {ordered.map((review) => (
          <li key={review.id} className="flex gap-3 py-3">
            <span
              aria-hidden="true"
              className="bg-surface-sunken text-ink-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            >
              {review.author
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </span>

            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-bold',
                    review.rating >= 4
                      ? 'text-instock'
                      : review.rating >= 3
                        ? 'text-accent-400'
                        : 'text-deal',
                  )}
                >
                  {review.title}
                </span>
                <span className="text-ink-subtle text-[11px]">{review.rating.toFixed(1)}/5</span>
              </span>
              <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
                {review.body}
              </span>
              <span className="text-ink-subtle mt-1 block text-[11px]">
                {review.author} · {ago(review.daysAgo)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
