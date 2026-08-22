import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { HeroCarousel } from '@/components/home/hero-carousel';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import {
  DepartmentGrid,
  NowPromo,
  SaleShelf,
  type DepartmentTile,
} from '@/components/stores/now-grids';
import {
  CategoryRail,
  DeliveryPinBar,
  NowSearch,
  type RailItem,
} from '@/components/stores/now-parts';
import { RecommendedShelf, type RecommendedTab } from '@/components/stores/now-recommended';
import { SavingsPanel } from '@/components/stores/now-savings';
import { getSession } from '@/lib/auth/guards';
import { readGuestCartId } from '@/lib/cart/guest';
import { DELIVERY_PIN_COOKIE } from '@/lib/delivery/cookie';
import { formatPaise } from '@/lib/utils/money';
import type { ProductSummary } from '@/models/product';
import { getBySubcategory, getCategoryDeals, getTodaysDeals } from '@/services/catalog';
import { getCartView } from '@/services/cart';
import { cashbackFor, nextTier } from '@/services/cashback';
import { estimateDelivery, FALLBACK_PIN } from '@/services/delivery';
import { isPrimeMember } from '@/services/prime';

import { JoinPrimeStrip } from './join-prime-strip';

export const metadata: Metadata = {
  title: 'amazon now',
  description: 'Everyday essentials, delivered fast — groceries, snacks, home and personal care.',
};

export const dynamic = 'force-dynamic';

/**
 * The Now store, built to the quick-commerce reference: PIN bar, search,
 * category rail, hero carousel, the two-tier savings panel, a recommended shelf
 * with tabs, department grids in four bands, promo strips between them, and the
 * sale cards at the foot.
 *
 * **Working, not decorative.** The PIN is stored and drives the estimate; the
 * rail, grids and shelves are queries against the live catalogue; every "Add" is
 * the product page's own Server Action; the Join Prime button charges the
 * wallet; and the cashback coins on the savings panel are the tiers
 * `services/checkout.ts` actually credits when an order is placed.
 *
 * **What is deliberately not copied.** The reference's promo strips advertise
 * Tide and a branded wipe, and its savings columns offer cashback on a
 * co-branded ICICI credit card. Those are other companies' marks and a real
 * bank's product. The strips carry this store's own promotions, and the column
 * carries the cashback this store really pays.
 */

/** Every shelf the page reads, fetched once and shared by all the sections. */
const SHELVES = [
  'fruits-vegetables',
  'pantry',
  'snacks',
  'beverages',
  'meat-seafood',
  'skincare',
  'haircare',
  'fragrance',
  'decor',
  'furniture',
  'lighting',
  'cookware',
  'dining',
  'appliances',
  'peripherals',
  'storage',
  'headphones',
  'speakers',
  'cameras',
  'wearables',
  'smartphones',
  'tablets',
  'phone-accessories',
  'watches',
  'footwear',
  'fitness',
  'outdoor',
  'cycling',
  'car-care',
  'car-electronics',
  'car-tools',
  'board-games',
] as const;

type Shelf = (typeof SHELVES)[number];

const RAIL: Array<{ label: string; key: Shelf; href: string }> = [
  {
    label: 'Vegetables',
    key: 'fruits-vegetables',
    href: '/category/grocery?subcategory=fruits-vegetables',
  },
  { label: 'Beverages', key: 'beverages', href: '/category/grocery?subcategory=beverages' },
  { label: 'Snacks', key: 'snacks', href: '/category/grocery?subcategory=snacks' },
  { label: 'Staples', key: 'pantry', href: '/category/grocery?subcategory=pantry' },
  { label: 'Meat & fish', key: 'meat-seafood', href: '/fresh/meat' },
  { label: 'Skin care', key: 'skincare', href: '/category/beauty?subcategory=skincare' },
  { label: 'Hair care', key: 'haircare', href: '/category/beauty?subcategory=haircare' },
  { label: 'Home', key: 'decor', href: '/category/home?subcategory=decor' },
  { label: 'Kitchen', key: 'cookware', href: '/category/kitchen?subcategory=cookware' },
  { label: 'Audio', key: 'headphones', href: '/category/electronics?subcategory=headphones' },
];

/**
 * Four bands of eight, as in the reference.
 *
 * The labels follow the catalogue rather than the screenshot: this store has no
 * paan counter and no feminine-hygiene shelf, and a tile leading to an empty
 * query is exactly the kind of thing the rest of the site goes out of its way
 * not to do. Every entry below is a subcategory that exists and has stock.
 */
const DEPARTMENTS: Array<{
  title: string;
  tiles: Array<{ label: string; key: Shelf; href: string }>;
}> = [
  {
    title: 'Groceries & kitchen',
    tiles: [
      {
        label: 'Fresh vegetables',
        key: 'fruits-vegetables',
        href: '/category/grocery?subcategory=fruits-vegetables',
      },
      { label: 'Atta, rice & dal', key: 'pantry', href: '/category/grocery?subcategory=pantry' },
      { label: 'Chicken, meat & fish', key: 'meat-seafood', href: '/fresh/meat' },
      { label: 'Chips & munchies', key: 'snacks', href: '/category/grocery?subcategory=snacks' },
      {
        label: 'Drinks & juices',
        key: 'beverages',
        href: '/category/grocery?subcategory=beverages',
      },
      {
        label: 'Kitchen appliances',
        key: 'appliances',
        href: '/category/kitchen?subcategory=appliances',
      },
      { label: 'Cookware', key: 'cookware', href: '/category/kitchen?subcategory=cookware' },
      { label: 'Dining', key: 'dining', href: '/category/kitchen?subcategory=dining' },
    ],
  },
  {
    title: 'Household essentials',
    tiles: [
      { label: 'Home lifestyle', key: 'decor', href: '/category/home?subcategory=decor' },
      { label: 'Furniture', key: 'furniture', href: '/category/home?subcategory=furniture' },
      { label: 'Lighting', key: 'lighting', href: '/category/home?subcategory=lighting' },
      { label: 'Vehicle care', key: 'car-care', href: '/category/automotive?subcategory=car-care' },
      {
        label: 'Car electricals',
        key: 'car-electronics',
        href: '/category/automotive?subcategory=car-electronics',
      },
      { label: 'Tools', key: 'car-tools', href: '/category/automotive?subcategory=car-tools' },
      {
        label: 'PC & electronics',
        key: 'peripherals',
        href: '/category/computers?subcategory=peripherals',
      },
      { label: 'Storage', key: 'storage', href: '/category/computers?subcategory=storage' },
    ],
  },
  {
    title: 'Personal care & beauty',
    tiles: [
      { label: 'Bath & body', key: 'skincare', href: '/category/beauty?subcategory=skincare' },
      { label: 'Hair care', key: 'haircare', href: '/category/beauty?subcategory=haircare' },
      { label: 'Fragrance', key: 'fragrance', href: '/category/beauty?subcategory=fragrance' },
      { label: 'Fitness', key: 'fitness', href: '/category/sports?subcategory=fitness' },
      { label: 'Outdoor', key: 'outdoor', href: '/category/sports?subcategory=outdoor' },
      { label: 'Cycling', key: 'cycling', href: '/category/sports?subcategory=cycling' },
      { label: 'Watches', key: 'watches', href: '/category/fashion?subcategory=watches' },
      { label: 'Footwear', key: 'footwear', href: '/category/fashion?subcategory=footwear' },
    ],
  },
  {
    title: 'Tech & entertainment',
    tiles: [
      {
        label: 'Headphones',
        key: 'headphones',
        href: '/category/electronics?subcategory=headphones',
      },
      { label: 'Speakers', key: 'speakers', href: '/category/electronics?subcategory=speakers' },
      { label: 'Cameras', key: 'cameras', href: '/category/electronics?subcategory=cameras' },
      { label: 'Wearables', key: 'wearables', href: '/category/electronics?subcategory=wearables' },
      {
        label: 'Smartphones',
        key: 'smartphones',
        href: '/category/mobiles?subcategory=smartphones',
      },
      { label: 'Tablets', key: 'tablets', href: '/category/mobiles?subcategory=tablets' },
      {
        label: 'Phone accessories',
        key: 'phone-accessories',
        href: '/category/mobiles?subcategory=phone-accessories',
      },
      { label: 'Board games', key: 'board-games', href: '/category/toys?subcategory=board-games' },
    ],
  },
];

const TABS: Array<{ id: string; label: string; keys: Shelf[]; href: string }> = [
  {
    id: 'grocery',
    label: 'Grocery',
    keys: ['fruits-vegetables', 'pantry', 'snacks'],
    href: '/category/grocery',
  },
  {
    id: 'beauty',
    label: 'Beauty',
    keys: ['skincare', 'haircare', 'fragrance'],
    href: '/category/beauty',
  },
  { id: 'home', label: 'Home', keys: ['decor', 'furniture', 'lighting'], href: '/category/home' },
  {
    id: 'kitchen',
    label: 'Kitchen',
    keys: ['cookware', 'dining', 'appliances'],
    href: '/category/kitchen',
  },
  {
    id: 'tech',
    label: 'Tech',
    keys: ['headphones', 'smartphones', 'wearables'],
    href: '/category/electronics',
  },
];

export default async function NowPage() {
  const [session, guestId, cookieStore] = await Promise.all([
    getSession(),
    readGuestCartId(),
    cookies(),
  ]);

  const identity = session
    ? { userId: new ObjectId(session.user.id) }
    : guestId
      ? { guestId }
      : null;

  const [deals, groceryDeals, cart, member, ...lists] = await Promise.all([
    getTodaysDeals(12),
    getCategoryDeals('grocery', 12),
    getCartView(identity),
    session ? isPrimeMember(session.user.id) : Promise.resolve(false),
    ...SHELVES.map((slug) => getBySubcategory(slug, 6)),
  ]);

  const shelf = new Map<Shelf, ProductSummary[]>(
    SHELVES.map((slug, index) => [slug, lists[index] ?? []]),
  );
  const cover = (key: Shelf): string | undefined => shelf.get(key)?.[0]?.thumbnail;

  const delivery =
    estimateDelivery(cookieStore.get(DELIVERY_PIN_COOKIE)?.value ?? FALLBACK_PIN) ??
    estimateDelivery(FALLBACK_PIN);

  // The cashback this basket is actually on course to earn.
  const payable = cart.totals.subtotal - cart.totals.discount;
  const earning = cashbackFor(payable, member);
  const upcoming = nextTier(payable, member);

  const railItems: RailItem[] = RAIL.filter((item) => cover(item.key)).map((item) => ({
    label: item.label,
    href: item.href,
    image: cover(item.key),
  }));

  const tabs: RecommendedTab[] = TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: tab.href,
    products: tab.keys.flatMap((key) => shelf.get(key) ?? []).slice(0, 12),
  })).filter((tab) => tab.products.length > 0);

  return (
    <Container size="wide" className="space-y-5 py-4 sm:py-6">
      {/* ------------------------------------------- PIN bar, search, rail */}
      {delivery && (
        <DeliveryPinBar
          pin={delivery.pin}
          label={delivery.label}
          minutes={delivery.minutes}
          csrfField={<CsrfField />}
        />
      )}
      <NowSearch />
      <CategoryRail items={railItems} />

      {/* ----------------------------------------------- the hero carousel */}
      <HeroCarousel
        slides={[
          {
            id: 'now-fresh',
            theme: 'home',
            badge: 'Trending',
            title: 'Fresh picks, delivered fast',
            subtitle: 'Fruit and vegetables graded by hand, dispatched the day they are picked.',
            image: '/banners/grocery.jpg',
            primary: {
              label: 'Shop fresh produce',
              href: '/category/grocery?subcategory=fruits-vegetables',
            },
            secondary: { label: 'All groceries', href: '/category/grocery' },
          },
          {
            id: 'now-deals',
            theme: 'deals',
            badge: "Today's deals",
            title: 'Discounts refreshed daily',
            subtitle: 'Every reduction here is the one stored on the product, not a banner claim.',
            image: '/banners/deals-festive.jpg',
            primary: { label: 'Shop the deals', href: '/products?deals=true&sort=discount' },
            secondary: { label: 'Browse everything', href: '/products' },
          },
          {
            id: 'now-beauty',
            theme: 'fitness',
            badge: 'Personal care',
            title: 'Bath, body and hair',
            subtitle: 'Skincare, haircare and fragrance from across the catalogue.',
            image: '/banners/beauty.jpg',
            primary: { label: 'Shop beauty', href: '/category/beauty' },
            secondary: { label: 'Skin care', href: '/category/beauty?subcategory=skincare' },
          },
        ]}
      />

      {/* ----------------------------------------------- the savings panel */}
      <SavingsPanel>
        {/* Live, from this visitor's own basket. */}
        <div className="border-hairline bg-surface-sunken border-t px-4 py-3 text-sm sm:px-5">
          {cart.totals.itemCount === 0 ? (
            <p className="text-ink-muted">
              Your basket is empty. Cashback starts at {formatPaise(upcoming?.tier.minOrder ?? 0)}.
            </p>
          ) : (
            <p className="text-ink-muted">
              {earning.reward > 0 && (
                <>
                  This basket earns{' '}
                  <span className="text-instock font-semibold">
                    {formatPaise(earning.reward)} cashback
                  </span>
                  {upcoming
                    ? ` — ${formatPaise(upcoming.shortfall)} more for ${formatPaise(upcoming.tier.reward)}. `
                    : '. '}
                </>
              )}
              {earning.reward === 0 && upcoming && (
                <>
                  <span className="text-ink font-semibold">{formatPaise(upcoming.shortfall)}</span>{' '}
                  more and this basket earns {formatPaise(upcoming.tier.reward)} cashback.{' '}
                </>
              )}
              <Link href="/cart" className="text-link hover:underline">
                View basket
              </Link>
            </p>
          )}
        </div>

        <JoinPrimeStrip member={member} signedIn={Boolean(session)} csrfField={<CsrfField />} />
      </SavingsPanel>

      {/* ------------------------------------------ recommended, with tabs */}
      <RecommendedShelf tabs={tabs} csrfField={<CsrfField />} />

      {/* ------------------------------------------------------- promo one */}
      <NowPromo
        tone="warm"
        eyebrow="Delivered in minutes"
        title="Staples, topped up"
        subtitle="Atta, rice, dals and oils — the shelf that runs out first."
        cta="Order now"
        href="/category/grocery?subcategory=pantry"
        image="/banners/grocery.jpg"
      />

      {/* ------------------------------------------------ department bands */}
      {DEPARTMENTS.map((department) => {
        const tiles: DepartmentTile[] = department.tiles.flatMap((tile) => {
          const image = cover(tile.key);
          return image ? [{ label: tile.label, href: tile.href, image }] : [];
        });
        return <DepartmentGrid key={department.title} title={department.title} tiles={tiles} />;
      })}

      {/* ------------------------------------------------------- promo two */}
      <NowPromo
        tone="cool"
        eyebrow="Personal care"
        title="Skin and hair, restocked"
        subtitle="Cleansers, serums and treatments — as fast as the groceries."
        cta="Order now"
        href="/category/beauty"
        image="/banners/beauty.jpg"
      />

      {/* -------------------------------------------------- the sale cards */}
      <SaleShelf
        title="Grocery sale"
        strapline="The same price as everywhere else in the store"
        maxDiscount={groceryDeals.reduce((high, p) => Math.max(high, p.discountPercentage), 0)}
        products={groceryDeals}
        viewAllHref="/category/grocery?deals=true&sort=discount"
        csrfField={<CsrfField />}
      />

      <SaleShelf
        title="Today's deals"
        strapline="Every discount below is the one stored on the product"
        maxDiscount={deals.reduce((high, p) => Math.max(high, p.discountPercentage), 0)}
        products={deals}
        viewAllHref="/products?deals=true&sort=discount"
        csrfField={<CsrfField />}
      />

      <p className="text-ink-subtle text-xs leading-relaxed">
        Now is a view of the same catalogue, not a separate shop — one basket, one checkout, and no
        platform or surge fee to waive. Delivery windows are estimated from your PIN code rather
        than looked up with a courier.{' '}
        <Link href="/products" className="text-link hover:underline">
          Browse everything
        </Link>
        .
      </p>
    </Container>
  );
}
