import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient, getMongoClient } from '@/lib/db/client';
import { seedDatabase } from '@/lib/db/seed';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import type { WalletEntryDoc } from '@/models/wallet';

/**
 * Re-seeding must not delete people.
 *
 * The seed used to empty the whole `users` collection, so refreshing the
 * catalogue silently removed every account anyone had registered -- and with
 * it their orders, their wallet and the audit trail. These tests pin the
 * behaviour that replaced it: the seed removes its own accounts and nobody
 * else's, unless it is explicitly told to reset.
 */

const DB_NAME = `amazon_next_seedkeep_${new ObjectId().toHexString().slice(-8)}`;
const REAL_EMAIL = 'someone.real@example.com';

const SEED_OPTIONS = {
  adminEmail: 'admin@example.com',
  adminPassword: 'TestSeedPassword2026!',
  demo: true,
  includeOrders: false,
};

async function db() {
  return (await getMongoClient()).db(DB_NAME);
}

/** A person who registered through the app, with money in their wallet. */
async function makeRealAccount(): Promise<ObjectId> {
  const target = await db();
  const now = new Date();
  const id = new ObjectId();

  const user: UserDoc = {
    _id: id,
    name: 'Someone Real',
    email: REAL_EMAIL,
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
  await target.collection<UserDoc>('users').insertOne(user);

  const entry: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: id,
    type: 'TOP_UP',
    direction: 'CREDIT',
    amount: rupeesToPaise(500),
    status: 'COMPLETED',
    currency: 'INR',
    reference: `WT-KEEP${Date.now()}`,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await target.collection<WalletEntryDoc>('walletEntries').insertOne(entry);

  return id;
}

beforeAll(async () => {
  await seedDatabase(await db(), SEED_OPTIONS);
}, 180_000);

afterAll(async () => {
  await (await getMongoClient()).db(DB_NAME).dropDatabase();
  await closeMongoClient();
});

describe('re-seeding with the default options', () => {
  it('leaves an account registered through the app, and its wallet, alone', async () => {
    const id = await makeRealAccount();

    await seedDatabase(await db(), { ...SEED_OPTIONS, skipIndexes: true });

    const target = await db();
    expect(await target.collection('users').countDocuments({ _id: id })).toBe(1);
    expect(await target.collection('walletEntries').countDocuments({ userId: id })).toBe(1);
  });

  it('still replaces its own accounts rather than duplicating them', async () => {
    const target = await db();

    await seedDatabase(target, { ...SEED_OPTIONS, skipIndexes: true });

    expect(await target.collection('users').countDocuments({ email: 'admin@example.com' })).toBe(1);
    expect(
      await target.collection('users').countDocuments({ email: 'customer1@example.com' }),
    ).toBe(1);
  });

  it('rebuilds the catalogue from scratch every time', async () => {
    const target = await db();
    const before = await target.collection('products').countDocuments();

    await seedDatabase(target, { ...SEED_OPTIONS, skipIndexes: true });

    expect(await target.collection('products').countDocuments()).toBe(before);
  });
});

describe('re-seeding with resetAccounts', () => {
  it('deletes every account and the rows attached to them', async () => {
    // Survived the default re-seeds above, which is the point of those tests.
    const existing = await (
      await db()
    )
      .collection<UserDoc>('users')
      .findOne({ email: REAL_EMAIL }, { projection: { _id: 1 } });
    const id = existing?._id ?? (await makeRealAccount());

    await seedDatabase(await db(), {
      ...SEED_OPTIONS,
      skipIndexes: true,
      resetAccounts: true,
    });

    const target = await db();
    expect(await target.collection('users').countDocuments({ _id: id })).toBe(0);
    expect(await target.collection('walletEntries').countDocuments({ userId: id })).toBe(0);
    // The seed's own accounts are back, and they are the only ones.
    expect(await target.collection('users').countDocuments({ email: REAL_EMAIL })).toBe(0);
  });
});
