import {
  Building2,
  CreditCard,
  Gift,
  Image as ImageIcon,
  Leaf,
  ShoppingBag,
  Ticket,
  Video,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { DesignCard } from '@/components/gift-cards/design-card';
import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import { BRANDS_OF_THE_MONTH } from '@/data/gift-brands';
import { FEATURED_OCCASIONS, occasionsIn } from '@/data/gift-occasions';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listGiftOrders } from '@/services/gift-purchase';
import { DELIVERY_OPTIONS, designsFor, sampleDesigns } from '@/services/gift-store';

export const metadata: Metadata = {
  title: 'Gift Cards',
  description:
    'Send an Eshwaran Pay gift card for any occasion, or buy a brand card, paid from your Eshwaran Pay balance.',
};

export const dynamic = 'force-dynamic';

/**
 * The gift card store.
 *
 * Laid out to the reference -- the store strip, the delivery tiles, the brand
 * savings row, an occasion row per occasion, and the everyday and festive
 * grids underneath.
 *
 * Every tile here goes somewhere real. The reference's landing page has rows
 * whose tiles are pictures; these are links into a filtered store or straight
 * on to the buy page with the design and the delivery type already chosen.
 */
export default async function GiftCardsPage() {
  const session = await getSession();
  const history = session ? await listGiftOrders(session.user.id, 3) : [];

  const everyday = occasionsIn('EVERYDAY').filter((occasion) => !occasion.featured);
  const festive = occasionsIn('FESTIVE');

  return (
    <>
      <GiftNav active="/gift-cards" />

      <Container size="wide" className="space-y-8 py-5">
        {/* ------------------------------------------------------ the stores */}
        <section aria-labelledby="stores">
          <h1 id="stores" className="text-lg font-bold sm:text-xl">
            Gift Cards
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            Paid from your Eshwaran Pay balance. The code is minted when you pay, and it works once.
          </p>

          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { href: '/gift-cards/buy', icon: Gift, label: 'Send a Gift Card' },
              { href: '/gift-cards/vouchers', icon: Ticket, label: 'Add a Voucher' },
              { href: '/gift-cards/occasions', icon: CreditCard, label: 'By Occasion' },
              { href: '/gift-cards/brands', icon: ShoppingBag, label: 'Brand Gift Cards' },
              { href: '/gift-cards/corporate', icon: Building2, label: 'Corporate Gifting' },
              {
                href: '/gift-cards/vouchers?kind=SHOPPING',
                icon: ShoppingBag,
                label: 'Shopping Vouchers',
              },
              { href: '/gift-cards/vouchers?kind=FRESH', icon: Leaf, label: 'Fresh Vouchers' },
            ].map((tile) => (
              <li key={tile.label}>
                <Link
                  href={tile.href}
                  className="group flex flex-col items-center gap-2 text-center"
                >
                  <span className="border-hairline group-hover:border-accent-500 bg-surface flex h-16 w-16 items-center justify-center rounded-full border transition-colors">
                    <tile.icon className="text-accent-400 h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="text-ink-muted group-hover:text-link text-[11px] leading-tight">
                    {tile.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------ how it is sent */}
        <section aria-labelledby="delivery">
          <h2 id="delivery" className="text-base font-bold">
            Explore popular Eshwaran Pay Gift Cards
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DELIVERY_OPTIONS.map((option) => (
              <li key={option.id}>
                <Link
                  href={`/gift-cards/occasions?delivery=${option.id}`}
                  className="border-hairline bg-surface hover:border-accent-500 block rounded-2xl border p-4 transition-colors"
                >
                  <span className="bg-accent-500/15 text-accent-400 flex h-10 w-10 items-center justify-center rounded-full">
                    {option.id === 'VIDEO' ? (
                      <Video className="h-5 w-5" aria-hidden="true" />
                    ) : option.id === 'PHOTO' ? (
                      <ImageIcon className="h-5 w-5" aria-hidden="true" />
                    ) : option.id === 'PHYSICAL' ? (
                      <Gift className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <CreditCard className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <span className="mt-2 block text-sm font-bold">{option.name}</span>
                  <span className="text-ink-muted mt-0.5 block text-xs">{option.blurb}</span>
                  <span className="text-ink-subtle mt-2 block text-[11px]">
                    {option.speed}
                    {option.feeRupees > 0 ? ` · ₹${option.feeRupees} to send` : ' · no fee'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------- savings on top brands */}
        <section aria-labelledby="brands">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="brands" className="text-base font-bold">
              Savings on top brands
            </h2>
            <Link
              href="/gift-cards/brands"
              className="text-link text-xs font-semibold hover:underline"
            >
              See all brands
            </Link>
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {BRANDS_OF_THE_MONTH.map((brand) => (
              <li key={brand.id}>
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
                      className="object-cover"
                    />
                  </span>
                  <span className="block px-2 py-1.5 text-center">
                    <span className="text-instock block text-[11px] font-bold">
                      {brand.discountPercent > 0
                        ? `Flat ${brand.discountPercent}% off`
                        : 'At face value'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------- the occasion rows */}
        {FEATURED_OCCASIONS.map((occasion) => {
          const designs = sampleDesigns(occasion, 4);
          return (
            <section key={occasion.id} aria-labelledby={`row-${occasion.id}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id={`row-${occasion.id}`} className="text-base font-bold">
                  {occasion.name}
                </h2>
                <Link
                  href={`/gift-cards/occasions?occasion=${occasion.id}`}
                  className="text-link text-xs font-semibold hover:underline"
                >
                  Explore more
                </Link>
              </div>
              <p className="text-ink-muted mt-0.5 text-xs">{occasion.blurb}</p>

              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {designs.map((design, index) => (
                  <li key={design.id}>
                    <DesignCard
                      design={design}
                      delivery={DELIVERY_OPTIONS[index % DELIVERY_OPTIONS.length]?.id}
                      caption={DELIVERY_OPTIONS[index % DELIVERY_OPTIONS.length]?.name}
                    />
                  </li>
                ))}
                <li>
                  <Link
                    href={`/gift-cards/occasions?occasion=${occasion.id}`}
                    className="border-hairline bg-surface-sunken hover:border-accent-500 flex h-full min-h-28 items-center justify-center rounded-xl border text-xs font-semibold transition-colors"
                  >
                    Explore more
                    <span className="text-ink-subtle ml-1">({occasion.designs})</span>
                  </Link>
                </li>
              </ul>
            </section>
          );
        })}

        {/* ------------------------------------------ other everyday moments */}
        <OccasionGrid id="everyday" title="Other everyday occasions" occasions={everyday} />

        {/* -------------------------------------------------- the festivals */}
        <OccasionGrid id="festive" title="Other festive occasions" occasions={festive} />

        {/* ----------------------------------------------------- your orders */}
        {history.length > 0 && (
          <section
            aria-labelledby="gift-history"
            className="border-hairline bg-surface overflow-hidden rounded-2xl border"
          >
            <h2 id="gift-history" className="border-hairline border-b px-4 py-3 text-sm font-bold">
              Gift cards you have sent
            </h2>
            <ul className="divide-hairline divide-y">
              {history.map((order) => (
                <li key={order.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {order.quantity} × {formatPaise(order.faceValue)} for {order.recipientName}
                    </span>
                    <span className="text-ink-muted block text-xs">
                      {order.delivery.toLowerCase()} · ending{' '}
                      {order.codeSuffixes.map((suffix) => `…${suffix}`).join(', ')}
                    </span>
                    <span className="text-ink-subtle block font-mono text-[11px]">
                      {order.reference}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm font-semibold">
                    {formatPaise(order.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-ink-subtle text-xs leading-relaxed">
          Every brand on this page is this store&apos;s own invention — a gift card is a promise
          that a named business will honour it, and these businesses do not exist to honour
          anything. The card faces are drawn here rather than licensed. What is real is the money:
          buying debits your{' '}
          <Link href="/pay/balance" className="text-link hover:underline">
            Eshwaran Pay balance
          </Link>{' '}
          and mints a code that credits somebody else&apos;s, exactly once.
        </p>
      </Container>
    </>
  );
}

function OccasionGrid({
  id,
  title,
  occasions,
}: {
  id: string;
  title: string;
  occasions: ReturnType<typeof occasionsIn>;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-base font-bold">
        {title}
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {occasions.map((occasion) => {
          const first = designsFor(occasion)[0];
          if (!first) return null;
          return (
            <li key={occasion.id}>
              <Link
                href={`/gift-cards/occasions?occasion=${occasion.id}`}
                className="group border-hairline bg-surface hover:border-accent-500 block overflow-hidden rounded-xl border transition-colors"
              >
                <span className="relative block aspect-[8/5]">
                  <Image
                    src={first.artwork}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 45vw, 180px"
                    className="object-cover"
                  />
                </span>
                <span className="text-ink-muted group-hover:text-link block px-2 py-1.5 text-center text-[11px]">
                  {occasion.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
