import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  trainBookingsCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import {
  bookTrain,
  findTrainBooking,
  listTrainBookings,
  MAX_PASSENGERS,
} from '@/services/train-booking';
import { searchTrains, type TrainClassOffer, type TrainDeparture } from '@/services/trains';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Booking a train ticket.
 *
 * The things worth testing are the ones that cost somebody money if they are
 * wrong: the fare must come from the class and not from the request, the wallet
 * must move by exactly fare x passengers and only once, a waitlisted class must
 * not be sellable at any price, and one traveller's PNRs must never be
 * reachable from another's account.
 */

const TODAY = new Date(2026, 7, 21, 9, 0);
const DATE = '2026-09-21';
const ctx = { ip: '10.99.0.31', userAgent: 'vitest' };

let counter = 0;

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Train Traveller ${counter}`,
    email: `train-${Date.now()}-${counter}@example.com`,
    passwordHash: await hashPassword('ValidPass123'),
    phone: null,
    hasPassword: true,
    role: 'USER',
    emailVerified: true,
    emailVerifiedAt: now,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(user);
  return user;
}

async function fundWallet(userId: string, rupees: number): Promise<void> {
  const topUp = await createTopUp(userId, rupeesToPaise(rupees));
  if (!topUp.ok) throw new Error('top-up refused');
  await completeTopUp(userId, topUp.entryId, MOCK_TEST_CARDS.success, ctx);
}

/** A train on the reference route with a bookable class and room for a party. */
function bookable(): { train: TrainDeparture; offer: TrainClassOffer } {
  const result = searchTrains({ from: 'NDLS', to: 'HWH', date: DATE }, TODAY);
  if (!result.ok) throw new Error(result.message);

  for (const train of result.trains) {
    const offer = train.classes.find((entry) => entry.bookable && entry.count >= 3);
    if (offer) return { train, offer };
  }
  throw new Error('no bookable class on the route');
}

/** A class that cannot be sold, if the route has one. */
function unsellable(): { train: TrainDeparture; offer: TrainClassOffer } | null {
  const result = searchTrains({ from: 'NDLS', to: 'HWH', date: DATE }, TODAY);
  if (!result.ok) throw new Error(result.message);

  for (const train of result.trains) {
    const offer = train.classes.find((entry) => !entry.bookable);
    if (offer) return { train, offer };
  }
  return null;
}

function party(size: number) {
  return Array.from({ length: size }, (_, index) => ({
    name: `Passenger ${index + 1}`,
    age: String(24 + index),
    gender: index % 2 === 0 ? 'M' : 'F',
  }));
}

function input(train: TrainDeparture, offer: TrainClassOffer, passengers = party(1)) {
  return {
    from: 'NDLS',
    to: 'HWH',
    date: DATE,
    trainNumber: train.number,
    classCode: offer.code,
    passengers,
  };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('train booking: the money', () => {
  it('charges the class fare times the passengers, and nothing the form said', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    const before = await getWalletSummary(userId);

    const result = await bookTrain(userId, input(train, offer, party(3)), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    expect(result.amount).toBe(offer.fare * 3);
    expect(result.passengers).toBe(3);

    const after = await getWalletSummary(userId);
    expect(before.balance - after.balance).toBe(offer.fare * 3);
  });

  it('writes exactly one debit, tagged as a train ticket', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    const result = await bookTrain(userId, input(train, offer), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    const entries = await walletEntriesCollection();
    const debits = await entries.find({ userId: user._id, type: 'TRAIN' }).toArray();
    expect(debits).toHaveLength(1);
    expect(debits[0]?.direction).toBe('DEBIT');
    expect(debits[0]?.amount).toBe(result.amount);
    expect(debits[0]?.reference).toBe(result.reference);
    expect(debits[0]?.status).toBe('COMPLETED');
  });

  it('refuses a booking the balance cannot cover, and takes nothing', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 1);

    const { train, offer } = bookable();
    const before = await getWalletSummary(userId);

    const result = await bookTrain(userId, input(train, offer, party(2)), ctx, TODAY);
    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT_BALANCE' });

    expect((await getWalletSummary(userId)).balance).toBe(before.balance);
    const bookings = await trainBookingsCollection();
    expect(await bookings.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe('train booking: what it refuses', () => {
  it('refuses a train that does not run on this route and date', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    expect(
      await bookTrain(userId, { ...input(train, offer), trainNumber: '00000' }, ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_TRAIN' });
  });

  it('refuses a station it does not know', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    expect(
      await bookTrain(userId, { ...input(train, offer), from: 'ZZZZ' }, ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_TRAIN' });
  });

  it('refuses a class the train does not carry', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    const missing = ['1A', '2A', '3A', 'CC', 'SL', '2S'].find(
      (code) => !train.classes.some((entry) => entry.code === code),
    );
    if (!missing) return;

    expect(
      await bookTrain(userId, { ...input(train, offer), classCode: missing }, ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_CLASS' });
  });

  it('will not sell a waitlisted or closed class at any price', async () => {
    const pair = unsellable();
    if (!pair) return;

    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);
    const before = await getWalletSummary(userId);

    const result = await bookTrain(userId, input(pair.train, pair.offer), ctx, TODAY);
    expect(result).toMatchObject({ ok: false, code: 'NOT_BOOKABLE' });

    expect((await getWalletSummary(userId)).balance).toBe(before.balance);
    const bookings = await trainBookingsCollection();
    expect(await bookings.countDocuments({ userId: user._id })).toBe(0);
  });

  it('refuses a party the chart cannot seat', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 60_000);

    const result = searchTrains({ from: 'NDLS', to: 'HWH', date: DATE }, TODAY);
    if (!result.ok) throw new Error(result.message);

    for (const train of result.trains) {
      const tight = train.classes.find(
        (entry) => entry.bookable && entry.count < MAX_PASSENGERS && entry.count >= 1,
      );
      if (!tight) continue;

      expect(
        await bookTrain(
          userId,
          input(train, tight, party(Math.min(MAX_PASSENGERS, tight.count + 1))),
          ctx,
          TODAY,
        ),
      ).toMatchObject({ ok: false, code: 'NOT_BOOKABLE' });
      return;
    }
  });

  it('refuses an empty passenger list', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    expect(await bookTrain(userId, input(train, offer, []), ctx, TODAY)).toMatchObject({
      ok: false,
      code: 'BAD_PASSENGERS',
    });
    expect(
      await bookTrain(
        userId,
        input(train, offer, [{ name: '   ', age: '30', gender: 'M' }]),
        ctx,
        TODAY,
      ),
    ).toMatchObject({ ok: false, code: 'BAD_PASSENGERS' });
  });

  it('refuses a party larger than one ticket carries', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 60_000);

    const result = searchTrains({ from: 'NDLS', to: 'HWH', date: DATE }, TODAY);
    if (!result.ok) throw new Error(result.message);

    for (const train of result.trains) {
      const roomy = train.classes.find((entry) => entry.bookable && entry.count > MAX_PASSENGERS);
      if (!roomy) continue;

      expect(
        await bookTrain(userId, input(train, roomy, party(MAX_PASSENGERS + 1)), ctx, TODAY),
      ).toMatchObject({ ok: false, code: 'BAD_PASSENGERS' });
      return;
    }
  });

  it.each([
    ['an age below the range', '0'],
    ['an age above the range', '200'],
    ['an age that is not a number', 'thirty'],
    ['a fractional age', '30.5'],
  ])('refuses %s', async (_label, age) => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    expect(
      await bookTrain(
        userId,
        input(train, offer, [{ name: 'A Traveller', age, gender: 'M' }]),
        ctx,
        TODAY,
      ),
    ).toMatchObject({ ok: false, code: 'BAD_PASSENGERS' });
  });

  it('refuses a name longer than a ticket line, rather than cutting it', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    expect(
      await bookTrain(
        userId,
        input(train, offer, [{ name: 'A'.repeat(61), age: '30', gender: 'M' }]),
        ctx,
        TODAY,
      ),
    ).toMatchObject({ ok: false, code: 'BAD_PASSENGERS' });
  });

  it('refuses a gender it cannot print on a chart', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    expect(
      await bookTrain(
        userId,
        input(train, offer, [{ name: 'A Traveller', age: '30', gender: 'Q' }]),
        ctx,
        TODAY,
      ),
    ).toMatchObject({ ok: false, code: 'BAD_PASSENGERS' });
  });

  it('will not take an invented user id', async () => {
    const { train, offer } = bookable();
    expect(await bookTrain('not-an-id', input(train, offer), ctx, TODAY)).toMatchObject({
      ok: false,
    });
  });
});

describe('train booking: the ticket', () => {
  it('snapshots the journey, so a later timetable change cannot rewrite a ticket', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    const result = await bookTrain(userId, input(train, offer, party(2)), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    const bookings = await trainBookingsCollection();
    const doc = await bookings.findOne({ pnr: result.pnr });
    expect(doc).toMatchObject({
      trainNumber: train.number,
      trainName: train.name,
      fromCode: train.origin.code,
      toCode: train.destination.code,
      travelDate: DATE,
      departureMinutes: train.departureMinutes,
      durationMinutes: train.durationMinutes,
      classCode: offer.code,
      farePerPassenger: offer.fare,
      amount: offer.fare * 2,
    });
    expect(doc?.passengers).toHaveLength(2);
  });

  it('keeps only what a ticket prints', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const { train, offer } = bookable();
    const result = await bookTrain(
      userId,
      input(train, offer, [{ name: '  Asha   Menon ', age: '34', gender: 'f' }]),
      ctx,
      TODAY,
    );
    if (!result.ok) throw new Error(result.message);

    const bookings = await trainBookingsCollection();
    const doc = await bookings.findOne({ pnr: result.pnr });
    const passenger = doc?.passengers[0];

    // Whitespace tidied, gender normalised, and nothing else stored.
    expect(passenger?.name).toBe('Asha Menon');
    expect(passenger?.gender).toBe('F');
    expect(passenger?.age).toBe(34);
    expect(Object.keys(passenger ?? {}).sort()).toEqual(['age', 'gender', 'name', 'status']);
  });

  it('gives every ticket a distinct ten-digit PNR and its own reference', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 60_000);

    const { train, offer } = bookable();
    const pnrs = new Set<string>();
    const references = new Set<string>();

    for (let index = 0; index < 3; index += 1) {
      const result = await bookTrain(userId, input(train, offer), ctx, TODAY);
      if (!result.ok) throw new Error(result.message);
      expect(result.pnr).toMatch(/^[1-9]\d{9}$/);
      pnrs.add(result.pnr);
      references.add(result.reference);
    }

    expect(pnrs.size).toBe(3);
    expect(references.size).toBe(3);
  });

  it('shows a traveller their own tickets and no one else', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await fundWallet(mine._id.toHexString(), 20_000);
    await fundWallet(theirs._id.toHexString(), 20_000);

    const { train, offer } = bookable();
    const ours = await bookTrain(mine._id.toHexString(), input(train, offer), ctx, TODAY);
    await bookTrain(theirs._id.toHexString(), input(train, offer), ctx, TODAY);
    if (!ours.ok) throw new Error(ours.message);

    const listed = await listTrainBookings(mine._id.toHexString());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.pnr).toBe(ours.pnr);
    expect(await listTrainBookings('not-an-id')).toEqual([]);
  });

  it('will not hand a PNR to the wrong account', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await fundWallet(mine._id.toHexString(), 20_000);

    const { train, offer } = bookable();
    const ours = await bookTrain(mine._id.toHexString(), input(train, offer), ctx, TODAY);
    if (!ours.ok) throw new Error(ours.message);

    expect(await findTrainBooking(mine._id.toHexString(), ours.pnr)).not.toBeNull();
    expect(await findTrainBooking(theirs._id.toHexString(), ours.pnr)).toBeNull();
    expect(await findTrainBooking(mine._id.toHexString(), '0000000000')).toBeNull();
  });
});
