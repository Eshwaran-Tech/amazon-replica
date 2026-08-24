import { BadgeCheck, Check, Play, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import {
  findChannel,
  findTitle,
  FREE_TITLES,
  INCLUDED_TITLES,
  RENTAL_TITLES,
  VIDEO_CHANNELS,
  type VideoTitle,
} from '@/data/video-catalogue';
import { getSession } from '@/lib/auth/guards';
import { formatPaise, rupeesToPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE } from '@/services/pricing';
import { getMembership, PRIME_PLANS_DETAILS } from '@/services/prime';
import { listEntitlements, RENTAL_WINDOW_HOURS } from '@/services/video';
import { getWalletSummary } from '@/services/wallet';

import { CancelPrimeForm, JoinPrimeForm } from './join-form';
import { ChannelGrid, FreeRow, RentRow } from './video-forms';

export const metadata: Metadata = {
  title: 'Prime Video',
  description: 'Prime Video: included titles, rentals, channels and a free tier.',
};

export const dynamic = 'force-dynamic';

/** A 30-day channel measured in hours reads as noise; say days once it is one. */
function hoursLabel(hours: number): string {
  if (hours <= 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.ceil(hours / 24);
  return `${days} days`;
}

function metaOf(title: VideoTitle): string {
  const length = title.seasons
    ? `${title.seasons} season${title.seasons > 1 ? 's' : ''}`
    : `${title.runtime}m`;
  return `${title.year} · ${length} · ${title.maturity}`;
}

/**
 * Prime Video.
 *
 * The four bands of the reference: the membership pitch, rentals, add-on
 * channels, and the free tier. Renting and subscribing are real -- both charge
 * the Eshwaran Pay wallet and write a dated entitlement, so what the page says
 * you own is what the database says you own.
 *
 * The titles, channels and posters are this project's own. The reference
 * carries real studios' key art and real broadcasters' logos, which belong to
 * those companies; posters here are generated from a gradient and the title.
 */
export default async function PrimeVideoPage() {
  const session = await getSession();

  const [membership, summary, entitlements] = await Promise.all([
    session ? getMembership(session.user.id) : Promise.resolve(null),
    session
      ? getWalletSummary(session.user.id)
      : Promise.resolve({ balance: 0, wallet: 0, giftCards: 0, pending: 0 }),
    listEntitlements(session?.user.id ?? null),
  ]);

  const held = new Set(entitlements.map((entry) => `${entry.kind}:${entry.refId}`));
  const isMember = membership?.active === true;

  return (
    <Container size="wide" className="space-y-4 py-5 sm:py-7">
      {/* ============================================== band 1: membership */}
      <section className="border-hairline bg-surface grid gap-5 rounded-2xl border p-5 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Welcome to Prime Video</h1>
          <p className="text-ink-muted mt-1 text-sm">
            Watch the latest movies, TV shows and originals — and get free delivery across the
            store.
          </p>

          {isMember ? (
            <div className="mt-4">
              <p className="text-instock flex items-center gap-1.5 text-sm font-semibold">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                You are a Prime member
              </p>
              <p className="text-ink-muted mt-1 text-sm">
                Runs until{' '}
                <span className="text-ink font-semibold">
                  {membership.expiresAt.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>{' '}
                ({membership.daysLeft} day{membership.daysLeft === 1 ? '' : 's'} left).
              </p>
              {membership.cancelledAt ? (
                <p className="text-ink-subtle mt-2 text-xs">
                  Renewal is off. You keep everything until the date above.
                </p>
              ) : (
                <CancelPrimeForm csrfField={<CsrfField />} />
              )}
            </div>
          ) : (
            <div className="mt-4">
              <JoinPrimeForm
                plans={PRIME_PLANS_DETAILS.map((plan) => ({
                  plan: plan.plan,
                  name: plan.name,
                  price: plan.price,
                  perMonth: plan.perMonth,
                  months: plan.months,
                }))}
                csrfField={<CsrfField />}
                signedIn={Boolean(session)}
                balance={summary.balance}
              />
              <p className="text-ink-subtle mt-2 text-xs">
                Paid from your Eshwaran Pay balance ({formatPaise(summary.balance)}).{' '}
                <Link href="/pay/balance" className="text-link hover:underline">
                  Add money
                </Link>
              </p>
            </div>
          )}

          <details className="mt-4">
            <summary className="border-hairline hover:border-accent-500 inline-block cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold">
              Compare All Plans
            </summary>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-left text-xs">
                <thead className="text-ink-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      What you get
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Free
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Prime
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-hairline divide-y">
                  {[
                    ['Free-tier catalogue', true, true],
                    ['Included Prime Video titles', false, true],
                    [`Free delivery below ${formatPaise(FREE_SHIPPING_THRESHOLD)}`, false, true],
                    ['Rent new releases', true, true],
                    ['Add-on channels', true, true],
                  ].map(([label, free, prime]) => (
                    <tr key={String(label)}>
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {String(label)}
                      </th>
                      <td className="py-2 pr-3">
                        <Tick on={Boolean(free)} />
                      </td>
                      <td className="py-2 pr-3">
                        <Tick on={Boolean(prime)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-ink-subtle mt-2 text-[11px]">
                Non-members pay {formatPaise(STANDARD_SHIPPING_FEE)} delivery under{' '}
                {formatPaise(FREE_SHIPPING_THRESHOLD)}; members never do.
              </p>
            </div>
          </details>
        </div>

        {/* Included titles, as the reference's poster wall. */}
        <ul className="grid grid-cols-4 gap-2">
          {INCLUDED_TITLES.map((title) => (
            <li key={title.id}>
              <span
                className={cn(
                  'flex aspect-[2/3] flex-col justify-end rounded-lg bg-gradient-to-br p-2',
                  title.gradient,
                )}
              >
                <span className="text-[11px] leading-tight font-bold text-white drop-shadow">
                  {title.name}
                </span>
                <span className="text-[9px] text-white/80">{metaOf(title)}</span>
                <span
                  className={cn(
                    'mt-1 w-fit rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                    isMember ? 'bg-white/90 text-slate-900' : 'bg-slate-900/80 text-white',
                  )}
                >
                  {isMember ? 'Included' : 'With Prime'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ================================================= band 2: rentals */}
      <section className="border-hairline bg-surface rounded-2xl border p-5 sm:p-6">
        <h2 className="text-lg font-bold sm:text-xl">Movie rentals on Prime Video</h2>
        <p className="text-ink-muted mt-1 text-sm">
          Early access to new films, before they reach the included catalogue. {RENTAL_WINDOW_HOURS}
          -hour viewing window, charged to your Eshwaran Pay balance.
        </p>

        <div className="mt-4">
          <RentRow
            csrfField={<CsrfField />}
            titles={RENTAL_TITLES.map((title) => ({
              id: title.id,
              name: title.name,
              gradient: title.gradient,
              meta: metaOf(title),
              price: rupeesToPaise(title.rentRupees),
              held: held.has(`RENTAL:${title.id}`),
            }))}
          />
        </div>
      </section>

      {/* ================================================ band 3: channels */}
      <section className="border-hairline bg-surface grid gap-5 rounded-2xl border p-5 sm:p-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">
            Your favourite subscriptions all in one place
          </h2>
          <p className="text-ink-muted mt-1 text-sm">
            Add a channel to your account and it is billed monthly from your Eshwaran Pay balance —
            one place to start it, one place to see what it cost.
          </p>
          <p className="text-ink-subtle mt-2 text-xs">
            These channels are this project&apos;s own. Real broadcasters&apos; names and logos are
            their property and are not used here.
          </p>
        </div>

        <ChannelGrid
          csrfField={<CsrfField />}
          channels={VIDEO_CHANNELS.map((channel) => ({
            id: channel.id,
            name: channel.name,
            gradient: channel.gradient,
            meta: channel.blurb,
            price: rupeesToPaise(channel.priceRupees),
            held: held.has(`CHANNEL:${channel.id}`),
          }))}
        />
      </section>

      {/* ================================================== band 4: free */}
      <section className="border-hairline bg-surface rounded-2xl border p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Play className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Watch for free
        </h2>
        <p className="text-ink-muted mt-1 text-sm">
          Web series, drama and comedy at no cost — no membership, no rental, nothing to pay.
        </p>

        <div className="mt-4">
          <FreeRow
            titles={FREE_TITLES.map((title) => ({
              id: title.id,
              name: title.name,
              gradient: title.gradient,
              meta: metaOf(title),
            }))}
          />
        </div>
      </section>

      {entitlements.length > 0 && (
        <section className="border-hairline bg-surface rounded-2xl border p-5">
          <h2 className="text-sm font-bold">Your library</h2>
          <ul className="text-ink-muted mt-2 space-y-1 text-xs">
            {entitlements.map((entry) => {
              const name =
                entry.kind === 'RENTAL'
                  ? findTitle(entry.refId)?.name
                  : findChannel(entry.refId)?.name;

              return (
                <li key={`${entry.kind}:${entry.refId}`}>
                  <span className="text-ink font-semibold">{name ?? entry.refId}</span> ·{' '}
                  {entry.kind === 'RENTAL' ? 'rental' : 'channel'} · {hoursLabel(entry.hoursLeft)}{' '}
                  left
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-ink-subtle text-xs leading-relaxed">
        There is no video player in this store, so nothing here streams — what does work is the
        commerce: memberships, rentals and channel subscriptions are charged to your wallet and
        recorded as dated entitlements you can see above and on{' '}
        <Link href="/pay/balance" className="text-link hover:underline">
          your balance
        </Link>
        .
      </p>
    </Container>
  );
}

function Tick({ on }: { on: boolean }) {
  return on ? (
    <>
      <Check className="text-instock h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Included</span>
    </>
  ) : (
    <>
      <X className="text-ink-subtle h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Not included</span>
    </>
  );
}
