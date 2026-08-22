'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { DestinationField } from '@/components/hotels/destination-field';
import { GuestsField } from '@/components/hotels/guests-field';
import { StayDateField } from '@/components/hotels/stay-date-field';
import { addDays, nightsBetween, MAX_NIGHTS } from '@/services/hotels';

/**
 * The search bar: destination, check-in, check-out, rooms and guests, Search.
 *
 * A GET navigation rather than a Server Action, deliberately: a results page
 * should be a URL you can bookmark, share and reload. The form posts nothing
 * and changes nothing, so there is no token to check and no state to protect.
 */

interface Props {
  /** `YYYY-MM-DD` for today, computed on the server so the clock is right. */
  today: string;
  initialCity?: string;
  initialTerm?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialRooms?: number;
  initialAdults?: number;
  initialChildren?: number[];
  /** Rendered as the slim bar above results rather than the landing panel. */
  compact?: boolean;
}

export function HotelSearchForm({
  today,
  initialCity = '',
  initialTerm = '',
  initialCheckIn,
  initialCheckOut,
  initialRooms = 1,
  initialAdults = 2,
  initialChildren = [],
  compact = false,
}: Props) {
  const router = useRouter();
  const [city, setCity] = useState(initialCity);
  const [term, setTerm] = useState(initialTerm);
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? today);
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? addDays(today, 1));
  const [rooms, setRooms] = useState(initialRooms);
  const [adults, setAdults] = useState(initialAdults);
  const [childAges, setChildAges] = useState<number[]>(initialChildren);
  const [offers, setOffers] = useState(true);
  const [error, setError] = useState('');
  const offersId = useId();

  function submit(event: React.FormEvent): void {
    event.preventDefault();

    if (!city) {
      setError('Choose a destination.');
      return;
    }

    const nights = nightsBetween(checkIn, checkOut);
    if (nights <= 0) {
      setError('Check-out must be after check-in.');
      return;
    }
    if (nights > MAX_NIGHTS) {
      setError(`A stay can run up to ${MAX_NIGHTS} nights.`);
      return;
    }

    setError('');
    const query = new URLSearchParams({
      city,
      in: checkIn,
      out: checkOut,
      rooms: String(rooms),
      adults: String(adults),
    });
    if (term) query.set('term', term);
    if (childAges.length > 0) query.set('kids', childAges.join(','));
    router.push(`/hotels/search?${query.toString()}`);
  }

  return (
    <form onSubmit={submit} className={compact ? '' : 'space-y-2'}>
      <div className="flex flex-col overflow-visible rounded-lg bg-white shadow-lg sm:flex-row sm:items-stretch">
        <DestinationField
          value={city}
          term={term}
          onChange={(next) => {
            setCity(next.city);
            setTerm(next.term);
          }}
        />

        <span
          aria-hidden="true"
          className="mx-4 h-px bg-neutral-200 sm:mx-0 sm:my-2 sm:h-auto sm:w-px"
        />

        <StayDateField
          checkIn={checkIn}
          checkOut={checkOut}
          min={today}
          onChange={(range) => {
            setCheckIn(range.checkIn);
            // A new check-in with no check-out yet defaults to one night, so
            // the bar is never in a state the Search button would reject.
            setCheckOut(range.checkOut || addDays(range.checkIn, 1));
          }}
        />

        <span
          aria-hidden="true"
          className="mx-4 h-px bg-neutral-200 sm:mx-0 sm:my-2 sm:h-auto sm:w-px"
        />

        <GuestsField
          rooms={rooms}
          adults={adults}
          childAges={childAges}
          onChange={(next) => {
            setRooms(next.rooms);
            setAdults(next.adults);
            setChildAges(next.childAges);
          }}
        />

        <div className="p-2">
          <button
            type="submit"
            className="bg-accent-500 hover:bg-accent-400 h-full w-full rounded-md px-8 py-2.5 text-sm font-bold whitespace-nowrap text-neutral-900"
          >
            Search
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-white px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!compact && (
        <>
          {/* The reference's offers row. It stores a preference and says so. */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 text-sm text-neutral-900">
            <span id={offersId}>Unlock exclusive offers for your mobile number</span>
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
            <p className="rounded-lg bg-white px-4 py-2 text-xs text-neutral-600">
              Noted for this search. This store sends no marketing messages and has no offers desk
              to pass a number to, so nothing leaves the page.
            </p>
          )}
        </>
      )}
    </form>
  );
}
