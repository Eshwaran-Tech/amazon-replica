'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * "Fresh ▾" with the three-store flyout.
 *
 * Opens on hover, focus and click -- never hover alone, which would leave the
 * menu unreachable by keyboard and unusable on a touchscreen. The close is
 * deferred slightly so the pointer can cross the gap between the trigger and
 * the panel without the panel vanishing underneath it.
 *
 * Each tile is a real route; nothing here is a placeholder.
 */

interface Store {
  href: string;
  /** The wordmark, drawn rather than an image so it follows the theme. */
  word: string;
  accent: string;
  tail: string;
  label: string;
}

const STORES: Store[] = [
  {
    href: '/fresh',
    word: 'fresh',
    accent: 'text-[#4a9c2d]',
    tail: 'bg-[#4a9c2d]',
    label: 'Fresh groceries, delivered',
  },
  {
    href: '/now',
    word: 'now',
    accent: 'text-[#1a9cd8] italic',
    tail: 'bg-[#1a9cd8]',
    label: 'Essentials in minutes',
  },
  {
    href: '/fresh/meat',
    word: 'freshmeat',
    accent: 'text-[#4a9c2d]',
    tail: 'bg-[#4a9c2d]',
    label: 'Meat and seafood, cut to order',
  },
];

export function FreshMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

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
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  /**
   * Measures the trigger so the panel can be positioned `fixed`.
   *
   * The nav row carries `overflow-hidden` as a deliberate backstop against a
   * long label introducing a scrollbar, and that clips an absolutely
   * positioned child. A fixed element escapes an `overflow` ancestor, so the
   * menu is placed in viewport coordinates instead of being absolutely
   * positioned inside the clipped row.
   */
  function measure() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 2, left: rect.left });
  }

  function openNow() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    measure();
    setOpen(true);
  }

  function closeSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  // Viewport coordinates go stale the moment the page moves under them.
  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 2, left: rect.left });
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocus={openNow}
      onBlur={closeSoon}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          measure();
          setOpen((previous) => !previous);
        }}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        className={cn(
          'flex min-h-11 items-center gap-1 rounded border px-2.5 text-[15px] whitespace-nowrap',
          open ? 'border-white/60 bg-white/10' : 'hover:outline-hairline/60 border-transparent hover:outline',
        )}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-75" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          style={{ top: anchor.top, left: anchor.left }}
          className="border-hairline bg-surface fixed z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border p-4 shadow-2xl shadow-black/50"
        >
          <ul className="grid grid-cols-2 gap-3">
            {STORES.map((store) => (
              <li key={store.href}>
                <Link
                  href={store.href}
                  onClick={() => setOpen(false)}
                  className="bg-surface-sunken hover:ring-accent-500 flex aspect-square flex-col items-center justify-center rounded p-3 text-center transition-shadow hover:ring-2"
                >
                  {/* The smile under the wordmark, as in the reference. */}
                  <span className={cn('text-2xl leading-none font-bold', store.accent)}>
                    {store.word}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn('mt-1 h-0.5 w-12 rounded-full', store.tail)}
                  />
                  <span className="text-ink-subtle mt-2 text-[11px] leading-tight">{store.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/category/grocery"
            onClick={() => setOpen(false)}
            className="text-link mt-4 inline-block text-sm hover:underline"
          >
            Shop all groceries on amazon
          </Link>
        </div>
      )}
    </div>
  );
}
