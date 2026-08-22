'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { bookHotelAction } from '@/actions/hotel';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';

/**
 * The guest name and the payment.
 *
 * The browser sends who the room is under. It does not send an amount: the
 * tariff is quoted on the server from the same function this page called, so
 * the total below is a preview of that sum and never its source.
 */

interface Props {
  stay: {
    city: string;
    checkIn: string;
    checkOut: string;
    rooms: number;
    adults: number;
    kids: string;
    hotelId: string;
    roomId: string;
  };
  total: number;
  balance: number;
  signedIn: boolean;
  /** Pre-filled from the account, because it is almost always the right name. */
  defaultName: string;
  csrfField: ReactNode;
}

export function GuestForm({ stay, total, balance, signedIn, defaultName, csrfField }: Props) {
  const [state, formAction] = useActionState(bookHotelAction, emptyFormState);
  const [guest, setGuest] = useState(defaultName);

  const short = balance < total;

  return (
    <form action={formAction} className="space-y-4">
      {csrfField}
      <input type="hidden" name="city" value={stay.city} />
      <input type="hidden" name="checkIn" value={stay.checkIn} />
      <input type="hidden" name="checkOut" value={stay.checkOut} />
      <input type="hidden" name="rooms" value={stay.rooms} />
      <input type="hidden" name="adults" value={stay.adults} />
      <input type="hidden" name="kids" value={stay.kids} />
      <input type="hidden" name="hotel" value={stay.hotelId} />
      <input type="hidden" name="room" value={stay.roomId} />

      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <h2 className="text-sm font-bold">Guest details</h2>

        <label className="mt-3 block text-xs font-semibold">
          Name the room is booked under
          <input
            name="guest"
            value={guest}
            onChange={(event) => setGuest(event.target.value)}
            placeholder="Name as on ID"
            maxLength={60}
            autoComplete="name"
            className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          />
        </label>

        <p className="text-ink-subtle mt-2 text-[11px] leading-relaxed">
          A name is everything a voucher carries, and everything this store keeps. No ID number is
          asked for, because none is needed to charge your balance — you will be asked for one at
          the desk, as any hotel would.
        </p>
      </section>

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <div className="space-y-2">
        {signedIn ? (
          <SubmitButton
            fullWidth
            size="lg"
            pendingLabel="Booking..."
            disabled={guest.trim().length === 0}
          >
            {guest.trim().length === 0 ? 'Add a guest name' : `Pay ${formatPaise(total)}`}
          </SubmitButton>
        ) : (
          <a
            href="/auth/login?next=/hotels"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-12 w-full items-center justify-center rounded-lg text-sm font-bold"
          >
            Sign in to book
          </a>
        )}

        <p className="text-ink-subtle text-center text-xs">
          Paid from your Amazon Pay balance ({formatPaise(balance)}).
          {short && signedIn && (
            <span className="text-deal"> {formatPaise(total - balance)} short.</span>
          )}
        </p>
      </div>
    </form>
  );
}
