import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { usersCollection, walletEntriesCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import { MAX_WALLET_BALANCE_RUPEES, topUpSchema } from '@/lib/validations/wallet';
import type { UserDoc } from '@/models/user';
import { completeTopUp, createTopUp, getWalletSummary, listWalletEntries } from '@/services/wallet';

/**
 * Wallet verification.
 *
 * The invariants that matter for money: a pending top-up is worth nothing
 * until a payment completes it, a declined card credits nothing, the same
 * top-up cannot be paid twice, one customer cannot settle another's top-up,
 * and the balance always equals the ledger underneath it.
 */

let counter = 0;
const ctx = { ip: '10.99.0.7', userAgent: 'vitest' };

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Wallet User ${counter}`,
    email: `wallet-${Date.now()}-${counter}@example.com`,
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

/** Sums the ledger independently, so the service cannot mark its own homework. */
async function ledgerBalance(userId: string): Promise<number> {
  const entries = await walletEntriesCollection();
  const docs = await entries.find({ userId: new ObjectId(userId), status: 'COMPLETED' }).toArray();
  return docs.reduce((sum, doc) => sum + (doc.direction === 'CREDIT' ? doc.amount : -doc.amount), 0);
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('wallet: amount validation', () => {
  it('rejects amounts a browser should never get away with', () => {
    for (const amount of [0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001]) {
      expect(topUpSchema.safeParse({ amountRupees: amount }).success, String(amount)).toBe(false);
    }
  });

  it('accepts whole rupee amounts up to the cap', () => {
    for (const amount of [1, 500, 10_000]) {
      expect(topUpSchema.safeParse({ amountRupees: amount }).success, String(amount)).toBe(true);
    }
  });
});

describe('wallet: a top-up is worth nothing until it is paid', () => {
  it('leaves the balance at zero while the entry is pending', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const created = await createTopUp(id, rupeesToPaise(1000));
    expect(created.ok).toBe(true);

    const summary = await getWalletSummary(id);
    expect(summary.balance).toBe(0);
    expect(summary.pending).toBe(rupeesToPaise(1000));
    expect(await ledgerBalance(id)).toBe(0);
  });

  it('credits the wallet only after a successful card', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const created = await createTopUp(id, rupeesToPaise(2500));
    if (!created.ok) throw new Error('top-up was not created');

    const paid = await completeTopUp(id, created.entryId, MOCK_TEST_CARDS.success, ctx);
    expect(paid.ok).toBe(true);

    const summary = await getWalletSummary(id);
    expect(summary.balance).toBe(rupeesToPaise(2500));
    expect(summary.pending).toBe(0);
    // The derived figure and the ledger must agree.
    expect(summary.balance).toBe(await ledgerBalance(id));
  });

  it('credits nothing when the card is declined', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const created = await createTopUp(id, rupeesToPaise(700));
    if (!created.ok) throw new Error('top-up was not created');

    const declined = await completeTopUp(id, created.entryId, MOCK_TEST_CARDS.declined, ctx);
    expect(declined.ok).toBe(false);

    const summary = await getWalletSummary(id);
    expect(summary.balance).toBe(0);
    expect(summary.pending).toBe(0); // it is FAILED, not still pending
    expect(await ledgerBalance(id)).toBe(0);
  });

  it('rejects a card number that is not a recognised test card', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const created = await createTopUp(id, rupeesToPaise(400));
    if (!created.ok) throw new Error('top-up was not created');

    const result = await completeTopUp(id, created.entryId, '1234567812345678', ctx);
    expect(result.ok).toBe(false);
    expect(await ledgerBalance(id)).toBe(0);
  });
});

describe('wallet: a top-up cannot be paid twice', () => {
  it('credits once even when the same entry is settled again', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const created = await createTopUp(id, rupeesToPaise(1500));
    if (!created.ok) throw new Error('top-up was not created');

    const first = await completeTopUp(id, created.entryId, MOCK_TEST_CARDS.success, ctx);
    const second = await completeTopUp(id, created.entryId, MOCK_TEST_CARDS.success, ctx);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await ledgerBalance(id)).toBe(rupeesToPaise(1500));
  });

  it('credits once when two payments race the same entry', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const created = await createTopUp(id, rupeesToPaise(800));
    if (!created.ok) throw new Error('top-up was not created');

    const [a, b] = await Promise.all([
      completeTopUp(id, created.entryId, MOCK_TEST_CARDS.success, ctx),
      completeTopUp(id, created.entryId, MOCK_TEST_CARDS.success, ctx),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await ledgerBalance(id)).toBe(rupeesToPaise(800));
  });
});

describe('wallet: ownership', () => {
  it('will not let one customer settle another customer top-up', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();

    const created = await createTopUp(owner._id.toHexString(), rupeesToPaise(900));
    if (!created.ok) throw new Error('top-up was not created');

    const attempt = await completeTopUp(
      stranger._id.toHexString(),
      created.entryId,
      MOCK_TEST_CARDS.success,
      ctx,
    );

    expect(attempt.ok).toBe(false);
    expect(await ledgerBalance(owner._id.toHexString())).toBe(0);
    expect(await ledgerBalance(stranger._id.toHexString())).toBe(0);
  });

  it('never shows one customer another customer entries', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();

    const created = await createTopUp(owner._id.toHexString(), rupeesToPaise(300));
    if (!created.ok) throw new Error('top-up was not created');

    expect(await listWalletEntries(stranger._id.toHexString())).toHaveLength(0);
    expect(await listWalletEntries(owner._id.toHexString())).toHaveLength(1);
  });
});

describe('wallet: balance cap', () => {
  it('refuses a top-up that would take the wallet over the cap', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const first = await createTopUp(id, rupeesToPaise(10_000));
    if (!first.ok) throw new Error('top-up was not created');
    await completeTopUp(id, first.entryId, MOCK_TEST_CARDS.success, ctx);

    // Pending entries count towards the cap, so many tabs cannot each slip
    // under it and collectively exceed it.
    const overshoot = await createTopUp(id, rupeesToPaise(MAX_WALLET_BALANCE_RUPEES));
    expect(overshoot.ok).toBe(false);
  });
});

describe('wallet: malformed identifiers', () => {
  it('treats a non-ObjectId as not found rather than throwing', async () => {
    const user = await makeUser();
    const result = await completeTopUp(user._id.toHexString(), 'not-an-id', MOCK_TEST_CARDS.success, ctx);
    expect(result.ok).toBe(false);
    expect(await getWalletSummary('not-an-id')).toEqual({
      balance: 0,
      wallet: 0,
      giftCards: 0,
      pending: 0,
    });
  });
});
