import { ArrowLeft, TrainFront } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { cn } from '@/lib/utils/cn';
import {
  addDays,
  arrivalOf,
  formatDuration,
  formatTime,
  routeOf,
  runsOnLabel,
  searchTrains,
} from '@/services/trains';

export const metadata: Metadata = {
  title: 'Train route',
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
  });
}

/**
 * Where a train calls between its two ends.
 *
 * The halts are worked out from real station geography -- a station is on the
 * route when it sits near the line between origin and destination and between
 * them along it. So the list agrees with a map: a Delhi to Chennai train calls
 * at Bhopal and Nagpur, and never at Guwahati.
 */
export default async function TrainRoutePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const from = one(params.from);
  const to = one(params.to);
  const date = one(params.date);
  const trainNumber = one(params.train);

  const search = searchTrains({ from, to, date }, new Date());
  const train = search.ok ? search.trains.find((entry) => entry.number === trainNumber) : undefined;

  if (!search.ok || !train) {
    return (
      <Container size="narrow" className="py-10">
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <TrainFront className="text-ink-subtle mx-auto h-10 w-10" aria-hidden="true" />
          <p className="mt-3 text-base font-bold">
            {search.ok ? 'That train does not run on this route and date.' : search.message}
          </p>
          <Link href="/trains" className="text-link mt-2 inline-block text-sm hover:underline">
            Start a new search
          </Link>
        </div>
      </Container>
    );
  }

  const halts = routeOf(train);
  const arrival = arrivalOf(train);

  return (
    <Container size="narrow" className="space-y-4 py-5">
      <Link
        href={`/trains/search?from=${from}&to=${to}&date=${date}`}
        className="text-link inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to the results
      </Link>

      <header className="border-hairline bg-surface rounded-2xl border p-4">
        <h1 className="text-base font-bold sm:text-lg">
          <span className="text-ink-subtle font-mono text-xs">{train.number}</span> {train.name}
        </h1>
        <p className="text-ink-muted mt-1 text-xs">
          {train.origin.name} ({train.origin.code}) → {train.destination.name} (
          {train.destination.code}) · {train.distanceKm} km ·{' '}
          {formatDuration(train.durationMinutes)}
        </p>
        <p className="text-ink-subtle mt-1 text-xs">
          Runs {runsOnLabel(train.runsOn)} · departs {formatTime(train.departureMinutes)}{' '}
          {prettyDate(date)} · arrives {formatTime(arrival.minutes)}{' '}
          {prettyDate(addDays(date, arrival.dayOffset))}
        </p>
      </header>

      <section
        aria-labelledby="halts"
        className="border-hairline bg-surface overflow-hidden rounded-2xl border"
      >
        <h2 id="halts" className="border-hairline border-b px-4 py-3 text-sm font-bold">
          {halts.length} stations on this run
        </h2>

        <ol className="divide-hairline divide-y">
          {halts.map((halt, index) => {
            const terminal = index === 0 || index === halts.length - 1;
            return (
              <li key={halt.station.code} className="flex items-center gap-3 px-4 py-3">
                {/* The line down the left, with a dot at every call. */}
                <span className="relative flex w-4 shrink-0 justify-center self-stretch">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-y-0 w-px',
                      index === 0 && 'top-1/2',
                      index === halts.length - 1 && 'bottom-1/2',
                      'bg-hairline',
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative mt-0.5 h-2.5 w-2.5 self-center rounded-full border-2',
                      terminal ? 'border-accent-500 bg-accent-500' : 'border-instock bg-surface',
                    )}
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-sm', terminal && 'font-bold')}>
                    {halt.station.name}
                    <span className="text-ink-subtle ml-1.5 font-mono text-[11px]">
                      {halt.station.code}
                    </span>
                  </span>
                  <span className="text-ink-subtle block text-[11px]">
                    {halt.station.city}, {halt.station.state} · {halt.km} km
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">
                    {formatTime(halt.arrivalMinutes)}
                    {halt.dayOffset > 0 && (
                      <span className="text-ink-muted ml-0.5 align-super text-[10px]">
                        +{halt.dayOffset}
                      </span>
                    )}
                  </span>
                  <span className="text-ink-subtle block text-[11px]">
                    {terminal ? (index === 0 ? 'Starts' : 'Ends') : `${halt.haltMinutes} min halt`}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="text-ink-subtle text-xs leading-relaxed">
        The stations and the distances between them are real. Which of them this service calls at,
        and when, is worked out from that geography — it is this store&apos;s own timetable, not
        Indian Railways&apos;.
      </p>
    </Container>
  );
}
