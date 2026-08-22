'use client';

import { Check, ChevronDown, Loader2, MapPin, Plus, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { addToCartAction } from '@/actions/cart';
import { setDeliveryPinAction } from '@/actions/delivery';
import { Alert } from '@/components/ui/alert';
import { emptyFormState } from '@/lib/forms/state';
import { cn } from '@/lib/utils/cn';

/**
 * The Now store's interactive parts.
 *
 * Everything here posts to a Server Action that already exists elsewhere in the
 * app -- the quick-add button is the same `addToCartAction` the product page
 * uses, with the same CSRF check and the same rate limit. None of it is a
 * decorative control.
 */

// ------------------------------------------------------------ delivery PIN

export function DeliveryPinBar({
  pin,
  label,
  minutes,
  csrfField,
}: {
  pin: string;
  label: string;
  minutes: number;
  csrfField: ReactNode;
}) {
  const [state, formAction] = useActionState(setDeliveryPinAction, emptyFormState);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(state);
  const fieldId = useId();

  // Closes itself once the server confirms, so the bar shows the new area
  // rather than the form that set it. Adjusted during render rather than in an
  // effect: the trigger is a prop-like value changing, not an external system,
  // and an effect here would render the open panel once before closing it.
  if (seen !== state) {
    setSeen(state);
    if (state.ok) setOpen(false);
  }

  return (
    <div className="border-hairline bg-surface rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="hover:bg-surface-sunken flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors"
      >
        <MapPin className="text-accent-400 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          Deliver to <span className="font-semibold">{pin}</span>
          <span className="text-ink-muted">, {label}</span>
        </span>
        <span className="border-hairline text-ink-muted hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:inline">
          ~{minutes} min
        </span>
        <ChevronDown
          className={cn(
            'text-ink-muted h-4 w-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <form action={formAction} className="border-hairline space-y-2 border-t p-3">
          {csrfField}
          <label htmlFor={fieldId} className="block text-xs font-semibold">
            Change delivery PIN code
          </label>
          <div className="flex gap-2">
            <input
              id={fieldId}
              name="pin"
              defaultValue={pin}
              inputMode="numeric"
              maxLength={6}
              autoComplete="postal-code"
              placeholder="600001"
              className="border-hairline focus:border-accent-500 min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
            />
            <SmallSubmit>Apply</SmallSubmit>
          </div>
          {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}
          <p className="text-ink-subtle text-[11px] leading-snug">
            The area name comes from the PIN itself — the first digits of an Indian PIN identify the
            sorting district and postal circle. The minutes are an estimate derived from the same
            code, not a live courier lookup.
          </p>
        </form>
      )}
    </div>
  );
}

function SmallSubmit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent-500 hover:bg-accent-400 text-brand-950 shrink-0 rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
}

// ------------------------------------------------------------- store search

export function NowSearch() {
  return (
    <form action="/search" method="get" role="search" className="relative">
      <label htmlFor="now-search" className="sr-only">
        Search the Now store
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500"
        aria-hidden="true"
      />
      <input
        id="now-search"
        name="q"
        type="search"
        placeholder='Search for "milk"'
        className="border-hairline focus:border-accent-500 w-full rounded-xl border bg-white py-2.5 pr-3 pl-9 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
      />
    </form>
  );
}

// ---------------------------------------------------------------- quick add

/**
 * The "+" on a product tile.
 *
 * One form per tile rather than one for the grid: the pending state belongs to
 * the tile that was clicked, and `useFormStatus` reads the nearest form.
 */
export function QuickAdd({
  productId,
  productName,
  outOfStock,
  csrfField,
}: {
  productId: string;
  productName: string;
  outOfStock: boolean;
  csrfField: ReactNode;
}) {
  const [state, formAction] = useActionState(addToCartAction, emptyFormState);

  if (outOfStock) {
    return (
      <span className="border-hairline text-ink-subtle inline-flex h-8 items-center rounded-lg border px-2 text-[11px] font-semibold">
        Out of stock
      </span>
    );
  }

  return (
    <form action={formAction}>
      {csrfField}
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value="1" />
      <QuickAddButton added={state.ok === true} productName={productName} />
      {state.message && !state.ok && (
        <span role="alert" className="text-deal mt-1 block text-[10px] leading-tight">
          {state.message}
        </span>
      )}
    </form>
  );
}

function QuickAddButton({ added, productName }: { added: boolean; productName: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={added ? `${productName} added to cart` : `Add ${productName} to cart`}
      className={cn(
        'inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border-2 text-xs font-bold transition-colors',
        added
          ? 'border-instock text-instock'
          : 'border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950',
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : added ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Added
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add
        </>
      )}
    </button>
  );
}

// ------------------------------------------------------------- category rail

export interface RailItem {
  label: string;
  href: string;
  image?: string | undefined;
}

/** The scrolling icon rail under the search bar. */
export function CategoryRail({ items }: { items: RailItem[] }) {
  if (items.length === 0) return null;

  return (
    // Two layouts, not one. On a phone this is what the reference shows: fixed
    // tiles that scroll sideways. On anything wider it becomes a grid that
    // divides the container between however many tiles there are -- 80px
    // thumbnails stranded against the left edge of a 1900px monitor is what a
    // phone layout looks like when nobody tells it the screen got bigger.
    <ul className="-mx-1 flex scrollbar-none gap-3 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] sm:gap-4 sm:overflow-visible sm:px-0">
      {items.map((item) => (
        <li key={item.href + item.label} className="shrink-0 sm:shrink">
          <Link href={item.href} className="group block w-[4.5rem] text-center sm:w-full">
            <span className="border-ink-subtle group-hover:border-accent-500 bg-surface-sunken relative block aspect-square w-full overflow-hidden rounded-2xl border-2 transition-colors">
              {item.image ? (
                <Image
                  src={item.image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 80px, 200px"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="text-ink-subtle absolute inset-0 flex items-center justify-center text-lg font-bold">
                  {item.label.charAt(0)}
                </span>
              )}
            </span>
            <span className="mt-1.5 block text-[11px] leading-tight font-semibold sm:text-sm">
              {item.label}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
