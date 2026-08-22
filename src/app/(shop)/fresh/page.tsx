import { BadgePercent, Truck, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import {
  BenefitCards,
  CategoryCircles,
  StoreBanner,
  StoreHero,
  StoreRow,
  type CategoryTile,
} from '@/components/stores/store-parts';
import { getBySubcategory, getCategoryDeals } from '@/services/catalog';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: `${BRAND_NAME} Fresh`,
  description: 'Everyday groceries, staples and fresh food.',
};

/**
 * The Fresh store.
 *
 * Every row is a query against the real catalogue's `grocery` category, so the
 * prices, stock and images are the ones checkout will use. Nothing here is a
 * fixture.
 */
export default async function FreshPage() {
  const [produce, beverages, snacks, pantry, meat, deals] = await Promise.all([
    getBySubcategory('fruits-vegetables', 18),
    getBySubcategory('beverages', 14),
    getBySubcategory('snacks', 14),
    getBySubcategory('pantry', 14),
    getBySubcategory('meat-seafood', 14),
    getCategoryDeals('grocery', 14),
  ]);

  // Tiles borrow a real product photo from the category they lead to.
  const tiles: CategoryTile[] = [
    {
      label: 'Fruits & vegetables',
      href: '/category/grocery?subcategory=fruits-vegetables',
      image: produce[0]?.thumbnail,
    },
    {
      label: 'Tea & coffee',
      href: '/category/grocery?subcategory=beverages',
      image: beverages[0]?.thumbnail,
    },
    {
      label: 'Snacks & biscuits',
      href: '/category/grocery?subcategory=snacks',
      image: snacks[0]?.thumbnail,
    },
    {
      label: 'Atta, rice & dals',
      href: '/category/grocery?subcategory=pantry',
      image: pantry[0]?.thumbnail,
    },
    { label: 'Meat & seafood', href: '/fresh/meat', image: meat[0]?.thumbnail },
  ];

  return (
    <Container size="wide" className="space-y-6 py-5 sm:py-7">
      <StoreHero
        word="fresh"
        accent="text-[#4a9c2d]"
        tagline={`Groceries, staples and everyday essentials from the ${BRAND_NAME} catalogue — same prices, same stock, one basket at checkout.`}
      />

      <BenefitCards
        items={[
          {
            title: 'Free delivery over ₹499',
            body: 'Applied automatically in the cart.',
            icon: <Truck className="h-5 w-5" />,
          },
          {
            title: 'Deals every day',
            body: 'Discounts refresh as stock moves.',
            icon: <BadgePercent className="h-5 w-5" />,
          },
          {
            title: 'Pay your way',
            body: 'Card, UPI, net banking or cash on delivery.',
            icon: <Wallet className="h-5 w-5" />,
          },
        ]}
      />

      <CategoryCircles title="Groceries & food" tiles={tiles} columns={5} />

      <StoreRow
        id="fresh-produce"
        title="Fruits & vegetables"
        products={produce}
        viewAllHref="/category/grocery?subcategory=fruits-vegetables"
      />

      <StoreRow
        id="fresh-deals"
        title="Deal zone"
        products={deals}
        viewAllHref="/category/grocery?deals=true&sort=discount"
      />

      <StoreBanner
        tone="green"
        title="Meat & seafood, cut to order"
        subtitle="Cold chain end to end, delivered at 0–4°C"
        href="/fresh/meat"
        cta="Visit the store"
      />

      <StoreRow
        id="fresh-pantry"
        title="Atta, rice & dals"
        products={pantry}
        viewAllHref="/category/grocery?subcategory=pantry"
      />
      <StoreRow
        id="fresh-beverages"
        title="Tea, coffee & drink mixes"
        products={beverages}
        viewAllHref="/category/grocery?subcategory=beverages"
      />
      <StoreRow
        id="fresh-snacks"
        title="Snacks & biscuits"
        products={snacks}
        viewAllHref="/category/grocery?subcategory=snacks"
      />

      <p className="text-ink-subtle text-xs">
        Fresh is a view of this store&apos;s grocery range, not a separate shop —{' '}
        <Link href="/category/grocery" className="text-link hover:underline">
          browse all groceries
        </Link>
        .
      </p>
    </Container>
  );
}
