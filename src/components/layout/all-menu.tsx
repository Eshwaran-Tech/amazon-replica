'use client';

import { ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import type { Translate } from '@/lib/i18n/messages';
import type { CategoryTreeNode } from '@/models/category';

interface AllMenuProps {
  categories: CategoryTreeNode[];
  userName: string | null;
  isAdmin: boolean;
  /** Server-rendered sign-out form (carries the CSRF token). */
  signOutForm: ReactNode;
  /** `bar` = the "≡ All" pill in the nav row; `icon` = the compact mobile button. */
  variant?: 'bar' | 'icon';
}

interface MenuLink {
  label: string;
  href: string;
  /** Second-level panel: real subcategory links. */
  children?: Array<{ label: string; href: string }>;
  /** Draws the › glyph, as in the reference, even without a sub-panel. */
  chevron?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuLink[];
  /** Items revealed by "See all". */
  more?: MenuLink[];
}

/**
 * The full "All" side menu.
 *
 * Section layout follows the reference. Every entry leads to a real page:
 * category rows are built from the live category tree (their sub-panels list
 * genuine subcategories), and the digital/programme rows -- features this
 * storefront does not have -- point at the closest real listing.
 */
function buildSections(
  t: Translate,
  categories: CategoryTreeNode[],
  signedIn: boolean,
  isAdmin: boolean,
): MenuSection[] {
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  // Category names come from the catalogue (seller-listed data), so they are
  // shown as stored; the surrounding chrome is translated.
  const subLinks = (...slugs: string[]) =>
    slugs.flatMap((slug) => {
      const node = bySlug.get(slug);
      if (!node) return [];
      return [
        { label: t('menu.allIn', { name: node.name }), href: `/category/${node.slug}` },
        ...node.children.map((child) => ({ label: child.name, href: `/category/${child.slug}` })),
      ];
    });
  const categoryRow = (label: string, ...slugs: string[]): MenuLink | null => {
    const children = subLinks(...slugs);
    if (children.length === 0) return null;
    return { label, href: `/category/${slugs[0]}`, children };
  };

  const featured = [
    categoryRow(t('menu.mobilesComputers'), 'mobiles', 'computers'),
    categoryRow(t('menu.tvAppliances'), 'electronics', 'kitchen'),
    {
      label: t('menu.mensFashion'),
      href: '/category/mens-clothing',
      children: subLinks('fashion'),
    },
    {
      label: t('menu.womensFashion'),
      href: '/category/womens-clothing',
      children: subLinks('fashion'),
    },
  ].filter((row): row is MenuLink => row !== null);

  const featuredSlugs = new Set(['mobiles', 'computers', 'electronics', 'kitchen', 'fashion']);
  const remaining = categories
    .filter((category) => !featuredSlugs.has(category.slug))
    .map((category) => categoryRow(category.name, category.slug))
    .filter((row): row is MenuLink => row !== null);

  return [
    {
      title: t('menu.trending'),
      items: [
        { label: t('menu.bestsellers'), href: '/products?sort=rating' },
        { label: t('menu.newReleases'), href: '/products?sort=newest' },
      ],
    },
    {
      title: t('menu.digital'),
      items: [
        { label: t('menu.echoAlexa'), href: '/category/speakers', chevron: true },
        { label: t('menu.fireTv'), href: '/category/electronics', chevron: true },
        { label: t('menu.kindle'), href: '/category/books', chevron: true },
        { label: t('menu.audible'), href: '/category/books', chevron: true },
        { label: t('menu.primeVideo'), href: '/products?prime=true', chevron: true },
        { label: t('menu.music'), href: '/category/headphones', chevron: true },
      ],
    },
    {
      title: t('menu.shopByCategory'),
      items: featured,
      more: remaining,
    },
    {
      title: t('menu.programs'),
      items: [
        { label: t('menu.giftCards'), href: '/products?deals=true&sort=discount', chevron: true },
        { label: t('menu.launchpad'), href: '/products?sort=newest' },
        { label: t('menu.business'), href: '/auth/register/details?via=email' },
        { label: t('menu.handloom'), href: '/category/decor' },
      ],
      more: [
        { label: t('menu.amazonPay'), href: '/pay' },
        { label: t('menu.prime'), href: '/products?prime=true' },
        { label: t('menu.todaysDeals'), href: '/products?deals=true&sort=discount' },
      ],
    },
    {
      title: t('menu.helpSettings'),
      items: [
        { label: t('menu.yourAccount'), href: '/account' },
        ...(isAdmin ? [{ label: t('menu.adminDashboard'), href: '/admin' }] : []),
        { label: t('menu.customerService'), href: '/help' },
        ...(signedIn ? [] : [{ label: t('menu.signIn'), href: '/auth/login' }]),
      ],
    },
  ];
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog semantics done properly, because a drawer that traps a keyboard
 * user is worse than no drawer: `role="dialog"` + `aria-modal`, focus moves in
 * on open and back to the trigger on close, Tab cycles inside, Escape closes,
 * and background scroll is locked.
 */
export function AllMenu({
  categories,
  userName,
  isAdmin,
  signOutForm,
  variant = 'bar',
}: AllMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subPanel, setSubPanel] = useState<MenuLink | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const sections = buildSections(t, categories, userName !== null, isAdmin);
  const helpTitle = t('menu.helpSettings');

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open, subPanel]);

  function close() {
    setOpen(false);
    setSubPanel(null);
  }

  const rowClass =
    'flex min-h-11 w-full items-center justify-between px-9 text-left text-[14px] text-white/90 hover:bg-white/10';

  return (
    <>
      {variant === 'bar' ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="hover:outline-hairline/60 flex min-h-11 items-center gap-1.5 rounded border border-transparent px-2.5 text-[15px] font-bold whitespace-nowrap hover:outline"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
          {t('header.all')}
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex h-11 w-11 items-center justify-center rounded text-white"
          aria-label={t('header.openMenu')}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={close}
            aria-label={t('header.closeMenu')}
            tabIndex={-1}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="All categories and settings"
            className="bg-brand-800 absolute inset-y-0 left-0 flex w-[365px] max-w-[88vw] flex-col text-white shadow-2xl"
          >
            {/* Close sits just outside the panel, as in the reference. */}
            <button
              type="button"
              onClick={close}
              className="absolute top-2 -right-11 flex h-9 w-9 items-center justify-center rounded text-white hover:bg-white/10"
              aria-label={t('header.closeMenu')}
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>

            <Link
              href={userName ? '/account' : '/auth/login'}
              onClick={close}
              className="bg-brand-900 flex min-h-[50px] items-center gap-2 px-6 text-[18px] font-bold hover:underline"
            >
              <CircleUserRound className="h-6 w-6" aria-hidden="true" />
              {userName ? t('header.hello', { name: userName }) : t('header.helloSignIn')}
            </Link>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {subPanel ? (
                // ---------------------------------------------- sub-panel
                <nav aria-label={subPanel.label}>
                  <button
                    type="button"
                    onClick={() => setSubPanel(null)}
                    className="flex min-h-12 w-full items-center gap-2 border-b border-white/10 px-6 text-[14px] font-bold text-white/90 hover:bg-white/10"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    {t('menu.mainMenu')}
                  </button>
                  <h3 className="px-9 pt-4 pb-1 text-[18px] font-bold">{subPanel.label}</h3>
                  <ul>
                    {subPanel.children?.map((child) => (
                      <li key={`${child.href}-${child.label}`}>
                        <Link href={child.href} onClick={close} className={rowClass}>
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : (
                // -------------------------------------------- main panel
                <nav aria-label="Site sections">
                  {sections.map((section) => {
                    const showMore = expanded.has(section.title);
                    return (
                      <div key={section.title} className="border-b border-white/10 py-2">
                        <h3 className="px-9 pt-2 pb-1 text-[18px] font-bold">{section.title}</h3>
                        <ul>
                          {[...section.items, ...(showMore ? (section.more ?? []) : [])].map(
                            (item) => (
                              <li key={`${section.title}-${item.label}`}>
                                {item.children ? (
                                  <button
                                    type="button"
                                    onClick={() => setSubPanel(item)}
                                    className={rowClass}
                                    aria-haspopup="true"
                                  >
                                    {item.label}
                                    <ChevronRight
                                      className="h-4 w-4 text-white/60"
                                      aria-hidden="true"
                                    />
                                  </button>
                                ) : (
                                  <Link href={item.href} onClick={close} className={rowClass}>
                                    {item.label}
                                    {item.chevron && (
                                      <ChevronRight
                                        className="h-4 w-4 text-white/60"
                                        aria-hidden="true"
                                      />
                                    )}
                                  </Link>
                                )}
                              </li>
                            ),
                          )}
                          {section.title === helpTitle && userName && (
                            <li className="px-9">{signOutForm}</li>
                          )}
                          {section.more && section.more.length > 0 && (
                            <li>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(section.title)) next.delete(section.title);
                                    else next.add(section.title);
                                    return next;
                                  })
                                }
                                aria-expanded={showMore}
                                className="flex min-h-11 items-center gap-1 px-9 text-[14px] text-white/90 hover:underline"
                              >
                                {showMore ? t('menu.seeLess') : t('menu.seeAll')}
                                <ChevronDown
                                  className={`h-4 w-4 text-white/60 transition-transform ${showMore ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                />
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </nav>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
