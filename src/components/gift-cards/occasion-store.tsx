import Link from 'next/link';

import { DesignCard } from '@/components/gift-cards/design-card';
import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import type { Occasion } from '@/data/gift-occasions';
import { brandsIn, type BrandCategory } from '@/data/gift-brands';
import { designsFor, type GiftDesign } from '@/services/gift-store';

/**
 * The shell both dedicated occasion stores use.
 *
 * The birthday and wedding pages in the reference are the same page with
 * different words: a banner, the designs grouped into named sections, a row of
 * brand categories, and a way back to the wider store. Writing that twice would
 * mean fixing it twice.
 *
 * The section grouping is a slice of the same design list, not a second
 * catalogue -- so a design cannot appear under "New Arrivals" here and not
 * exist on the results grid.
 */

export interface StoreSection {
  title: string;
  /** Where in the occasion's design list this section starts. */
  from: number;
  /** How many designs it shows; the rest of the list when omitted. */
  count?: number;
}

interface Props {
  occasion: Occasion;
  /** The banner headline and its line underneath. */
  heading: string;
  strapline: string;
  sections: StoreSection[];
  /** Brand categories worth pointing at from this occasion. */
  brandCategories: BrandCategory[];
  activeTab: string;
}

export function OccasionStore({
  occasion,
  heading,
  strapline,
  sections,
  brandCategories,
  activeTab,
}: Props) {
  const designs = designsFor(occasion);

  return (
    <>
      <GiftNav active={activeTab} />

      <Container size="wide" className="space-y-7 py-5">
        <header className="border-hairline overflow-hidden rounded-2xl border">
          <div
            className="px-5 py-8 sm:px-8 sm:py-10"
            style={{
              background: `linear-gradient(120deg, hsl(${occasion.hue} 62% 32%), hsl(${(occasion.hue + 40) % 360} 54% 20%))`,
            }}
          >
            <h1 className="text-xl font-bold text-white sm:text-2xl">{heading}</h1>
            <p className="mt-1.5 max-w-xl text-sm text-white/80">{strapline}</p>
          </div>
        </header>

        {sections.map((section) => {
          const slice = designs.slice(
            section.from,
            section.count === undefined ? undefined : section.from + section.count,
          );
          if (slice.length === 0) return null;

          return (
            <section key={section.title} aria-labelledby={`sec-${section.from}`}>
              <h2
                id={`sec-${section.from}`}
                className="border-hairline border-b pb-2 text-xs font-bold tracking-[0.14em] uppercase"
              >
                {section.title}
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {slice.map((design: GiftDesign, index) => (
                  <li key={design.id}>
                    <DesignCard design={design} priority={section.from === 0 && index < 6} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {/* ----------------------------------------------------- the brands */}
        {brandCategories.length > 0 && (
          <section aria-labelledby="store-brands">
            <h2
              id="store-brands"
              className="border-hairline border-b pb-2 text-xs font-bold tracking-[0.14em] uppercase"
            >
              Brand Gift Cards
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {brandCategories.map((category) => {
                const brands = brandsIn(category);
                return (
                  <li key={category}>
                    <Link
                      href="/gift-cards/brands"
                      className="border-hairline bg-surface hover:border-accent-500 block rounded-xl border p-4 transition-colors"
                    >
                      <span className="block text-sm font-bold">{category}</span>
                      <span className="text-ink-muted mt-1 block text-xs">
                        {brands.map((brand) => brand.name).join(', ')}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/gift-cards/occasions?occasion=${occasion.id}`}
            className="border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950 rounded-lg border px-4 py-2 text-sm font-bold transition-colors"
          >
            See all {designs.length} designs
          </Link>
          <Link
            href="/gift-cards"
            className="border-hairline text-ink-muted hover:border-accent-500 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
          >
            Back to the Gift Cards Store
          </Link>
        </div>

        <p className="text-ink-subtle text-xs leading-relaxed">
          Every face here is drawn by this store. Buying one debits your{' '}
          <Link href="/pay/balance" className="text-link hover:underline">
            Amazon Pay balance
          </Link>{' '}
          and mints a code that credits somebody else&apos;s, exactly once.
        </p>
      </Container>
    </>
  );
}
