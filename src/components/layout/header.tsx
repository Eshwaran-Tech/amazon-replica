import { ChevronDown, MapPin, ShoppingCart, User } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { logoutAction } from '@/actions/auth';
import { Logo } from '@/components/brand/logo';
import { AccountMenu } from '@/components/layout/account-menu';
import { AllMenu } from '@/components/layout/all-menu';
import { Container } from '@/components/layout/container';
import { FreshMenu } from '@/components/layout/fresh-menu';
import { LanguageMenu } from '@/components/layout/language-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { SearchBar } from '@/components/layout/search-bar';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { LANGUAGE_COOKIE_NAME, languageByCode } from '@/lib/i18n/languages';
import { THEME_COOKIE_NAME, themeFromCookie } from '@/lib/theme';
import { MESSAGES, makeTranslate, type MessageKey } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils/cn';
import { getCategoryTree } from '@/services/catalog';

interface HeaderProps {
  cartCount?: number;
}

/**
 * Second-row navigation.
 *
 * Config, not markup, so labels and destinations can be changed here without
 * touching JSX. `dropdown` shows the chevron; `highlighted` renders the item as
 * the white pill.
 *
 * `show` is the breakpoint at which an item appears. The row never scrolls and
 * is never clipped: instead, items are revealed as the viewport gains room for
 * them, so at every width the bar is full and every visible label is complete.
 * At 1920px all thirteen are shown, matching the reference.
 *
 * A horizontally scrolling nav bar was the previous approach and it was wrong
 * on a desktop: the overflow is invisible, so the hidden items are simply never
 * discovered, and a trackpad user scrolls the bar by accident while trying to
 * scroll the page.
 *
 * Every `href` points at a route that exists and returns results -- no link in
 * this app leads to a 404 or an empty page. Items without a natural equivalent
 * in this catalogue map to the closest sensible listing; repoint them here as
 * real pages get built.
 */
const NAV_ITEMS: Array<{
  /** Message key; the label is looked up in the visitor's language. */
  key: MessageKey;
  href: string;
  dropdown?: boolean;
  highlighted?: boolean;
  /** Tailwind visibility, gated on measured cumulative width. */
  show?: string;
}> = [
  // Rendered as the three-store flyout rather than a plain link.
  { key: 'nav.fresh', href: '/category/grocery', dropdown: true },
  // Both Prime entries lead to the membership page: it is the only Prime
  // surface this store has, and the wider item is hidden until `xl`.
  { key: 'nav.primeVideo', href: '/prime', show: 'hidden sm:flex' },
  { key: 'nav.sell', href: '/products?sort=newest', show: 'hidden sm:flex' },
  { key: 'nav.bestsellers', href: '/products?sort=rating', show: 'hidden md:flex' },
  { key: 'nav.todaysDeals', href: '/products?deals=true&sort=discount', show: 'hidden md:flex' },
  { key: 'nav.mobiles', href: '/category/mobiles', show: 'hidden lg:flex' },
  { key: 'nav.newReleases', href: '/products?sort=newest', show: 'hidden lg:flex' },
  { key: 'nav.prime', href: '/prime', show: 'hidden xl:flex' },
  { key: 'nav.amazonPay', href: '/pay', show: 'hidden xl:flex' },
  { key: 'nav.electronics', href: '/category/electronics', show: 'hidden xl:flex' },
  { key: 'nav.customerService', href: '/help', show: 'hidden 2xl:flex' },
  { key: 'nav.homeKitchen', href: '/category/home', show: 'hidden 2xl:flex' },
  { key: 'nav.fashion', href: '/category/fashion', show: 'hidden 3xl:flex' },
  { key: 'nav.computers', href: '/category/computers', show: 'hidden 3xl:flex' },
  { key: 'nav.toysGames', href: '/category/toys', show: 'hidden 3xl:flex' },
];

/**
 * Site header.
 *
 * Follows the conventional large-marketplace header layout:
 *
 *   Row 1  logo | deliver-to | [scope v][search][go] | language | account |
 *          returns & orders | cart
 *   Row 2  [= All] | category links | promo slot
 *
 * The branding is amazon's own. The *layout* is a widely used e-commerce
 * pattern; the wordmark, icon and palette are not copied from any retailer.
 *
 * Responsive strategy -- three designed layouts, not one scaled down:
 *
 *   <640px   two rows: [menu · logo · account · cart] then a full-width search.
 *            Deliver-to and language move into the drawer; a 360px screen
 *            cannot show them without starving the search input.
 *   >=640px  search inline, account labels appear.
 *   >=1024px full desktop row exactly as above.
 *
 * A Server Component: the session is read on the server, so no auth state ships
 * to the client and there is no signed-out flash during hydration.
 */
export async function Header({ cartCount = 0 }: HeaderProps) {
  const [session, categories, cookieStore] = await Promise.all([
    getSession(),
    getCategoryTree(),
    cookies(),
  ]);

  const firstName = session?.user.name.split(' ')[0] ?? null;
  const isAdmin = session?.user.role === 'ADMIN';
  const navCategories = categories.map((c) => ({
    name: c.name,
    slug: c.slug,
    hasChildren: c.children.length > 0,
  }));
  const language = languageByCode(cookieStore.get(LANGUAGE_COOKIE_NAME)?.value);
  const t = makeTranslate(MESSAGES[language.code]);
  const theme = themeFromCookie(cookieStore.get(THEME_COOKIE_NAME)?.value);

  // Rendered here (a Server Component) so it carries a CSRF token; styled as
  // one more entry in the flyout's "Your Account" column.
  const signOutForm = (
    <form action={logoutAction}>
      <CsrfField />
      <button
        type="submit"
        className="block py-[3px] text-left text-[13px] leading-snug text-white/85 hover:text-[#ffb52b] hover:underline"
      >
        {t('account.signOut')}
      </button>
    </form>
  );

  return (
    <header className="text-white">
      {/* ======================================================= row 1 ===== */}
      <div className="bg-brand-900">
        <Container size="wide" className="flex items-center gap-1 py-1.5 sm:gap-2">
          {/* Compact hamburger for phones; from lg the "All" pill in row 2 opens the same menu. */}
          <div className="lg:hidden">
            <AllMenu
              variant="icon"
              categories={categories}
              userName={firstName}
              isAdmin={isAdmin}
              signOutForm={signOutForm}
            />
          </div>

          <Link
            href="/"
            aria-label="amazon home"
            className="hover:outline-hairline/60 shrink-0 rounded border border-transparent px-1 py-1 hover:outline"
          >
            <Logo className="hidden sm:inline-flex" />
            <Logo markOnly className="sm:hidden" />
          </Link>

          {/* Deliver-to. Desktop only: on a phone this costs width the search
              input needs, and it is available in the drawer. */}
          <Link
            href="/account/addresses"
            className="hover:outline-hairline/60 hidden shrink-0 items-end gap-1 rounded border border-transparent px-2 py-1 leading-tight hover:outline lg:flex"
          >
            <MapPin className="mb-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="block text-[11px] whitespace-nowrap text-white/85">
                {t('header.deliverTo')}
              </span>
              <span className="block text-[13px] font-bold whitespace-nowrap">
                {t('header.updateLocation')}
              </span>
            </span>
          </Link>

          {/* Search, inline from sm up.
              `min-w-[9rem]` is load-bearing: every sibling in this row is
              `shrink-0`, so without a floor the search is the only thing that
              gives and it collapses to a stub at tablet widths. */}
          <div className="hidden min-w-[9rem] flex-1 sm:block">
            <SearchBar categories={navCategories} />
          </div>

          {/* Country + language, as "IN EN v" in the reference, with the picker. */}
          <LanguageMenu current={language.code} csrfField={<CsrfField />} flag={<IndiaFlag />} />

          {/* Hidden on the narrowest phones, where the header row has no space
              left; the drawer carries it there instead. */}
          <div className="hidden md:block">
            <ThemeToggle current={theme} csrfField={<CsrfField />} />
          </div>

          <nav
            aria-label="Account and orders"
            className="ml-auto flex shrink-0 items-center gap-0.5"
          >
            {/* Compact icon on mobile; full flyout from sm up. */}
            <Link
              href={session ? '/account' : '/auth/login'}
              className="flex min-h-11 w-11 items-center justify-center rounded sm:hidden"
            >
              <User className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">
                {session ? t('header.yourAccount') : t('header.signIn')}
              </span>
            </Link>

            <div className="hidden sm:block">
              <AccountMenu firstName={firstName} isAdmin={isAdmin} signOutForm={signOutForm} />
            </div>

            <Link
              href="/orders"
              className="hover:outline-hairline/60 hidden min-h-11 flex-col justify-center rounded border border-transparent px-2 leading-tight hover:outline lg:flex"
            >
              <span className="text-[11px] whitespace-nowrap text-white/85">
                {t('header.returns')}
              </span>
              <span className="text-[13px] font-bold whitespace-nowrap">
                {t('header.andOrders')}
              </span>
            </Link>

            <Link
              href="/cart"
              className="hover:outline-hairline/60 flex min-h-11 items-end gap-0.5 rounded border border-transparent px-2 hover:outline"
            >
              <span className="relative flex items-end">
                <ShoppingCart className="h-7 w-7" aria-hidden="true" />
                {/* Count sits over the cart mouth, as in the reference. */}
                <span className="text-accent-400 absolute -top-1 left-1/2 min-w-4 -translate-x-1/2 text-center text-sm leading-none font-bold">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              </span>
              <span className="hidden pb-0.5 text-[13px] font-bold lg:inline">
                {t('header.cart')}
              </span>
              <span className="sr-only">{t('header.cartItems', { count: cartCount })}</span>
            </Link>
          </nav>
        </Container>

        {/* Mobile search row. */}
        <div className="px-3 pb-2 sm:hidden">
          <SearchBar categories={navCategories} compact />
        </div>
      </div>

      {/* ======================================================= row 2 ===== */}
      <nav aria-label="Main" className="bg-brand-800">
        <Container size="wide">
          {/* 15px links with generous horizontal padding, matching the
              reference's proportions; the 44px row height gives every link a
              proper touch target.

              `overflow-hidden` is a backstop, not the layout mechanism -- the
              per-item breakpoints above are what make everything fit. If a
              future label is long enough to overflow anyway, it gets clipped
              rather than introducing a scrollbar that shifts the row. */}
          <ul className="flex items-center gap-0 overflow-hidden">
            {/* "≡ All" opens the full side menu. */}
            <li className="shrink-0">
              <AllMenu
                variant="bar"
                categories={categories}
                userName={firstName}
                isAdmin={isAdmin}
                signOutForm={signOutForm}
              />
            </li>

            {NAV_ITEMS.map((item) =>
              item.highlighted ? (
                // Highlighted pill, as in the reference: white ground, dark
                // text, its own icon. Distinct enough to read as a feature
                // rather than another nav link.
                <li key={item.key} className={cn('mx-1 shrink-0', item.show)}>
                  <Link
                    href={item.href}
                    className="flex min-h-8 items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[15px] font-bold whitespace-nowrap text-neutral-900 hover:bg-neutral-200"
                  >
                    <AssistantGlyph />
                    {t(item.key)}
                  </Link>
                </li>
              ) : item.key === 'nav.fresh' ? (
                <li key={item.key} className={cn('shrink-0', item.show ?? 'flex')}>
                  <FreshMenu label={t(item.key)} />
                </li>
              ) : (
                <li key={item.key} className={cn('shrink-0', item.show ?? 'flex')}>
                  <Link
                    href={item.href}
                    className="hover:outline-hairline/60 flex min-h-11 items-center gap-1 rounded border border-transparent px-2.5 text-[15px] whitespace-nowrap hover:outline"
                  >
                    {t(item.key)}
                    {item.dropdown && (
                      <ChevronDown className="h-3.5 w-3.5 opacity-75" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              ),
            )}

            {isAdmin && (
              <li className="shrink-0">
                <Link
                  href="/admin"
                  className="text-accent-300 hover:outline-hairline/60 flex min-h-11 items-center rounded border border-transparent px-2.5 text-[15px] font-bold whitespace-nowrap hover:outline"
                >
                  {t('header.admin')}
                </Link>
              </li>
            )}
          </ul>
        </Container>
      </nav>
    </header>
  );
}

/**
 * Assistant glyph for the highlighted pill.
 *
 * Original artwork -- two overlapping dots suggesting a conversation, not a
 * copy of any product's icon.
 */
function AssistantGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="7.5" cy="10" r="5" fill="#f5a524" />
      <circle cx="13" cy="10" r="4" fill="#2563eb" opacity="0.9" />
      <circle cx="10.2" cy="10" r="1.6" fill="#ffffff" />
    </svg>
  );
}

/**
 * India tricolour. A national flag, drawn as simple geometry -- no third-party
 * icon set and nothing trademarked.
 */
function IndiaFlag() {
  return (
    <svg viewBox="0 0 21 14" className="h-3.5 w-5 shrink-0 rounded-[1px]" aria-hidden="true">
      <rect width="21" height="14" fill="#f2f2f2" />
      <rect width="21" height="4.67" fill="#FF9933" />
      <rect y="9.33" width="21" height="4.67" fill="#138808" />
      <circle cx="10.5" cy="7" r="1.7" fill="none" stroke="#000080" strokeWidth="0.6" />
    </svg>
  );
}
