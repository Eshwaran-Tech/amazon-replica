import { BadgeIndianRupee, ReceiptText, ShieldCheck, TrainFront } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { TrainSearchForm } from '@/components/trains/train-search-form';
import { getSession } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listTrainBookings } from '@/services/train-booking';
import { formatTime, todayKey } from '@/services/trains';

export const metadata: Metadata = {
  title: 'Train tickets',
  description:
    'Search trains between Indian stations and pay for a ticket from your Eshwaran Pay balance.',
};

export const dynamic = 'force-dynamic';

/**
 * Train tickets.
 *
 * The stations, their codes and the distances between them are real. The
 * timetable is this store's own and is generated from those distances, which
 * the note at the foot of the page says plainly -- a booking flow that implied
 * it was quoting Indian Railways would be the one dishonest thing on it.
 */
export default async function TrainsPage() {
  const now = new Date();
  const today = todayKey(now);

  const session = await getSession();
  const history = session ? await listTrainBookings(session.user.id, 3) : [];

  return (
    <>
      {/* ---------------------------------------------------------- the search */}
      <section className="bg-slate-800">
        <Container size="wide" className="py-6">
          <h1 className="mb-4 text-center text-lg font-bold text-white sm:text-xl">
            Train Tickets
          </h1>
          <TrainSearchForm today={today} />

          <p className="mt-3 text-center text-xs text-slate-300">
            Fares are charged to your{' '}
            <Link href="/pay/balance" className="text-accent-400 hover:underline">
              Eshwaran Pay balance
            </Link>
            . No card, no gateway.
          </p>
        </Container>
      </section>

      <Container size="wide" className="space-y-6 py-6">
        {/* ------------------------------------------------------ what is true */}
        <section aria-labelledby="train-promises" className="mx-auto max-w-xl">
          <h2 id="train-promises" className="sr-only">
            What this costs
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: BadgeIndianRupee,
                title: 'No booking fee',
                body: 'The fare on the tile is the fare taken from your balance. Nothing is added at payment.',
              },
              {
                icon: ReceiptText,
                title: 'One ledger',
                body: 'A ticket is a line in your Eshwaran Pay balance, next to every other thing this store has charged you.',
              },
              {
                icon: ShieldCheck,
                title: 'Only real berths',
                body: 'A waitlisted class shows its number and refuses the click. No money for a place in a queue.',
              },
            ].map((item) => (
              <li key={item.title} className="border-hairline bg-surface rounded-xl border p-4">
                <item.icon className="text-accent-400 h-5 w-5" aria-hidden="true" />
                <p className="mt-2 text-sm font-bold">{item.title}</p>
                <p className="text-ink-muted mt-1 text-xs leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* -------------------------------------------------------- your tickets */}
        {history.length > 0 && (
          <section
            aria-labelledby="train-history"
            className="border-hairline bg-surface mx-auto max-w-xl overflow-hidden rounded-2xl border"
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
                      <span className="text-ink-muted ml-2 font-normal">
                        {ticket.trainNumber} {ticket.trainName}
                      </span>
                    </span>
                    <span className="text-ink-muted block text-xs">
                      {ticket.classCode} · {ticket.passengers.length} passenger
                      {ticket.passengers.length === 1 ? '' : 's'} ·{' '}
                      {formatTime(ticket.departureMinutes)}
                    </span>
                    <span className="text-ink-subtle block font-mono text-[11px]">
                      PNR {ticket.pnr}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold">
                      {formatPaise(ticket.amount)}
                    </span>
                    <span className="text-ink-subtle block text-[11px]">{ticket.travelDate}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --------------------------------------------------------------- help */}
        <div className="mx-auto max-w-xl text-center">
          <Link href="/help" className="text-link text-sm font-semibold hover:underline">
            Help and FAQs
          </Link>
        </div>

        <p className="text-ink-subtle mx-auto max-w-xl text-xs leading-relaxed">
          <TrainFront className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
          Station names, codes and the distances between them are real. Every service on the results
          page — its number, its name, its timings and its fares — is this store&apos;s own,
          generated from that distance and the same on every reload. No berth is reserved with
          Indian Railways; what is real is the charge to your Eshwaran Pay balance.
        </p>
      </Container>
    </>
  );
}
