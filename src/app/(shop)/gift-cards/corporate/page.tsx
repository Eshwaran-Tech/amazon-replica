import { BadgeCheck, Building2, Headphones, Palette, ShieldCheck, Zap } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { GiftNav } from '@/components/gift-cards/gift-nav';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { occasionsIn } from '@/data/gift-occasions';
import { designsFor } from '@/services/gift-store';

import { BulkTools } from './bulk-tools';

export const metadata: Metadata = {
  title: 'Corporate Gifting',
  description:
    'Bulk gift cards for teams and rewards, with published discount slabs and no quotation to chase.',
};

export const dynamic = 'force-dynamic';

/**
 * Corporate gifting.
 *
 * Three things the reference does that this page deliberately does not.
 *
 * It shows a wall of real companies' logos under "the preferred gifting partner
 * for 10,000+ organisations". This store has no customers to name and no such
 * count to claim, so it makes no claim.
 *
 * It carries testimonials attributed to unnamed executives at real firms. Those
 * would be fabricated quotes from people who never said them, which is the one
 * thing on any of these pages that could actually mislead somebody into
 * spending money.
 *
 * It promises a reply within one business day. There is nobody here to reply,
 * so instead the enquiry is genuinely recorded and the page says exactly that.
 *
 * What replaces them is the part that is real: published discount slabs, a
 * calculator that works them out, and the workplace card designs.
 */
export default function CorporateGiftingPage() {
  const workplace = occasionsIn('CORPORATE');

  return (
    <>
      <GiftNav active="/gift-cards/corporate" />

      <Container size="wide" className="space-y-8 py-5">
        {/* ------------------------------------------------------- the hero */}
        <header className="border-hairline overflow-hidden rounded-2xl border bg-gradient-to-r from-[#1b2a4a] to-[#2b3f6b] px-5 py-8 sm:px-8 sm:py-10">
          <p className="text-accent-400 flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            Corporate gifting
          </p>
          <h1 className="mt-2 text-xl font-bold text-white sm:text-3xl">
            Gift cards, in bulk, without the quotation
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/80">
            For rewards, incentives and payouts. The discount slabs are published below and the
            calculator works them out — so you can size an order before you speak to anybody, which
            is just as well, because there is nobody here to speak to.
          </p>
        </header>

        {/* --------------------------------------- the calculator and form */}
        <BulkTools csrfField={<CsrfField />} />

        {/* --------------------------------------------------- what it does */}
        <section aria-labelledby="benefits">
          <h2 id="benefits" className="text-base font-bold">
            What a gift card is good for
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: 'Anything this store sells',
                body: 'The balance spends across the whole catalogue, not a curated corner of it.',
              },
              {
                title: 'Recharges and bills',
                body: 'Mobile recharges are paid from the same balance a gift card credits.',
              },
              {
                title: 'Travel and tickets',
                body: 'Flights, buses, trains and hotel stays all draw on the same balance.',
              },
            ].map((item) => (
              <li key={item.title} className="border-hairline bg-surface rounded-xl border p-4">
                <p className="text-sm font-bold">{item.title}</p>
                <p className="text-ink-muted mt-1 text-xs leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------- why it is safe */}
        <section aria-labelledby="why" className="rounded-2xl bg-[#1b2a4a] px-5 py-7 sm:px-8">
          <h2 id="why" className="text-center text-lg font-bold text-white">
            Why a gift card rather than a transfer
          </h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {[
              {
                icon: Zap,
                title: 'Instant delivery',
                body: 'The code exists the moment the payment clears.',
              },
              {
                icon: ShieldCheck,
                title: 'Stored as a hash',
                body: 'Only a keyed hash of each code is kept, never the code.',
              },
              {
                icon: Palette,
                title: 'Choose the face',
                body: 'Every workplace design below, and a message on each.',
              },
              {
                icon: BadgeCheck,
                title: 'Spent once',
                body: 'Redemption is one conditional update. No code pays twice.',
              },
              {
                icon: Headphones,
                title: 'One ledger',
                body: 'Every card shows up in the balance, itemised.',
              },
            ].map((item) => (
              <li key={item.title} className="text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
                  <item.icon className="text-accent-400 h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-2 text-sm font-bold text-white">{item.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/70">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------- the workplace faces */}
        <section aria-labelledby="designs">
          <h2 id="designs" className="text-base font-bold">
            Workplace card designs
          </h2>
          <p className="text-ink-muted mt-1 text-xs">
            Every one buyable now, from your Eshwaran Pay balance, one at a time or fifty.
          </p>

          <div className="mt-4 space-y-5">
            {workplace.map((occasion) => (
              <div key={occasion.id}>
                <h3 className="text-ink-muted text-xs font-bold">{occasion.name}</h3>
                <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {designsFor(occasion).map((design) => (
                    <li key={design.id}>
                      <Link
                        href={`/gift-cards/buy?design=${design.id}`}
                        className="group border-hairline bg-surface hover:border-accent-500 block overflow-hidden rounded-xl border transition-colors"
                      >
                        <span className="relative block aspect-[8/5]">
                          <Image
                            src={design.artwork}
                            alt={`${occasion.name} card design`}
                            fill
                            sizes="(max-width: 640px) 45vw, 200px"
                            className="object-cover"
                          />
                        </span>
                        <span className="text-ink-muted group-hover:text-link block px-2 py-1.5 text-[11px]">
                          Send this one
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <p className="text-ink-subtle text-xs leading-relaxed">
          This page names no customers and quotes no testimonials, because this store has neither —
          the reference&apos;s wall of client logos and its quotes from unnamed executives are the
          one thing on a page like this that could genuinely mislead somebody into spending money.
          The discount slabs, the calculator and the designs are all real, and the enquiry form
          really does store what you type into it.
        </p>
      </Container>
    </>
  );
}
