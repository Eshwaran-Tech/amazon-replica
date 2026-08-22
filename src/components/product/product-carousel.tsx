import Link from 'next/link';

import { SectionHeading } from '@/components/home/section-heading';
import type { ProductSummary } from '@/models/product';

import { PriceDisplay } from './price-display';
import { ProductImage } from './product-image';
import { RatingStars } from './rating-stars';

interface ProductCarouselProps {
  title: string;
  products: ProductSummary[];
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Stable id for the heading; defaults to a slug of the title (fine for
   *  Latin titles, so translated titles should pass one explicitly). */
  id?: string;
  priority?: boolean;
}

/**
 * Horizontally scrolling product row.
 *
 * Native overflow scrolling with CSS scroll-snap rather than a JavaScript
 * carousel. That means it works before hydration, respects the platform's
 * momentum scrolling on touch, and remains keyboard- and screen-reader
 * navigable as an ordinary list -- none of which a custom slider gets for free.
 *
 * `scroll-snap-type` gives the tidy card alignment a carousel is usually built
 * for, at no JavaScript cost.
 */
export function ProductCarousel({
  title,
  products,
  viewAllHref,
  viewAllLabel,
  id,
  priority = false,
}: ProductCarouselProps) {
  if (products.length === 0) return null;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const headingId = id ?? `carousel-${slug || 'section'}`;

  return (
    <section
      aria-labelledby={headingId}
      className="border-hairline bg-surface rounded-2xl border p-4 sm:p-6"
    >
      <SectionHeading
        id={headingId}
        title={title}
        viewAllHref={viewAllHref}
        {...(viewAllLabel ? { viewAllLabel } : {})}
      />

      <ul
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
        // Room for the focus ring on the first and last cards, which would
        // otherwise be clipped by the scroll container.
        style={{ scrollPaddingInline: '0.25rem' }}
      >
        {products.map((product, index) => (
          <li key={product.id} className="w-36 shrink-0 snap-start sm:w-44 lg:w-48">
            <Link
              href={`/products/${product.slug}`}
              className="hover:bg-surface-sunken block rounded-xl p-1.5 transition-colors"
            >
              <div className="bg-surface-sunken relative aspect-square w-full overflow-hidden rounded-lg">
                <ProductImage
                  src={product.thumbnail}
                  alt={product.name}
                  priority={priority && index < 4}
                  sizes="(max-width: 640px) 144px, 192px"
                />
              </div>
              <p className="text-ink mt-2 line-clamp-2 text-sm leading-snug">{product.name}</p>
              {product.reviewCount > 0 && (
                <RatingStars
                  rating={product.rating}
                  reviewCount={product.reviewCount}
                  className="mt-1"
                />
              )}
              <PriceDisplay
                price={product.effectivePrice}
                listPrice={product.discountPrice ? product.price : null}
                size="sm"
                className="mt-1"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
