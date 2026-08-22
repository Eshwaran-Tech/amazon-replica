'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface FilterDrawerProps {
  children: ReactNode;
  activeCount: number;
}

/**
 * Bottom-sheet filter panel for small screens.
 *
 * The filters themselves are server-rendered links passed in as `children`, so
 * this component only handles presentation -- no filter logic is duplicated
 * between the mobile and desktop paths, which is how the two normally drift
 * apart.
 *
 * A bottom sheet rather than a side drawer: on a phone the bottom of the screen
 * is where the thumb is, and a sheet can be dismissed downward.
 *
 * Same dialog discipline as the navigation drawer -- focus moves in and back
 * out, Tab is trapped, Escape closes, background scroll is locked.
 */
export function FilterDrawer({ children, activeCount }: FilterDrawerProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Capture the node now: by cleanup time the ref may point elsewhere, and
    // focus would silently fail to return to the trigger -- leaving a keyboard
    // user at the top of the document after closing the sheet.
    const trigger = triggerRef.current;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const selector =
      'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])';
    panelRef.current?.querySelector<HTMLElement>(selector)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = panelRef.current?.querySelectorAll<HTMLElement>(selector);
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
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="border-hairline bg-surface hover:bg-surface-muted inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium lg:hidden"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filters
        {activeCount > 0 && (
          <span className="bg-accent-500 text-brand-950 rounded-full px-1.5 text-xs font-bold">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            tabIndex={-1}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filter products"
            className="bg-surface absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl shadow-xl"
          >
            <div className="border-hairline flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base font-bold">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>

            <div className="border-hairline bg-surface border-t p-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="bg-accent-500 hover:bg-accent-600 text-brand-950 min-h-11 w-full rounded-md text-sm font-semibold"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
