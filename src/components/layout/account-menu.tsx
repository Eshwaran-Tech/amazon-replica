'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n/messages';

interface AccountMenuProps {
  firstName: string | null;
  isAdmin: boolean;
  /** Sign-out form, rendered on the server so it carries a CSRF token. */
  signOutForm: ReactNode;
}

/**
 * The flyout's two columns.
 *
 * Every entry points at a route that exists. Items whose feature this
 * storefront does not have (wish lists, Prime Video, devices, ...) go to the
 * closest real page -- the same rule the main navigation follows -- and are
 * marked below so they can be repointed as those features are built.
 */
const YOUR_LISTS: Array<{ key: MessageKey; href: string }> = [
  { key: 'account.createWishList', href: '/account' },
  { key: 'account.wishFromAnyWebsite', href: '/account' },
  { key: 'account.babyWishlist', href: '/category/toys' },
  { key: 'account.discoverStyle', href: '/category/fashion' },
  { key: 'account.exploreShowroom', href: '/category/home' },
];

const YOUR_ACCOUNT: Array<{ key: MessageKey; href: string }> = [
  { key: 'account.yourAccount', href: '/account' },
  { key: 'account.yourOrders', href: '/orders' },
  { key: 'account.yourWishList', href: '/account' },
  { key: 'account.keepShopping', href: '/products?sort=newest' },
  { key: 'account.recommendations', href: '/products?sort=rating' },
  { key: 'account.returns', href: '/orders' },
  { key: 'account.recalls', href: '/help' },
  { key: 'account.primeMembership', href: '/products?prime=true' },
  { key: 'account.primeVideo', href: '/products' },
  { key: 'account.subscribeSave', href: '/category/grocery' },
  { key: 'account.memberships', href: '/products?prime=true' },
  { key: 'account.sellerAccount', href: '/products?sort=newest' },
  { key: 'account.contentLibrary', href: '/category/books' },
  { key: 'account.devices', href: '/category/electronics' },
  { key: 'account.musicLibrary', href: '/category/electronics' },
  { key: 'account.businessAccount', href: '/auth/register/details?via=email' },
];

const itemClass =
  'block py-[3px] text-[13px] leading-snug text-white/85 hover:text-[#ffb52b] hover:underline';

/**
 * "Hello, {name} / Account & Lists" with the flyout.
 *
 * Opens on hover *and* on focus/click, not hover alone. A hover-only menu is
 * unreachable by keyboard and unusable on touch, where the first tap would
 * merely trigger the hover state. The trigger is a real link, so it still works
 * with JavaScript disabled -- the flyout is the enhancement.
 */
export function AccountMenu({ firstName, isAdmin, signOutForm }: AccountMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // A short close delay stops the menu vanishing while the pointer crosses the
  // gap between the trigger and the panel.
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Link
        href={firstName ? '/account' : '/auth/login'}
        aria-expanded={open}
        aria-controls={menuId}
        className={`flex min-h-11 flex-col justify-center rounded border px-2 leading-tight ${
          open ? 'border-white/60' : 'hover:outline-hairline/60 border-transparent hover:outline'
        }`}
      >
        <span className="text-[11px] whitespace-nowrap text-white/85">
          {firstName ? t('header.hello', { name: firstName }) : t('header.helloSignIn')}
        </span>
        <span className="flex items-center gap-0.5 text-[13px] font-bold whitespace-nowrap">
          {t('header.accountLists')}
          <ChevronDown className="h-3 w-3 opacity-80" aria-hidden="true" />
        </span>
      </Link>

      {open && (
        <div
          id={menuId}
          className="bg-brand-800 absolute top-full right-0 z-50 mt-1 w-[480px] rounded-sm border border-white/10 text-white shadow-[0_0_14px_rgba(0,0,0,.6)]"
        >
          {/* Caret pointing at the trigger, as in the reference. */}
          <span
            aria-hidden="true"
            className="border-b-brand-800 absolute -top-2 right-16 h-0 w-0 border-x-8 border-b-8 border-x-transparent"
          />

          {!firstName && (
            <div className="border-b border-white/10 px-5 pt-4 pb-3 text-center">
              <Link
                href="/auth/login"
                className="mx-auto flex h-8 w-52 items-center justify-center rounded-full border border-[#FCD200] bg-[#FFD814] text-[13px] font-medium text-neutral-900 hover:bg-[#F7CA00]"
              >
                {t('account.signIn')}
              </Link>
              <p className="mt-2 text-[12px] text-white/70">
                {t('account.newCustomer')}{' '}
                <Link href="/auth/register/details" className="text-[#6cb6ff] hover:text-[#ffb52b] hover:underline">
                  {t('account.startHere')}
                </Link>
              </p>
            </div>
          )}

          <div className="bg-brand-900 mx-4 mt-4 flex items-center justify-between gap-3 rounded px-4 py-3 text-[13px]">
            <span className="text-white/85">{t('account.whoShopping')}</span>
            <Link
              href="/account"
              className="flex shrink-0 items-center gap-0.5 font-semibold text-[#6cb6ff] hover:text-[#ffb52b] hover:underline"
            >
              {t('account.manageProfiles')}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="flex px-4 pt-4 pb-5">
            {/* -------------------------------------------------- Your Lists */}
            <div className="w-[45%] border-r border-white/10 pr-6">
              <h3 className="mb-2 text-[16px] font-bold">{t('account.yourLists')}</h3>
              <ul>
                {YOUR_LISTS.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={itemClass}>
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ------------------------------------------------ Your Account */}
            <div className="flex-1 pl-6">
              <h3 className="mb-2 text-[16px] font-bold">{t('account.yourAccount')}</h3>
              <ul>
                <li>
                  <Link href="/auth/login" className={itemClass}>
                    {t('account.switchAccounts')}
                  </Link>
                </li>
                <li>
                  {firstName ? (
                    signOutForm
                  ) : (
                    <Link href="/auth/login" className={itemClass}>
                      {t('account.signOut')}
                    </Link>
                  )}
                </li>
                <li aria-hidden="true" className="my-2 border-t border-white/10" />
                {isAdmin && (
                  <li>
                    <Link href="/admin" className={`${itemClass} font-semibold`}>
                      {t('account.adminDashboard')}
                    </Link>
                  </li>
                )}
                {YOUR_ACCOUNT.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className={itemClass}>
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
