'use client';

import { useEffect, useRef, useState } from 'react';

import { CABIN_LABELS, type CabinClass } from '@/services/flights';
import { cn } from '@/lib/utils/cn';

/**
 * Travellers and cabin.
 *
 * The two rules that make the counts sensible are enforced by disabling the
 * numbers rather than by rejecting the choice afterwards, so nobody picks a
 * combination and is then told off for it:
 *
 *  - **at most nine seats**, so children are capped by how many adults are
 *    already selected;
 *  - **at most one infant per adult**, because an infant travels on a lap.
 */

const MAX_SEATS = 9;

interface TravellersFieldProps {
  adults: number;
  /** Named `childCount`, not `children`: React reserves that prop name. */
  childCount: number;
  infants: number;
  cabin: CabinClass;
  onChange: (next: {
    adults: number;
    childCount: number;
    infants: number;
    cabin: CabinClass;
  }) => void;
}

export function TravellersField({
  adults,
  childCount,
  infants,
  cabin,
  onChange,
}: TravellersFieldProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

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
    };
  }, [open]);

  const total = adults + childCount + infants;
  const summary = `${String(total).padStart(2, '0')} Traveller${total === 1 ? '' : 's'}, ${CABIN_LABELS[cabin]}`;

  return (
    <div ref={containerRef} className="relative">
      {/* Posted separately so the server sees the real breakdown. */}
      <input type="hidden" name="adults" value={adults} />
      {/* `children` in the URL; the prop is `childCount` only because React
          reserves that name. */}
      <input type="hidden" name="children" value={childCount} />
      <input type="hidden" name="infants" value={infants} />
      <input type="hidden" name="cabin" value={cabin} />

      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full text-left"
      >
        <span className="text-ink-muted block text-[11px]">Travellers &amp; class</span>
        <span className="block truncate text-sm font-semibold">{summary}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Number of travellers"
          // Left-aligned while the grid is stacked (the cell sits on the left
          // there, and right-anchoring pushed the panel off-screen); right-
          // aligned once the cell is the rightmost column.
          className="border-hairline bg-surface absolute top-full left-0 z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border shadow-2xl shadow-black/50 lg:right-0 lg:left-auto"
        >
          <p className="border-hairline bg-surface-sunken rounded-t-xl border-b px-4 py-2.5 text-sm font-bold">
            Number of Travellers
          </p>

          <CountRow
            label="Adults"
            hint="12 years & above (on travel day)"
            value={adults}
            min={1}
            max={MAX_SEATS - childCount}
            onSelect={(next) =>
              onChange({ adults: next, childCount, infants: Math.min(infants, next), cabin })
            }
          />
          <CountRow
            label="Children"
            hint="2 - 12 years (on travel day)"
            value={childCount}
            min={0}
            max={MAX_SEATS - adults}
            onSelect={(next) => onChange({ adults, childCount: next, infants, cabin })}
          />
          <CountRow
            label="Infants"
            hint="Under 2 years (on travel day)"
            value={infants}
            min={0}
            // One lap each.
            max={adults}
            onSelect={(next) => onChange({ adults, childCount, infants: next, cabin })}
          />

          <p className="border-hairline bg-surface-sunken border-y px-4 py-2.5 text-sm font-bold">
            Cabin
          </p>
          <ul className="p-2">
            {(Object.keys(CABIN_LABELS) as CabinClass[]).map((option) => (
              <li key={option}>
                <label className="hover:bg-surface-sunken flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm">
                  <input
                    type="radio"
                    name="cabin-choice"
                    checked={cabin === option}
                    onChange={() => onChange({ adults, childCount, infants, cabin: option })}
                    className="accent-accent-500 h-4 w-4"
                  />
                  {CABIN_LABELS[option]}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CountRow({
  label,
  hint,
  value,
  min,
  max,
  onSelect,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onSelect: (value: number) => void;
}) {
  return (
    <fieldset className="border-hairline border-b px-4 py-3">
      <legend className="sr-only">{label}</legend>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-ink-subtle text-[11px]">{hint}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, index) => index).map((option) => {
          const disabled = option < min || option > max;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              aria-pressed={value === option}
              aria-label={`${option} ${label.toLowerCase()}`}
              onClick={() => onSelect(option)}
              className={cn(
                'h-7 w-7 rounded text-xs transition-colors',
                disabled && 'text-ink-subtle/40 cursor-not-allowed',
                !disabled && value !== option && 'hover:bg-surface-sunken',
                value === option && 'border-accent-500 text-accent-400 border font-bold',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
