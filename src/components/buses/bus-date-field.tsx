'use client';

import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { holidayOn, holidaysInMonth } from '@/data/holidays';
import { cn } from '@/lib/utils/cn';

/**
 * The two-month date picker from the reference, with holidays marked.
 *
 * Holidays earn their place: they are when coaches fill and fares climb, so
 * seeing "August 2026 — 3 Holidays" before picking a date is information, not
 * decoration. Weekend columns are tinted for the same reason.
 *
 * Dates are handled as `YYYY-MM-DD` in local time throughout. `toISOString()`
 * would shift the day for anyone east of UTC, which is everyone this store is
 * priced for.
 */

function toKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseKey(key: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/** Monday-first column index, because Indian calendars start on Monday. */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface Props {
  name: string;
  label: string;
  value: string;
  /** Earliest selectable date, `YYYY-MM-DD`. */
  min: string;
  onChange: (dateKey: string) => void;
}

export function BusDateField({ name, label, value, min, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = parseKey(value) ?? parseKey(min);
  const [view, setView] = useState(() => ({
    year: parsed?.year ?? new Date().getFullYear(),
    month: parsed?.month ?? new Date().getMonth(),
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
    view.month === 11
      ? { year: view.year + 1, month: 0 }
      : { year: view.year, month: view.month + 1 },
  ];

  const shown = parseKey(value);
  const dayLabel = shown
    ? new Date(shown.year, shown.month, shown.day).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      })
    : 'Select date';
  const weekdayLabel = shown
    ? new Date(shown.year, shown.month, shown.day).getTime() ===
      new Date(
        parseKey(min)?.year ?? 0,
        parseKey(min)?.month ?? 0,
        parseKey(min)?.day ?? 0,
      ).getTime()
      ? 'Today'
      : new Date(shown.year, shown.month, shown.day).toLocaleDateString('en-IN', {
          weekday: 'short',
        })
    : '';

  function step(direction: -1 | 1): void {
    setView((current) => {
      const next = current.month + direction;
      if (next < 0) return { year: current.year - 1, month: 11 };
      if (next > 11) return { year: current.year + 1, month: 0 };
      return { year: current.year, month: next };
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={value} />

      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-label={label}
        className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm text-neutral-900"
      >
        <CalendarDays className="text-accent-500 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-semibold">{dayLabel}</span>
        {weekdayLabel && <span className="text-neutral-500">{weekdayLabel}</span>}
      </button>

      {open && (
        <div className="border-hairline absolute top-full left-0 z-40 mt-1 w-[min(44rem,92vw)] rounded-xl border bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100"
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
                value={value}
                onPick={(key) => {
                  onChange(key);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Month({
  year,
  month,
  min,
  value,
  onPick,
}: {
  year: number;
  month: number;
  min: string;
  value: string;
  onPick: (key: string) => void;
}) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = mondayIndex(first);
  const holidays = holidaysInMonth(year, month);

  return (
    <div>
      <p className="mb-2 text-center text-sm font-bold text-neutral-900">
        {first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}{' '}
        {holidays.length > 0 && (
          <span className="text-[#c45500]">
            {holidays.length} Holiday{holidays.length === 1 ? '' : 's'}
          </span>
        )}
      </p>

      <div className="grid grid-cols-7 gap-px text-center">
        {WEEKDAYS.map((day, index) => (
          <span
            key={day}
            className={cn(
              'py-1 text-[10px] font-bold',
              index >= 5 ? 'text-[#c45500]' : 'text-neutral-500',
            )}
          >
            {day}
          </span>
        ))}

        {Array.from({ length: lead }, (_, index) => (
          <span key={`lead-${index}`} />
        ))}

        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const key = toKey(year, month, day);
          const past = key < min;
          const chosen = key === value;
          const holiday = holidayOn(key);
          const weekend = mondayIndex(new Date(year, month, day)) >= 5;

          return (
            <button
              key={key}
              type="button"
              disabled={past}
              onClick={() => onPick(key)}
              title={holiday?.name}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center rounded-md px-0.5 py-1 text-xs leading-tight transition-colors',
                past && 'cursor-not-allowed text-neutral-300',
                !past && weekend && 'bg-[#fff6ec]',
                !past && !chosen && 'text-neutral-900 hover:bg-neutral-100',
                chosen && 'bg-[#0f8a8a] font-bold text-white',
              )}
            >
              {holiday && !past && (
                <span
                  className={cn(
                    'block max-w-full truncate text-[8px]',
                    chosen ? 'text-white/90' : 'text-[#c45500]',
                  )}
                >
                  {holiday.name}
                </span>
              )}
              <span>{day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
