'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { paiseToRupees } from '@/lib/utils/money';
import { cheapestFareFor } from '@/services/flights';
import { cn } from '@/lib/utils/cn';

/**
 * Two-month date picker with a fare under every day.
 *
 * The fares are the real ones. `cheapestFareFor` runs the same generator the
 * results page runs, so the number printed on a day is the number that day
 * actually costs -- a calendar that advertised a fare the search then
 * contradicted would be worse than showing none.
 *
 * Dates are built and compared as local `Y-M-D` strings, never through
 * `toISOString()`, which converts to UTC and lands on the previous day for
 * anyone east of Greenwich -- in India that would grey out today.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/** Monday-first column index, since the reference week starts on Monday. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

interface DateFieldProps {
  name: string;
  label: string;
  value: string;
  min: string;
  onChange?: (value: string) => void;
  /** Route, so the calendar can price each day. Omit to hide fares. */
  route?: { from: string; to: string };
  /** Shown as a clear control when the field is optional (a return leg). */
  onClear?: () => void;
}

export function DateField({ name, label, value, min, onChange, route, onClear }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseKey(value) ?? parseKey(min);
  const [view, setView] = useState(() => ({
    year: parsed?.year ?? 2026,
    month: parsed?.month ?? 0,
  }));

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

  const months = [
    { year: view.year, month: view.month },
    view.month === 11 ? { year: view.year + 1, month: 0 } : { year: view.year, month: view.month + 1 },
  ];

  // Priced once per open/route/month rather than on every keystroke elsewhere.
  const fares = useMemo(() => {
    if (!open || !route) return new Map<string, number>();

    const today = new Date();
    const map = new Map<string, number>();

    for (const { year, month } of months) {
      const days = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const key = toKey(year, month, day);
        if (key < min) continue;

        const fare = cheapestFareFor(route.from, route.to, key, today);
        if (fare !== null) map.set(key, fare);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, route?.from, route?.to, view.year, view.month, min]);

  const label12 = (() => {
    const parts = parseKey(value);
    if (!parts) return 'Select date';
    const date = new Date(parts.year, parts.month, parts.day);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  })();

  const weekday = (() => {
    const parts = parseKey(value);
    if (!parts) return '';
    return new Date(parts.year, parts.month, parts.day).toLocaleDateString('en-IN', { weekday: 'short' });
  })();

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <CalendarDays className="text-ink-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="text-ink-muted block text-[11px]">{label}</span>
            <span className="block truncate text-sm font-semibold">
              {label12}
              {weekday && <span className="text-ink-subtle ml-1 text-[11px] font-normal">{weekday}</span>}
            </span>
          </span>
        </button>

        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="text-ink-subtle hover:text-ink shrink-0 px-1 text-sm"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="border-hairline bg-surface absolute top-full left-0 z-40 mt-1 w-[min(38rem,calc(100vw-2rem))] rounded-xl border p-3 shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() =>
                setView(({ year, month }) =>
                  month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
                )
              }
              aria-label="Previous month"
              className="hover:bg-surface-sunken rounded-lg p-1.5"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span aria-live="polite" className="sr-only">
              {MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              onClick={() =>
                setView(({ year, month }) =>
                  month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
                )
              }
              aria-label="Next month"
              className="hover:bg-surface-sunken rounded-lg p-1.5"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {months.map(({ year, month }) => (
              <Month
                key={`${year}-${month}`}
                year={year}
                month={month}
                min={min}
                selected={value}
                fares={fares}
                onPick={(key) => {
                  onChange?.(key);
                  setOpen(false);
                }}
              />
            ))}
          </div>

          {route && (
            <p className="text-ink-subtle mt-3 flex items-center gap-1.5 border-t border-dashed pt-2 text-[11px]">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Fares are the lowest for 1 adult in Economy, in INR, and change with the date.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Month({
  year,
  month,
  min,
  selected,
  fares,
  onPick,
}: {
  year: number;
  month: number;
  min: string;
  selected: string;
  fares: Map<string, number>;
  onPick: (key: string) => void;
}) {
  const firstColumn = mondayIndex(new Date(year, month, 1));
  const days = new Date(year, month + 1, 0).getDate();

  return (
    <section aria-label={`${MONTHS[month]} ${year}`}>
      <p className="mb-1 text-center text-sm font-bold">
        {MONTHS[month]} {year}
      </p>

      <div className="text-ink-subtle grid grid-cols-7 text-center text-[10px]">
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">
            {day.slice(0, 2)}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstColumn }, (_, index) => (
          <span key={`pad-${index}`} />
        ))}

        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const key = toKey(year, month, day);
          const isPast = key < min;
          const isSelected = key === selected;
          const column = (firstColumn + index) % 7;
          const isWeekend = column >= 5;
          const fare = fares.get(key);

          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => onPick(key)}
              aria-pressed={isSelected}
              aria-label={`${day} ${MONTHS[month]} ${year}${fare ? `, from ${Math.round(paiseToRupees(fare))} rupees` : ''}`}
              className={cn(
                'flex h-11 flex-col items-center justify-center rounded-lg text-[11px] transition-colors',
                isPast && 'text-ink-subtle/40 cursor-not-allowed',
                !isPast && isWeekend && !isSelected && 'bg-accent-500/5',
                !isPast && !isSelected && 'hover:bg-surface-sunken',
                isSelected && 'bg-accent-500 font-bold text-slate-900',
              )}
            >
              <span>{day}</span>
              {!isPast && fare !== undefined && (
                <span className={cn('text-[9px]', isSelected ? 'text-slate-900' : 'text-instock')}>
                  {Math.round(paiseToRupees(fare)).toLocaleString('en-IN')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
