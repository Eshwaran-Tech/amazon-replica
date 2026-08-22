import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FREE_TITLES,
  INCLUDED_TITLES,
  RENTAL_TITLES,
  VIDEO_CHANNELS,
} from '@/data/video-catalogue';
import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { usersCollection, videoEntitlementsCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import { mintGiftCards, redeemGiftCard } from '@/services/gift-cards';
import {
  CHANNEL_WINDOW_DAYS,
  listEntitlements,
  RENTAL_WINDOW_HOURS,
  rentTitle,
  subscribeChannel,
} from '@/services/video';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Prime Video verification.
 *
 * A rental is only worth anything if the money actually left the wallet and the
 * entitlement actually expires, so both are checked against the ledger rather
 * than against the return value.
 */

let counter = 0;
const ctx = { ip: '10.99.0.12', userAgent: 'vitest' };

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Video User ${counter}`,
    email: `video-${Date.now()}-${counter}@example.com`,
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

/** Funds a wallet purely from a gift card, with no top-up behind it. */
async function fundWithGiftCard(userId: string, rupees: number): Promise<void> {
  const [card] = await mintGiftCards(rupeesToPaise(rupees), 1);
  if (!card) throw new Error('minting produced no card');
  const result = await redeemGiftCard(userId, card.code, ctx);
  if (!result.ok) throw new Error('redemption refused');
}

/** The catalogue is a fixed array, but the compiler cannot know that. */
function fixture<T>(value: T | undefined, what: string): T {
  if (!value) throw new Error(`the catalogue is missing its ${what}`);
  return value;
}

const RENTAL = fixture(RENTAL_TITLES[0], 'first rental');
const SECOND_RENTAL = fixture(RENTAL_TITLES[3], 'fourth rental');
const INCLUDED = fixture(INCLUDED_TITLES[0], 'first included title');
const FREE = fixture(FREE_TITLES[0], 'first free title');
const CHANNEL = fixture(VIDEO_CHANNELS[0], 'first channel');

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('video: renting', () => {
  it('refuses when the wallet cannot cover the rental', async () => {
    const id = (await makeUser())._id.toHexString();

    const result = await rentTitle(id, RENTAL.id, ctx);

    expect(result.ok).toBe(false);
    expect(await listEntitlements(id)).toHaveLength(0);
  });

  it('charges the wallet exactly the listed price and grants the title', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);

    const before = (await getWalletSummary(id)).balance;
    const result = await rentTitle(id, RENTAL.id, ctx);
    const after = (await getWalletSummary(id)).balance;

    expect(result.ok).toBe(true);
    expect(before - after).toBe(rupeesToPaise(RENTAL.rentRupees));
    expect(await listEntitlements(id)).toEqual([
      expect.objectContaining({ kind: 'RENTAL', refId: RENTAL.id }),
    ]);
  });

  it('will not charge twice for a rental that is still running', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);

    await rentTitle(id, RENTAL.id, ctx);
    const afterFirst = (await getWalletSummary(id)).balance;

    const second = await rentTitle(id, RENTAL.id, ctx);

    expect(second.ok).toBe(false);
    expect(second.ok === false && second.code).toBe('ALREADY_HELD');
    expect((await getWalletSummary(id)).balance).toBe(afterFirst);
  });

  it('keeps one entitlement row per title', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 1000);
    await rentTitle(id, RENTAL.id, ctx);
    await rentTitle(id, RENTAL.id, ctx);

    const entitlements = await videoEntitlementsCollection();
    expect(
      await entitlements.countDocuments({ userId: user._id, kind: 'RENTAL', refId: RENTAL.id }),
    ).toBe(1);
  });

  it('refuses a title that is not on the rental shelf', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);

    const included = await rentTitle(id, INCLUDED.id, ctx);
    const free = await rentTitle(id, FREE.id, ctx);
    const invented = await rentTitle(id, 'no-such-film', ctx);

    for (const result of [included, free, invented]) {
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe('UNKNOWN');
    }
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(1000));
  });
});

describe('video: subscribing', () => {
  it('charges the monthly price and grants the channel', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);

    const before = (await getWalletSummary(id)).balance;
    const result = await subscribeChannel(id, CHANNEL.id, ctx);

    expect(result.ok).toBe(true);
    expect(before - (await getWalletSummary(id)).balance).toBe(rupeesToPaise(CHANNEL.priceRupees));
    expect(await listEntitlements(id)).toEqual([
      expect.objectContaining({ kind: 'CHANNEL', refId: CHANNEL.id }),
    ]);
  });

  it('refuses a channel that does not exist', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);

    const result = await subscribeChannel(id, 'not-a-channel', ctx);

    expect(result.ok).toBe(false);
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(1000));
  });

  it('keeps a rental and a channel apart', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);

    await rentTitle(id, RENTAL.id, ctx);
    await subscribeChannel(id, CHANNEL.id, ctx);

    const held = await listEntitlements(id);
    expect(held.map((entry) => entry.kind).sort()).toEqual(['CHANNEL', 'RENTAL']);
  });
});

describe('video: expiry is the whole truth', () => {
  it('drops the rental once the window passes and lets it be rented again', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);
    await rentTitle(id, RENTAL.id, ctx);

    const later = new Date(Date.now() + (RENTAL_WINDOW_HOURS + 1) * 60 * 60 * 1000);

    expect(await listEntitlements(id, later)).toHaveLength(0);

    const again = await rentTitle(id, RENTAL.id, ctx, later);
    expect(again.ok).toBe(true);
  });

  it('runs a channel for its full window and no longer', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 1000);
    await subscribeChannel(id, CHANNEL.id, ctx);

    const dayBefore = new Date(Date.now() + (CHANNEL_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000);
    const dayAfter = new Date(Date.now() + (CHANNEL_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000);

    expect(await listEntitlements(id, dayBefore)).toHaveLength(1);
    expect(await listEntitlements(id, dayAfter)).toHaveLength(0);
  });
});

describe('wallet: spending is charged against the whole balance', () => {
  it('draws a rental out of gift-card money when there is no top-up behind it', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWithGiftCard(id, 1000);

    const before = await getWalletSummary(id);
    expect(before.balance).toBe(rupeesToPaise(1000));
    expect(before.giftCards).toBe(rupeesToPaise(1000));

    expect((await rentTitle(id, RENTAL.id, ctx)).ok).toBe(true);

    const after = await getWalletSummary(id);
    expect(after.balance).toBe(rupeesToPaise(1000) - rupeesToPaise(RENTAL.rentRupees));
    // The split must still add up, whichever bucket the money came from.
    expect(after.wallet + after.giftCards).toBe(after.balance);
  });

  it('spends top-up money before gift-card money', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWallet(id, 100);
    await fundWithGiftCard(id, 1000);

    expect((await rentTitle(id, RENTAL.id, ctx)).ok).toBe(true);

    const after = await getWalletSummary(id);
    expect(after.wallet).toBe(0);
    expect(after.giftCards).toBe(after.balance);
  });

  it('never lets a purchase be forgiven by an empty bucket', async () => {
    const id = (await makeUser())._id.toHexString();
    await fundWithGiftCard(id, 200);

    // Two rentals at 149 each: the second must be refused, not silently free.
    const first = await rentTitle(id, RENTAL.id, ctx);
    const second = await rentTitle(id, SECOND_RENTAL.id, ctx);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.ok === false && second.code).toBe('INSUFFICIENT_BALANCE');
  });
});
