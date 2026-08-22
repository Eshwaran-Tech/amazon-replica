'use client';

import { Clock, Plane } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { POPULAR_AIRPORTS, searchAirports, findAirport, type Airport } from '@/data/airports';
import { cn } from '@/lib/utils/cn';

/**
 * Airport picker.
 *
 * A real combobox rather than a styled `<div>` list: the input carries
 * `role="combobox"`, the panel is a `listbox`, and the highlighted row is
 * pointed at by `aria-activedescendant` so a screen reader announces it while
 * focus stays in the text field. Arrow keys move, Enter picks, Escape closes.
 *
 * Recent searches live in `localStorage`, which is the right store for them:
 * it is a convenience local to this browser, not account data, so it never
 * touches the server or the database.
 */

const RECENT_KEY = 'flights:recent-airports';
const MAX_RECENT = 3;

function readRecent(): Airport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const codes: unknown = JSON.parse(raw);
    if (!Array.isArray(codes)) return [];
    // Resolved through the airport list, so a stale or edited code is dropped
    // rather than rendered as a broken row.
    return codes
      .filter((code): code is string => typeof code === 'string')
      .map((code) => findAirport(code))
      .filter((airport): airport is Airport => Boolean(airport))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberAirport(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readRecent().map((airport) => airport.code);
    const next = [code, ...existing.filter((entry) => entry !== code)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // A full or disabled storage must not break the search form.
  }
}

interface AirportFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
}

export function AirportField({ name, label, value, onChange, placeholder }: AirportFieldProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<Airport[]>([]);

  const selected = findAirport(value);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const typing = query.trim().length > 0;
  const results = typing ? searchAirports(query, 8) : POPULAR_AIRPORTS;
  // Recents only appear on the unfiltered panel, as in the reference.
  const rows: Array<{ airport: Airport; recent: boolean }> = typing
    ? results.map((airport) => ({ airport, recent: false }))
    : [
        ...recent.map((airport) => ({ airport, recent: true })),
        ...results
          .filter((airport) => !recent.some((entry) => entry.code === airport.code))
          .map((airport) => ({ airport, recent: false })),
      ];

  /**
   * Opens the panel and refreshes the recents.
   *
   * Read here rather than in an effect: `localStorage` does not exist during
   * the server render, so reading it at open time keeps the first client
   * render identical to the server's and avoids a hydration mismatch.
   */
  function openPanel() {
    setRecent(readRecent());
    setActive(0);
    setOpen(true);
  }

  function choose(airport: Airport) {
    onChange(airport.code);
    rememberAirport(airport.code);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openPanel();
        return;
      }
      setActive((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + rows.length) % rows.length;
      });
      return;
    }
    if (event.key === 'Enter' && open) {
      const row = rows[active];
      if (row) {
        event.preventDefault();
        choose(row.airport);
      }
      return;
    }
    if (event.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {/* What the form posts: always a resolved code, never raw typing. */}
      <input type="hidden" name={name} value={value} />

      <label htmlFor={`${listId}-input`} className="text-ink-muted block text-[11px]">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <span className="border-hairline text-ink-muted shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px]">
          {selected?.code ?? '---'}
        </span>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${rows[active].airport.code}` : undefined}
          autoComplete="off"
          placeholder={placeholder ?? 'Select Airport'}
          value={open ? query : (selected?.city ?? '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            if (!open) openPanel();
          }}
          onFocus={() => {
            setQuery('');
            openPanel();
          }}
          onKeyDown={onKeyDown}
          className="text-ink w-full min-w-0 bg-transparent text-sm font-semibold outline-none"
        />
      </div>

      <span className="text-ink-subtle mt-0.5 block truncate text-[11px]">
        {selected ? `${selected.code} - ${selected.name}` : 'Choose an airport'}
      </span>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="border-hairline bg-surface absolute top-full left-0 z-40 mt-1 max-h-80 w-[19rem] overflow-auto rounded-xl border py-1 shadow-2xl shadow-black/50"
        >
          {rows.length === 0 && (
            <li className="text-ink-subtle px-3 py-3 text-sm">No matching airport.</li>
          )}

          {rows.map((row, index) => {
            const previous = rows[index - 1];
            const heading =
              index === 0 && row.recent
                ? 'Recent Searches'
                : previous?.recent && !row.recent
                  ? typing
                    ? 'Suggested Cities'
                    : 'Popular Cities'
                  : index === 0 && !row.recent
                    ? typing
                      ? 'Suggested Cities'
                      : 'Popular Cities'
                    : null;

            return (
              <li key={row.airport.code}>
                {heading && (
                  <p className="bg-surface-sunken text-ink-muted px-3 py-1.5 text-[11px] font-bold">
                    {heading}
                  </p>
                )}
                <button
                  type="button"
                  id={`${listId}-${row.airport.code}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(row.airport)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors',
                    index === active ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                  )}
                >
                  <span aria-hidden="true" className="text-ink-subtle mt-0.5 shrink-0">
                    {row.recent ? <Clock className="h-3.5 w-3.5" /> : <Plane className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">
                      {row.airport.city}
                      {!row.recent && `, ${row.airport.country}`}
                    </span>
                    <span className="text-ink-subtle block truncate text-[11px]">
                      {row.airport.code} - {row.airport.name}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
