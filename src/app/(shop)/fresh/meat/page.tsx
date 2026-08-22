import { Snowflake, Thermometer, Timer } from 'lucide-react';
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
import { getBySubcategory } from '@/services/catalog';
import type { ProductSummary } from '@/models/product';

export const metadata: Metadata = {
  title: 'amazon fresh meat',
  description: 'Chicken, mutton, seafood and cold cuts, cut to order.',
};

/** The product types this store is organised around, in display order. */
const CUTS = [
  'Chicken Breast',
  'Chicken Curry Cut',
  'Boneless Chicken',
  'Mutton Curry Cut',
  'Prawns',
  'Fish Fillet',
  'Seekh Kebab',
  'Cold Cuts',
] as const;

/**
 * The Fresh Meat store.
 *
 * Backed by the catalogue's `grocery/meat-seafood` subcategory, which was
 * added for this store rather than mocked up here -- so every cut below is a
 * product with a real price, stock level and product page.
 *
 * Rows are grouped by cut by matching the product name, which is where the
 * generator puts the type. A cut with nothing in stock is simply absent
 * instead of rendering an empty shelf.
 */
export default async function FreshMeatPage() {
  const all = await getBySubcategory('meat-seafood', 100);

  const byCut = new Map<string, ProductSummary[]>();
  for (const cut of CUTS) {
    const lower = cut.toLowerCase();
    byCut.set(
      cut,
      all.filter((product) => product.name.toLowerCase().includes(lower)),
    );
  }

  const tiles: CategoryTile[] = CUTS.map((cut) => ({
    label: cut,
    href: `/products?q=${encodeURIComponent(cut)}`,
    image: byCut.get(cut)?.[0]?.thumbnail,
  })).filter((tile) => tile.image !== undefined);

  const popular = [...all].sort((a, b) => b.rating - a.rating).slice(0, 14);

  return (
    <Container size="wide" className="space-y-6 py-5 sm:py-7">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/fresh" className="hover:text-link hover:underline">
          fresh
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Meat &amp; seafood</span>
      </nav>

      <StoreHero
        word="freshmeat"
        accent="text-[#c0397a]"
        tagline="Chicken, mutton, seafood and cold cuts — cut to order, cold chain end to end."
      />

      <BenefitCards
        items={[
          {
            title: 'Cut to order',
            body: 'Never pre-packed and left standing.',
            icon: <Timer className="h-5 w-5" />,
          },
          {
            title: 'Cold chain 0–4°C',
            body: 'Maintained from the source to your door.',
            icon: <Thermometer className="h-5 w-5" />,
          },
          {
            title: 'Frozen at −18°C',
            body: 'Where the cut calls for it.',
            icon: <Snowflake className="h-5 w-5" />,
          },
        ]}
      />

      <CategoryCircles title="Shop by category" tiles={tiles} columns={6} />

      <StoreRow
        id="meat-popular"
        title="Popular near you"
        products={popular}
        viewAllHref="/category/grocery?subcategory=meat-seafood&sort=rating"
      />

      {CUTS.map((cut) => (
        <StoreRow
          key={cut}
          id={`meat-${cut.replace(/\W+/g, '-').toLowerCase()}`}
          title={cut}
          products={byCut.get(cut) ?? []}
          viewAllHref={`/products?q=${encodeURIComponent(cut)}`}
        />
      ))}

      <StoreBanner
        tone="green"
        title="Everything else for the week"
        subtitle="Atta, rice, oils, tea and snacks in the fresh store"
        href="/fresh"
        cta="Shop fresh"
      />
    </Container>
  );
}
