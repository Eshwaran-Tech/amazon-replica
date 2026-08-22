'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils/cn';

interface SearchBarProps {
  /** Extra fields on the entries are ignored; only name and slug are used. */
  categories: Array<{ name: string; slug: string }>;
  className?: string;
  /** Compact variant for the mobile header row. */
  compact?: boolean;
}

interface Suggestion {
  name: string;
  slug: string;
}

/**
 * Search box with type-ahead.
 *
 * Submits as a real GET form, so it works with JavaScript disabled and the
 * result is a shareable, bookmarkable URL. The suggestions are an enhancement
 * layered on top, not the mechanism.
 *
 * Suggestions are fetched from an endpoint that escapes the query into an
 * anchored regex server-side; nothing here builds a query.
 */
export function SearchBar({ categories, className, compact = false }: SearchBarProps) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listboxId = useId();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState('all');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced fetch. Without the delay this fires on every keystroke, which is
  // both wasteful and the fastest way to hit the endpoint's rate limit.
  useEffect(() => {
    const trimmed = query.trim();
    // Nothing to clear here: whether suggestions are *shown* is derived from
    // the query below, so a short query needs no state update (and a setState
    // in an effect body causes an extra render pass).
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/products/suggest?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { ok?: boolean; data?: Suggestion[] } | null) => {
          if (payload?.ok && Array.isArray(payload.data)) {
            setSuggestions(payload.data.slice(0, 8));
          }
        })
        .catch(() => {
          // Aborted or offline: suggestions are optional, search still works.
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // Derived, not stored: a stale list can never be shown for a query that is
  // now too short.
  const visibleSuggestions = query.trim().length >= 2 ? suggestions : [];

  function go(term: string) {
    setOpen(false);
    const params = new URLSearchParams();
    if (term.trim()) params.set('q', term.trim());
    if (category !== 'all') params.set('category', category);
    router.push(`/search?${params.toString()}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleSuggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % visibleSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? visibleSuggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const chosen = visibleSuggestions[activeIndex];
      if (chosen) go(chosen.name);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form
        action="/search"
        method="get"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          go(query);
        }}
        // Focus ring on the whole control rather than the input alone: the
        // group reads as one component, and a ring around just the middle
        // segment looks like a rendering fault.
        className="focus-within:outline-accent-400 flex w-full overflow-hidden rounded-md focus-within:outline-3"
      >
        {/* Category scope: desktop only. On a phone it eats the width the input
            needs, and the filter is one tap away on the results page. */}
        {!compact && (
          <>
            <label htmlFor="search-category" className="sr-only">
              {t('header.searchInCategory')}
            </label>
            <select
              id="search-category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              // Native select with its own arrow, matching the reference's
              // scope control. Light grey against the white input so the two
              // segments read as one component.
              className="hidden w-16 shrink-0 border-r border-black/20 bg-[#e6e6e6] px-2 text-[13px] text-neutral-800 md:block"
            >
              <option value="all">{t('header.all')}</option>
              {categories.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="search-input" className="sr-only">
          {t('header.searchLabel')}
        </label>
        <input
          id="search-input"
          name="q"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('header.searchPlaceholder')}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && visibleSuggestions.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          // Dark ink, not the theme's `text-ink`: this input keeps a white
          // background at every breakpoint, and the theme colour is a near-white
          // meant for dark surfaces -- on white it left what you typed
          // effectively invisible. The placeholder is a mid grey so it still
          // reads as placeholder rather than as entered text.
          className="min-h-10 w-full min-w-0 bg-white px-3 text-base text-neutral-900 caret-neutral-900 outline-none placeholder:text-neutral-500 sm:min-h-11"
        />

        <button
          type="submit"
          className="bg-accent-500 hover:bg-accent-600 text-brand-950 flex min-h-10 w-11 shrink-0 items-center justify-center sm:min-h-11 sm:w-12"
          aria-label={t('header.search')}
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>

      {open && visibleSuggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t('header.suggestions')}
          className="border-hairline bg-surface absolute top-full right-0 left-0 z-50 mt-1 max-h-80 overflow-auto rounded-md border shadow-lg"
        >
          {visibleSuggestions.map((suggestion, index) => (
            <li
              key={suggestion.slug}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onClick={() => go(suggestion.name)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm',
                  index === activeIndex ? 'bg-surface-muted' : 'bg-transparent',
                )}
              >
                <Search className="text-ink-subtle h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{suggestion.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
