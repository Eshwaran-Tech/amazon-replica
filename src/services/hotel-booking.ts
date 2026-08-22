import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { hotelBookingsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import type { HotelBookingDoc, HotelBookingView } from '@/models/hotel-booking';
import type { WalletEntryDoc } from '@/models/wallet';

import { findRoom, quoteStay, searchHotels } from './hotels';
import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Hotel booking.
 *
 * Paid from the Amazon Pay wallet, like everything else this store sells, so
 * one ledger holds the lot.
 *
 * The property, the room and the tariff are re-derived from the destination,
 * dates and party rather than trusted from the form. The browser sends *which*
 * hotel, *which* room and *who* is staying; the price is quoted on the server
 * from the same function the results page called. A request has no field in
 * which to name an amount.
 */

export type BookHotelResult =
  | { ok: true; reference: string; amount: Paise; nights: number; rooms: number }
  | {
      ok: false;
      code: 'UNKNOWN_HOTEL' | 'UNKNOWN_ROOM' | 'BAD_STAY' | 'BAD_GUEST' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface BookHotelInput {
  city: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  childAges: number[];
  hotelId: string;
  roomId: string;
  guestName: string;
}

export async function bookHotel(
  userId: string,
  input: BookHotelInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<BookHotelResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN_HOTEL', message: 'Please sign in again.' };
  }

  const guestName = input.guestName.trim().replace(/\s+/g, ' ');
  if (guestName.length === 0) {
    return { ok: false, code: 'BAD_GUEST', message: 'Enter the name the room is booked under.' };
  }
  if (guestName.length > 60) {
    return {
      ok: false,
      code: 'BAD_GUEST',
      message: 'That name is longer than a voucher line allows.',
    };
  }

  const search = searchHotels(
    {
      city: input.city,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      adults: input.adults,
      children: input.childAges,
    },
    now,
  );

  if (!search.ok) {
    return {
      ok: false,
      code: search.code === 'UNKNOWN_CITY' ? 'UNKNOWN_HOTEL' : 'BAD_STAY',
      message: search.message,
    };
  }

  const hotel = search.hotels.find((entry) => entry.id === input.hotelId);
  if (!hotel) {
    return {
      ok: false,
      code: 'UNKNOWN_HOTEL',
      message: 'That property is no longer on this search. Try again.',
    };
  }

  const room = findRoom(hotel, input.roomId);
  if (!room) {
    return { ok: false, code: 'UNKNOWN_ROOM', message: 'That room is not offered here.' };
  }

  // The same quote the page showed, from the same function, on the server.
  const quote = quoteStay(room, {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: search.rooms,
  });

  if (quote.nights <= 0 || quote.total <= 0) {
    return { ok: false, code: 'BAD_STAY', message: 'Check-out must be after check-in.' };
  }

  const { balance } = await getWalletSummary(userId);
  if (balance < quote.total) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Amazon Pay balance is not enough. Add money and try again.',
    };
  }

  const reference = `HT-${randomBytes(3).toString('hex').toUpperCase()}`;

  // Debit first, as the bus, train, rentals and recharge do: a charge with no
  // voucher is something support can fix, a voucher with no charge is a free
  // night for anyone who can crash the request at the right moment.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'HOTEL',
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

  const bookings = await hotelBookingsCollection();
  const doc: HotelBookingDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    reference,
    hotelId: hotel.id,
    hotelName: hotel.name,
    starRating: hotel.starRating,
    locality: hotel.locality,
    cityName: hotel.city.name,
    address: hotel.address,
    roomId: room.id,
    roomTier: room.tier,
    mealPlan: room.mealPlan,
    cancellation: room.cancellation,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: quote.nights,
    rooms: quote.rooms,
    adults: search.rooms > 0 ? Math.floor(input.adults) : 1,
    childAges: input.childAges,
    guestName,
    perNight: quote.perNight,
    roomTotal: quote.roomTotal,
    taxRate: quote.taxRate,
    taxes: quote.taxes,
    amount: quote.total,
    createdAt: now,
  };
  await bookings.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'hotel.booked',
      actorId: userId,
      targetType: 'hotelBooking',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        reference,
        amount: quote.total,
        hotel: hotel.id,
        room: room.id,
        nights: quote.nights,
        rooms: quote.rooms,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      },
    },
    'info',
  );

  return { ok: true, reference, amount: quote.total, nights: quote.nights, rooms: quote.rooms };
}

/** This guest's bookings, newest first. Ownership is in the query. */
export async function listHotelBookings(userId: string, limit = 5): Promise<HotelBookingView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const bookings = await hotelBookingsCollection();
  const docs = await bookings
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    reference: doc.reference,
    hotelName: doc.hotelName,
    starRating: doc.starRating,
    locality: doc.locality,
    cityName: doc.cityName,
    roomTier: doc.roomTier,
    mealPlan: doc.mealPlan,
    cancellation: doc.cancellation,
    checkIn: doc.checkIn,
    checkOut: doc.checkOut,
    nights: doc.nights,
    rooms: doc.rooms,
    adults: doc.adults,
    childAges: doc.childAges,
    guestName: doc.guestName,
    perNight: doc.perNight,
    amount: doc.amount,
    createdAt: doc.createdAt,
  }));
}
