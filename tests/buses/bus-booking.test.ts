import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  busBookingsCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import { bookBus, listBusBookings } from '@/services/bus-booking';
import { MAX_SEATS_PER_BOOKING, seatMapFor } from '@/services/bus-seats';
import { searchBuses, type BusDeparture } from '@/services/buses';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Booking a bus seat.
 *
 * The things worth testing are the ones that cost somebody money if they are
 * wrong: the fare must come from the seat map and not from the request, the
 * wallet must move by exactly that much and only once, a party that cannot be
 * paid for must not become a ticket, and one customer's bookings must never be
 * visible from another's account.
 */

const TODAY = new Date(2026, 7, 21);
const DATE = '2026-09-21';
const ctx = { ip: '10.99.0.21', userAgent: 'vitest' };

let counter = 0;

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Bus Traveller ${counter}`,
    email: `bus-${Date.now()}-${counter}@example.com`,
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

function coach(): BusDeparture {
  const result = searchBuses({ from: 'bengaluru', to: 'chennai', date: DATE }, TODAY);
  if (!result.ok) throw new Error(result.message);
  const bus = result.buses.find((entry) => seatMapFor(entry).availableSeats >= 3);
  if (!bus) throw new Error('every coach on the route is full');
  return bus;
}

function freeSeats(bus: BusDeparture, count: number) {
  return seatMapFor(bus)
    .seats.filter((seat) => seat.available)
    .slice(0, count);
}

function input(bus: BusDeparture, seatIds: string[]) {
  return {
    from: 'bengaluru',
    to: 'chennai',
    date: DATE,
    busId: bus.id,
    seatIds,
    boardingPoint: bus.boardingPoints[0] ?? 'Central Bus Stand',
    dropPoint: bus.dropPoints[0] ?? 'Central Bus Stand',
  };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('bus booking: the money', () => {
  it('charges the sum of the chosen seats, and nothing the form said', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    const seats = freeSeats(bus, 2);
    const expected = seats.reduce((sum, seat) => sum + seat.fare, 0);

    const before = await getWalletSummary(userId);
    const result = await bookBus(
      userId,
      input(
        bus,
        seats.map((seat) => seat.id),
      ),
      ctx,
      TODAY,
    );
    if (!result.ok) throw new Error(result.message);

    expect(result.amount).toBe(expected);
    const after = await getWalletSummary(userId);
    expect(before.balance - after.balance).toBe(expected);
  });

  it('writes exactly one debit, tagged as a bus ticket', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    const seat = freeSeats(bus, 1)[0];
    if (!seat) throw new Error('a full coach');

    const result = await bookBus(userId, input(bus, [seat.id]), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    const entries = await walletEntriesCollection();
    const debits = await entries.find({ userId: user._id, type: 'BUS' }).toArray();
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

    const bus = coach();
    const seats = freeSeats(bus, 2);

    const before = await getWalletSummary(userId);
    const result = await bookBus(
      userId,
      input(
        bus,
        seats.map((seat) => seat.id),
      ),
      ctx,
      TODAY,
    );

    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT_BALANCE' });
    expect((await getWalletSummary(userId)).balance).toBe(before.balance);

    const bookings = await busBookingsCollection();
    expect(await bookings.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe('bus booking: what it refuses', () => {
  it('refuses a coach that is not on the route', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    const result = await bookBus(
      userId,
      { ...input(bus, ['L1']), busId: 'not-a-coach' },
      ctx,
      TODAY,
    );
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_BUS' });
  });

  it('refuses a route it cannot serve', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    const result = await bookBus(userId, { ...input(bus, ['L1']), from: 'atlantis' }, ctx, TODAY);
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_BUS' });
  });

  it('refuses a seat that is not on the coach, and one already gone', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    expect(await bookBus(userId, input(bus, ['Z999']), ctx, TODAY)).toMatchObject({
      ok: false,
      code: 'BAD_SEATS',
    });

    const taken = seatMapFor(bus).seats.find((seat) => !seat.available);
    if (taken) {
      expect(await bookBus(userId, input(bus, [taken.id]), ctx, TODAY)).toMatchObject({
        ok: false,
        code: 'BAD_SEATS',
      });
    }
  });

  it('refuses a party larger than the cap', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 50_000);

    const bus = coach();
    const seats = freeSeats(bus, MAX_SEATS_PER_BOOKING + 1);
    if (seats.length <= MAX_SEATS_PER_BOOKING) return;

    expect(
      await bookBus(
        userId,
        input(
          bus,
          seats.map((seat) => seat.id),
        ),
        ctx,
        TODAY,
      ),
    ).toMatchObject({ ok: false, code: 'BAD_SEATS' });
  });

  it('refuses an empty choice', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    expect(await bookBus(userId, input(coach(), []), ctx, TODAY)).toMatchObject({
      ok: false,
      code: 'BAD_SEATS',
    });
  });

  it('will not take an invented user id', async () => {
    const bus = coach();
    expect(await bookBus('not-an-id', input(bus, ['L1']), ctx, TODAY)).toMatchObject({ ok: false });
  });
});

describe('bus booking: the ticket', () => {
  it('falls back to a real stop when the form names one the coach does not use', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    const seat = freeSeats(bus, 1)[0];
    if (!seat) throw new Error('a full coach');

    const result = await bookBus(
      userId,
      {
        ...input(bus, [seat.id]),
        boardingPoint: 'A Stop That Does Not Exist',
        dropPoint: 'Nor This One',
      },
      ctx,
      TODAY,
    );
    if (!result.ok) throw new Error(result.message);

    const bookings = await busBookingsCollection();
    const doc = await bookings.findOne({ reference: result.reference });
    expect(bus.boardingPoints).toContain(doc?.boardingPoint);
    expect(bus.dropPoints).toContain(doc?.dropPoint);
  });

  it('snapshots the journey, so a later timetable change cannot rewrite a ticket', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const bus = coach();
    const seat = freeSeats(bus, 1)[0];
    if (!seat) throw new Error('a full coach');

    const result = await bookBus(userId, input(bus, [seat.id]), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    const bookings = await busBookingsCollection();
    const doc = await bookings.findOne({ reference: result.reference });
    expect(doc).toMatchObject({
      fromCity: 'Bengaluru',
      toCity: 'Chennai',
      travelDate: DATE,
      operatorName: bus.operator.name,
      coach: bus.coach,
      departureMinutes: bus.departureMinutes,
      durationMinutes: bus.durationMinutes,
      seatIds: [seat.id],
      amount: result.amount,
    });
  });

  it('shows a customer their own tickets and no one else', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await fundWallet(mine._id.toHexString(), 5000);
    await fundWallet(theirs._id.toHexString(), 5000);

    const bus = coach();
    const seats = freeSeats(bus, 2);
    const first = seats[0];
    const second = seats[1];
    if (!first || !second) throw new Error('a full coach');

    await bookBus(mine._id.toHexString(), input(bus, [first.id]), ctx, TODAY);
    await bookBus(theirs._id.toHexString(), input(bus, [second.id]), ctx, TODAY);

    const listed = await listBusBookings(mine._id.toHexString());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.seatIds).toEqual([first.id]);
    expect(await listBusBookings('not-an-id')).toEqual([]);
  });

  it('gives every ticket its own reference', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 20_000);

    const bus = coach();
    const seats = freeSeats(bus, 3);
    const references = new Set<string>();

    for (const seat of seats) {
      const result = await bookBus(userId, input(bus, [seat.id]), ctx, TODAY);
      if (!result.ok) throw new Error(result.message);
      references.add(result.reference);
    }

    expect(references.size).toBe(seats.length);
  });
});
