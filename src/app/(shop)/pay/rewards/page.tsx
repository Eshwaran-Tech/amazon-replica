import { Coins, Crown, Info, ShoppingBag, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { EARN_TILES, SURFACE_LABELS, type RewardOffer } from '@/data/reward-offers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { isPrimeMember } from '@/services/prime';
import { cashbackEarned, listOffers, type ClaimableOffer } from '@/services/rewards';

import { CollectButton } from './collect-button';

export const metadata: Metadata = {
  title: 'Your rewards',
  description: 'Collect cashback offers and see what you have earned.',
};

export const dynamic = 'force-dynamic';

function shortDate(value: Date): string {
  return value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Your rewards.
 *
 * Laid out to the reference: the membership banner, the cashback-earned strip,
 * the wall of claimable offers, and the ways to earn underneath.
 *
 * The difference is that Collect does something. A collected offer is a row in
 * `rewardClaims`, and the next qualifying order spends it inside the checkout
 * transaction -- so the number under "Cashback earned" is summed from the
 * ledger rather than from a promise.
 */
export default async function RewardsPage() {
  const session = await getSession();
  const prime = session ? await isPrimeMember(session.user.id) : false;

  const [offers, earned] = await Promise.all([
    listOffers(session?.user.id ?? null, prime),
    session ? cashbackEarned(session.user.id) : Promise.resolve(0),
  ]);

  const live = offers.filter((entry) => entry.claim?.status === 'CLAIMED').length;

  return (
    <Container size="wide" className="space-y-6 py-5">
      {/* ---------------------------------------------------------- the band */}
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-2xl bg-gradient-to-r from-[#f6c343] to-[#f0a92c] p-5 text-neutral-900">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] uppercase">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            Rewards
          </p>
          <h1 className="mt-1.5 text-lg font-bold sm:text-xl">
            {prime ? 'Prime rewards are on your account' : 'Collect an offer before you shop'}
          </h1>
          <p className="mt-1 max-w-lg text-sm text-neutral-800">
            {prime
              ? 'Prime-only offers are included below, and the better of your collected offer and the standing tier applies to each order.'
              : 'Every offer here is a real claim against your account. It pays out on the next qualifying order.'}
          </p>
          {!prime && (
            <Link
              href="/prime"
              className="mt-3 inline-block rounded-md bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white"
            >
              See Prime offers
            </Link>
          )}
        </div>

        <div className="border-hairline bg-surface flex flex-col justify-center rounded-2xl border p-5">
          <p className="text-ink-muted flex items-center gap-1.5 text-xs">
            <Coins className="text-accent-400 h-3.5 w-3.5" aria-hidden="true" />
            Cashback earned
          </p>
          <p className="text-accent-400 mt-1 text-2xl font-bold">{formatPaise(earned)}</p>
          <p className="text-ink-subtle mt-1 text-[11px]">
            Summed from your ledger, not from what was promised.{' '}
            <Link href="/pay/balance?type=CASHBACK" className="text-link hover:underline">
              See every credit
            </Link>
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------- the offers */}
      <section aria-labelledby="claim">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="claim" className="text-base font-bold">
            Claim your shopping rewards
          </h2>
          {live > 0 && (
            <p className="text-instock text-xs font-semibold">
              {live} collected and waiting to be used
            </p>
          )}
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {offers.map((entry) => (
            <li key={entry.offer.id}>
              <OfferTile entry={entry} signedIn={Boolean(session)} />
            </li>
          ))}
        </ul>

        <p className="text-ink-subtle mt-3 flex items-start gap-2 text-[11px] leading-relaxed">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            One offer per order, and it does not stack with the standing cashback tiers — the better
            of the two applies. &ldquo;Up to&rdquo; means capped: a percentage offer pays the
            percentage or the cap, whichever is smaller.
          </span>
        </p>
      </section>

      {/* ------------------------------------------------------ ways to earn */}
      <section aria-labelledby="earn">
        <h2 id="earn" className="text-base font-bold">
          Earn rewards every time you pay or shop
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {EARN_TILES.map((tile) => (
            <li key={tile.label}>
              <Link
                href={tile.href}
                className="border-hairline bg-surface hover:border-accent-500 block h-full rounded-xl border p-3 transition-colors"
              >
                <span className="bg-accent-500/15 text-accent-400 flex h-8 w-8 items-center justify-center rounded-full">
                  <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="mt-2 block text-sm font-bold">{tile.label}</span>
                <span className="text-ink-muted mt-0.5 block text-[11px] leading-relaxed">
                  {tile.blurb}
                </span>
                <span className="text-ink-subtle mt-2 block text-[10px] tracking-wide uppercase">
                  {SURFACE_LABELS[tile.surface]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-ink-subtle text-xs leading-relaxed">
        <Sparkles className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
        Collecting an offer writes a claim against your account, and the checkout spends it inside
        the same transaction that takes your money — so an order that fails cannot burn an offer,
        and one offer cannot pay twice. What you have earned is read back from the ledger, which is
        the only record of what was actually paid.
      </p>
    </Container>
  );
}

function OfferTile({ entry, signedIn }: { entry: ClaimableOffer; signedIn: boolean }) {
  const { offer, claim } = entry;

  const status = !signedIn
    ? 'SIGNED_OUT'
    : claim === null
      ? 'AVAILABLE'
      : (claim.status as 'CLAIMED' | 'REDEEMED' | 'EXPIRED');

  const detail =
    claim?.status === 'CLAIMED'
      ? `until ${shortDate(claim.expiresAt)}`
      : claim?.status === 'REDEEMED' && claim.rewardPaid
        ? formatPaise(claim.rewardPaid)
        : undefined;

  return (
    <article
      className={cn(
        'border-hairline bg-surface flex h-full flex-col overflow-hidden rounded-xl border',
        status === 'CLAIMED' && 'border-accent-500',
        status === 'EXPIRED' && 'opacity-60',
      )}
    >
      <div
        className="px-3 py-4 text-neutral-900"
        style={{
          background: `linear-gradient(135deg, hsl(${offer.hue} 88% 68%), hsl(${offer.hue} 82% 56%))`,
        }}
      >
        <p className="text-sm leading-tight font-bold">{offer.headline}</p>
        {offer.primeOnly && (
          <span className="mt-1 inline-block rounded-sm bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold text-white">
            PRIME
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <p className="text-ink-muted text-[11px] leading-snug">{offer.terms}</p>
        <p className="text-ink-subtle mt-1 text-[10px]">
          Min order ₹{offer.minOrderRupees.toLocaleString('en-IN')} ·{' '}
          {SURFACE_LABELS[offer.surface]}
        </p>
        <p className="text-ink-subtle mt-0.5 text-[10px]">
          Valid {offer.validForDays} days once collected
        </p>

        <div className="mt-auto pt-2">
          <CollectButton
            offerId={offer.id}
            status={status}
            {...(detail ? { detail } : {})}
            csrfField={<CsrfField />}
          />
        </div>
      </div>
    </article>
  );
}

export type { RewardOffer };
