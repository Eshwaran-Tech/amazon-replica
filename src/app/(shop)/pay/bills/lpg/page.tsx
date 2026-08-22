import { AlertTriangle, CalendarClock, Flame, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AccountForm } from '@/components/bills/account-form';
import { NoBillerNotice } from '@/components/bills/bill-lines';
import { PayForm } from '@/components/bills/pay-form';
import { Container } from '@/components/layout/container';
import { billersIn } from '@/data/billers';
import { CYLINDERS, MIN_REFILL_GAP_DAYS, SUBSIDISED_PER_YEAR } from '@/data/lpg';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { formatPaise } from '@/lib/utils/money';
import {
  checkBooking,
  deliveryCalendar,
  fromDayKey,
  lpgConnection,
  quoteRefill,
} from '@/services/bills/lpg';
import { listSavedBillers } from '@/services/bills/pay';

export const metadata: Metadata = {
  title: 'LPG refill',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * LPG.
 *
 * **The only surface here that is not a bill.** Nothing is owed and nothing is
 * accruing — there is a cylinder, a price, and the question of when somebody
 * can be at home. So this page has a delivery calendar where the others have a
 * total, and it can **refuse** the request, which no bill page can.
 *
 * The two rules it enforces are the real ones people are caught by: a minimum
 * gap between subsidised refills, and a yearly cap past which you pay the market
 * rate. And the subsidy is shown as a **transfer that arrives later**, never as
 * money off — because you pay the full price at the door, and netting it off
 * would misstate what leaves your account today.
 */

interface Props {
  searchParams: Promise<{
    biller?: string;
    account?: string;
    cylinder?: string;
    date?: string;
    slot?: string;
  }>;
}

export default async function LpgPage({ searchParams }: Props) {
  const params = await searchParams;
  const session = await getSession();
  const now = new Date();

  const billerId = params.biller ?? billersIn('LPG')[0]?.id ?? '';
  const account = params.account?.replace(/\s/g, '');
  const connection = account ? lpgConnection(billerId, account, now) : null;

  const cylinderId = params.cylinder ?? 'domestic-14';
  const refill = connection ? quoteRefill(cylinderId, connection) : null;

  const calendar = connection ? deliveryCalendar(connection.distributorId, now) : [];
  const chosenDate =
    params.date ?? calendar.find((day) => day.slots.some((entry) => entry.available))?.key;
  const chosenSlot = params.slot;

  const permitted =
    connection && chosenDate && chosenSlot
      ? checkBooking(connection, cylinderId, chosenDate, chosenSlot, now)
      : null;

  const saved = session ? await listSavedBillers(session.user.id, 'LPG') : [];

  const link = (changes: { cylinder?: string; date?: string; slot?: string }): string => {
    const next = new URLSearchParams();
    if (params.biller) next.set('biller', params.biller);
    if (params.account) next.set('account', params.account);
    next.set('cylinder', changes.cylinder ?? cylinderId);
    const date = changes.date ?? chosenDate;
    if (date) next.set('date', date);
    const slot = changes.slot ?? chosenSlot;
    // Changing the day clears the slot, because a slot is only meaningful on
    // the day it belongs to and carrying it over would book the wrong one.
    if (slot && !changes.date) next.set('slot', slot);
    return `/pay/bills/lpg?${next.toString()}`;
  };

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay/bills" className="hover:text-link hover:underline">
          Bill payments
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">LPG</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <Flame className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Book an LPG refill
        </h1>
        <p className="text-ink-muted mt-1 max-w-prose text-sm">
          Not a bill. Nothing is owed — this is an order for a cylinder and a slot for somebody to
          carry it up your stairs.
        </p>
      </header>

      <NoBillerNotice what="distributor" noun="connection" />

      <AccountForm
        category="LPG"
        action="/pay/bills/lpg"
        billerId={params.biller}
        account={params.account}
        saved={saved}
      />

      {params.account && !connection && (
        <div className="border-hairline bg-surface rounded-2xl border p-6 text-center text-sm">
          <p className="font-bold">That LPG id does not look right.</p>
          <p className="text-ink-muted mt-1">
            Seventeen digits, printed on your subscription voucher.
          </p>
        </div>
      )}

      {connection && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,23rem)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {/* ----------------------------------------- the connection */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <div className="border-hairline flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-bold">{connection.holder}</p>
                  <p className="text-ink-muted font-mono text-xs tracking-wide">
                    {connection.lpgId}
                  </p>
                </div>
                <p className="text-ink-muted text-xs">{connection.distributorName}</p>
              </div>

              <div className="border-hairline grid grid-cols-3 divide-x divide-[color:var(--color-hairline,#2a3441)] border-b">
                {[
                  {
                    label: 'Last delivered',
                    value: connection.lastDeliveredOn.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                    }),
                  },
                  {
                    label: `Subsidised left of ${SUBSIDISED_PER_YEAR}`,
                    value: String(connection.subsidisedRemaining),
                  },
                  {
                    label: 'Subsidy to',
                    value: connection.subsidyAccount,
                  },
                ].map((cell) => (
                  <div key={cell.label} className="px-3 py-3 text-center">
                    <p className="text-sm font-bold tabular-nums">{cell.value}</p>
                    <p className="text-ink-subtle text-xs">{cell.label}</p>
                  </div>
                ))}
              </div>

              {connection.daysUntilEligible > 0 && (
                <div className="border-deal/40 bg-deal/10 m-4 flex items-start gap-2 rounded-xl border p-3">
                  <AlertTriangle className="text-deal mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="text-ink-muted text-xs leading-relaxed">
                    <span className="text-deal font-bold">
                      A subsidised refill can be booked in {connection.daysUntilEligible} day
                      {connection.daysUntilEligible === 1 ? '' : 's'}.
                    </span>{' '}
                    There is a {MIN_REFILL_GAP_DAYS}-day minimum gap between subsidised cylinders,
                    and your last one came {MIN_REFILL_GAP_DAYS - connection.daysUntilEligible} days
                    ago. A commercial cylinder can still be ordered today, at the market rate.
                  </p>
                </div>
              )}
            </section>

            {/* ------------------------------------------- the cylinder */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                Which cylinder
              </h2>
              <ul className="divide-hairline divide-y">
                {CYLINDERS.map((cylinder) => {
                  const on = cylinder.id === cylinderId;
                  return (
                    <li key={cylinder.id}>
                      <Link
                        href={link({ cylinder: cylinder.id })}
                        className={cn(
                          'hover:bg-surface-sunken flex items-start gap-3 px-4 py-3 transition-colors',
                          on && 'bg-accent-500/10',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2',
                            on ? 'border-accent-400 bg-accent-400' : 'border-ink-subtle',
                          )}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold">{cylinder.label}</span>
                          <span className="text-ink-muted mt-0.5 block text-xs">
                            {cylinder.blurb}
                          </span>
                          {!cylinder.subsidised && (
                            <span className="text-ink-subtle mt-0.5 block text-xs">
                              No subsidy, and no minimum gap between orders.
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          ₹{cylinder.priceRupees}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ------------------------------------------- the calendar */}
            <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
              <h2 className="border-hairline flex items-center gap-2 border-b px-4 py-3 text-sm font-bold">
                <Truck className="text-accent-400 h-4 w-4" aria-hidden="true" />
                When shall it come
              </h2>

              <div className="space-y-3 px-4 py-4">
                {calendar.map((day) => {
                  const isChosenDay = day.key === chosenDate;
                  const anyFree = day.slots.some((entry) => entry.available);

                  return (
                    <div key={day.key}>
                      <p
                        className={cn(
                          'mb-1.5 text-xs font-bold',
                          !anyFree && 'text-ink-subtle',
                          isChosenDay && 'text-accent-400',
                        )}
                      >
                        {day.label}
                        {!anyFree && <span className="ml-2 font-normal">no slots</span>}
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {day.slots.map((entry) => {
                          const on = isChosenDay && entry.slot.id === chosenSlot;
                          if (!entry.available) {
                            return (
                              <span
                                key={entry.slot.id}
                                className="border-hairline text-ink-subtle rounded-lg border border-dashed px-2 py-2 text-center text-[0.7rem]"
                              >
                                {entry.slot.label.split(',')[0]}
                                <span className="block">{entry.note}</span>
                              </span>
                            );
                          }
                          return (
                            <Link
                              key={entry.slot.id}
                              href={link({ date: day.key, slot: entry.slot.id })}
                              className={cn(
                                'rounded-lg border px-2 py-2 text-center text-[0.7rem] font-bold transition-colors',
                                on
                                  ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                                  : 'border-hairline text-ink-muted hover:border-accent-500/60',
                              )}
                            >
                              {entry.slot.label.split(',')[0]}
                              <span className="text-ink-subtle block font-normal">
                                {entry.slot.from}–{entry.slot.to}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-ink-subtle border-hairline border-t px-4 py-3 text-xs leading-relaxed">
                From tomorrow, up to a week ahead. Sunday is closed, and the evening slot is the one
                that fills — which is not a quirk of this page, it is what every distributor sees.
              </p>
            </section>
          </div>

          {/* --------------------------------------------- the booking */}
          <aside>
            <section className="border-hairline bg-surface rounded-2xl border p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <CalendarClock className="text-accent-400 h-4 w-4" aria-hidden="true" />
                Your booking
              </h2>

              {refill && (
                <>
                  <p className="text-sm font-bold">{refill.cylinder.label}</p>
                  <p className="text-2xl font-bold">{formatPaise(refill.payable)}</p>

                  {refill.subsidyApplies ? (
                    <div className="border-instock/40 bg-instock/10 mt-3 rounded-xl border p-3">
                      <p className="text-instock text-sm font-bold">
                        {formatPaise(refill.subsidyTransfer)} comes back
                      </p>
                      <p className="text-ink-muted mt-1 text-xs leading-relaxed">
                        Transferred to {connection.subsidyAccount} after delivery — it is{' '}
                        <span className="text-ink font-bold">not</span> money off today. You pay the
                        full ₹{refill.cylinder.priceRupees} at the door, which is why the total
                        above does not net it off.
                      </p>
                    </div>
                  ) : (
                    <p className="text-ink-muted mt-2 text-xs leading-relaxed">
                      {refill.subsidyReason}
                    </p>
                  )}

                  <dl className="border-hairline mt-4 space-y-1.5 border-t pt-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Delivery</dt>
                      <dd className="text-right">
                        {fromDayKey(chosenDate ?? '')?.toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        }) ?? 'Choose a day'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-muted">Slot</dt>
                      <dd className="text-right">
                        {chosenSlot
                          ? calendar
                              .flatMap((day) => day.slots)
                              .find((entry) => entry.slot.id === chosenSlot)?.slot.label
                          : 'Choose a slot'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    {!session ? (
                      <Link
                        href="/auth/login?next=/pay/bills/lpg"
                        className="bg-accent-500 hover:bg-accent-400 text-brand-950 block rounded-lg px-4 py-2 text-center text-sm font-bold"
                      >
                        Sign in to book
                      </Link>
                    ) : !chosenDate || !chosenSlot ? (
                      <p className="border-hairline text-ink-muted rounded-lg border border-dashed px-4 py-3 text-center text-xs">
                        Choose a day and a slot above.
                      </p>
                    ) : permitted && !permitted.ok ? (
                      <div className="border-deal/40 bg-deal/10 rounded-xl border p-3">
                        <p className="text-deal flex items-start gap-2 text-xs leading-relaxed">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          {permitted.message}
                        </p>
                      </div>
                    ) : (
                      <PayForm
                        fields={{
                          category: 'LPG',
                          biller: connection.distributorId,
                          account: connection.lpgId,
                          option: 'REFILL',
                          cylinder: refill.cylinder.id,
                          date: chosenDate,
                          slot: chosenSlot,
                        }}
                        label={`Book for ${formatPaise(refill.payable)}`}
                        saveAs={connection.distributorName}
                      />
                    )}
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>
      )}
    </Container>
  );
}
