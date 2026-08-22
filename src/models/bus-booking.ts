import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A confirmed bus booking.
 *
 * The journey is snapshotted rather than referenced: the search that produced
 * it is regenerated from a seed, and a ticket must still read correctly if the
 * generator ever changes. Same reasoning as the order-item snapshots.
 */
export interface BusBookingDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** Human-facing reference, shared with the wallet entry. */
  reference: string;
  fromCity: string;
  toCity: string;
  /** `YYYY-MM-DD`. */
  travelDate: string;
  operatorName: string;
  coach: string;
  departureMinutes: number;
  durationMinutes: number;
  seatIds: string[];
  boardingPoint: string;
  dropPoint: string;
  amount: Paise;
  createdAt: Date;
}

export interface BusBookingView {
  id: string;
  reference: string;
  fromCity: string;
  toCity: string;
  travelDate: string;
  operatorName: string;
  coach: string;
  departureMinutes: number;
  seatIds: string[];
  boardingPoint: string;
  dropPoint: string;
  amount: Paise;
  createdAt: Date;
}
