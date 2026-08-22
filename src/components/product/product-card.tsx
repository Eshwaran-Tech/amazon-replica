import { Truck } from 'lucide-react';
import Link from 'next/link';

import { getT } from '@/lib/i18n/server';
import { cn } from '@/lib/utils/cn';
import type { ProductSummary } from '@/models/product';

import { PriceDisplay } from './price-display';
import { ProductImage } from './product-image';
import { RatingStars } from './rating-stars';

interface ProductCardProps {
  product: ProductSummary;
  /** Above-the-fold cards skip lazy loading to improve LCP. */
  priority?: boolean;
  className?: string;
}

/**
 * Grid tile.
 *
 * One link wraps the image and the title rather than several competing links to
 * the same destination -- duplicate adjacent links are a common screen-reader
 * annoyance, and they make keyboard tabbing through a grid twice as long.
 *
 * The title is clamped to two lines so a long product name cannot push the
 * price out of alignment with the neighbouring cards.
 */
export async function ProductCard({ product, priority = false, className }: ProductCardProps) {
  const { t } = await getT();
  return (
    <article
      className={cn(
        'border-hairline bg-surface group relative flex flex-col rounded-xl border p-2.5 sm:p-3',
        'hover:border-accent-500/50 transition-colors hover:shadow-lg hover:shadow-black/30',
        className,
      )}
    >
      <div className="bg-surface-sunken relative aspect-square w-full overflow-hidden rounded-lg">
        <ProductImage
          src={product.thumbnail}
          alt={product.name}
          priority={priority}
          className="transition-transform duration-200 group-hover:scale-[1.03]"
        />

        {product.discountPercentage > 0 && (
          <span className="bg-deal absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold text-white">
            {t('product.off', { percent: product.discountPercentage })}
          </span>
        )}

        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-1 text-center text-[11px] font-semibold text-white">
            {t('product.unavailable')}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-1 flex-col gap-1">
        <p className="text-ink-subtle text-xs">{product.brand}</p>

        <h3 className="text-sm leading-snug font-medium">
          {/* `after:absolute inset-0` turns the whole card into the click target
              while keeping exactly one link in the accessibility tree. */}
          <Link
            href={`/products/${product.slug}`}
            className="text-ink hover:text-link after:absolute after:inset-0 after:content-['']"
          >
            <span className="line-clamp-2">{product.name}</span>
          </Link>
        </h3>

        {product.reviewCount > 0 && (
          <RatingStars rating={product.rating} reviewCount={product.reviewCount} />
        )}

        <div className="mt-auto pt-1.5">
          <PriceDisplay
            price={product.effectivePrice}
            listPrice={product.discountPrice ? product.price : null}
            discountPercentage={product.discountPercentage}
            size="sm"
          />

          {product.isPrime && (
            <p className="text-instock mt-1 flex items-center gap-1 text-xs font-semibold">
              <Truck className="h-3.5 w-3.5" aria-hidden="true" />
              {t('product.fastDelivery')}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
