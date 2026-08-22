import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { PriceDisplay } from '@/components/product/price-display';
import { ProductImage } from '@/components/product/product-image';
import { QuickAdd } from '@/components/stores/now-parts';
import type { ProductSummary } from '@/models/product';

/**
 * The department grids and sale shelf from the reference's lower half.
 *
 * A tile only exists when the shelf behind it does: `page.tsx` filters out any
 * department entry whose subcategory came back empty, so this never renders a
 * label leading to nothing. Same rule as the circles on Fresh.
 */

export interface DepartmentTile {
  label: string;
  href: string;
  image: string;
}

/** One band: a heading over a dense row of square tiles. */
export function DepartmentGrid({ title, tiles }: { title: string; tiles: DepartmentTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby={`dept-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <h2
        id={`dept-${title.replace(/\W+/g, '-').toLowerCase()}`}
        className="text-ink-muted text-xs font-bold tracking-wide uppercase"
      >
        {title}
      </h2>

      <ul className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {tiles.map((tile) => (
          <li key={tile.href + tile.label}>
            <Link href={tile.href} className="group block text-center">
              <span className="border-ink-subtle group-hover:border-accent-500 bg-surface-sunken relative block aspect-square w-full overflow-hidden rounded-xl border-2 transition-colors">
                <Image
                  src={tile.image}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </span>
              <span className="mt-1 block text-[10px] leading-tight font-medium sm:text-[11px]">
                {tile.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The wide promotional strip between bands. */
export function NowPromo({
  eyebrow,
  title,
  subtitle,
  cta,
  href,
  image,
  tone,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  tone: 'warm' | 'cool';
}) {
  const grounds = {
    warm: 'from-amber-500 to-orange-600',
    cool: 'from-sky-400 to-sky-600',
  } as const;

  return (
    <Link
      href={href}
      className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r ${grounds[tone]} p-5 sm:p-6`}
    >
      <span className="relative z-10 min-w-0 flex-1">
        {eyebrow && (
          <span className="mb-1.5 inline-block rounded-full bg-slate-900/80 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
            {eyebrow}
          </span>
        )}
        <span className="block text-xl leading-tight font-black text-slate-900 sm:text-2xl">
          {title}
        </span>
        <span className="mt-0.5 block text-sm text-slate-800">{subtitle}</span>
        <span className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors group-hover:bg-slate-800">
          {cta}
        </span>
      </span>

      <span className="relative hidden h-28 w-28 shrink-0 overflow-hidden rounded-xl ring-2 ring-white/50 sm:block sm:h-32 sm:w-32">
        <Image src={image} alt="" fill sizes="128px" className="object-cover" />
      </span>
    </Link>
  );
}

/** The reference's "MAHA GROCERY SALE" card: header, grid of tiles, View All. */
export function SaleShelf({
  title,
  strapline,
  maxDiscount,
  products,
  viewAllHref,
  csrfField,
}: {
  title: string;
  strapline: string;
  maxDiscount: number;
  products: ProductSummary[];
  viewAllHref: string;
  /** The server-rendered CSRF input, reused by every tile's form. */
  csrfField: ReactNode;
}) {
  if (products.length === 0) return null;

  return (
    <section
      aria-labelledby="now-sale"
      className="overflow-hidden rounded-2xl bg-gradient-to-b from-amber-400 to-amber-200 p-1"
    >
      <div className="px-3 pt-3 pb-2 text-center">
        <h2 id="now-sale" className="text-lg font-black tracking-tight text-amber-950 sm:text-xl">
          {title}
        </h2>
        <p className="text-xs font-semibold text-amber-900">{strapline}</p>
        {maxDiscount > 0 && (
          <p className="mt-1 inline-block rounded-full bg-amber-950 px-3 py-0.5 text-[11px] font-bold text-amber-100">
            Up to {maxDiscount}% off
          </p>
        )}
      </div>

      <div className="bg-surface rounded-xl p-3">
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {products.map((product) => (
            <li
              key={product.id}
              className="border-hairline bg-surface-sunken flex flex-col rounded-lg border p-2"
            >
              <Link
                href={`/products/${product.slug}`}
                className="bg-surface relative block aspect-square overflow-hidden rounded-md"
              >
                <ProductImage src={product.thumbnail} alt={product.name} sizes="140px" />
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

        <p className="mt-3 text-center">
          <Link
            href={viewAllHref}
            className="text-link inline-flex items-center gap-1 text-sm font-semibold hover:underline"
          >
            View all →
          </Link>
        </p>
      </div>
    </section>
  );
}
