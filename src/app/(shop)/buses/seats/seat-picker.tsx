'use client';

import { Armchair, BedDouble } from 'lucide-react';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { bookBusAction } from '@/actions/bus';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

/**
 * The seat map and the booking form.
 *
 * The map is rendered from data the server produced, and the total shown is
 * summed from the same per-seat fares the server will sum again when the form
 * posts. The browser never sends an amount -- picking a seat sends its label.
 */

export interface SeatView {
  id: string;
  deck: 'LOWER' | 'UPPER';
  kind: 'SEATER' | 'SLEEPER';
  row: number;
  column: number;
  available: boolean;
  ladiesOnly: boolean;
  fare: number;
}

export interface DeckView {
  deck: 'LOWER' | 'UPPER';
  rows: number;
  columns: number;
  aisleAfter: number;
  seats: SeatView[];
}

interface Props {
  decks: DeckView[];
  boardingPoints: string[];
  dropPoints: string[];
  maxSeats: number;
  balance: number;
  signedIn: boolean;
  route: { from: string; to: string; date: string; busId: string };
  csrfField: ReactNode;
}

export function SeatPicker({
  decks,
  boardingPoints,
  dropPoints,
  maxSeats,
  balance,
  signedIn,
  route,
  csrfField,
}: Props) {
  const [state, formAction] = useActionState(bookBusAction, emptyFormState);
  const [chosen, setChosen] = useState<string[]>([]);
  const [boarding, setBoarding] = useState(boardingPoints[0] ?? '');
  const [drop, setDrop] = useState(dropPoints[0] ?? '');
  const [notice, setNotice] = useState('');

  // Cleared after a booking so the map does not show sold seats as selected.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) setChosen([]);
  }

  const all = decks.flatMap((deck) => deck.seats);
  const picked = all.filter((seat) => chosen.includes(seat.id));
  const total = picked.reduce((sum, seat) => sum + seat.fare, 0);

  function toggle(seat: SeatView): void {
    if (!seat.available) return;

    setChosen((current) => {
      if (current.includes(seat.id)) {
        setNotice('');
        return current.filter((id) => id !== seat.id);
      }
      if (current.length >= maxSeats) {
        setNotice(`You can book up to ${maxSeats} seats at a time.`);
        return current;
      }
      setNotice('');
      return [...current, seat.id];
    });
  }

  return (
    <form
      action={formAction}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
    >
      {csrfField}
      <input type="hidden" name="from" value={route.from} />
      <input type="hidden" name="to" value={route.to} />
      <input type="hidden" name="date" value={route.date} />
      <input type="hidden" name="busId" value={route.busId} />
      <input type="hidden" name="seats" value={chosen.join(',')} />
      <input type="hidden" name="boarding" value={boarding} />
      <input type="hidden" name="drop" value={drop} />

      {/* ------------------------------------------------------- the decks */}
      <div className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
        <Legend />

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {decks.map((deck) => (
            <div key={deck.deck}>
              <p className="text-ink-muted mb-2 text-xs font-bold tracking-wide uppercase">
                {deck.deck === 'LOWER' ? 'Lower deck' : 'Upper deck'}
                <span className="text-ink-subtle ml-2 font-normal normal-case">
                  {deck.seats.filter((seat) => seat.available).length} free
                </span>
              </p>

              {/* The driver's cab, so the map has a front. */}
              <div className="border-hairline text-ink-subtle mb-2 flex justify-end rounded-t-xl border border-b-0 px-3 py-1.5 text-[10px]">
                Front
              </div>

              <div className="border-hairline space-y-1.5 rounded-b-xl border border-t-0 p-3">
                {Array.from({ length: deck.rows }, (_, row) => (
                  <div key={row} className="flex items-center gap-1.5">
                    {Array.from({ length: deck.columns }, (_, column) => {
                      const seat = deck.seats.find(
                        (entry) => entry.row === row && entry.column === column,
                      );
                      if (!seat) return <span key={column} className="h-8 w-8" />;

                      return (
                        <span key={column} className="flex items-center gap-1.5">
                          <SeatButton
                            seat={seat}
                            picked={chosen.includes(seat.id)}
                            onToggle={() => toggle(seat)}
                          />
                          {column === deck.aisleAfter && (
                            <span className="w-4" aria-hidden="true" />
                          )}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------------- the summary */}
      <aside className="border-hairline bg-surface space-y-4 rounded-2xl border p-4 lg:sticky lg:top-4">
        <div>
          <h2 className="text-sm font-bold">Your seats</h2>
          {picked.length === 0 ? (
            <p className="text-ink-muted mt-1 text-xs">
              Pick a seat from the map. Up to {maxSeats} at a time.
            </p>
          ) : (
            <ul className="divide-hairline mt-2 divide-y text-sm">
              {picked.map((seat) => (
                <li key={seat.id} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {seat.id}
                    <span className="text-ink-subtle ml-1 text-xs">
                      {seat.kind === 'SLEEPER' ? 'berth' : 'seat'}
                      {seat.ladiesOnly ? ' · ladies' : ''}
                    </span>
                  </span>
                  <span className="font-medium">{formatPaise(seat.fare)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {notice && <p className="text-deal text-xs">{notice}</p>}

        <Picker
          label="Boarding point"
          value={boarding}
          options={boardingPoints}
          onChange={setBoarding}
        />
        <Picker label="Dropping point" value={drop} options={dropPoints} onChange={setDrop} />

        <div className="border-hairline flex items-baseline justify-between border-t pt-3">
          <span className="text-sm font-bold">Total</span>
          <span className="text-accent-400 text-lg font-bold">{formatPaise(total)}</span>
        </div>

        {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

        {signedIn ? (
          <SubmitButton
            fullWidth
            size="lg"
            pendingLabel="Booking..."
            disabled={picked.length === 0}
          >
            {picked.length === 0 ? 'Select seats' : `Pay ${formatPaise(total)}`}
          </SubmitButton>
        ) : (
          <a
            href="/auth/login?next=/buses"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-12 w-full items-center justify-center rounded-lg text-sm font-bold"
          >
            Sign in to book
          </a>
        )}

        <p className="text-ink-subtle text-center text-xs">
          Paid from your Eshwaran Pay balance ({formatPaise(balance)}).
          {picked.length > 0 && balance < total && (
            <span className="text-deal"> {formatPaise(total - balance)} short.</span>
          )}
        </p>
      </aside>
    </form>
  );
}

function SeatButton({
  seat,
  picked,
  onToggle,
}: {
  seat: SeatView;
  picked: boolean;
  onToggle: () => void;
}) {
  const Icon = seat.kind === 'SLEEPER' ? BedDouble : Armchair;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!seat.available}
      aria-pressed={picked}
      aria-label={
        seat.available
          ? `Seat ${seat.id}, ${seat.kind === 'SLEEPER' ? 'berth' : 'seat'}${seat.ladiesOnly ? ', reserved for women' : ''}, ₹${Math.round(seat.fare / 100)}`
          : `Seat ${seat.id}, already booked`
      }
      title={
        seat.available ? `${seat.id} · ₹${Math.round(seat.fare / 100)}` : `${seat.id} · booked`
      }
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded border-2 transition-colors',
        !seat.available && 'border-hairline bg-surface-sunken cursor-not-allowed opacity-40',
        seat.available &&
          !picked &&
          seat.ladiesOnly &&
          'border-pink-400 text-pink-400 hover:bg-pink-400/10',
        seat.available &&
          !picked &&
          !seat.ladiesOnly &&
          'border-instock text-instock hover:bg-instock/10',
        picked && 'border-accent-500 bg-accent-500 text-brand-950',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function Legend() {
  return (
    <ul className="text-ink-muted flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
      {[
        { className: 'border-instock', label: 'Available' },
        { className: 'border-accent-500 bg-accent-500', label: 'Selected' },
        { className: 'border-pink-400', label: 'Ladies only' },
        { className: 'border-hairline bg-surface-sunken opacity-40', label: 'Booked' },
      ].map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('inline-block h-3.5 w-3.5 rounded border-2', item.className)}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
