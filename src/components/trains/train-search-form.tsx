'use client';

import { ArrowDownUp, Circle, TrainFront } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { BusDateField } from '@/components/buses/bus-date-field';
import { StationField } from '@/components/trains/station-field';
import { findStation } from '@/data/train-stations';

/**
 * The search panel: source, swap, destination, date, AC Only, Find Trains.
 *
 * A GET navigation rather than a Server Action, deliberately: a results page
 * should be a URL you can bookmark, share and reload. The form posts nothing
 * and changes nothing, so there is no token to check and no state to protect.
 *
 * The calendar is the one the bus search uses. It marks holidays, which matter
 * here for the same reason they matter there -- that is when trains fill.
 */

interface Props {
  /** `YYYY-MM-DD` for today, computed on the server so the clock is right. */
  today: string;
  initialFrom?: string;
  initialTo?: string;
  initialDate?: string;
  initialAcOnly?: boolean;
  /** Rendered inside a sheet rather than on the page. */
  compact?: boolean;
}

export function TrainSearchForm({
  today,
  initialFrom = '',
  initialTo = '',
  initialDate,
  initialAcOnly = false,
  compact = false,
}: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [date, setDate] = useState(initialDate ?? today);
  const [acOnly, setAcOnly] = useState(initialAcOnly);
  const [error, setError] = useState('');
  const acId = useId();

  function submit(event: React.FormEvent): void {
    event.preventDefault();

    const source = findStation(from);
    const destination = findStation(to);

    if (!source || !destination) {
      setError('Choose a source and a destination station.');
      return;
    }
    // Two stations in one city is a metro ride, not a reservation.
    if (source.city === destination.city) {
      setError('Source and destination must be different cities.');
      return;
    }

    setError('');
    const query = new URLSearchParams({ from: source.code, to: destination.code, date });
    if (acOnly) query.set('ac', '1');
    router.push(`/trains/search?${query.toString()}`);
  }

  return (
    <form onSubmit={submit} className={compact ? '' : 'mx-auto max-w-xl'}>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        {/* ------------------------------------------- source and destination */}
        <div className="relative">
          <StationField
            name="from"
            label="Source city or station"
            placeholder="Enter source city or station"
            value={from}
            onChange={setFrom}
            recentKey="amazon.trains.recent.from"
            marker={
              <Circle className="h-2.5 w-2.5 fill-[#c45500] text-[#c45500]" aria-hidden="true" />
            }
          />

          {/* The dashed run between the two ends, as the reference draws it. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-16 left-11 -translate-y-1/2 border-t border-dashed border-neutral-300"
          />

          <button
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            aria-label="Swap source and destination"
            className="absolute top-1/2 right-4 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-300 bg-white text-[#c45500] shadow-sm hover:bg-neutral-50"
          >
            <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          </button>

          <StationField
            name="to"
            label="Destination city or station"
            placeholder="Enter destination city or station"
            value={to}
            onChange={setTo}
            recentKey="amazon.trains.recent.to"
            marker={<TrainFront className="h-4 w-4 text-[#c45500]" aria-hidden="true" />}
          />
        </div>

        {/* ------------------------------------------------------------ date */}
        <div className="border-t border-neutral-200 px-4 pt-3 pb-1">
          <p className="text-xs text-neutral-500">Departure Date</p>
          <div className="-mx-4">
            <BusDateField
              name="date"
              label="Departure date"
              value={date}
              min={today}
              onChange={setDate}
            />
          </div>
        </div>

        {/* --------------------------------------------------------- AC only */}
        <div className="border-t border-neutral-200 px-4 py-3">
          <label
            htmlFor={acId}
            className="flex cursor-pointer items-center gap-3 text-sm text-neutral-900"
          >
            <input
              id={acId}
              type="checkbox"
              checked={acOnly}
              onChange={(event) => setAcOnly(event.target.checked)}
              className="h-4 w-4 accent-[#c45500]"
            />
            AC Only
          </label>
        </div>

        {/* ------------------------------------------------------------ find */}
        <div className="border-t border-neutral-200 p-3">
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 w-full rounded-lg py-3 text-base font-bold text-neutral-900"
          >
            Find Trains
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-white px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
