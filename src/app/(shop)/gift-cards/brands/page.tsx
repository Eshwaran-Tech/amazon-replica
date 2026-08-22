import { BadgePercent, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import {
  BRANDS_OF_THE_MONTH,
  brandsIn,
  populatedCategories,
  type GiftBrand,
} from '@/data/gift-brands';

export const metadata: Metadata = {
  title: 'Brand Gift Cards',
  description: 'Gift cards for the brands this store carries, paid from your Amazon Pay balance.',
};

/**
 * The brand store, laid out to the reference: the banner, the brands of the
 * month, then a horizontal row per category.
 *
 * Every brand here is this store's own invention, which the note at the foot
 * says plainly. A gift card is a promise that a named business will honour it,
 * and putting a real retailer's name on a card this store issues would be
 * making that promise on their behalf.
 */
export default function BrandGiftCardsPage() {
  const categories = populatedCategories();

  return (
    <>
      <GiftNav active="/gift-cards/brands" />

      <Container size="wide" className="space-y-8 py-5">
        <header className="from-accent-500/20 border-hairline rounded-2xl border bg-gradient-to-r to-transparent p-5">
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Store className="text-accent-400 h-5 w-5" aria-hidden="true" />
            Brand Gift Cards Store
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            A simple way to shop and save on brands. Paid from your Amazon Pay balance.
          </p>
        </header>

        {/* ------------------------------------------- brands of the month */}
        <section aria-labelledby="month">
          <h2 id="month" className="flex items-center gap-2 text-base font-bold">
            <BadgePercent className="text-accent-400 h-4 w-4" aria-hidden="true" />
            Brands of the Month
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {BRANDS_OF_THE_MONTH.map((brand) => (
              <li key={brand.id}>
                <BrandTile brand={brand} priority />
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------- by category */}
        {categories.map((category) => {
          const brands = brandsIn(category);
          return (
            <section key={category} aria-labelledby={`cat-${category}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`cat-${category}`} className="text-base font-bold">
                  {category} Gift Cards
                </h2>
                <span className="text-ink-subtle text-xs">
                  {brands.length} brand{brands.length === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {brands.map((brand) => (
                  <li key={brand.id} className="w-44 shrink-0">
                    <BrandTile brand={brand} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <p className="text-ink-subtle text-xs leading-relaxed">
          Every brand on this page is this store&apos;s own invention. A gift card is a promise that
          a named business will honour it, and these businesses do not exist to honour anything — so
          none of them borrows a real retailer&apos;s name or mark. What is real is the mechanism:
          buying one debits your{' '}
          <Link href="/pay/balance" className="text-link hover:underline">
            Amazon Pay balance
          </Link>{' '}
          and mints a code that redeems exactly once.
        </p>
      </Container>
    </>
  );
}

function BrandTile({ brand, priority }: { brand: GiftBrand; priority?: boolean }) {
  return (
    <Link
      href={`/gift-cards/buy?brand=${brand.id}`}
      className="group border-hairline bg-surface hover:border-accent-500 block overflow-hidden rounded-xl border transition-colors"
    >
      <span className="relative block aspect-[8/5]">
        <Image
          src={`/gift-cards/brand-${brand.id}.svg`}
          alt={`${brand.name} gift card`}
          fill
          sizes="(max-width: 640px) 45vw, 180px"
          priority={priority}
          className="object-cover"
        />
      </span>
      <span className="block px-2 py-2">
        <span className="group-hover:text-link block truncate text-xs font-semibold">
          {brand.name}
        </span>
        <span className="text-ink-subtle mt-0.5 block text-[10px]">
          From ₹{Math.min(...brand.denominations).toLocaleString('en-IN')} ·{' '}
          {brand.redeemableAt.toLowerCase()}
        </span>
        <span
          className={
            brand.discountPercent > 0
              ? 'text-instock mt-1 block text-[11px] font-bold'
              : 'text-ink-subtle mt-1 block text-[11px]'
          }
        >
          {brand.discountPercent > 0 ? `Flat ${brand.discountPercent}% off` : 'At face value'}
        </span>
      </span>
    </Link>
  );
}
