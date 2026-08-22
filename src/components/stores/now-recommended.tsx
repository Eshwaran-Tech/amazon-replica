'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { PriceDisplay } from '@/components/product/price-display';
import { ProductImage } from '@/components/product/product-image';
import { QuickAdd } from '@/components/stores/now-parts';
import { cn } from '@/lib/utils/cn';
import type { ProductSummary } from '@/models/product';

/**
 * "Recommended for you", with the reference's tab rail above the grid.
 *
 * Every tab's products are sent with the page, so switching is instant and
 * needs no round trip -- there are a few dozen summaries in total, which is
 * cheaper than a fetch per tab and keeps the whole shelf usable before
 * hydration finishes. Each tab is a real query against a real shelf; a tab with
 * nothing behind it is dropped server-side rather than rendered empty.
 */

export interface RecommendedTab {
  id: string;
  label: string;
  href: string;
  products: ProductSummary[];
}

export function RecommendedShelf({
  tabs,
  csrfField,
}: {
  tabs: RecommendedTab[];
  /** The server-rendered CSRF input, reused by every tile's form. */
  csrfField: ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  if (!current) return null;

  return (
    <section aria-labelledby="now-recommended">
      <div className="flex items-end justify-between gap-3">
        <h2 id="now-recommended" className="text-base font-bold sm:text-lg">
          Recommended for you
        </h2>
        <Link
          href={current.href}
          className="text-link shrink-0 text-sm font-semibold hover:underline"
        >
          See all →
        </Link>
      </div>

      {/* The tab rail. */}
      <div
        role="tablist"
        aria-label="Recommended categories"
        className="mt-2 flex scrollbar-none gap-2 overflow-x-auto pb-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`now-tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls={`now-panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={cn(
              'shrink-0 rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors',
              tab.id === current.id
                ? 'border-accent-500 bg-accent-500 text-brand-950'
                : 'border-hairline text-ink-muted hover:border-accent-500',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ul
        role="tabpanel"
        id={`now-panel-${current.id}`}
        aria-labelledby={`now-tab-${current.id}`}
        className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6"
      >
        {current.products.map((product) => (
          <li
            key={product.id}
            className="border-hairline bg-surface flex flex-col rounded-xl border p-2"
          >
            <Link
              href={`/products/${product.slug}`}
              className="bg-surface-sunken relative block aspect-square overflow-hidden rounded-lg"
            >
              <ProductImage src={product.thumbnail} alt={product.name} sizes="140px" />
              {product.discountPercentage > 0 && (
                <span className="bg-deal absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {product.discountPercentage}%
                </span>
              )}
            </Link>
            <Link
              href={`/products/${product.slug}`}
              className="hover:text-link mt-1.5 line-clamp-2 min-h-8 text-[11px] leading-tight font-medium"
            >
              {product.name}
            </Link>
            <div className="mt-auto pt-1">
              <PriceDisplay price={product.effectivePrice} listPrice={product.price} size="sm" />
            </div>
            <div className="mt-1.5">
              <QuickAdd
                productId={product.id}
                productName={product.name}
                outOfStock={!product.inStock}
                csrfField={csrfField}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
