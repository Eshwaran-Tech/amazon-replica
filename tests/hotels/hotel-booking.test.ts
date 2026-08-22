import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  hotelBookingsCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import { bookHotel, listHotelBookings } from '@/services/hotel-booking';
import { quoteStay, searchHotels, type Hotel, type HotelRoom } from '@/services/hotels';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Booking a stay.
 *
 * The things worth testing are the ones that cost somebody money if they are
 * wrong: the amount must come from the room and the nights rather than from the
 * request, the wallet must move by exactly that and only once, a stay that
 * cannot be paid for must not become a voucher, and one guest's bookings must
 * never be visible from another's account.
 */

const TODAY = new Date(2026, 7, 21, 10, 0);
const IN = '2026-09-21';
const OUT = '2026-09-23';
const ctx = { ip: '10.99.0.41', userAgent: 'vitest' };

let counter = 0;

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Hotel Guest ${counter}`,
    email: `hotel-${Date.now()}-${counter}@example.com`,
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

/** A property in Pune, where a two-night stay fits comfortably in a wallet. */
function pick(): { hotel: Hotel; room: HotelRoom } {
  const result = searchHotels(
    { city: 'pune', checkIn: IN, checkOut: OUT, rooms: 1, adults: 2, children: [] },
    TODAY,
  );
  if (!result.ok) throw new Error(result.message);

  for (const hotel of result.hotels) {
    const room = hotel.rooms[0];
    // Two nights inside a single top-up, so the tests are about booking rather
    // than about topping up four times.
    if (room && quoteStay(room, { checkIn: IN, checkOut: OUT, rooms: 1 }).total < 900_000) {
      return { hotel, room };
    }
  }
  throw new Error('nothing affordable on the route');
}

function input(hotel: Hotel, room: HotelRoom, overrides: Record<string, unknown> = {}) {
  return {
    city: 'pune',
    checkIn: IN,
    checkOut: OUT,
    rooms: 1,
    adults: 2,
    childAges: [] as number[],
    hotelId: hotel.id,
    roomId: room.id,
    guestName: 'Asha Menon',
    ...overrides,
  };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('hotel booking: the money', () => {
  it('charges the rate times the nights times the rooms, and nothing the form said', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    const expected = quoteStay(room, { checkIn: IN, checkOut: OUT, rooms: 1 });

    const before = await getWalletSummary(userId);
    const result = await bookHotel(userId, input(hotel, room), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    expect(result.amount).toBe(expected.total);
    expect(result.nights).toBe(2);
    expect(result.rooms).toBe(1);

    const after = await getWalletSummary(userId);
    expect(before.balance - after.balance).toBe(expected.total);
  });

  it('charges two rooms twice', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const single = searchHotels(
      { city: 'pune', checkIn: IN, checkOut: OUT, rooms: 1, adults: 2, children: [] },
      TODAY,
    );
    const double = searchHotels(
      { city: 'pune', checkIn: IN, checkOut: OUT, rooms: 2, adults: 4, children: [] },
      TODAY,
    );
    if (!single.ok || !double.ok) throw new Error('search failed');

    const one = single.hotels[0];
    const two = double.hotels[0];
    const oneRoom = one?.rooms[0];
    const twoRoom = two?.rooms[0];
    if (!one || !two || !oneRoom || !twoRoom) throw new Error('no properties');

    const forOne = quoteStay(oneRoom, { checkIn: IN, checkOut: OUT, rooms: 1 });
    const forTwo = quoteStay(twoRoom, { checkIn: IN, checkOut: OUT, rooms: 2 });
    expect(forTwo.roomTotal).toBeGreaterThan(forOne.roomTotal * 1.9);
  });

  it('writes exactly one debit, tagged as a hotel booking', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    const result = await bookHotel(userId, input(hotel, room), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    const entries = await walletEntriesCollection();
    const debits = await entries.find({ userId: user._id, type: 'HOTEL' }).toArray();
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

    const { hotel, room } = pick();
    const before = await getWalletSummary(userId);

    const result = await bookHotel(userId, input(hotel, room), ctx, TODAY);
    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT_BALANCE' });

    expect((await getWalletSummary(userId)).balance).toBe(before.balance);
    const bookings = await hotelBookingsCollection();
    expect(await bookings.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe('hotel booking: what it refuses', () => {
  it('refuses a property that is not on this search', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    expect(
      await bookHotel(userId, input(hotel, room, { hotelId: 'goa-99' }), ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_HOTEL' });
  });

  it('refuses a destination it does not know', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    expect(
      await bookHotel(userId, input(hotel, room, { city: 'atlantis' }), ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_HOTEL' });
  });

  it('refuses a room the property does not offer', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    expect(
      await bookHotel(userId, input(hotel, room, { roomId: 'pune-1-r9' }), ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'UNKNOWN_ROOM' });
  });

  it('refuses a stay with no nights, or one in the past', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    expect(await bookHotel(userId, input(hotel, room, { checkOut: IN }), ctx, TODAY)).toMatchObject(
      { ok: false, code: 'BAD_STAY' },
    );
    expect(
      await bookHotel(
        userId,
        input(hotel, room, { checkIn: '2026-08-01', checkOut: '2026-08-03' }),
        ctx,
        TODAY,
      ),
    ).toMatchObject({ ok: false, code: 'BAD_STAY' });
  });

  it('refuses a party the search would refuse', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    expect(
      await bookHotel(userId, input(hotel, room, { rooms: 1, adults: 9 }), ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'BAD_STAY' });
  });

  it('refuses a missing or oversized guest name', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    expect(
      await bookHotel(userId, input(hotel, room, { guestName: '   ' }), ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'BAD_GUEST' });
    expect(
      await bookHotel(userId, input(hotel, room, { guestName: 'A'.repeat(61) }), ctx, TODAY),
    ).toMatchObject({ ok: false, code: 'BAD_GUEST' });
  });

  it('will not take an invented user id', async () => {
    const { hotel, room } = pick();
    expect(await bookHotel('not-an-id', input(hotel, room), ctx, TODAY)).toMatchObject({
      ok: false,
    });
  });
});

describe('hotel booking: the voucher', () => {
  it('snapshots the stay, so a later generator change cannot rewrite it', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    const quote = quoteStay(room, { checkIn: IN, checkOut: OUT, rooms: 1 });

    const result = await bookHotel(userId, input(hotel, room), ctx, TODAY);
    if (!result.ok) throw new Error(result.message);

    const bookings = await hotelBookingsCollection();
    const doc = await bookings.findOne({ reference: result.reference });
    expect(doc).toMatchObject({
      hotelId: hotel.id,
      hotelName: hotel.name,
      starRating: hotel.starRating,
      locality: hotel.locality,
      cityName: hotel.city.name,
      roomId: room.id,
      roomTier: room.tier,
      mealPlan: room.mealPlan,
      cancellation: room.cancellation,
      checkIn: IN,
      checkOut: OUT,
      nights: 2,
      rooms: 1,
      perNight: quote.perNight,
      taxRate: quote.taxRate,
      taxes: quote.taxes,
      amount: quote.total,
    });
  });

  it('tidies the guest name and keeps nothing else about them', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    const result = await bookHotel(
      userId,
      input(hotel, room, { guestName: '  Asha   Menon ' }),
      ctx,
      TODAY,
    );
    if (!result.ok) throw new Error(result.message);

    const bookings = await hotelBookingsCollection();
    const doc = await bookings.findOne({ reference: result.reference });
    expect(doc?.guestName).toBe('Asha Menon');
    // Nothing resembling an identity document or a contact detail.
    const keys = Object.keys(doc ?? {});
    for (const forbidden of ['email', 'phone', 'idNumber', 'passport', 'aadhaar']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('gives every booking its own reference', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    // Three stays, and a top-up is capped, so the wallet is filled three times.
    for (let index = 0; index < 3; index += 1) await fundWallet(userId, 10_000);

    const { hotel, room } = pick();
    const references = new Set<string>();

    for (let index = 0; index < 3; index += 1) {
      const result = await bookHotel(userId, input(hotel, room), ctx, TODAY);
      if (!result.ok) throw new Error(result.message);
      references.add(result.reference);
    }

    expect(references.size).toBe(3);
  });

  it('shows a guest their own bookings and no one else', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await fundWallet(mine._id.toHexString(), 10_000);
    await fundWallet(theirs._id.toHexString(), 10_000);

    const { hotel, room } = pick();
    const ours = await bookHotel(mine._id.toHexString(), input(hotel, room), ctx, TODAY);
    await bookHotel(theirs._id.toHexString(), input(hotel, room), ctx, TODAY);
    if (!ours.ok) throw new Error(ours.message);

    const listed = await listHotelBookings(mine._id.toHexString());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.reference).toBe(ours.reference);
    expect(await listHotelBookings('not-an-id')).toEqual([]);
  });
});
