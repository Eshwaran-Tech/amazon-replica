'use client';

import { ChevronRight, Compass, History, Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  findStation,
  POPULAR_STATIONS,
  searchStations,
  stationsInCity,
  type TrainStation,
} from '@/data/train-stations';
import { cn } from '@/lib/utils/cn';

/**
 * The station picker from the reference: a sheet with a search box, the
 * traveller's recent stations, and the popular ones underneath.
 *
 * "Recent Searches" is a real list, not a decorative heading -- it is kept in
 * `localStorage` under one key per field, so the stations you actually use rise
 * to the top on the next visit. It never leaves the browser: a list of stations
 * somebody looks up is their business, and this store has no use for it.
 *
 * A `role="dialog"` with a focus trap rather than a floating div, because on a
 * phone this covers the whole screen and a screen reader needs to be told the
 * page behind it is not the thing to read.
 */

const RECENT_LIMIT = 4;

function readRecent(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((code): code is string => typeof code === 'string').slice(0, RECENT_LIMIT);
  } catch {
    // A corrupt or blocked store is not worth an error; the list is a nicety.
    return [];
  }
}

function writeRecent(key: string, code: string): string[] {
  const next = [code, ...readRecent(key).filter((entry) => entry !== code)].slice(0, RECENT_LIMIT);
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Private browsing, a full quota: the picker still works without a memory.
  }
  return next;
}

interface Props {
  /** Posted field name, so the form works without JavaScript state. */
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (code: string) => void;
  /** Icon shown to the left of the chosen station. */
  marker: React.ReactNode;
  /** Storage key, so source and destination keep separate histories. */
  recentKey: string;
}

export function StationField({
  name,
  label,
  placeholder,
  value,
  onChange,
  marker,
  recentKey,
}: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const selected = findStation(value);
  const matches = useMemo(() => (term ? searchStations(term) : []), [term]);

  const recentStations = useMemo(
    () => recent.map((code) => findStation(code)).filter((s): s is TrainStation => s !== undefined),
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
   * The history is read here rather than on mount, so it is fresh every time
   * the sheet opens -- including after another tab has added to it -- and the
   * first render owes nothing to a store the server cannot see.
   */
  function openSheet(): void {
    setRecent(readRecent(recentKey));
    setOpen(true);
  }

  function choose(station: TrainStation): void {
    onChange(station.code);
    setRecent(writeRecent(recentKey, station.code));
    setTerm('');
    setOpen(false);
  }

  return (
    <>
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        onClick={openSheet}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-500">
          {marker}
        </span>
        {selected ? (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] font-bold text-neutral-600">
              {selected.code}
            </span>
            <span className="truncate text-base font-semibold text-neutral-900">
              {selected.name}
            </span>
          </span>
        ) : (
          <span className="text-base text-neutral-500">{placeholder}</span>
        )}
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
            <div className="flex items-center justify-end border-b border-neutral-200 px-3 py-2">
              <h2 id={titleId} className="sr-only">
                {label}
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
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder={placeholder}
                  aria-label={label}
                  className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-6">
              {term ? (
                <Section title="Matching stations">
                  {matches.length === 0 && (
                    <p className="px-4 py-6 text-center text-sm text-neutral-500">
                      No station matches “{term}”.
                    </p>
                  )}
                  {matches.map((station) => (
                    <Row
                      key={station.code}
                      station={station}
                      icon={<Search className="h-4 w-4" aria-hidden="true" />}
                      onChoose={choose}
                    />
                  ))}
                </Section>
              ) : (
                <>
                  {recentStations.length > 0 && (
                    <Section title="Recent Searches">
                      {recentStations.map((station) => (
                        <Row
                          key={station.code}
                          station={station}
                          icon={<History className="h-4 w-4" aria-hidden="true" />}
                          onChoose={choose}
                        />
                      ))}
                    </Section>
                  )}

                  <Section title="Popular Cities">
                    {POPULAR_STATIONS.map((station) => (
                      <Row
                        key={station.code}
                        station={station}
                        icon={<Compass className="h-4 w-4" aria-hidden="true" />}
                        onChoose={choose}
                        allStations
                      />
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
  station,
  icon,
  onChoose,
  allStations = false,
}: {
  station: TrainStation;
  icon: React.ReactNode;
  onChoose: (station: TrainStation) => void;
  /** Append "All Stations" when the city really has more than one. */
  allStations?: boolean;
}) {
  const siblings = stationsInCity(station.city).length;
  const suffix = allStations && siblings > 1 ? ' - All Stations' : '';

  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(station)}
        className={cn(
          'flex w-full items-center gap-3 border-b border-neutral-200 px-4 py-3 text-left',
          'hover:bg-neutral-50',
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-neutral-500">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#007185]">
            {station.code} - {station.name}
            {suffix}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {station.city}, {station.state}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
      </button>
    </li>
  );
}
