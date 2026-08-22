import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { primeMembershipsCollection, usersCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import type { UserDoc } from '@/models/user';
import {
  amountToFreeShipping,
  calculateTotals,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
} from '@/services/pricing';
import { cancelPrime, getMembership, isPrimeMember, joinPrime, PRIME_PLANS_DETAILS } from '@/services/prime';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Prime verification.
 *
 * Two things matter: the membership must be paid for out of the wallet exactly
 * once, and the benefit must be a real change to the charged total rather than
 * a badge -- so the pricing rule is tested directly as well.
 */

let counter = 0;
const ctx = { ip: '10.99.0.11', userAgent: 'vitest' };

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Prime User ${counter}`,
    email: `prime-${Date.now()}-${counter}@example.com`,
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

/** Funds a wallet the honest way: a top-up settled by the test gateway. */
async function fundWallet(userId: string, rupees: number): Promise<void> {
  const topUp = await createTopUp(userId, rupeesToPaise(rupees));
  if (!topUp.ok) throw new Error('top-up refused');
  await completeTopUp(userId, topUp.entryId, MOCK_TEST_CARDS.success, ctx);
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('prime: joining', () => {
  it('refuses when the wallet cannot cover the plan', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    const result = await joinPrime(id, 'ANNUAL', ctx);
    expect(result.ok).toBe(false);
    expect(await isPrimeMember(id)).toBe(false);
  });

  it('charges the wallet exactly once and starts the membership', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 2000);

    const plan = PRIME_PLANS_DETAILS.find((entry) => entry.plan === 'ANNUAL');
    if (!plan) throw new Error('missing plan');

    const before = (await getWalletSummary(id)).balance;
    const result = await joinPrime(id, 'ANNUAL', ctx);
    const after = (await getWalletSummary(id)).balance;

    expect(result.ok).toBe(true);
    expect(before - after).toBe(plan.price);
    expect(await isPrimeMember(id)).toBe(true);
  });

  it('will not let an active member join again and pay twice', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    await joinPrime(id, 'MONTHLY', ctx);
    const balanceAfterFirst = (await getWalletSummary(id)).balance;

    const second = await joinPrime(id, 'MONTHLY', ctx);

    expect(second.ok).toBe(false);
    expect((await getWalletSummary(id)).balance).toBe(balanceAfterFirst);
  });

  it('keeps one membership row per customer', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    await joinPrime(id, 'MONTHLY', ctx);

    const memberships = await primeMembershipsCollection();
    expect(await memberships.countDocuments({ userId: user._id })).toBe(1);
  });

  it('rejects a plan that does not exist', async () => {
    const user = await makeUser();
    await fundWallet(user._id.toHexString(), 5000);

    // @ts-expect-error -- deliberately outside the union.
    const result = await joinPrime(user._id.toHexString(), 'FREE_FOREVER', ctx);
    expect(result.ok).toBe(false);
  });
});

describe('prime: expiry is the whole truth', () => {
  it('stops conferring membership once the date passes', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    await joinPrime(id, 'MONTHLY', ctx);

    expect(await isPrimeMember(id)).toBe(true);

    // A year on, without anything having to sweep the collection.
    const later = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    expect(await isPrimeMember(id, later)).toBe(false);
    expect((await getMembership(id, later))?.active).toBe(false);
  });
});

describe('prime: cancelling', () => {
  it('turns off renewal without ending the paid term', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    await joinPrime(id, 'MONTHLY', ctx);

    const result = await cancelPrime(id, ctx);
    expect(result.ok).toBe(true);

    const membership = await getMembership(id);
    expect(membership?.cancelledAt).not.toBeNull();
    // Still a member: they paid for the term.
    expect(membership?.active).toBe(true);
    expect(await isPrimeMember(id)).toBe(true);
  });

  it('refuses to cancel twice', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);
    await joinPrime(id, 'MONTHLY', ctx);

    await cancelPrime(id, ctx);
    expect((await cancelPrime(id, ctx)).ok).toBe(false);
  });

  it('refuses when there is no membership', async () => {
    const user = await makeUser();
    expect((await cancelPrime(user._id.toHexString(), ctx)).ok).toBe(false);
  });
});

describe('prime: the benefit is a real price change', () => {
  const smallBasket = [{ listPrice: rupeesToPaise(200), unitPrice: rupeesToPaise(200), quantity: 1 }];

  it('charges delivery below the threshold for a non-member', () => {
    const totals = calculateTotals(smallBasket);
    expect(totals.shipping).toBe(STANDARD_SHIPPING_FEE);
  });

  it('waives delivery for a member on the same basket', () => {
    const totals = calculateTotals(smallBasket, { freeShipping: true });
    expect(totals.shipping).toBe(0);
  });

  it('leaves the member total lower by exactly the delivery fee', () => {
    const guest = calculateTotals(smallBasket);
    const member = calculateTotals(smallBasket, { freeShipping: true });
    expect(guest.total - member.total).toBe(STANDARD_SHIPPING_FEE);
  });

  it('changes nothing on a basket already over the threshold', () => {
    const big = [{ listPrice: FREE_SHIPPING_THRESHOLD, unitPrice: FREE_SHIPPING_THRESHOLD, quantity: 1 }];
    expect(calculateTotals(big).total).toBe(calculateTotals(big, { freeShipping: true }).total);
  });

  it('never nags a member to spend more for a benefit they pay for', () => {
    const totals = calculateTotals(smallBasket);
    expect(amountToFreeShipping(totals)).toBeGreaterThan(0);
    expect(amountToFreeShipping(totals, true)).toBe(0);
  });

  it('keeps the total additively consistent either way', () => {
    for (const options of [{}, { freeShipping: true }]) {
      const totals = calculateTotals(smallBasket, options);
      expect(totals.total).toBe(totals.subtotal - totals.discount + totals.shipping + totals.tax);
    }
  });
});
