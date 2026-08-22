import Link from 'next/link';

import { formatPaise } from '@/lib/utils/money';
import { buildCatalogUrl, hasActiveFilters, toggleBrand } from '@/lib/utils/search-params';
import type { ProductSearchInput } from '@/lib/validations/search';
import type { ProductFacets } from '@/services/catalog';
import type { CategoryTreeNode } from '@/models/category';

import { RatingStars } from '@/components/product/rating-stars';

interface FiltersProps {
  basePath: string;
  input: ProductSearchInput;
  facets: ProductFacets;
  categories: CategoryTreeNode[];
}

/** Fixed price bands, in rupees. An allow-list, not a free-text range input. */
const PRICE_BANDS: Array<{ label: string; min?: number; max?: number }> = [
  { label: 'Under 500', max: 500 },
  { label: '500 - 2,000', min: 500, max: 2000 },
  { label: '2,000 - 10,000', min: 2000, max: 10000 },
  { label: '10,000 - 30,000', min: 10000, max: 30000 },
  { label: 'Over 30,000', min: 30000 },
];

/**
 * Filter panel.
 *
 * Every control is a link, so the whole panel is functional as plain HTML.
 * Checkbox-looking chips are links styled as checkboxes with `aria-pressed`,
 * which is honest about what they do (navigate) while still announcing state.
 */
export function Filters({ basePath, input, facets, categories }: FiltersProps) {
  const selectedCategory = categories.find((category) => category.slug === input.category);

  return (
    <div className="space-y-5 text-sm">
      {hasActiveFilters(input) && (
        <Link
          href={buildCatalogUrl(basePath, input, {
            category: undefined,
            subcategory: undefined,
            brand: [],
            minPrice: undefined,
            maxPrice: undefined,
            minRating: undefined,
            inStock: false,
            prime: false,
            deals: false,
          })}
          className="text-link hover:text-link-hover inline-block font-medium hover:underline"
        >
          Clear all filters
        </Link>
      )}

      {/* --------------------------------------------------------- category */}
      <FilterGroup heading="Category">
        {!selectedCategory ? (
          <ul className="space-y-1.5">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={buildCatalogUrl(basePath, input, {
                    category: category.slug,
                    subcategory: undefined,
                  })}
                  className="text-link hover:text-link-hover block py-0.5 hover:underline"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-1.5">
            <Link
              href={buildCatalogUrl(basePath, input, {
                category: undefined,
                subcategory: undefined,
              })}
              className="text-link hover:text-link-hover block py-0.5 text-xs hover:underline"
            >
              &larr; All categories
            </Link>
            <p className="font-bold">{selectedCategory.name}</p>
            <ul className="space-y-1.5 pl-2">
              {selectedCategory.children.map((child) => (
                <li key={child.slug}>
                  <Link
                    href={buildCatalogUrl(basePath, input, {
                      subcategory: input.subcategory === child.slug ? undefined : child.slug,
                    })}
                    aria-pressed={input.subcategory === child.slug}
                    className={
                      input.subcategory === child.slug
                        ? 'text-ink block py-0.5 font-semibold'
                        : 'text-link hover:text-link-hover block py-0.5 hover:underline'
                    }
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </FilterGroup>

      {/* ------------------------------------------------------------ brand */}
      {facets.brands.length > 0 && (
        <FilterGroup heading="Brand">
          <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {facets.brands.map((brand) => {
              const checked = input.brand.includes(brand.name);
              return (
                <li key={brand.name}>
                  <Link
                    href={buildCatalogUrl(basePath, input, {
                      brand: toggleBrand(input.brand, brand.name),
                    })}
                    aria-pressed={checked}
                    className="hover:bg-surface-muted flex min-h-9 items-center gap-2 rounded px-1"
                  >
                    <Checkbox checked={checked} />
                    <span className="flex-1 truncate">{brand.name}</span>
                    <span className="text-ink-subtle text-xs">{brand.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </FilterGroup>
      )}

      {/* ------------------------------------------------------------ price */}
      <FilterGroup heading="Price">
        <ul className="space-y-0.5">
          {PRICE_BANDS.map((band) => {
            const bandMin = band.min === undefined ? undefined : band.min * 100;
            const bandMax = band.max === undefined ? undefined : band.max * 100;
            const active = input.minPrice === bandMin && input.maxPrice === bandMax;

            return (
              <li key={band.label}>
                <Link
                  href={buildCatalogUrl(basePath, input, {
                    minPrice: active ? undefined : bandMin,
                    maxPrice: active ? undefined : bandMax,
                  })}
                  aria-pressed={active}
                  className="hover:bg-surface-muted flex min-h-9 items-center gap-2 rounded px-1"
                >
                  <Checkbox checked={active} />
                  <span>&#8377;{band.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {facets.priceRange && (
          <p className="text-ink-subtle mt-2 text-xs">
            Range: {formatPaise(facets.priceRange.min)} - {formatPaise(facets.priceRange.max)}
          </p>
        )}
      </FilterGroup>

      {/* ----------------------------------------------------------- rating */}
      <FilterGroup heading="Customer rating">
        <ul className="space-y-0.5">
          {[4, 3, 2].map((rating) => (
            <li key={rating}>
              <Link
                href={buildCatalogUrl(basePath, input, {
                  minRating: input.minRating === rating ? undefined : rating,
                })}
                aria-pressed={input.minRating === rating}
                className="hover:bg-surface-muted flex min-h-9 items-center gap-2 rounded px-1"
              >
                <Checkbox checked={input.minRating === rating} />
                <RatingStars rating={rating} />
                <span className="text-xs">&amp; up</span>
              </Link>
            </li>
          ))}
        </ul>
      </FilterGroup>

      {/* ---------------------------------------------------------- toggles */}
      <FilterGroup heading="Availability and offers">
        <ul className="space-y-0.5">
          {(
            [
              { key: 'inStock', label: 'In stock only' },
              { key: 'prime', label: 'Fast delivery' },
              { key: 'deals', label: 'On offer' },
            ] as const
          ).map((toggle) => (
            <li key={toggle.key}>
              <Link
                href={buildCatalogUrl(basePath, input, { [toggle.key]: !input[toggle.key] })}
                aria-pressed={input[toggle.key]}
                className="hover:bg-surface-muted flex min-h-9 items-center gap-2 rounded px-1"
              >
                <Checkbox checked={input[toggle.key]} />
                <span>{toggle.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`filter-${heading}`}>
      <h3 id={`filter-${heading}`} className="mb-2 text-sm font-bold">
        {heading}
      </h3>
      {children}
    </section>
  );
}

/** Visual checkbox. Decorative -- state is announced via `aria-pressed`. */
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        checked
          ? 'bg-link border-link flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border'
          : 'border-ink-subtle flex h-4 w-4 shrink-0 rounded-sm border bg-white'
      }
    >
      {checked && (
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor">
          <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
