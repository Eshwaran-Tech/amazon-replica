'use client';

import { ArrowLeftRight, Search } from 'lucide-react';
import { useState } from 'react';

import type { CabinClass } from '@/services/flights';

import { AirportField } from './airport-field';
import { DateField } from './date-field';
import { TravellersField } from './travellers-field';

/**
 * The flight search panel.
 *
 * A plain GET form: the search lives entirely in the URL, so a result page can
 * be bookmarked, shared or reloaded, and the back button behaves. Nothing here
 * is submitted to a Server Action because nothing is being changed.
 */

interface SearchFormProps {
  /** Today as `YYYY-MM-DD`, resolved on the server to avoid a clock mismatch. */
  today: string;
  initial?: {
    from?: string;
    to?: string;
    date?: string;
    returnDate?: string;
    adults?: number;
    children?: number;
    infants?: number;
    cabin?: CabinClass;
  };
}

export function FlightSearchForm({ today, initial }: SearchFormProps) {
  const [from, setFrom] = useState(initial?.from ?? 'DEL');
  const [to, setTo] = useState(initial?.to ?? 'BOM');
  const [date, setDate] = useState(initial?.date ?? today);
  const [returnDate, setReturnDate] = useState(initial?.returnDate ?? '');
  const [travellers, setTravellers] = useState({
    adults: initial?.adults ?? 1,
    children: initial?.children ?? 0,
    infants: initial?.infants ?? 0,
    cabin: initial?.cabin ?? ('ECONOMY' as CabinClass),
  });

  const roundTrip = returnDate !== '';

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <form action="/flights/search" method="get" className="text-ink">
      <fieldset className="mb-3">
        <legend className="sr-only">Trip type</legend>
        <div className="flex items-center gap-5 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="trip"
              value="one"
              checked={!roundTrip}
              onChange={() => setReturnDate('')}
              className="accent-accent-500 h-4 w-4"
            />
            One Way
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="trip"
              value="round"
              checked={roundTrip}
              onChange={() => setReturnDate(date)}
              className="accent-accent-500 h-4 w-4"
            />
            Round Trip
          </label>
        </div>
      </fieldset>

      {/* No `overflow-hidden`: it would clip the dropdowns that open out of
          these cells. The hairline seams come from the gap showing the
          container background instead. */}
      <div className="border-hairline bg-hairline grid gap-px rounded-xl border sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr_1.1fr]">
        <div className="bg-surface relative p-3">
          <AirportField name="from" label="From" value={from} onChange={setFrom} />

          <button
            type="button"
            onClick={swap}
            aria-label="Swap origin and destination"
            className="border-hairline bg-surface-sunken hover:border-accent-500 absolute top-1/2 right-0 z-20 hidden translate-x-1/2 -translate-y-1/2 rounded-full border p-1.5 sm:block"
          >
            <ArrowLeftRight className="text-accent-400 h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-surface p-3">
          <AirportField name="to" label="To" value={to} onChange={setTo} />
        </div>

        <div className="bg-surface p-3">
          <DateField
            name="date"
            label="Departure"
            value={date}
            min={today}
            onChange={setDate}
            route={{ from, to }}
          />
        </div>

        <div className="bg-surface p-3">
          {roundTrip ? (
            <DateField
              name="returnDate"
              label="Return"
              value={returnDate}
              min={date}
              onChange={setReturnDate}
              route={{ from: to, to: from }}
              onClear={() => setReturnDate('')}
            />
          ) : (
            <button
              type="button"
              onClick={() => setReturnDate(date)}
              className="text-ink-muted hover:text-link flex h-full w-full items-center gap-2 text-left text-sm"
            >
              <span className="border-hairline flex h-5 w-5 items-center justify-center rounded-full border text-xs">
                +
              </span>
              Add Return
            </button>
          )}
        </div>

        <div className="bg-surface flex items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <TravellersField
              adults={travellers.adults}
              childCount={travellers.children}
              infants={travellers.infants}
              cabin={travellers.cabin}
              onChange={({ adults, childCount, infants, cabin }) =>
                setTravellers({ adults, children: childCount, infants, cabin })
              }
            />
          </div>

          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-600 flex shrink-0 items-center gap-1.5 self-stretch rounded-lg px-4 text-sm font-bold text-slate-900"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
