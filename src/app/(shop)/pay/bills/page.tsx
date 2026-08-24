import {
  Cable,
  CalendarClock,
  CreditCard,
  Droplet,
  Flame,
  GraduationCap,
  Landmark,
  Lightbulb,
  type LucideIcon,
  Receipt,
  ShieldCheck,
  Smartphone,
  Tv,
  Wifi,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { BILL_TILE_CATEGORIES, CATEGORY_META, type BillCategory } from '@/data/billers';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import { listBillPayments, listSavedBillers } from '@/services/bills/pay';
import { getWalletSummary } from '@/services/wallet';

export const metadata: Metadata = {
  title: 'Bill payments',
  description:
    'Electricity, water, gas, telecom, tax and fees — paid from your Eshwaran Pay balance.',
};

export const dynamic = 'force-dynamic';

/**
 * The Bill Payments hub.
 *
 * Every tile goes somewhere and every one of them does something different.
 * The line under each is not marketing: it names the one thing that page does
 * which none of the others do, because thirteen identical "enter your number"
 * forms would be thirteen tiles pretending to be a feature.
 */

const ICONS: Record<BillCategory, LucideIcon> = {
  ELECTRICITY: Lightbulb,
  WATER: Droplet,
  PIPED_GAS: Flame,
  POSTPAID: Smartphone,
  LANDLINE: Cable,
  BROADBAND: Wifi,
  CABLE: Tv,
  CREDIT_CARD: CreditCard,
  LOAN: Landmark,
  MUNICIPAL_TAX: Landmark,
  EDUCATION: GraduationCap,
  INSURANCE_PREMIUM: ShieldCheck,
  LPG: Flame,
  DTH: Tv,
};

export default async function BillsHubPage() {
  const session = await getSession();
  const [wallet, saved, recent] = session
    ? await Promise.all([
        getWalletSummary(session.user.id),
        listSavedBillers(session.user.id),
        listBillPayments(session.user.id, 8),
      ])
    : [null, [], []];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Eshwaran Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Bill payments</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <Receipt className="text-accent-400 h-5 w-5" aria-hidden="true" />
            Bill payments
          </h1>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            Thirteen kinds of bill, each with its own arithmetic and its own thing worth knowing.
          </p>
        </div>
        {wallet && (
          <p className="text-ink-muted text-sm">
            Eshwaran Pay balance{' '}
            <span className="text-ink font-bold">{formatPaise(wallet.balance)}</span>
          </p>
        )}
      </header>

      <div className="border-link/40 bg-link/5 rounded-2xl border p-3 text-xs leading-relaxed">
        <p className="text-ink-muted">
          <span className="text-ink font-bold">No biller can see any of this.</span> This store has
          no connection to a discom, a bank or a municipality, so each bill is worked out from the
          number you type and is the same every time for that number. The money is real and leaves
          your Eshwaran Pay balance; the tariffs, slabs, minimum dues and penalties are the real
          published structures.
        </p>
      </div>

      {/* ------------------------------------------------- saved billers */}
      {saved.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
            Your billers
            <span className="text-ink-subtle ml-2 font-normal">one tap each</span>
          </h2>
          <ul className="divide-hairline divide-y">
            {saved.map((entry) => {
              const meta = CATEGORY_META[entry.category];
              return (
                <li key={entry.id}>
                  <Link
                    href={`${meta.href}?biller=${entry.billerId}&account=${entry.account}`}
                    className="hover:bg-surface-sunken flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 transition-colors"
                  >
                    <span className="text-sm font-bold">{entry.nickname}</span>
                    <span className="text-ink-muted text-xs">
                      {meta.label} · {entry.billerName} · {entry.account}
                    </span>
                    {entry.lastPaidAt && entry.lastAmount !== null && (
                      <span className="text-ink-subtle ml-auto text-xs">
                        Last paid {formatPaise(entry.lastAmount)} on{' '}
                        {entry.lastPaidAt.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------ the tiles */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BILL_TILE_CATEGORIES.map((category) => {
          const meta = CATEGORY_META[category];
          const Icon = ICONS[category];
          return (
            <Link
              key={category}
              href={meta.href}
              className={cn(
                'border-hairline bg-surface hover:border-accent-500/60 flex items-start gap-3 rounded-2xl border p-4 transition-colors',
              )}
            >
              <span className="bg-accent-500/15 text-accent-400 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{meta.label}</span>
                <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
                  {meta.distinctive}
                </span>
              </span>
            </Link>
          );
        })}
      </section>

      {/* ------------------------------------------------------- history */}
      {recent.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Recently paid</h2>
          <ul className="divide-hairline divide-y">
            {recent.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <span className="text-sm font-bold">{payment.billerName}</span>
                <span className="text-ink-muted font-mono text-xs">{payment.account}</span>
                <span className="text-ink-subtle text-xs">{payment.period}</span>
                {payment.booking && (
                  <span className="bg-instock/15 text-instock rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
                    Delivery{' '}
                    {payment.booking.deliverOn.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                )}
                <span className="ml-auto text-sm font-bold tabular-nums">
                  {formatPaise(payment.amount)}
                </span>
                <span className="text-ink-subtle w-full text-xs sm:w-auto">
                  {payment.reference}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Mobile recharge', href: '/pay/recharge', icon: Smartphone },
          { label: 'DTH recharge', href: '/pay/recharge/dth', icon: Tv },
          { label: 'App Store and Play credit', href: '/pay/recharge/credit', icon: CalendarClock },
        ].map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.href}
              href={row.href}
              className="border-hairline bg-surface hover:border-accent-500/60 flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors"
            >
              <Icon className="text-accent-400 h-4 w-4 shrink-0" aria-hidden="true" />
              {row.label}
            </Link>
          );
        })}
      </section>
    </Container>
  );
}
