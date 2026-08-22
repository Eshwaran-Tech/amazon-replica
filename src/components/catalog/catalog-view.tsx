import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { ProductGrid } from '@/components/product/product-grid';
import { hasActiveFilters } from '@/lib/utils/search-params';
import type { ProductSearchInput } from '@/lib/validations/search';
import type { CategoryTreeNode } from '@/models/category';
import type { ProductListResult } from '@/services/catalog';

import { Breadcrumb, type Crumb } from './breadcrumb';
import { FilterDrawer } from './filter-drawer';
import { Filters } from './filters';
import { Pagination } from './pagination';
import { SortSelect } from './sort-select';

interface CatalogViewProps {
  heading: string;
  basePath: string;
  input: ProductSearchInput;
  result: ProductListResult;
  categories: CategoryTreeNode[];
  crumbs: Crumb[];
  description?: string;
}

/**
 * Shared listing layout for /products, /search and /category/[slug].
 *
 * One implementation for all three so the filter behaviour, pagination and
 * empty states cannot drift apart between them -- three near-identical listing
 * pages is how a filter bug ends up fixed in one place and not the other two.
 *
 * Layout by breakpoint:
 *   mobile/tablet  filter button opens a bottom sheet, grid uses full width
 *   lg and up      persistent 15rem sidebar beside the grid
 */
export function CatalogView({
  heading,
  basePath,
  input,
  result,
  categories,
  crumbs,
  description,
}: CatalogViewProps) {
  const activeFilterCount =
    (input.category ? 1 : 0) +
    (input.subcategory ? 1 : 0) +
    input.brand.length +
    (input.minPrice !== undefined || input.maxPrice !== undefined ? 1 : 0) +
    (input.minRating !== undefined ? 1 : 0) +
    (input.inStock ? 1 : 0) +
    (input.prime ? 1 : 0) +
    (input.deals ? 1 : 0);

  const filters = (
    <Filters basePath={basePath} input={input} facets={result.facets} categories={categories} />
  );

  const firstIndex = (result.page - 1) * result.limit + 1;
  const lastIndex = Math.min(result.page * result.limit, result.total);

  return (
    <Container size="wide" className="py-4 sm:py-5">
      <Breadcrumb items={crumbs} />

      <div className="mt-3 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        {/* Sidebar: desktop only. The same markup is reused inside the drawer. */}
        <aside className="hidden lg:block" aria-label="Product filters">
          <div className="bg-surface sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg p-4">
            {filters}
          </div>
        </aside>

        <div className="min-w-0">
          <div className="bg-surface mb-3 rounded-lg p-3 sm:p-4">
            <h1 className="text-lg font-bold sm:text-xl">{heading}</h1>
            {description && <p className="text-ink-muted mt-1 text-sm">{description}</p>}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-muted text-sm" aria-live="polite">
                {result.total === 0
                  ? 'No results'
                  : `${firstIndex.toLocaleString('en-IN')}-${lastIndex.toLocaleString('en-IN')} of ${result.total.toLocaleString('en-IN')} results`}
              </p>

              <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                <FilterDrawer activeCount={activeFilterCount}>{filters}</FilterDrawer>
                <SortSelect basePath={basePath} input={input} />
              </div>
            </div>
          </div>

          {result.items.length === 0 ? (
            <div className="bg-surface rounded-lg p-8 text-center">
              <h2 className="text-base font-bold">No products matched</h2>
              <p className="text-ink-muted mx-auto mt-2 max-w-md text-sm">
                {input.q
                  ? `We could not find anything for "${input.q}". Try a different spelling or a more general term.`
                  : 'Try removing a filter or two to see more products.'}
              </p>
              {hasActiveFilters(input) && (
                <Link
                  href={basePath}
                  className="border-hairline bg-surface hover:bg-surface-muted mt-4 inline-flex min-h-11 items-center rounded-md border px-5 text-sm font-semibold"
                >
                  Clear all filters
                </Link>
              )}
            </div>
          ) : (
            <>
              <ProductGrid products={result.items} variant="with-sidebar" priorityCount={4} />
              <Pagination
                basePath={basePath}
                input={input}
                page={result.page}
                totalPages={result.totalPages}
              />
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
