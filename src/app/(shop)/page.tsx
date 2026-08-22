import Image from 'next/image';
import Link from 'next/link';

import { HeroCarousel, type HeroSlide } from '@/components/home/hero-carousel';
import { PromoBanners, type PromoBanner } from '@/components/home/promo-banners';
import { SectionHeading } from '@/components/home/section-heading';
import { Container } from '@/components/layout/container';
import { getT } from '@/lib/i18n/server';
import { ProductCarousel } from '@/components/product/product-carousel';
import { ProductGrid } from '@/components/product/product-grid';
import {
  bannerImageIfPresent,
  categoryImageIfPresent,
  heroImageIfPresent,
  heroVideoIfPresent,
} from '@/lib/media/hero-media';
import {
  getBestSellers,
  getFeaturedProducts,
  getNewArrivals,
  getTodaysDeals,
  getTopLevelCategories,
} from '@/services/catalog';

// No `title` override here on purpose. The root layout's `title.template`
// appends " | amazon", so setting the full brand name again produced
// "amazon - Online Shopping ... | amazon". Falling through to `title.default`
// gives the intended title exactly once.

/**
 * Hero slides.
 *
 * Static content, so it is defined here rather than fetched -- a database round
 * trip for six hard-coded headlines would be latency for nothing. The links all
 * point at real, filtered catalogue URLs, so no slide is a dead end.
 */
const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'fashion',
    theme: 'fashion',
    badge: 'Limited Time Offer',
    title: 'Summer Fashion Edit',
    subtitle: 'Curated styles from top brands - new arrivals every week',
    image: '/hero/fashion.svg',
    primary: { label: 'Explore Fashion', href: '/category/fashion' },
    secondary: { label: "Today's Deals", href: '/products?deals=true&sort=discount' },
  },
  {
    id: 'electronics',
    theme: 'electronics',
    badge: 'New Season',
    title: 'Sound & Vision',
    subtitle: 'Headphones, speakers and cameras from the brands we stock',
    image: '/hero/electronics.svg',
    primary: { label: 'Shop Electronics', href: '/category/electronics' },
    secondary: { label: 'Best Sellers', href: '/products?sort=rating' },
  },
  {
    id: 'gaming',
    theme: 'gaming',
    badge: 'Limited Time Offer',
    title: 'Gaming Universe',
    subtitle: 'Consoles, accessories & games - everything for your setup',
    image: '/hero/gaming.svg',
    primary: { label: 'Shop Gaming', href: '/category/toys' },
    secondary: { label: "Today's Deals", href: '/products?deals=true&sort=discount' },
  },
  {
    id: 'mobiles',
    theme: 'mobiles',
    badge: 'Upgrade Week',
    title: 'Phones & Tablets',
    subtitle: 'Flagship cameras, all-day batteries and years of updates',
    image: '/hero/mobiles.svg',
    primary: { label: 'Shop Mobiles', href: '/category/mobiles' },
    secondary: { label: 'Compare Deals', href: '/category/mobiles?deals=true' },
  },
  {
    id: 'home',
    theme: 'home',
    badge: 'Home & Living',
    title: 'Make It Yours',
    subtitle: 'Furniture, lighting and kitchen pieces chosen to last',
    image: '/hero/home.svg',
    primary: { label: 'Shop Home', href: '/category/home' },
    secondary: { label: 'Kitchen Picks', href: '/category/kitchen' },
  },
  {
    id: 'fitness',
    theme: 'fitness',
    badge: 'Hot Deals',
    title: 'Fitness Fest',
    subtitle: 'Gym gear, yoga & sportswear - push harder for up to 60% less',
    image: '/hero/fitness.svg',
    primary: { label: 'Get Fit Now', href: '/category/sports' },
    secondary: { label: "Today's Deals", href: '/products?deals=true&sort=discount' },
  },
  {
    id: 'deals',
    theme: 'deals',
    badge: 'Up to 40% Off',
    title: 'Deals of the Day',
    subtitle: 'Genuine reductions on the products people actually buy',
    image: '/hero/deals.svg',
    primary: { label: 'Shop Deals', href: '/products?deals=true&sort=discount' },
    secondary: { label: 'Browse All', href: '/products' },
  },
];

/**
 * Promotional banners, shown under Today's Deals.
 *
 * Static like the hero slides, and for the same reason: hard-coded copy does
 * not warrant a database round trip. `image` is the banner's file stem under
 * `public/banners/`; the page drops any whose file is missing, so a partial
 * `pnpm banners:fetch` shows fewer banners instead of broken images.
 *
 * `tone` describes the artwork, not the site theme -- most of these are pale
 * studio sets that need dark caption text over them.
 */
const PROMO_FEATURE: Omit<PromoBanner, 'image'> & { image: string } = {
  id: 'festive',
  image: 'deals-festive',
  eyebrow: 'Limited time',
  title: 'Festive Tech & Gifting Edit',
  subtitle: 'Handpicked gadgets and gifts, discounted while stock lasts.',
  cta: 'Shop the deals',
  href: '/products?deals=true&sort=discount',
  tone: 'light',
};

const PROMO_BANNERS: Array<Omit<PromoBanner, 'image'> & { image: string }> = [
  {
    id: 'electronics',
    image: 'electronics',
    eyebrow: 'Setup goals',
    title: 'Build Your Battlestation',
    subtitle: 'Monitors, headsets and keyboards for work and play.',
    cta: 'Shop electronics',
    href: '/category/electronics',
    tone: 'dark',
  },
  {
    id: 'beauty',
    image: 'beauty',
    eyebrow: 'Everyday ritual',
    title: 'Skincare That Sticks',
    subtitle: 'Serums, cleansers and SPF from the shelves we stock.',
    cta: 'Shop beauty',
    href: '/category/beauty',
    tone: 'light',
  },
  {
    id: 'home',
    image: 'home',
    eyebrow: 'Make it yours',
    title: 'Living Room Refresh',
    subtitle: 'Sofas, lighting and decor to finish the room.',
    cta: 'Shop home',
    href: '/category/home',
    tone: 'light',
  },
];

export default async function HomePage() {
  // One parallel wave rather than five sequential awaits: these queries are
  // independent, and serialising them would stack their latencies.
  const [categories, deals, bestSellers, featured, newArrivals, { t }] = await Promise.all([
    getTopLevelCategories(),
    getTodaysDeals(14),
    getBestSellers(14),
    getFeaturedProducts(10),
    getNewArrivals(14),
    getT(),
  ]);
  const viewAll = t('home.viewAll');

  // Only banners whose artwork is actually on disk. `pnpm banners:fetch`
  // downloads them; without it this section simply does not render.
  const resolveBanner = (banner: (typeof PROMO_BANNERS)[number]): PromoBanner | null => {
    const image = bannerImageIfPresent(banner.image);
    return image ? { ...banner, image } : null;
  };
  const featureBanner = resolveBanner(PROMO_FEATURE);
  const promoBanners = PROMO_BANNERS.map(resolveBanner).filter(
    (banner): banner is PromoBanner => banner !== null,
  );

  return (
    <div className="pb-12">
      {/* Backdrops are attached only when the file is actually present in
          `public/hero/`, so nothing 404s while assets are still being added.
          Precedence: video > banner image > generated 3D scene.

            public/hero/fashion.jpg      Summer Fashion Edit
            public/hero/gaming.jpg       Gaming Universe
            public/hero/mobiles.jpg      Phones & Tablets
            public/hero/electronics.jpg  Sound & Vision
            public/hero/fitness.jpg      Fitness Fest
            public/hero/home.jpg         Make It Yours
            public/hero/deals.jpg        Deals of the Day

          (.jpeg/.png/.webp/.avif also work; .mp4/.webm gives that slide video.)
          Restart the dev server after adding files -- existence is checked once
          per boot, not per request. */}
      <HeroCarousel
        slides={HERO_SLIDES.map((slide) => {
          const video = heroVideoIfPresent(slide.id);
          const banner = heroImageIfPresent(slide.id);
          return { ...slide, ...(video ? { video } : {}), ...(banner ? { banner } : {}) };
        })}
      />

      {/* The category card lifts slightly over the bottom of the hero. Kept
          shallow (8px) now that banners fill the band: a deeper overlap would
          eat the banner artwork rather than an empty gradient. */}
      <Container size="wide" className="relative z-10 -mt-2 space-y-6 sm:space-y-8">
        {/* --------------------------------------------------- categories */}
        <section
          aria-labelledby="shop-by-category"
          className="border-hairline from-surface to-surface-muted rounded-2xl border bg-gradient-to-b p-4 shadow-2xl shadow-black/40 sm:p-6"
        >
          <SectionHeading
            id="shop-by-category"
            title={t('home.shopByCategory')}
            viewAllHref="/products"
            viewAllLabel={viewAll}
          />

          {/* 3 across on the smallest phones, up to 12 on a wide monitor, so the
              row stays one tidy band rather than a ragged block. */}
          {/* Square poster tiles. The user-supplied cards at
              `public/categories/<slug>.png` are 1:1 posters with the category
              name, tagline and product renders baked into the artwork, so:

               - tiles are square (a portrait crop would clip the baked title,
                 which starts at the card's left edge);
               - no visible label is drawn over a poster -- it already carries
                 one, and overlaying ours printed every name twice. The link
                 keeps an sr-only name, because a screen reader cannot read
                 pixels.

              Without a poster the generated glyph renders with an overlaid
              text label, exactly as before. Files are resolved from disk at
              render time; restart the dev server after adding one.

              Columns cap at 6 so the posters' baked text stays legible --
              twelve-across made the taglines unreadable mush. 12 tiles divide
              evenly at every step: 2x6, 3x4, 4x3, 6x2. */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 sm:gap-4">
            {categories.map((category) => {
              const poster = categoryImageIfPresent(category.slug);
              const src = poster ?? category.image;

              return (
                <li key={category.slug}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="border-hairline hover:border-accent-500/70 group relative block aspect-square overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/40"
                  >
                    {src && (
                      <Image
                        src={src}
                        alt=""
                        fill
                        // Only the generated SVG bypasses the optimiser; real
                        // images go through it and get resized.
                        unoptimized={src.endsWith('.svg')}
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 280px"
                        className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    )}

                    {poster ? (
                      // The poster's own artwork is the visible label.
                      <span className="sr-only">{category.name}</span>
                    ) : (
                      <>
                        {/* Scrim guarantees contrast for the fallback label. */}
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
                        />
                        <span className="absolute inset-x-1 bottom-2 text-center text-xs leading-tight font-semibold text-white drop-shadow sm:text-sm">
                          {category.name}
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <ProductCarousel
          id="carousel-deals"
          title={t('home.todaysDeals')}
          products={deals}
          viewAllHref="/products?deals=true&sort=discount"
          viewAllLabel={viewAll}
          priority
        />

        {/* ------------------------------------------------- promo banners */}
        {(featureBanner || promoBanners.length > 0) && (
          <section
            aria-labelledby="promo-banners"
            className="border-hairline bg-surface rounded-2xl border p-4 sm:p-6"
          >
            <SectionHeading
              id="promo-banners"
              title={t('home.promoBanners')}
              viewAllHref="/products?deals=true&sort=discount"
              viewAllLabel={viewAll}
            />
            <PromoBanners
              {...(featureBanner ? { feature: featureBanner } : {})}
              banners={promoBanners}
            />
          </section>
        )}

        <ProductCarousel
          id="carousel-best-sellers"
          title={t('home.bestSellers')}
          products={bestSellers}
          viewAllHref="/products?sort=rating"
          viewAllLabel={viewAll}
        />

        {/* ------------------------------------------------------ featured */}
        {featured.length > 0 && (
          <section
            aria-labelledby="featured"
            className="border-hairline bg-surface rounded-2xl border p-4 sm:p-6"
          >
            <SectionHeading
              id="featured"
              title={t('home.featured')}
              viewAllHref="/products"
              viewAllLabel={viewAll}
            />
            <ProductGrid products={featured} />
          </section>
        )}

        <ProductCarousel
          id="carousel-new-arrivals"
          title={t('home.newArrivals')}
          products={newArrivals}
          viewAllHref="/products?sort=newest"
          viewAllLabel={viewAll}
        />
      </Container>
    </div>
  );
}
