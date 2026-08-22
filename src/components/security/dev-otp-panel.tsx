'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * The development one-time password, shown as a notification panel.
 *
 * Fixed to the top-left, above the page, sliding in from beyond the left edge.
 * It shows the code and nothing else: entering the code happens in the verify
 * card on the page, not here. This panel is a delivery channel standing in for
 * the email that no configured provider is sending.
 *
 * Not a modal -- no backdrop, no focus trap, no scroll lock. It must not
 * interrupt the field the customer is typing into behind it.
 *
 * It stays mounted while closed so the exit slide can play; `visibility` is
 * what finally removes it from the Tab order once the transition ends. The
 * slide is dropped under `prefers-reduced-motion`.
 */
export function DevOtpPanel({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [exited, setExited] = useState(false);

  // Mount closed, then slide in, so the transition has a frame to run from.
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hidden = !open && exited;

  return (
    <div
      role="region"
      aria-label="Development one-time password"
      aria-hidden={hidden ? true : undefined}
      onTransitionEnd={() => {
        if (!open) setExited(true);
      }}
      className={cn(
        'fixed top-4 left-4 z-50 w-[min(17rem,calc(100vw-2rem))] sm:top-6 sm:left-6',
        'transition-transform duration-[400ms] ease-out motion-reduce:transition-none',
        open ? 'translate-x-0' : '-translate-x-[calc(100%+2rem)]',
        hidden && 'invisible',
      )}
    >
      {/* Header tab and body read as one card: the tab drops its bottom radius
          and the body its top-left, so the seam closes. */}
      <div className="border-hairline bg-surface-sunken flex w-fit items-center gap-3 rounded-t-xl border border-b-0 py-1.5 pr-1.5 pl-3 shadow-lg shadow-black/40">
        <span className="text-ink-muted text-xs font-bold tracking-[0.15em] uppercase">OTP</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Dismiss development code"
          tabIndex={hidden ? -1 : 0}
          className="hover:bg-surface focus-visible:outline-accent-500 rounded-lg p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="border-hairline bg-surface rounded-tr-xl rounded-b-xl border p-4 shadow-2xl shadow-black/50">
        <p className="text-ink font-mono text-3xl font-bold tracking-[0.25em]">{code}</p>
        <p className="text-ink-subtle mt-2 text-[11px] leading-relaxed">
          Development code — no mail provider is configured, so it is shown here instead of being
          sent.
        </p>
      </div>
    </div>
  );
}
