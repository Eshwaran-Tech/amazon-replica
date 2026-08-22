'use client';

import { Building2, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  cityLabel,
  findCity,
  POPULAR_CITIES,
  searchCities,
  type HotelCity,
} from '@/data/hotel-cities';

/**
 * "City, area or hotel name", and the sheet behind it.
 *
 * Recent Searches is a real list, kept in `localStorage` and never sent
 * anywhere: where somebody has been looking at hotels is their business, and
 * this store has no use for it.
 *
 * The box searches localities too, so typing "Calangute" finds Goa and carries
 * the neighbourhood through to the results as a filter. That is why the chosen
 * term is submitted alongside the city id rather than thrown away.
 */

const RECENT_LIMIT = 4;

function readRecent(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT);
  } catch {
    // A corrupt or blocked store is not worth an error; the list is a nicety.
    return [];
  }
}

function writeRecent(key: string, id: string): string[] {
  const next = [id, ...readRecent(key).filter((entry) => entry !== id)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private browsing, a full quota: the picker still works without a memory.
  }
  return next;
}

interface Props {
  value: string;
  /** Free text the guest typed, kept so a locality can narrow the results. */
  term: string;
  onChange: (value: { city: string; term: string }) => void;
}

export function DestinationField({ value, term, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const selected = findCity(value);
  const matches = useMemo(() => (typed ? searchCities(typed) : []), [typed]);
  const recentCities = useMemo(
    () => recent.map((id) => findCity(id)).filter((city): city is HotelCity => city !== undefined),
    [recent],
  );

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      // Keep Tab inside the sheet: behind it is a page that is not, right now,
      // reachable by pointer either.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /**
   * Read the history when the sheet opens rather than on mount: it is then
   * fresh even after another tab has added to it, and the first render owes
   * nothing to a store the server cannot see.
   */
  function openSheet(): void {
    setRecent(readRecent('amazon.hotels.recent'));
    setTyped('');
    setOpen(true);
  }

  function choose(city: HotelCity): void {
    // A typed locality is kept; a typed city name is not, because the city is
    // already the answer and re-filtering on it would find nothing.
    const locality = city.localities.find((entry) =>
      entry.toLowerCase().includes(typed.trim().toLowerCase()),
    );
    onChange({ city: city.id, term: typed.trim() && locality ? locality : '' });
    setRecent(writeRecent('amazon.hotels.recent', city.id));
    setTyped('');
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name="city" value={value} />
      <input type="hidden" name="term" value={term} />

      <button type="button" onClick={openSheet} className="min-w-0 flex-1 px-4 py-2.5 text-left">
        <span className="block text-xs text-neutral-500">City, area or hotel name</span>
        <span className="block truncate text-base text-neutral-900">
          {selected ? (
            <>
              <span className="font-semibold">{term || selected.name}</span>
              {term && <span className="ml-1.5 text-sm text-neutral-500">{selected.name}</span>}
            </>
          ) : (
            <span className="text-neutral-500">Where are you going?</span>
          )}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-0 sm:p-6">
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex h-full w-full max-w-lg flex-col bg-white sm:h-[min(40rem,90vh)] sm:rounded-2xl"
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
              <h2 id={titleId} className="flex-1 text-sm font-bold text-neutral-900">
                City, area or hotel name
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-4 py-3">
              <div className="flex items-center gap-2 rounded-md border border-neutral-400 px-3 py-2.5">
                <Search className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder="City, area or hotel name"
                  aria-label="Search destinations"
                  className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              {typed ? (
                <Section title="Matching destinations">
                  {matches.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-neutral-500">
                      Nothing matches “{typed}”.
                    </p>
                  )}
                  {matches.map((city) => (
                    <Row key={city.id} city={city} typed={typed} onChoose={choose} />
                  ))}
                </Section>
              ) : (
                <>
                  {recentCities.length > 0 && (
                    <Section title="Recent Searches">
                      {recentCities.map((city) => (
                        <Row key={city.id} city={city} typed="" onChoose={choose} showKind />
                      ))}
                    </Section>
                  )}

                  <Section title="Popular Cities">
                    {POPULAR_CITIES.map((city) => (
                      <Row key={city.id} city={city} typed="" onChoose={choose} />
                    ))}
                  </Section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="bg-neutral-100 px-4 py-2 text-base font-bold text-neutral-900">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

function Row({
  city,
  typed,
  onChoose,
  showKind = false,
}: {
  city: HotelCity;
  typed: string;
  onChoose: (city: HotelCity) => void;
  showKind?: boolean;
}) {
  // When the term names a neighbourhood, show which one -- otherwise a search
  // for "Calangute" returns a row that just says "Goa" and looks like a miss.
  const locality = typed
    ? city.localities.find((entry) => entry.toLowerCase().includes(typed.trim().toLowerCase()))
    : undefined;

  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(city)}
        className="flex w-full items-center gap-3 border-b border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50"
      >
        <Building2 className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-neutral-900">
            {locality ? `${locality}, ${city.name}` : cityLabel(city)}
          </span>
          {locality && (
            <span className="block truncate text-xs text-neutral-500">{cityLabel(city)}</span>
          )}
        </span>
        {showKind && <span className="shrink-0 text-xs text-neutral-500">City</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
      </button>
    </li>
  );
}
