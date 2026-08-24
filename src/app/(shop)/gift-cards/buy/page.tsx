import { ArrowLeft, Gift } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { getWalletSummary } from '@/services/wallet';
import {
  DELIVERY_OPTIONS,
  DENOMINATIONS,
  designsFor,
  findBrand,
  findDelivery,
  findDesign,
  findVoucherType,
  occasionNoun,
} from '@/services/gift-store';
import { findOccasion } from '@/data/gift-occasions';

import { BuyGiftForm } from './buy-form';

export const metadata: Metadata = {
  title: 'Send a gift card',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/**
 * Buying one.
 *
 * The design, brand or voucher is re-derived from its id rather than trusted
 * from the URL, and derived again inside the action before anything is charged.
 * This page cannot be the authority on a price: it is a page.
 *
 * With nothing chosen it falls back to the first birthday design, so the
 * "Send a Gift Card" tile on the store lands somewhere usable rather than on
 * an error.
 */
export default async function BuyGiftCardPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const brand = findBrand(one(params.brand));
  const voucher = findVoucherType(one(params.voucher));
  // With nothing chosen the page falls back to the first birthday design, so
  // the "Send a Gift Card" tile lands somewhere usable rather than on an error.
  const birthday = findOccasion('birthday');
  const fallback = birthday ? designsFor(birthday)[0] : undefined;
  const design = brand || voucher ? undefined : (findDesign(one(params.design)) ?? fallback);

  const session = await getSession();
  const summary = session
    ? await getWalletSummary(session.user.id)
    : { balance: 0, wallet: 0, giftCards: 0, pending: 0 };

  // A brand card or a voucher is a code, so email is the only way to send one.
  const deliveries =
    brand || voucher ? DELIVERY_OPTIONS.filter((o) => o.id === 'EMAIL') : DELIVERY_OPTIONS;
  const requested = findDelivery(one(params.delivery));
  const initialDelivery =
    requested && deliveries.some((option) => option.id === requested.id)
      ? requested.id
      : (deliveries[0]?.id ?? 'EMAIL');

  const denominations = brand ? brand.denominations : DENOMINATIONS;
  const initialAmount = denominations[Math.min(2, denominations.length - 1)] ?? 500;

  const artwork = brand
    ? `/gift-cards/brand-${brand.id}.svg`
    : (design?.artwork ?? fallback?.artwork ?? '');

  const title = brand
    ? `${brand.name} Gift Card`
    : voucher
      ? voucher.name
      : `${design ? occasionNoun(design.occasion) : 'Eshwaran Pay'} Gift Card`;

  return (
    <>
      <GiftNav active="/gift-cards" />

      <Container size="narrow" className="space-y-4 py-5">
        <Link
          href="/gift-cards"
          className="text-link inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Gift Cards
        </Link>

        {/* The card face is 8:5 and carries its greeting in a band across the
            foot. A wider box crops that band off, which is the one part of the
            design that has to survive. */}
        <header className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          {artwork ? (
            <div className="relative mx-auto aspect-[8/5] w-full max-w-md">
              <Image
                src={artwork}
                alt={`${title} design`}
                fill
                sizes="(max-width: 640px) 100vw, 700px"
                priority
                className="object-cover"
              />
            </div>
          ) : (
            <div className="bg-surface-sunken flex aspect-[16/6] items-center justify-center">
              <Gift className="text-ink-subtle h-10 w-10" aria-hidden="true" />
            </div>
          )}

          <div className="p-4">
            <h1 className="text-base font-bold sm:text-lg">{title}</h1>
            <p className="text-ink-muted mt-1 text-xs">
              {brand
                ? `${brand.tagline} · redeemable ${brand.redeemableAt.toLowerCase()} · valid ${brand.validityMonths} months`
                : voucher
                  ? voucher.purpose
                  : `“${design?.greeting}” · ${design?.occasion.blurb}`}
            </p>
          </div>
        </header>

        {/* Choose another face without leaving the page. */}
        {design && (
          <section aria-labelledby="other-designs">
            <h2 id="other-designs" className="text-xs font-bold">
              Choose another design
            </h2>
            <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {designsFor(design.occasion).map((option) => (
                <li key={option.id} className="shrink-0">
                  <Link
                    href={`/gift-cards/buy?design=${option.id}&delivery=${initialDelivery}`}
                    aria-current={option.id === design.id ? 'true' : undefined}
                    className={`relative block h-16 w-26 overflow-hidden rounded-lg border-2 ${
                      option.id === design.id ? 'border-accent-500' : 'border-hairline'
                    }`}
                  >
                    <Image
                      src={option.artwork}
                      alt={`Design ${option.index + 1}`}
                      width={104}
                      height={65}
                      className="h-16 w-26 object-cover"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <BuyGiftForm
          {...(design ? { designId: design.id } : {})}
          {...(brand ? { brandId: brand.id } : {})}
          {...(voucher ? { voucherKind: voucher.id } : {})}
          denominations={denominations}
          allowCustomAmount={!brand}
          deliveries={deliveries.map((option) => ({
            id: option.id,
            name: option.name,
            blurb: option.blurb,
            feeRupees: option.feeRupees,
            speed: option.speed,
          }))}
          initialDelivery={initialDelivery}
          initialAmount={initialAmount}
          discountPercent={brand?.discountPercent ?? 0}
          balance={summary.balance}
          signedIn={Boolean(session)}
          csrfField={<CsrfField />}
        />

        <p className="text-ink-subtle text-xs leading-relaxed">
          The amount is summed on the server from the denomination and the quantity — this page
          sends no total. The code is minted when the payment clears and is redeemable once, through{' '}
          <Link href="/gift-cards/vouchers" className="text-link hover:underline">
            Add to Eshwaran Pay balance
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
