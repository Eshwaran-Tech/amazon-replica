import { ArrowLeft, TrainFront } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { statusLabel } from '@/data/train-classes';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listTrainBookings, MAX_PASSENGERS } from '@/services/train-booking';
import {
  addDays,
  arrivalOf,
  formatDuration,
  formatTime,
  offerOn,
  searchTrains,
} from '@/services/trains';
import { getWalletSummary } from '@/services/wallet';

import { PassengerForm } from './passenger-form';

export const metadata: Metadata = {
  title: 'Book a train ticket',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function prettyDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Passenger entry and payment.
 *
 * The train and the class are re-derived from the route, date, number and code
 * rather than passed through the URL as data. The search is deterministic, so
 * the same URL always rebuilds the same service -- and a tampered number simply
 * finds nothing rather than conjuring a train with a fare of its own.
 *
 * The same re-derivation happens again inside the booking action. This page
 * cannot be the authority on a price: it is a page.
 */
export default async function BookTrainPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const from = one(params.from);
  const to = one(params.to);
  const date = one(params.date);
  const trainNumber = one(params.train);
  const classCode = one(params.class);

  const session = await getSession();
  const now = new Date();

  const search = searchTrains({ from, to, date }, now);
  const train = search.ok ? search.trains.find((entry) => entry.number === trainNumber) : undefined;
  const offer = train ? offerOn(train, classCode) : undefined;

  const [summary, history] = await Promise.all([
    session
      ? getWalletSummary(session.user.id)
      : Promise.resolve({ balance: 0, wallet: 0, giftCards: 0, pending: 0 }),
    session ? listTrainBookings(session.user.id, 3) : Promise.resolve([]),
  ]);

  const backHref = `/trains/search?from=${from}&to=${to}&date=${date}`;

  if (!search.ok || !train || !offer) {
    return (
      <Container size="narrow" className="py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <TrainFront className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">
            {!search.ok
              ? search.message
              : !train
                ? 'That train does not run on this route and date.'
                : 'That class is not offered on this train.'}
          </p>
          <Link href="/trains" className="text-link mt-2 inline-block text-sm hover:underline">
            Start a new search
          </Link>
        </div>
      </Container>
    );
  }

  const arrival = arrivalOf(train);
  const status = statusLabel(offer.status, offer.count);

  if (!offer.bookable) {
    return (
      <Container size="narrow" className="space-y-4 py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <TrainFront className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">
            {offer.code} is {status} on {train.number} {train.name}.
          </p>
          <p className="text-ink-muted mt-2 text-sm">
            This store will not take money for a place in a queue it has no way to clear. Pick a
            class with berths, or try another date.
          </p>
          <Link href={backHref} className="text-link mt-3 inline-block text-sm hover:underline">
            Back to the results
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container size="narrow" className="space-y-4 py-5">
      <Link
        href={backHref}
        className="text-link inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to {search.from.code} – {search.to.code}
      </Link>

      {/* ------------------------------------------------------- the journey */}
      <header className="border-hairline bg-surface rounded-2xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="min-w-0 text-base font-bold sm:text-lg">
            <span className="text-ink-subtle font-mono text-xs">{train.number}</span> {train.name}
          </h1>
          <p className="text-sm">
            <span className="border-instock text-instock rounded border px-1.5 py-0.5 text-xs font-bold">
              {offer.code} · {status}
            </span>
          </p>
        </div>

        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <p className="text-base font-bold">{formatTime(train.departureMinutes)}</p>
            <p className="text-ink-subtle text-[11px]">
              {train.origin.name} ({train.origin.code})
            </p>
          </div>
          <p className="border-hairline text-ink-muted mx-auto rounded border border-dashed px-2 py-0.5 text-center text-[11px]">
            {formatDuration(train.durationMinutes)}
          </p>
          <div className="text-right">
            <p className="text-base font-bold">
              {formatTime(arrival.minutes)}
              {arrival.dayOffset > 0 && (
                <span className="text-ink-muted ml-0.5 align-super text-[10px]">
                  +{arrival.dayOffset}
                </span>
              )}
            </p>
            <p className="text-ink-subtle text-[11px]">
              {train.destination.name} ({train.destination.code})
            </p>
          </div>
        </div>

        <p className="text-ink-subtle mt-2 text-xs">
          {prettyDate(date)}
          {arrival.dayOffset > 0 && (
            <> · arrives {prettyDate(addDays(date, arrival.dayOffset))}</>
          )}{' '}
          · {offer.label} · {formatPaise(offer.fare)} per passenger
        </p>
      </header>

      <PassengerForm
        route={{ from, to, date, train: train.number, travelClass: offer.code }}
        farePerPassenger={offer.fare}
        maxPassengers={MAX_PASSENGERS}
        berthsLeft={offer.count}
        balance={summary.balance}
        signedIn={Boolean(session)}
        csrfField={<CsrfField />}
      />

      {history.length > 0 && (
        <section
          aria-labelledby="train-history"
          className="border-hairline bg-surface overflow-hidden rounded-2xl border"
        >
          <h2 id="train-history" className="border-hairline border-b px-4 py-3 text-sm font-bold">
            Your recent train tickets
          </h2>
          <ul className="divide-hairline divide-y">
            {history.map((ticket) => (
              <li key={ticket.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {ticket.fromCode} → {ticket.toCode}
                  </span>
                  <span className="text-ink-muted block text-xs">
                    {ticket.trainNumber} {ticket.trainName} · {ticket.classCode} ·{' '}
                    {ticket.passengers.length} passenger
                    {ticket.passengers.length === 1 ? '' : 's'}
                  </span>
                  <span className="text-ink-subtle block font-mono text-[11px]">
                    PNR {ticket.pnr}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{formatPaise(ticket.amount)}</span>
                  <span className="text-ink-subtle block text-[11px]">{ticket.travelDate}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-ink-subtle text-xs leading-relaxed">
        The fare is summed on the server from the class you chose and the passengers you entered —
        this page sends no amount. No berth is reserved with Indian Railways; what is real is the
        charge to your{' '}
        <Link href="/pay/balance" className="text-link hover:underline">
          Amazon Pay balance
        </Link>
        .
      </p>
    </Container>
  );
}
