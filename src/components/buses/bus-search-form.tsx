'use client';

import { ArrowLeftRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { BusDateField } from '@/components/buses/bus-date-field';
import { CityField } from '@/components/buses/city-field';

/**
 * The search panel: source, swap, destination, date, Find Buses.
 *
 * A GET navigation rather than a Server Action, deliberately: a results page
 * should be a URL you can bookmark, share and reload. The action posts nothing
 * and changes nothing, so there is no token to check and no state to protect.
 */

interface Props {
  /** `YYYY-MM-DD` for today, computed on the server so the clock is right. */
  today: string;
  initialFrom?: string;
  initialTo?: string;
  initialDate?: string;
}

export function BusSearchForm({ today, initialFrom = '', initialTo = '', initialDate }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [date, setDate] = useState(initialDate ?? today);
  const [offers, setOffers] = useState(false);
  const [error, setError] = useState('');
  const offersId = useId();

  function submit(event: React.FormEvent): void {
    event.preventDefault();

    if (!from || !to) {
      setError('Choose a source and a destination city.');
      return;
    }
    if (from === to) {
      setError('Source and destination must differ.');
      return;
    }

    setError('');
    router.push(`/buses/search?from=${from}&to=${to}&date=${date}`);
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col overflow-visible rounded-xl bg-white shadow-lg sm:flex-row sm:items-stretch">
        <CityField
          name="from"
          label="Source city"
          placeholder="Enter source city"
          value={from}
          onChange={setFrom}
        />

        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          aria-label="Swap source and destination"
          className="text-accent-500 flex shrink-0 items-center justify-center border-y border-neutral-200 px-3 py-2 hover:bg-neutral-100 sm:border-x sm:border-y-0"
        >
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <CityField
          name="to"
          label="Destination city"
          placeholder="Enter destination city"
          value={to}
          onChange={setTo}
        />

        <div className="shrink-0 border-y border-neutral-200 sm:border-x sm:border-y-0">
          <BusDateField
            name="date"
            label="Date of journey"
            value={date}
            min={today}
            onChange={setDate}
          />
        </div>

        <div className="p-2">
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 h-full w-full rounded-md px-6 py-2.5 text-sm font-bold whitespace-nowrap"
          >
            Find Buses
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-white px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* The reference's offers row. It stores a preference and says so. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-sm text-neutral-900">
        <span id={offersId}>Unlock exclusive offers for my mobile number</span>
        <span role="radiogroup" aria-labelledby={offersId} className="flex items-center gap-4">
          {[
            { label: 'Yes', on: true },
            { label: 'No', on: false },
          ].map((option) => (
            <label key={option.label} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="offers"
                checked={offers === option.on}
                onChange={() => setOffers(option.on)}
                className="accent-[#c45500]"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </span>
      </div>

      {offers && (
        <p className="rounded-xl bg-white px-4 py-2 text-xs text-neutral-600">
          Noted for this search. This store sends no marketing messages and has no offers desk to
          pass a number to, so nothing leaves the page.
        </p>
      )}
    </form>
  );
}
