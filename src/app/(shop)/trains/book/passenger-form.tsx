'use client';

import { Minus, Plus, UserRound } from 'lucide-react';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { bookTrainAction } from '@/actions/train';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

/**
 * The passenger list and the payment.
 *
 * The browser sends names, ages and how each traveller should be listed. It
 * does not send an amount: the fare is looked up on the server from the class
 * the URL names and multiplied by the passengers that survive validation there.
 * The total below is a preview of that sum, never its source.
 */

interface Props {
  route: { from: string; to: string; date: string; train: string; travelClass: string };
  farePerPassenger: number;
  maxPassengers: number;
  /** Berths the chart has left, which caps the party at less than the maximum. */
  berthsLeft: number;
  balance: number;
  signedIn: boolean;
  csrfField: ReactNode;
}

interface Row {
  name: string;
  age: string;
  gender: 'M' | 'F' | 'X';
}

const EMPTY: Row = { name: '', age: '', gender: 'M' };

export function PassengerForm({
  route,
  farePerPassenger,
  maxPassengers,
  berthsLeft,
  balance,
  signedIn,
  csrfField,
}: Props) {
  const [state, formAction] = useActionState(bookTrainAction, emptyFormState);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }]);

  // Cleared after a booking, so a confirmed ticket does not leave a filled form
  // sitting there inviting a second charge for the same journey.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) setRows([{ ...EMPTY }]);
  }

  const cap = Math.min(maxPassengers, Math.max(1, berthsLeft));
  const filled = rows.filter((row) => row.name.trim().length > 0).length;
  const total = farePerPassenger * Math.max(filled, 1);

  function update(index: number, patch: Partial<Row>): void {
    setRows((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  }

  return (
    <form action={formAction} className="space-y-4">
      {csrfField}
      <input type="hidden" name="from" value={route.from} />
      <input type="hidden" name="to" value={route.to} />
      <input type="hidden" name="date" value={route.date} />
      <input type="hidden" name="train" value={route.train} />
      <input type="hidden" name="class" value={route.travelClass} />

      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Passengers</h2>
          <p className="text-ink-subtle text-xs">
            Up to {cap} on one ticket
            {berthsLeft < maxPassengers && <> · {berthsLeft} left in this class</>}
          </p>
        </div>

        <ul className="mt-3 space-y-3">
          {rows.map((row, index) => (
            <li key={index} className="border-hairline rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="text-ink-muted flex items-center gap-1.5 text-xs font-bold">
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Passenger {index + 1}
                </p>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
                    className="text-ink-muted hover:text-deal inline-flex items-center gap-1 text-xs"
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto]">
                <label className="block">
                  <span className="sr-only">Passenger {index + 1} name</span>
                  <input
                    name={`name-${index}`}
                    value={row.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    placeholder="Name as on ID"
                    maxLength={60}
                    autoComplete="off"
                    className="border-hairline focus:border-accent-500 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
                  />
                </label>

                <label className="block">
                  <span className="sr-only">Passenger {index + 1} age</span>
                  <input
                    name={`age-${index}`}
                    value={row.age}
                    onChange={(event) =>
                      update(index, { age: event.target.value.replace(/\D/g, '').slice(0, 3) })
                    }
                    inputMode="numeric"
                    placeholder="Age"
                    className="border-hairline focus:border-accent-500 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
                  />
                </label>

                <fieldset className="flex items-center gap-1">
                  <legend className="sr-only">Passenger {index + 1} listed as</legend>
                  {(['M', 'F', 'X'] as const).map((option) => (
                    <label
                      key={option}
                      className={cn(
                        'cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold',
                        row.gender === option
                          ? 'border-accent-500 bg-accent-500/10 text-ink'
                          : 'border-hairline text-ink-muted',
                      )}
                    >
                      <input
                        type="radio"
                        name={`gender-${index}`}
                        value={option}
                        checked={row.gender === option}
                        onChange={() => update(index, { gender: option })}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
              </div>
            </li>
          ))}
        </ul>

        {rows.length < cap && (
          <button
            type="button"
            onClick={() => setRows((current) => [...current, { ...EMPTY }])}
            className="text-link mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add a passenger
          </button>
        )}

        <p className="text-ink-subtle mt-3 text-[11px] leading-relaxed">
          A name, an age and how you should be listed on the chart is everything a ticket prints,
          and everything this store keeps. No ID number is asked for, because none is needed to
          charge your balance.
        </p>
      </section>

      {/* --------------------------------------------------------- the total */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Fare per passenger</dt>
            <dd className="font-medium">{formatPaise(farePerPassenger)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Passengers</dt>
            <dd className="font-medium">{Math.max(filled, 1)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Booking fee</dt>
            <dd className="text-instock font-medium">None</dd>
          </div>
          <div className="border-hairline flex items-baseline justify-between border-t pt-2">
            <dt className="text-sm font-bold">Total</dt>
            <dd className="text-accent-400 text-lg font-bold">{formatPaise(total)}</dd>
          </div>
        </dl>

        {state.message && (
          <div className="mt-3">
            <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
          </div>
        )}

        <div className="mt-3">
          {signedIn ? (
            <SubmitButton fullWidth size="lg" pendingLabel="Booking..." disabled={filled === 0}>
              {filled === 0 ? 'Add a passenger' : `Pay ${formatPaise(total)}`}
            </SubmitButton>
          ) : (
            <a
              href="/auth/login?next=/trains"
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-12 w-full items-center justify-center rounded-lg text-sm font-bold"
            >
              Sign in to book
            </a>
          )}
        </div>

        <p className="text-ink-subtle mt-2 text-center text-xs">
          Paid from your Amazon Pay balance ({formatPaise(balance)}).
          {filled > 0 && balance < total && (
            <span className="text-deal"> {formatPaise(total - balance)} short.</span>
          )}
        </p>
      </section>
    </form>
  );
}
