import Link from 'next/link';

import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import { CASHBACK_TIERS, type CashbackTier } from '@/services/cashback';
import { FREE_SHIPPING_THRESHOLD, STANDARD_SHIPPING_FEE } from '@/services/pricing';

/**
 * The savings panel, in the reference's two-tier layout: cashback coins on the
 * left, delivery and cashback columns on the right, a Prime band across the
 * middle, and the join control at the bottom.
 *
 * Every figure is read from the code that enforces it -- the coins from
 * `CASHBACK_TIERS`, which `placeOrder` credits against, and the delivery line
 * from `services/pricing.ts`, which `calculateTotals` charges from. The
 * reference's third column offers cashback on a co-branded ICICI credit card;
 * that is a real bank's product and is not reproduced, so the column carries
 * the benefit this store does have.
 */

/** A stamped coin, as in the reference. */
function Coin({ tier, tone }: { tier: CashbackTier; tone: 'gold' | 'silver' | 'blue' }) {
  const faces = {
    gold: 'from-amber-300 to-amber-600 text-amber-950 ring-amber-200/60',
    silver: 'from-slate-200 to-slate-400 text-slate-900 ring-slate-100/60',
    blue: 'from-sky-300 to-sky-600 text-sky-950 ring-sky-200/60',
  } as const;

  return (
    <span
      className={cn(
        'flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full bg-gradient-to-br text-center ring-2 ring-inset',
        faces[tone],
      )}
    >
      <span className="text-lg leading-none font-black">{whole(tier.reward)}</span>
      <span className="mt-0.5 text-[9px] leading-tight font-bold opacity-80">above</span>
      <span className="text-[11px] leading-none font-bold">{whole(tier.minOrder)}</span>
    </span>
  );
}

/**
 * Rupees without the paise.
 *
 * These amounts are always whole rupees, and "₹1,499.00" on a 20mm coin is two
 * characters of noise crowding out the number that matters.
 */
function whole(amount: number): string {
  return `₹${Math.round(amount / 100).toLocaleString('en-IN')}`;
}

function Column({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-bold">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-ink-muted text-xs leading-snug">
          {line}
        </p>
      ))}
    </div>
  );
}

export function SavingsPanel({ children }: { children: React.ReactNode }) {
  const standard = CASHBACK_TIERS.filter((tier) => !tier.primeOnly);
  const primeTier = CASHBACK_TIERS.find((tier) => tier.primeOnly);

  return (
    <section
      aria-labelledby="now-savings"
      className="border-accent-500/40 bg-surface overflow-hidden rounded-2xl border"
    >
      <h2 id="now-savings" className="sr-only">
        Savings on every order
      </h2>

      {/* ------------------------------------------------- standard tier */}
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
        <div className="flex -space-x-4">
          {standard.map((tier, index) => (
            <Coin key={tier.minOrder} tier={tier} tone={index === 0 ? 'gold' : 'silver'} />
          ))}
        </div>

        <div className="divide-hairline grid gap-4 sm:grid-cols-2 sm:divide-x">
          <Column
            title="Free delivery"
            lines={[
              `above ${formatPaise(FREE_SHIPPING_THRESHOLD)}`,
              `${formatPaise(STANDARD_SHIPPING_FEE)} below that`,
            ]}
          />
          <div className="sm:pl-4">
            <Column
              title="Cashback"
              lines={['Credited to your Amazon Pay', 'balance as the order is placed']}
            />
          </div>
        </div>
      </div>

      <p className="border-hairline text-ink-muted flex items-center gap-2 border-t px-4 py-2.5 text-xs sm:px-5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-[9px] font-black text-amber-950">
          ₹
        </span>
        <span>
          <span className="text-ink font-semibold">No platform, handling or surge fee</span> — the
          only charge beside the item price is delivery.
        </span>
      </p>

      {/* -------------------------------------------------- the prime band */}
      <p className="bg-gradient-to-r from-sky-600 to-sky-500 px-4 py-1.5 text-center text-[11px] font-bold tracking-wide text-white uppercase">
        Save more with{' '}
        <Link href="/prime" className="underline underline-offset-2">
          Prime
        </Link>{' '}
        benefits
      </p>

      {/* ----------------------------------------------------- prime tier */}
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
        {primeTier && (
          <div className="flex">
            <Coin tier={primeTier} tone="blue" />
          </div>
        )}

        <div className="divide-hairline grid gap-4 sm:grid-cols-2 sm:divide-x">
          <Column title="Free delivery" lines={['on every order', 'no minimum basket']} />
          <div className="sm:pl-4">
            <Column
              title="Prime Video"
              lines={['included titles, rentals', 'and add-on channels']}
            />
          </div>
        </div>
      </div>

      {children}
    </section>
  );
}
