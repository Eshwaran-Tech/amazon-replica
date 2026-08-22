import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { trainBookingsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import { statusLabel } from '@/data/train-classes';
import type { TrainBookingDoc, TrainBookingView, TrainPassenger } from '@/models/train-booking';
import type { WalletEntryDoc } from '@/models/wallet';

import { arrivalOf, offerOn, searchTrains } from './trains';
import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Train ticket booking.
 *
 * Paid from the Amazon Pay wallet, like everything else this store sells, so
 * one ledger holds the lot.
 *
 * The train and the class are re-derived from the route, date, number and class
 * code rather than trusted from the form. The browser sends *which* service and
 * *who* is travelling; the fare is looked up on the server and multiplied by
 * the passenger count there. A request has no field in which to name a price.
 *
 * A class that is waitlisted or closed cannot be booked at all. Showing "WL 33"
 * and then taking the money would be selling a place in a queue this store has
 * no way to clear.
 */

/** The party size one ticket may carry, as a railway booking caps it. */
export const MAX_PASSENGERS = 6;

export const MIN_AGE = 1;
export const MAX_AGE = 120;

export type BookTrainResult =
  | { ok: true; pnr: string; reference: string; amount: Paise; passengers: number }
  | {
      ok: false;
      code:
        | 'UNKNOWN_TRAIN'
        | 'UNKNOWN_CLASS'
        | 'NOT_BOOKABLE'
        | 'BAD_PASSENGERS'
        | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface BookTrainInput {
  from: string;
  to: string;
  /** `YYYY-MM-DD`. */
  date: string;
  trainNumber: string;
  classCode: string;
  passengers: Array<{ name: string; age: string | number; gender: string }>;
}

/** Ten digits, the shape a railway ticket carries. */
function makePnr(): string {
  const bytes = randomBytes(5);
  let digits = '';
  for (const byte of bytes) digits += String(byte % 10) + String(Math.floor(byte / 10) % 10);
  // Never leading-zero: a PNR is read and typed back as ten characters.
  return (digits[0] === '0' ? '4' : digits[0]) + digits.slice(1, 10);
}

/**
 * Passenger list, validated.
 *
 * A name and a plausible age is everything a chart prints and everything this
 * store keeps. Anything longer than a ticket line is refused rather than
 * truncated, so nobody discovers their name was silently cut in half.
 */
function readPassengers(
  raw: BookTrainInput['passengers'],
  status: string,
): { ok: true; passengers: TrainPassenger[] } | { ok: false; message: string } {
  const passengers: TrainPassenger[] = [];

  for (const entry of raw) {
    const name = String(entry.name ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const age = Number(entry.age);
    const gender = String(entry.gender ?? '')
      .trim()
      .toUpperCase();

    if (name.length === 0) continue;

    if (name.length > 60) {
      return { ok: false, message: 'A passenger name is longer than a ticket line allows.' };
    }
    if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
      return {
        ok: false,
        message: `Enter an age between ${MIN_AGE} and ${MAX_AGE} for every passenger.`,
      };
    }
    if (gender !== 'M' && gender !== 'F' && gender !== 'X') {
      return { ok: false, message: 'Choose how each passenger should be listed on the chart.' };
    }

    passengers.push({ name, age, gender, status });
  }

  if (passengers.length === 0) {
    return { ok: false, message: 'Add at least one passenger.' };
  }
  if (passengers.length > MAX_PASSENGERS) {
    return { ok: false, message: `One ticket carries up to ${MAX_PASSENGERS} passengers.` };
  }

  return { ok: true, passengers };
}

export async function bookTrain(
  userId: string,
  input: BookTrainInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<BookTrainResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN_TRAIN', message: 'Please sign in again.' };
  }

  const search = searchTrains({ from: input.from, to: input.to, date: input.date }, now);
  if (!search.ok) {
    return { ok: false, code: 'UNKNOWN_TRAIN', message: search.message };
  }

  const train = search.trains.find((entry) => entry.number === input.trainNumber);
  if (!train) {
    return {
      ok: false,
      code: 'UNKNOWN_TRAIN',
      message: 'That train does not run on this route and date. Search again.',
    };
  }

  const offer = offerOn(train, input.classCode);
  if (!offer) {
    return {
      ok: false,
      code: 'UNKNOWN_CLASS',
      message: 'That class is not offered on this train.',
    };
  }

  if (!offer.bookable) {
    return {
      ok: false,
      code: 'NOT_BOOKABLE',
      message: `${offer.code} is ${statusLabel(offer.status, offer.count)} on this train. Pick a class with berths.`,
    };
  }

  const read = readPassengers(input.passengers, statusLabel(offer.status, offer.count));
  if (!read.ok) {
    return { ok: false, code: 'BAD_PASSENGERS', message: read.message };
  }

  // A party larger than the chart can seat is refused before any money moves.
  if (read.passengers.length > offer.count) {
    return {
      ok: false,
      code: 'NOT_BOOKABLE',
      message: `Only ${offer.count} berth${offer.count === 1 ? '' : 's'} left in ${offer.code}.`,
    };
  }

  const amount = offer.fare * read.passengers.length;

  const { balance } = await getWalletSummary(userId);
  if (balance < amount) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Amazon Pay balance is not enough. Add money and try again.',
    };
  }

  const reference = `TT-${randomBytes(3).toString('hex').toUpperCase()}`;
  const pnr = makePnr();

  // Debit first, as the bus, the rentals and the recharge do: a charge with no
  // ticket is something support can fix, a ticket with no charge is a free ride
  // for anyone who can crash the request at the right moment.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'TRAIN',
    direction: 'DEBIT',
    amount,
    status: 'COMPLETED',
    currency: 'INR',
    reference,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const bookings = await trainBookingsCollection();
  const doc: TrainBookingDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    pnr,
    reference,
    trainNumber: train.number,
    trainName: train.name,
    fromCode: train.origin.code,
    fromName: train.origin.name,
    toCode: train.destination.code,
    toName: train.destination.name,
    travelDate: input.date,
    departureMinutes: train.departureMinutes,
    durationMinutes: train.durationMinutes,
    classCode: offer.code,
    className: offer.label,
    passengers: read.passengers,
    farePerPassenger: offer.fare,
    amount,
    createdAt: now,
  };
  await bookings.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'train.booked',
      actorId: userId,
      targetType: 'trainBooking',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reference,
        amount,
        passengers: read.passengers.length,
        train: train.number,
        travelClass: offer.code,
        route: `${train.origin.code}-${train.destination.code}`,
        date: input.date,
        // The arrival is logged so a support query can be answered without
        // regenerating the timetable the ticket was cut from.
        arrivesDayOffset: arrivalOf(train).dayOffset,
      },
    },
    'info',
  );

  return { ok: true, pnr, reference, amount, passengers: read.passengers.length };
}

/** This customer's tickets, newest first. Ownership is in the query. */
export async function listTrainBookings(userId: string, limit = 5): Promise<TrainBookingView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const bookings = await trainBookingsCollection();
  const docs = await bookings
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    pnr: doc.pnr,
    reference: doc.reference,
    trainNumber: doc.trainNumber,
    trainName: doc.trainName,
    fromCode: doc.fromCode,
    fromName: doc.fromName,
    toCode: doc.toCode,
    toName: doc.toName,
    travelDate: doc.travelDate,
    departureMinutes: doc.departureMinutes,
    classCode: doc.classCode,
    className: doc.className,
    passengers: doc.passengers,
    amount: doc.amount,
    createdAt: doc.createdAt,
  }));
}

/**
 * One ticket by PNR, for the traveller who owns it.
 *
 * The user id is part of the query rather than checked after the read, so a
 * guessed PNR returns nothing instead of somebody else's passenger list.
 */
export async function findTrainBooking(
  userId: string,
  pnr: string,
): Promise<TrainBookingView | null> {
  if (!ObjectId.isValid(userId)) return null;

  const bookings = await trainBookingsCollection();
  const doc = await bookings.findOne({ userId: new ObjectId(userId), pnr: pnr.trim() });
  if (!doc) return null;

  return {
    id: doc._id.toHexString(),
    pnr: doc.pnr,
    reference: doc.reference,
    trainNumber: doc.trainNumber,
    trainName: doc.trainName,
    fromCode: doc.fromCode,
    fromName: doc.fromName,
    toCode: doc.toCode,
    toName: doc.toName,
    travelDate: doc.travelDate,
    departureMinutes: doc.departureMinutes,
    classCode: doc.classCode,
    className: doc.className,
    passengers: doc.passengers,
    amount: doc.amount,
    createdAt: doc.createdAt,
  };
}
