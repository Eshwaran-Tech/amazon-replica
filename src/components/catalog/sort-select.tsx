'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';

import { buildCatalogUrl } from '@/lib/utils/search-params';
import { PRODUCT_SORT_OPTIONS, type ProductSearchInput } from '@/lib/validations/search';

const LABELS: Record<(typeof PRODUCT_SORT_OPTIONS)[number], string> = {
  relevance: 'Featured',
  newest: 'Newest arrivals',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Average customer review',
  discount: 'Biggest discount',
};

/**
 * Sort control.
 *
 * A native `<select>` rather than a custom dropdown: it gets the platform's own
 * picker on mobile, full keyboard support, and correct screen-reader semantics
 * for free -- all things a div-based menu has to reimplement and usually gets
 * subtly wrong.
 *
 * Options come from the same `z.enum` the server validates against, so the UI
 * cannot offer a value the server would reject.
 */
export function SortSelect({ basePath, input }: { basePath: string; input: ProductSearchInput }) {
  const router = useRouter();
  const id = useId();

  return (
    // `min-w-0` on both the wrapper and the select is what lets the control
    // shrink instead of overflowing. A flex item defaults to `min-width: auto`,
    // meaning it refuses to shrink below its content -- and the longest option
    // ("Average customer review") is wider than a 375px screen allows once the
    // Filters button and the label are accounted for. Measured before this
    // fix: the select ran to 385px in a 375px viewport and was clipped.
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      {/* Visible from sm up; on a phone the select's own value makes its
          purpose obvious, and the label costs ~60px of scarce width. */}
      <label htmlFor={id} className="sr-only shrink-0 text-sm font-medium sm:not-sr-only">
        Sort by
      </label>
      <select
        id={id}
        value={input.sort}
        onChange={(event) => {
          const value = event.target.value as ProductSearchInput['sort'];
          router.push(buildCatalogUrl(basePath, input, { sort: value }));
        }}
        className="border-hairline bg-surface min-h-10 w-full min-w-0 flex-1 rounded-md border px-2 text-sm sm:w-auto sm:flex-none"
      >
        {PRODUCT_SORT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
