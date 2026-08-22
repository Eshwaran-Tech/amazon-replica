'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { TrainSearchForm } from '@/components/trains/train-search-form';

/**
 * The pencil on the route strip: it opens the search panel over the results,
 * pre-filled with the search that produced them.
 *
 * The same form the landing page uses, so there is one place where a search is
 * built and one place it can go wrong. Submitting navigates; the sheet is only
 * ever a way to reach the form.
 */

interface Props {
  today: string;
  from: string;
  to: string;
  date: string;
  acOnly: boolean;
  /** The pencil itself, so the server page owns the icon. */
  children: React.ReactNode;
}

export function EditSearch({ today, from, to, date, acOnly, children }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Change this search"
        aria-expanded={open}
        className="shrink-0 rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
      >
        {children}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-0 sm:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Change this search"
            className="w-full max-w-lg bg-white sm:rounded-2xl"
          >
            <div className="flex items-center justify-end px-3 py-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-3 pb-4">
              <TrainSearchForm
                today={today}
                initialFrom={from}
                initialTo={to}
                initialDate={date}
                initialAcOnly={acOnly}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
