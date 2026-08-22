'use client';

import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { CHILD_MAX_AGE, MAX_ADULTS_PER_ROOM, MAX_CHILDREN, MAX_ROOMS } from '@/services/hotels';

/**
 * Rooms and guests.
 *
 * The steppers are bounded by the same constants the search service validates
 * against, so the control cannot offer a party the server will refuse. Adults
 * are capped per room rather than in total: asking for four adults means adding
 * a room, which is what a hotel would tell you.
 *
 * A child's age is asked for because it changes the tariff and, at some
 * properties, whether they can stay at all. It is used for the quote and
 * nothing else.
 */

interface Props {
  rooms: number;
  adults: number;
  childAges: number[];
  onChange: (value: { rooms: number; adults: number; childAges: number[] }) => void;
}

export function GuestsField({ rooms, adults, childAges, onChange }: Props) {
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

  const maxAdults = rooms * MAX_ADULTS_PER_ROOM;

  function setRooms(next: number): void {
    const clamped = Math.min(MAX_ROOMS, Math.max(1, next));
    // Dropping a room can leave more adults than the remaining rooms sleep, so
    // the party comes down with it rather than becoming invalid behind a
    // control that looked like it worked.
    onChange({
      rooms: clamped,
      adults: Math.min(adults, clamped * MAX_ADULTS_PER_ROOM),
      childAges,
    });
  }

  function setAdults(next: number): void {
    onChange({ rooms, adults: Math.min(maxAdults, Math.max(1, next)), childAges });
  }

  const summary = [
    `${rooms} Room${rooms === 1 ? '' : 's'}`,
    `${adults} Adult${adults === 1 ? '' : 's'}`,
    childAges.length > 0 ? `${childAges.length} Child${childAges.length === 1 ? '' : 'ren'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <input type="hidden" name="rooms" value={rooms} />
      <input type="hidden" name="adults" value={adults} />
      <input type="hidden" name="childAges" value={childAges.join(',')} />

      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className={cn('w-full px-4 py-2.5 text-left', open && 'bg-neutral-50')}
      >
        <span className="block text-xs text-neutral-500">Rooms &amp; Guests</span>
        <span className="block truncate text-base font-semibold text-neutral-900">{summary}</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-40 mt-1 w-[min(22rem,92vw)] rounded-xl border border-neutral-200 bg-white shadow-xl">
          <p className="border-b border-neutral-200 bg-neutral-100 px-4 py-2.5 text-sm font-bold text-neutral-900">
            Select Rooms &amp; Guests
          </p>

          <div className="space-y-4 p-4">
            <Stepper label="Rooms" value={rooms} min={1} max={MAX_ROOMS} onChange={setRooms} />

            <Stepper
              label="Adults"
              hint="Age 13 years and above"
              value={adults}
              min={1}
              max={maxAdults}
              onChange={setAdults}
            />

            {childAges.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-neutral-900">Children</p>
                <p className="text-xs text-neutral-500">Age 0 to {CHILD_MAX_AGE} years</p>
                <ul className="mt-2 space-y-2">
                  {childAges.map((age, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <label className="flex-1 text-xs text-neutral-600">
                        Child {index + 1} age
                        <select
                          value={age}
                          onChange={(event) =>
                            onChange({
                              rooms,
                              adults,
                              childAges: childAges.map((current, at) =>
                                at === index ? Number(event.target.value) : current,
                              ),
                            })
                          }
                          className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900"
                        >
                          {Array.from({ length: CHILD_MAX_AGE + 1 }, (_, value) => (
                            <option key={value} value={value}>
                              {value === 0 ? 'Under 1' : `${value} year${value === 1 ? '' : 's'}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            rooms,
                            adults,
                            childAges: childAges.filter((_, at) => at !== index),
                          })
                        }
                        aria-label={`Remove child ${index + 1}`}
                        className="mt-4 rounded p-1.5 text-neutral-500 hover:bg-neutral-100"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {childAges.length < MAX_CHILDREN && (
              <button
                type="button"
                onClick={() => onChange({ rooms, adults, childAges: [...childAges, 5] })}
                className="text-sm font-semibold text-[#007185] hover:underline"
              >
                + Add Children
              </button>
            )}
          </div>

          <div className="border-t border-neutral-200 p-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="bg-accent-500 hover:bg-accent-400 w-full rounded-lg py-2 text-sm font-bold text-neutral-900"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-sm font-semibold text-neutral-900">{label}</span>
        {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
      </span>

      <span className="flex items-center rounded-md border border-neutral-300">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`One fewer ${label.toLowerCase()}`}
          className="px-2.5 py-1.5 text-neutral-700 disabled:text-neutral-300"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span
          aria-live="polite"
          className="min-w-9 border-x border-neutral-300 bg-neutral-100 px-2 py-1.5 text-center text-sm font-semibold text-neutral-900"
        >
          {String(value).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`One more ${label.toLowerCase()}`}
          className="px-2.5 py-1.5 text-neutral-700 disabled:text-neutral-300"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
