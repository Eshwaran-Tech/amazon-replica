import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ProductCarousel } from '@/components/product/product-carousel';
import type { ProductSummary } from '@/models/product';
import { cn } from '@/lib/utils/cn';

/**
 * Building blocks shared by the three themed storefronts.
 *
 * Each store is a *view of the real catalogue* -- the tiles, rows and deal
 * strips are filtered queries against the same products the rest of the site
 * sells, not a separate set of fixtures. So a price shown here is the price at
 * checkout, and a category tile that is empty says so rather than rendering a
 * decorative grid over nothing.
 */

export function StoreHero({
  word,
  tagline,
  accent,
  children,
}: {
  word: string;
  tagline: string;
  /** Tailwind text colour for the wordmark. */
  accent: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-hairline bg-surface rounded-2xl border p-5 sm:p-6">
      <p className={cn('text-3xl leading-none font-bold sm:text-4xl', accent)}>{word}</p>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 block h-1 w-20 rounded-full', accent.replace('text-', 'bg-'))}
      />
      <p className="text-ink-muted mt-3 max-w-2xl text-sm">{tagline}</p>
      {children}
    </header>
  );
}

/** The three-up savings strip at the top of the Fresh and Now stores. */
export function BenefitCards({
  items,
}: {
  items: Array<{ title: string; body: string; icon: ReactNode }>;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <li
          key={item.title}
          className="border-hairline bg-surface flex items-start gap-3 rounded-xl border p-3"
        >
          <span
            aria-hidden="true"
            className="bg-accent-500/15 text-accent-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          >
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{item.title}</span>
            <span className="text-ink-muted block text-xs leading-snug">{item.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface CategoryTile {
  label: string;
  href: string;
  /** A product image standing in for the category, when one exists. */
  image?: string | undefined;
}

/**
 * The circular "Shop by category" grid.
 *
 * Images come from real products in that category, so an empty category shows
 * an initial rather than a stock photo of something it does not sell.
 */
export function CategoryCircles({
  title,
  tiles,
  columns = 4,
}: {
  title: string;
  tiles: CategoryTile[];
  columns?: 4 | 5 | 6;
}) {
  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby={`tiles-${title.replace(/\W+/g, '-').toLowerCase()}`}>
      <h2
        id={`tiles-${title.replace(/\W+/g, '-').toLowerCase()}`}
        className="text-base font-bold sm:text-lg"
      >
        {title}
      </h2>

      <ul
        className={cn(
          'mt-3 grid gap-3 sm:gap-4',
          columns === 6 && 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6',
          columns === 5 && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
          columns === 4 && 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        {tiles.map((tile) => (
          <li key={tile.href + tile.label}>
            <Link href={tile.href} className="group block text-center">
              {/*
                Capped rather than `w-full`: in a wide container four columns
                would each be ~340px across, which turns a category shortcut
                into a hero image. The ring is two solid pixels of `ink-subtle`
                because several catalogue photos are cut out on black, and a
                hairline against those is no edge at all.
              */}
              <span className="border-ink-subtle group-hover:border-accent-500 bg-surface-sunken relative mx-auto block aspect-square w-full max-w-[8.5rem] overflow-hidden rounded-full border-2 transition-colors sm:max-w-[10rem]">
                {tile.image ? (
                  <Image
                    src={tile.image}
                    alt=""
                    fill
                    sizes="160px"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span className="text-ink-subtle absolute inset-0 flex items-center justify-center text-2xl font-bold">
                    {tile.label.charAt(0)}
                  </span>
                )}
              </span>
              <span className="mt-2 block text-xs leading-tight font-medium sm:text-sm">
                {tile.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A titled product row; renders nothing when the query came back empty. */
export function StoreRow({
  id,
  title,
  products,
  viewAllHref,
}: {
  id: string;
  title: string;
  products: ProductSummary[];
  viewAllHref: string;
}) {
  if (products.length === 0) return null;

  return (
    <ProductCarousel
      id={id}
      title={title}
      products={products}
      viewAllHref={viewAllHref}
      viewAllLabel="See all"
    />
  );
}

/** The wide promotional strip between sections. */
export function StoreBanner({
  title,
  subtitle,
  href,
  cta,
  tone = 'accent',
}: {
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  tone?: 'accent' | 'green' | 'blue';
}) {
  const gradients = {
    accent: 'from-accent-500 to-accent-400',
    green: 'from-[#4a9c2d] to-[#7cc142]',
    blue: 'from-[#1a9cd8] to-[#4fc3f7]',
  } as const;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center justify-between gap-4 rounded-2xl bg-gradient-to-r p-5 transition-transform hover:-translate-y-0.5',
        gradients[tone],
      )}
    >
      <span className="min-w-0">
        <span className="block text-lg font-bold text-slate-900 sm:text-xl">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-800">{subtitle}</span>
      </span>
      <span className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        {cta}
      </span>
    </Link>
  );
}
