import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { busBookingsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import type { BusBookingDoc, BusBookingView } from '@/models/bus-booking';
import type { WalletEntryDoc } from '@/models/wallet';

import { searchBuses } from './buses';
import { quoteSeats } from './bus-seats';
import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Bus ticket booking.
 *
 * Paid from the Eshwaran Pay wallet, like everything else this store sells, so
 * one ledger holds the lot.
 *
 * The departure is re-derived from the route, date and id rather than trusted
 * from the form. That is the whole point: the browser sends which coach and
 * which seats, and the fare is summed on the server from the seat map. A
 * request has no field in which to name a price.
 */

export type BookBusResult =
  | { ok: true; reference: string; amount: Paise; seatIds: string[] }
  | {
      ok: false;
      code: 'UNKNOWN_BUS' | 'BAD_SEATS' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface BookBusInput {
  from: string;
  to: string;
  /** `YYYY-MM-DD`. */
  date: string;
  busId: string;
  seatIds: string[];
  boardingPoint: string;
  dropPoint: string;
}

export async function bookBus(
  userId: string,
  input: BookBusInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<BookBusResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN_BUS', message: 'Please sign in again.' };
  }

  const search = searchBuses({ from: input.from, to: input.to, date: input.date }, now);
  if (!search.ok) {
    return { ok: false, code: 'UNKNOWN_BUS', message: search.message };
  }

  const bus = search.buses.find((entry) => entry.id === input.busId);
  if (!bus) {
    return {
      ok: false,
      code: 'UNKNOWN_BUS',
      message: 'That coach is no longer on this route. Search again.',
    };
  }

  const quote = quoteSeats(bus, input.seatIds);
  if (!quote.ok) {
    return { ok: false, code: 'BAD_SEATS', message: quote.message };
  }

  const { balance } = await getWalletSummary(userId);
  if (balance < quote.total) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough. Add money and try again.',
    };
  }

  // Boarding and dropping points are checked against the coach's own lists --
  // a point that is not on this service is not a point this service stops at.
  const boardingPoint = bus.boardingPoints.includes(input.boardingPoint)
    ? input.boardingPoint
    : (bus.boardingPoints[0] ?? 'Central Bus Stand');
  const dropPoint = bus.dropPoints.includes(input.dropPoint)
    ? input.dropPoint
    : (bus.dropPoints[0] ?? 'Central Bus Stand');

  const reference = `BT-${randomBytes(3).toString('hex').toUpperCase()}`;

  // Debit first, as the rentals and the recharge do: a charge with no ticket is
  // something support can fix, a ticket with no charge is a free ride for
  // anyone who can crash the request at the right moment.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'BUS',
    direction: 'DEBIT',
    amount: quote.total,
    status: 'COMPLETED',
    currency: 'INR',
    reference,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const bookings = await busBookingsCollection();
  const doc: BusBookingDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    reference,
    fromCity: search.from.name,
    toCity: search.to.name,
    travelDate: input.date,
    operatorName: bus.operator.name,
    coach: bus.coach,
    departureMinutes: bus.departureMinutes,
    durationMinutes: bus.durationMinutes,
    seatIds: quote.seats.map((seat) => seat.id),
    boardingPoint,
    dropPoint,
    amount: quote.total,
    createdAt: now,
  };
  await bookings.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'bus.booked',
      actorId: userId,
      targetType: 'busBooking',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reference,
        amount: quote.total,
        seats: doc.seatIds.length,
        route: `${search.from.id}-${search.to.id}`,
        date: input.date,
      },
    },
    'info',
  );

  return { ok: true, reference, amount: quote.total, seatIds: doc.seatIds };
}

/** This customer's bookings, newest first. Ownership is in the query. */
export async function listBusBookings(userId: string, limit = 5): Promise<BusBookingView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const bookings = await busBookingsCollection();
  const docs = await bookings
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    reference: doc.reference,
    fromCity: doc.fromCity,
    toCity: doc.toCity,
    travelDate: doc.travelDate,
    operatorName: doc.operatorName,
    coach: doc.coach,
    departureMinutes: doc.departureMinutes,
    seatIds: doc.seatIds,
    boardingPoint: doc.boardingPoint,
    dropPoint: doc.dropPoint,
    amount: doc.amount,
    createdAt: doc.createdAt,
  }));
}
