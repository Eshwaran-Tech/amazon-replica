import { cn } from '@/lib/utils/cn';
import type { ProductSummary } from '@/models/product';

import { ProductCard } from './product-card';

interface ProductGridProps {
  products: ProductSummary[];
  className?: string;
  /** Fewer columns when the grid sits beside a filter sidebar. */
  variant?: 'full' | 'with-sidebar';
  /** Number of leading cards to load eagerly, for LCP. */
  priorityCount?: number;
}

/**
 * Responsive product grid.
 *
 * Column counts are chosen per breakpoint rather than left to auto-fit:
 *
 *   320-400px  2 columns -- one column wastes the width of a modern phone,
 *                           three makes the price text unreadable
 *   640px      3
 *   1024px     4 (or 3 beside a sidebar)
 *   1280px     5 (or 4 beside a sidebar)
 *   1920px+    6 -- otherwise cards stretch absurdly wide on a large monitor
 *
 * `items-stretch` keeps every card the same height regardless of title length,
 * so prices line up across a row.
 */
export function ProductGrid({
  products,
  className,
  variant = 'full',
  priorityCount = 0,
}: ProductGridProps) {
  const columns =
    variant === 'with-sidebar'
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6';

  return (
    <div className={cn('grid items-stretch gap-2.5 sm:gap-3 lg:gap-4', columns, className)}>
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < priorityCount} />
      ))}
    </div>
  );
}
