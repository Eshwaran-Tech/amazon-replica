import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A confirmed hotel booking.
 *
 * The stay is snapshotted rather than referenced, for the same reason the
 * order, bus and train records are: the search that produced it is regenerated
 * from a seed, and a voucher must still read correctly if the generator ever
 * changes.
 *
 * The guest's name is kept because a hotel voucher carries one. Nothing else
 * about them is: no identity number, no address, no contact detail. This store
 * has no use for them and no business holding them.
 */
export interface HotelBookingDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** Human-facing reference, shared with the wallet entry. */
  reference: string;
  hotelId: string;
  hotelName: string;
  starRating: number;
  locality: string;
  cityName: string;
  address: string;
  roomId: string;
  roomTier: string;
  mealPlan: string;
  cancellation: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  /** One age per child. */
  childAges: number[];
  guestName: string;
  /** Per room, per night, at booking time. */
  perNight: Paise;
  roomTotal: Paise;
  taxRate: number;
  taxes: Paise;
  amount: Paise;
  createdAt: Date;
}

export interface HotelBookingView {
  id: string;
  reference: string;
  hotelName: string;
  starRating: number;
  locality: string;
  cityName: string;
  roomTier: string;
  mealPlan: string;
  cancellation: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  adults: number;
  childAges: number[];
  guestName: string;
  perNight: Paise;
  amount: Paise;
  createdAt: Date;
}
