import { Gift } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { DesignCard } from '@/components/gift-cards/design-card';
import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import { GIFT_BRANDS } from '@/data/gift-brands';
import { OCCASIONS, occasionsIn, type OccasionGroup } from '@/data/gift-occasions';
import { cn } from '@/lib/utils/cn';
import {
  applyGiftFilters,
  brandListings,
  DELIVERY_OPTIONS,
  DELIVERY_TYPES,
  DENOMINATIONS,
  designListings,
  type DeliveryType,
  type GiftListing,
  type GiftSort,
} from '@/services/gift-store';

export const metadata: Metadata = {
  title: 'Gift cards by occasion',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
}

function withParams(
  base: Record<string, string>,
  changes: Record<string, string | undefined>,
): string {
  const next = new URLSearchParams(base);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `/gift-cards/occasions?${query}` : '/gift-cards/occasions';
}

function toggled(current: string[], entry: string): string | undefined {
  const next = current.includes(entry)
    ? current.filter((item) => item !== entry)
    : [...current, entry];
  return next.length > 0 ? next.join(',') : undefined;
}

const SORTS: Array<{ key: GiftSort; label: string }> = [
  { key: 'FEATURED', label: 'Featured' },
  { key: 'PRICE_LOW', label: 'Price (Low to High)' },
  { key: 'PRICE_HIGH', label: 'Price (High to Low)' },
  { key: 'NEWEST', label: 'Newest' },
];

const GROUPS: Array<{ id: OccasionGroup; label: string }> = [
  { id: 'EVERYDAY', label: 'Everyday' },
  { id: 'FESTIVE', label: 'Festive' },
  { id: 'CORPORATE', label: 'Workplace' },
];

/**
 * The results grid with the filter column, laid out to the reference.
 *
 * Filters are links, not a client-side panel: every combination is a URL you
 * can share or reload, the back button behaves, and the page works with
 * JavaScript off.
 */
export default async function OccasionsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const occasionId = one(params.occasion);
  const brands = list(
    one(params.brand),
    GIFT_BRANDS.map((brand) => brand.id),
  );
  const delivery = list(one(params.delivery), DELIVERY_TYPES) as DeliveryType[];
  const minRupees = Number(one(params.min)) || undefined;
  const maxRupees = Number(one(params.max)) || undefined;
  const sort = (list(one(params.sort), [
    'FEATURED',
    'PRICE_LOW',
    'PRICE_HIGH',
    'NEWEST',
  ] as const)[0] ?? 'FEATURED') as GiftSort;

  const base: Record<string, string> = {};
  if (occasionId) base.occasion = occasionId;
  if (brands.length) base.brand = brands.join(',');
  if (delivery.length) base.delivery = delivery.join(',');
  if (minRupees) base.min = String(minRupees);
  if (maxRupees) base.max = String(maxRupees);
  if (sort !== 'FEATURED') base.sort = sort;

  // Brand cards join the pool only when no occasion is chosen -- a brand card
  // is not a birthday design, and showing it under one would be a lie the
  // filter itself tells.
  const pool: GiftListing[] = occasionId
    ? designListings()
    : [...brandListings(), ...designListings()];

  const shown = applyGiftFilters(pool, {
    ...(occasionId ? { occasion: occasionId } : {}),
    brands,
    delivery,
    ...(minRupees !== undefined ? { minRupees } : {}),
    ...(maxRupees !== undefined ? { maxRupees } : {}),
    sort,
  });

  const chosen = OCCASIONS.find((occasion) => occasion.id === occasionId);

  return (
    <>
      <GiftNav active="/gift-cards/occasions" />

      <Container size="wide" className="py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-base font-bold sm:text-lg">
            {chosen ? chosen.name : 'All gift cards'}
          </h1>
          <p className="text-ink-muted text-sm">
            {shown.length} design{shown.length === 1 ? '' : 's'}
          </p>
        </div>
        {chosen && <p className="text-ink-muted mt-0.5 text-xs">{chosen.blurb}</p>}

        <div className="mt-3 gap-5 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
          {/* --------------------------------------------------- the filters */}
          <aside className="border-hairline bg-surface mb-4 rounded-2xl border p-4 lg:mb-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Filters</h2>
              <Link
                href="/gift-cards/occasions"
                className="text-link text-xs font-semibold hover:underline"
              >
                Clear All
              </Link>
            </div>

            {GROUPS.map((group) => (
              <Group key={group.id} title={group.label}>
                <ul className="space-y-1.5">
                  {occasionsIn(group.id).map((occasion) => (
                    <li key={occasion.id}>
                      <Check
                        href={withParams(base, {
                          occasion: occasionId === occasion.id ? undefined : occasion.id,
                          // Brand chips make no sense once an occasion is on.
                          brand: undefined,
                        })}
                        on={occasionId === occasion.id}
                        label={occasion.name}
                      />
                    </li>
                  ))}
                </ul>
              </Group>
            ))}

            <Group title="Delivery Type">
              <ul className="space-y-1.5">
                {DELIVERY_OPTIONS.map((option) => (
                  <li key={option.id}>
                    <Check
                      href={withParams(base, { delivery: toggled(delivery, option.id) })}
                      on={delivery.includes(option.id)}
                      label={option.name}
                    />
                  </li>
                ))}
              </ul>
            </Group>

            <Group title="Amount">
              <ul className="space-y-1.5">
                {DENOMINATIONS.map((value) => (
                  <li key={value}>
                    <Check
                      href={withParams(base, {
                        max: maxRupees === value ? undefined : String(value),
                      })}
                      on={maxRupees === value}
                      label={`Up to ₹${value.toLocaleString('en-IN')}`}
                    />
                  </li>
                ))}
              </ul>
            </Group>
          </aside>

          {/* --------------------------------------------------- the results */}
          <div className="min-w-0">
            <nav
              aria-label="Sort results"
              className="border-hairline bg-surface flex overflow-x-auto rounded-t-2xl border border-b-0"
            >
              {SORTS.map((option) => (
                <Link
                  key={option.key}
                  href={withParams(base, {
                    sort: option.key === 'FEATURED' ? undefined : option.key,
                  })}
                  aria-current={sort === option.key ? 'true' : undefined}
                  className={cn(
                    'shrink-0 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors',
                    sort === option.key
                      ? 'border-accent-500 text-ink'
                      : 'text-link border-transparent hover:border-neutral-300',
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </nav>

            <div className="border-hairline rounded-b-2xl border p-3">
              {shown.length === 0 ? (
                <p className="py-10 text-center text-sm">
                  Nothing matches every filter.{' '}
                  <Link
                    href="/gift-cards/occasions"
                    className="text-link font-semibold hover:underline"
                  >
                    Clear them
                  </Link>
                  .
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {shown.map((listing, index) =>
                    listing.design ? (
                      <li key={listing.id}>
                        <DesignCard
                          design={listing.design}
                          {...(delivery[0] ? { delivery: delivery[0] } : {})}
                          priority={index < 5}
                        />
                      </li>
                    ) : (
                      <li key={listing.id}>
                        <BrandTile listing={listing} />
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>

        <p className="text-ink-subtle mt-5 text-xs leading-relaxed">
          <Gift className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
          Every card face here is drawn by this store, and every brand on it is invented. What is
          real is the money: buying one debits your Amazon Pay balance and mints a code that works
          exactly once.
        </p>
      </Container>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-hairline mt-4 border-t pt-4 first-of-type:border-t-0">
      <h3 className="mb-2 text-xs font-bold">{title}</h3>
      {children}
    </div>
  );
}

function Check({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link href={href} aria-pressed={on} className="flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 text-[10px] font-black',
          on ? 'border-accent-500 bg-accent-500 text-brand-950' : 'border-hairline',
        )}
      >
        {on ? '✓' : ''}
      </span>
      <span className={on ? 'text-ink font-semibold' : 'text-ink-muted'}>{label}</span>
    </Link>
  );
}

function BrandTile({ listing }: { listing: GiftListing }) {
  return (
    <Link
      href={`/gift-cards/buy?brand=${listing.brand?.id ?? ''}`}
      className="group border-hairline bg-surface hover:border-accent-500 block overflow-hidden rounded-xl border transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a local SVG with
          no layout shift to guard against; `next/image` adds nothing here. */}
      <img
        src={listing.artwork}
        alt={listing.title}
        width={320}
        height={200}
        className="aspect-[8/5] w-full object-cover"
      />
      <span className="block px-2 py-1.5">
        <span className="text-ink-muted group-hover:text-link block truncate text-[11px]">
          {listing.brand?.name}
        </span>
        {listing.discountPercent > 0 && (
          <span className="text-instock block text-[11px] font-bold">
            {listing.discountPercent}% off
          </span>
        )}
      </span>
    </Link>
  );
}
