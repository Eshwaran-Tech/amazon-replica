import {
  ArrowRight,
  Award,
  Banknote,
  BookOpen,
  Bus,
  Cable,
  CalendarClock,
  Car,
  CarFront,
  CircleHelp,
  CreditCard,
  Droplet,
  Flame,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Hotel,
  Landmark,
  Lightbulb,
  type LucideIcon,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  RefreshCcw,
  Salad,
  ScrollText,
  Settings,
  ShieldCheck,
  Smartphone,
  Ticket,
  Train,
  Tv,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { getWalletSummary } from '@/services/wallet';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = {
  title: 'Eshwaran Pay',
  description: 'Your Eshwaran Pay balance, recharges, bill payments, gift cards and transactions.',
};

/**
 * The Eshwaran Pay landing page.
 *
 * Laid out to the reference: a balance card down the left, then grouped tiles
 * (Travel, Recharges, Bill Payments, ...) and a stack of promotional rows.
 * The icons are drawn from the project's existing Lucide set rather than
 * copied from the reference artwork, and the page uses this site's own dark
 * surfaces so it does not arrive as a foreign light-themed slab.
 *
 * **Only some of these tiles do anything, and the page says so.** This store
 * sells goods; it does not pay an electricity bill or issue motor insurance.
 * Tiles with a real destination are links; the rest render as plain,
 * non-clickable items and carry a "Soon" marker, with a notice at the top of
 * the page. A grid of forty tiles that all look live but silently do nothing
 * would be a worse outcome than an honest one.
 *
 * The balance beside them is real: it is summed from the same ledger that
 * checkout, Prime and Prime Video are charged against.
 */

interface Tile {
  label: string;
  icon: LucideIcon;
  /** Present only when the tile actually goes somewhere. */
  href?: string;
}

interface TileGroup {
  id: string;
  title: string;
  tiles: Tile[];
}

const GROUPS: TileGroup[] = [
  {
    id: 'travel',
    title: 'Travel',
    tiles: [
      { label: 'Flights', icon: Plane, href: '/flights' },
      { label: 'Bus Tickets', icon: Bus, href: '/buses' },
      { label: 'Trains', icon: Train, href: '/trains' },
      { label: 'Hotels', icon: Hotel, href: '/hotels' },
    ],
  },
  {
    id: 'recharges',
    title: 'Recharges',
    tiles: [
      { label: 'Mobile Recharge', icon: Smartphone, href: '/pay/recharge' },
      { label: 'App Store Code', icon: Gift, href: '/pay/recharge/credit?store=APPSTORE' },
      { label: 'DTH Recharge', icon: Tv, href: '/pay/recharge/dth' },
      { label: 'Play Recharge', icon: PiggyBank, href: '/pay/recharge/credit?store=PLAY' },
    ],
  },
  {
    id: 'bill-payments',
    title: 'Bill Payments',
    tiles: [
      { label: 'Electricity', icon: Lightbulb, href: '/pay/bills/electricity' },
      { label: 'Mobile Postpaid', icon: Smartphone, href: '/pay/bills/postpaid' },
      { label: 'Credit Card Bill', icon: CreditCard, href: '/pay/bills/credit-card' },
      { label: 'Loan Repayment', icon: Landmark, href: '/pay/bills/loan' },
      { label: 'LPG', icon: Flame, href: '/pay/bills/lpg' },
      { label: 'Insurance Premium', icon: ShieldCheck, href: '/pay/bills/insurance' },
      { label: 'Piped Gas', icon: Flame, href: '/pay/bills/piped-gas' },
      { label: 'Water Bill', icon: Droplet, href: '/pay/bills/water' },
      { label: 'Landline', icon: Cable, href: '/pay/bills/landline' },
      { label: 'Broadband', icon: Wifi, href: '/pay/bills/broadband' },
      { label: 'Municipal Tax', icon: Landmark, href: '/pay/bills/municipal-tax' },
      { label: 'Cable TV', icon: Tv, href: '/pay/bills/cable' },
      { label: 'Education Fees', icon: GraduationCap, href: '/pay/bills/education' },
    ],
  },
  {
    id: 'daily-transit',
    title: 'Daily Transit',
    tiles: [
      { label: 'Buy a FASTag', icon: CarFront, href: '/pay/fastag' },
      { label: 'FASTag Recharge', icon: RefreshCcw, href: '/pay/fastag' },
      { label: 'Metro Recharge', icon: Train, href: '/pay/metro' },
    ],
  },
  {
    id: 'insurance',
    title: 'Insurance',
    tiles: [
      { label: 'Car Insurance', icon: Car, href: '/insurance?kind=CAR' },
      { label: 'Bike Insurance', icon: ShieldCheck, href: '/insurance?kind=BIKE' },
      { label: 'Health Insurance', icon: HeartPulse, href: '/insurance/health' },
    ],
  },
  {
    id: 'gift-cards',
    title: 'Gift cards and Vouchers',
    tiles: [
      { label: 'Add Gift Card', icon: Gift, href: '/pay/gift-cards' },
      { label: 'Gift Cards', icon: Gift, href: '/gift-cards' },
      { label: 'Eshwaran Vouchers', icon: Ticket, href: '/gift-cards/vouchers' },
      { label: 'Brand Vouchers', icon: Ticket, href: '/gift-cards/brands' },
      { label: 'Birthday Gift Cards', icon: Gift, href: '/gift-cards/birthday' },
      { label: 'Wedding Gift Cards', icon: Gift, href: '/gift-cards/wedding' },
      { label: 'Corporate Gifting', icon: Award, href: '/gift-cards/corporate' },
    ],
  },
  {
    id: 'manage',
    title: 'Manage',
    tiles: [
      { label: 'Your Transactions', icon: Receipt, href: '/orders' },
      { label: 'Your Rewards', icon: Percent, href: '/pay/rewards' },
      { label: 'EMI', icon: CalendarClock, href: '/pay/emi' },
      { label: 'Your Saved Cards', icon: CreditCard, href: '/pay/cards' },
      { label: 'Help and FAQs', icon: CircleHelp, href: '/help/pay' },
      { label: 'Ledger statement', icon: ScrollText, href: '/pay/statement' },
      { label: 'Complaint History', icon: BookOpen, href: '/pay/tickets' },
    ],
  },
];

interface Promo {
  id: string;
  title: string;
  subtitle?: string;
  icons: LucideIcon[];
  href?: string;
}

const PROMOS: Promo[] = [
  { id: 'pay-anyone', title: 'Pay anyone, anywhere', icons: [HandCoins, Smartphone, Banknote] },
  {
    id: 'pay-bills',
    title: 'Pay bills or recharge',
    icons: [Receipt, Lightbulb, Wifi],
    href: '/pay/bills',
  },
  { id: 'order-food', title: 'Order food, medicines & more', icons: [Utensils, Salad, HeartPulse] },
  {
    id: 'train-tickets',
    title: 'Book train tickets',
    subtitle: 'Zero payment gateway charges',
    icons: [Train, Ticket],
  },
  {
    id: 'vehicle-insurance',
    title: 'Buy vehicle insurance',
    subtitle: 'It is as easy as a recharge',
    icons: [ShieldCheck, CarFront, Wrench],
    href: '/insurance',
  },
];

/** Everything the sidebar's balance card offers. */
const BALANCE_ACTIONS: Array<{ label: string; icon: LucideIcon; href?: string }> = [
  { label: 'Add Money', icon: Wallet, href: '/pay/balance' },
  { label: 'Account Settings', icon: Settings, href: '/account' },
];

function TileItem({ tile }: { tile: Tile }) {
  const Icon = tile.icon;

  const body = (
    <>
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-full',
          tile.href ? 'bg-accent-500/15 text-accent-400' : 'bg-surface-sunken text-ink-subtle',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span
        className={cn(
          'text-center text-[11px] leading-tight sm:text-xs',
          tile.href ? 'text-ink' : 'text-ink-subtle',
        )}
      >
        {tile.label}
      </span>
    </>
  );

  if (!tile.href) {
    return (
      <li className="flex flex-col items-center gap-2 p-2">
        {body}
        <span className="text-ink-subtle text-[10px] tracking-wide uppercase">Soon</span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={tile.href}
        className="hover:bg-surface-sunken focus-visible:outline-accent-500 flex flex-col items-center gap-2 rounded-xl p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {body}
        {/* Keeps the row heights identical to the unavailable tiles. */}
        <span className="text-accent-400 text-[10px] tracking-wide uppercase">Open</span>
      </Link>
    </li>
  );
}

export default async function PayPage() {
  const liveCount = GROUPS.flatMap((group) => group.tiles).filter((tile) => tile.href).length;
  const totalCount = GROUPS.flatMap((group) => group.tiles).length;

  // The same ledger the balance page sums. Signed-out visitors get a real
  // zero rather than somebody else's figure.
  const session = await getSession();
  const summary = session ? await getWalletSummary(session.user.id) : { balance: 0, pending: 0 };

  return (
    <Container size="wide" className="py-5 sm:py-7">
      <h1 className="text-xl font-bold sm:text-2xl">Eshwaran Pay</h1>

      {/* Said plainly rather than discovered by clicking. */}
      <p className="text-ink-muted mt-1 text-sm">
        {liveCount} of {totalCount} services below are live in this store, alongside the wallet. The
        rest — travel, bill payments and insurance — are not connected to a provider yet and are
        marked <span className="text-ink-subtle font-semibold uppercase">Soon</span>.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-5">
        {/* ------------------------------------------------------- balance */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section
            aria-labelledby="pay-balance"
            className="border-hairline bg-surface rounded-2xl border p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="pay-balance" className="text-sm font-bold">
                Eshwaran Pay Balance
              </h2>
              <Link
                href="/pay/balance"
                className="text-accent-400 hover:text-accent-300 text-sm font-bold hover:underline"
              >
                {formatPaise(summary.balance)}
              </Link>
            </div>

            <ul className="mt-3 space-y-1">
              {BALANCE_ACTIONS.map((action) => {
                const Icon = action.icon;
                const content = (
                  <>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {action.label}
                  </>
                );

                return (
                  <li key={action.label}>
                    {action.href ? (
                      <Link
                        href={action.href}
                        className="text-link hover:bg-surface-sunken flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:underline"
                      >
                        {content}
                      </Link>
                    ) : (
                      <span className="text-ink-subtle flex items-center gap-2 px-2 py-1.5 text-sm">
                        {content}
                        <span className="ml-auto text-[10px] tracking-wide uppercase">Soon</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="text-ink-subtle mt-3 text-xs leading-relaxed">
              {session
                ? 'Summed from your wallet ledger. Top-ups are settled by the test gateway.'
                : 'Sign in to see your wallet balance.'}
            </p>
          </section>
        </aside>

        {/* --------------------------------------------------- tile groups */}
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <section
              key={group.id}
              aria-labelledby={`pay-${group.id}`}
              className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5"
            >
              <h2 id={`pay-${group.id}`} className="text-link text-sm font-bold">
                {group.title}
              </h2>

              <ul className="mt-3 grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
                {group.tiles.map((tile) => (
                  <TileItem key={`${group.id}-${tile.label}`} tile={tile} />
                ))}
              </ul>
            </section>
          ))}

          {/* -------------------------------------------------- promo rows */}
          <ul className="space-y-3">
            {PROMOS.map((promo) => (
              <li key={promo.id}>
                <div className="from-accent-500 to-accent-400 relative flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r p-4 sm:p-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-slate-900 sm:text-lg">{promo.title}</p>
                    {promo.subtitle && (
                      <p className="mt-0.5 text-xs text-slate-800 sm:text-sm">{promo.subtitle}</p>
                    )}
                  </div>

                  {/* Decorative: the row's meaning is already in its heading. */}
                  <div aria-hidden="true" className="flex shrink-0 items-center gap-2 sm:gap-3">
                    {promo.icons.map((Icon, index) => (
                      <span
                        key={index}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-slate-900 shadow-sm sm:h-12 sm:w-12"
                      >
                        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-ink-subtle px-1 text-xs leading-relaxed">
            Eshwaran Pay is a demonstration surface in this project. Nothing here moves money, and no
            payment instrument is stored. See{' '}
            <Link href="/help" className="text-link hover:underline">
              Help &amp; customer service
            </Link>{' '}
            for how checkout payments actually work.
          </p>

          <Link
            href="/products"
            className="text-link inline-flex items-center gap-1.5 px-1 text-sm font-semibold hover:underline"
          >
            Continue shopping
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Container>
  );
}
