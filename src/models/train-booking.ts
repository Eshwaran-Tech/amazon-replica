import type { ObjectId } from 'mongodb';

import type { TrainClassCode } from '@/data/train-classes';
import type { Paise } from '@/lib/utils/money';

/**
 * A confirmed train booking.
 *
 * The journey is snapshotted rather than referenced, for the same reason the
 * bus and order records are: the search that produced it is regenerated from a
 * seed, and a ticket must still read correctly if the generator ever changes.
 *
 * Passenger names and ages are kept because a railway ticket carries them --
 * but nothing beyond what a ticket prints. No identity number, no address, no
 * contact detail: this store has no use for them and no business holding them.
 */
export interface TrainPassenger {
  name: string;
  age: number;
  /** As printed on the chart. */
  gender: 'M' | 'F' | 'X';
  /** "AVL 26" at the moment of booking became this berth's status. */
  status: string;
}

export interface TrainBookingDoc {
  _id: ObjectId;
  userId: ObjectId;
  /** Ten digits, as a railway ticket carries. Shown to the traveller. */
  pnr: string;
  /** Wallet-facing reference, shared with the ledger entry. */
  reference: string;
  trainNumber: string;
  trainName: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  /** `YYYY-MM-DD`. */
  travelDate: string;
  departureMinutes: number;
  durationMinutes: number;
  classCode: TrainClassCode;
  className: string;
  passengers: TrainPassenger[];
  /** Fare for one passenger, at booking time. */
  farePerPassenger: Paise;
  amount: Paise;
  createdAt: Date;
}

export interface TrainBookingView {
  id: string;
  pnr: string;
  reference: string;
  trainNumber: string;
  trainName: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  travelDate: string;
  departureMinutes: number;
  classCode: TrainClassCode;
  className: string;
  passengers: TrainPassenger[];
  amount: Paise;
  createdAt: Date;
}
