'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { holidayOn, holidaysInMonth } from '@/data/holidays';
import { cn } from '@/lib/utils/cn';

/**
 * Check-in and check-out, picked as a range across two months.
 *
 * One panel, not two: a stay is a range, and picking its ends in two separate
 * calendars is how you end up checking out before you check in. The first click
 * sets check-in and clears check-out; the second sets check-out. A second click
 * on or before the first date starts the range again rather than refusing --
 * changing your mind about the start is the commonest reason to reopen this.
 *
 * Holidays are marked because they are when rooms fill and tariffs climb, which
 * this store's pricing actually reflects. Weekend columns are tinted for the
 * same reason.
 *
 * Dates are `YYYY-MM-DD` in local time throughout. `toISOString()` would shift
 * the day for anyone east of UTC, which is everyone this store is priced for.
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

/** "21 Aug"; and "Today" / "Tomorrow" / the weekday beside it. */
function label(key: string, today: string): { day: string; note: string } {
  const parsed = parseKey(key);
  if (!parsed) return { day: 'Select', note: '' };

  const date = new Date(parsed.year, parsed.month, parsed.day);
  const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const base = parseKey(today);
  if (base) {
    const start = new Date(base.year, base.month, base.day);
    const days = Math.round((date.getTime() - start.getTime()) / 86_400_000);
    if (days === 0) return { day, note: 'Today' };
    if (days === 1) return { day, note: 'Tomorrow' };
  }

  return { day, note: date.toLocaleDateString('en-IN', { weekday: 'short' }) };
}

interface Props {
  checkIn: string;
  checkOut: string;
  /** Earliest selectable date, `YYYY-MM-DD`. */
  min: string;
  onChange: (range: { checkIn: string; checkOut: string }) => void;
}

export function StayDateField({ checkIn, checkOut, min, onChange }: Props) {
  const [open, setOpen] = useState<null | 'in' | 'out'>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const anchor = parseKey(checkIn) ?? parseKey(min);
  const [view, setView] = useState(() => ({
    year: anchor?.year ?? new Date().getFullYear(),
    month: anchor?.month ?? new Date().getMonth(),
  }));

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(null);
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

  function step(direction: -1 | 1): void {
    setView((current) => {
      const next = current.month + direction;
      if (next < 0) return { year: current.year - 1, month: 11 };
      if (next > 11) return { year: current.year + 1, month: 0 };
      return { year: current.year, month: next };
    });
  }

  /** One click on a day, interpreted against what is already chosen. */
  function choose(key: string): void {
    // Picking a check-in always restarts the range; picking a day at or before
    // the current check-in means you have changed your mind about the start.
    if (open === 'in' || !checkIn || key <= checkIn) {
      onChange({ checkIn: key, checkOut: '' });
      setOpen('out');
      return;
    }

    onChange({ checkIn, checkOut: key });
    setOpen(null);
  }

  const inLabel = label(checkIn, min);
  const outLabel = checkOut ? label(checkOut, min) : { day: 'Select', note: '' };

  return (
    <div ref={containerRef} className="relative flex flex-1">
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />

      <Trigger
        title="Check-in"
        value={inLabel}
        active={open === 'in'}
        onClick={() => setOpen(open === 'in' ? null : 'in')}
      />
      <span aria-hidden="true" className="my-2 w-px bg-neutral-200" />
      <Trigger
        title="Check-out"
        value={outLabel}
        active={open === 'out'}
        onClick={() => setOpen(open === 'out' ? null : 'out')}
      />

      {open && (
        <div className="absolute top-full left-0 z-40 mt-1 w-[min(46rem,92vw)] rounded-xl border border-neutral-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="text-xs font-semibold text-neutral-700">
              {open === 'in' ? 'Pick your check-in date' : 'Pick your check-out date'}
            </p>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100"
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
                checkIn={checkIn}
                checkOut={checkOut}
                onChoose={choose}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Trigger({
  title,
  value,
  active,
  onClick,
}: {
  title: string;
  value: { day: string; note: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn('min-w-0 flex-1 px-4 py-2.5 text-left', active && 'bg-neutral-50')}
    >
      <span className="block text-xs text-neutral-500">{title}</span>
      <span className="block truncate text-base text-neutral-900">
        <span className="font-semibold">{value.day}</span>
        {value.note && <span className="ml-1.5 text-sm text-neutral-500">{value.note}</span>}
      </span>
    </button>
  );
}

function Month({
  year,
  month,
  min,
  checkIn,
  checkOut,
  onChoose,
}: {
  year: number;
  month: number;
  min: string;
  checkIn: string;
  checkOut: string;
  onChoose: (key: string) => void;
}) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = mondayIndex(first);
  const holidays = holidaysInMonth(year, month + 1);

  return (
    <div>
      <p className="mb-1 text-center text-sm font-bold text-neutral-900">
        {first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        {holidays.length > 0 && (
          <span className="mt-0.5 block text-[11px] font-semibold text-[#c45500]">
            {holidays.length} Holiday{holidays.length === 1 ? '' : 's'}
          </span>
        )}
      </p>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((weekday, index) => (
          <span
            key={weekday}
            className={cn(
              'py-1 text-[10px] font-bold',
              index >= 5 ? 'text-[#c45500]' : 'text-neutral-500',
            )}
          >
            {weekday}
          </span>
        ))}

        {Array.from({ length: lead }, (_, index) => (
          <span key={`lead-${index}`} />
        ))}

        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const key = toKey(year, month, day);
          const disabled = key < min;
          const weekend = mondayIndex(new Date(year, month, day)) >= 5;
          const holiday = holidayOn(key);

          const isStart = key === checkIn;
          const isEnd = key === checkOut;
          const inRange = Boolean(checkIn && checkOut && key > checkIn && key < checkOut);

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(key)}
              aria-pressed={isStart || isEnd}
              title={holiday?.name}
              className={cn(
                'relative rounded py-1.5 text-xs',
                disabled && 'cursor-not-allowed text-neutral-300',
                !disabled && weekend && !isStart && !isEnd && !inRange && 'bg-[#fff8f0]',
                !disabled &&
                  !isStart &&
                  !isEnd &&
                  !inRange &&
                  'text-neutral-800 hover:bg-neutral-100',
                inRange && 'bg-[#c45500]/15 text-neutral-900',
                (isStart || isEnd) && 'bg-[#0f7b8a] font-bold text-white',
              )}
            >
              {day}
              {holiday && !isStart && !isEnd && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 truncate px-0.5 text-[7px] leading-none text-[#c45500]"
                >
                  {holiday.name.split(' ')[0]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
