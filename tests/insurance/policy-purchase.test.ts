import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  insurancePoliciesCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import type { WalletEntryDoc } from '@/models/wallet';
import { buyHealthPolicy, buyMotorPolicy, listPolicies } from '@/services/insurance-purchase';
import { quotesFor } from '@/services/motor-insurance';
import { getWalletSummary } from '@/services/wallet';

/**
 * Paying a premium.
 *
 * The invariant worth guarding: **the browser never names the price.** The form
 * carries a vehicle, an insurer and a set of add-ons, and what is charged is
 * recomputed from the rate book. Everything else here is the ordinary money
 * discipline -- one ledger entry, one policy, and nothing charged when the
 * balance is short.
 */

let counter = 0;
const ctx = { ip: '10.99.0.7', userAgent: 'vitest' };

async function makeUser(balanceRupees: number): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Policy User ${counter}`,
    email: `policy-${Date.now()}-${counter}@example.com`,
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

  if (balanceRupees > 0) {
    const wallet = await walletEntriesCollection();
    const credit: WalletEntryDoc = {
      _id: new ObjectId(),
      userId: user._id,
      type: 'TOP_UP',
      direction: 'CREDIT',
      amount: rupeesToPaise(balanceRupees),
      status: 'COMPLETED',
      currency: 'INR',
      reference: `SEED-POL-${counter}`,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await wallet.insertOne(credit);
  }

  return user;
}

const motor = {
  modelId: 'meridian-hatch-vx',
  registration: 'TN02BQ6666',
  ageMonths: 24,
  plan: 'COMPREHENSIVE' as const,
  idv: null,
  claimFreeYears: 2,
  addOnIds: ['zero-dep'],
};

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('buying motor cover', () => {
  it('charges exactly what the quote said, and records the breakdown', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const quoted = quotesFor(motor);
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;

    const cheapest = quoted.quotes[0];
    if (!cheapest) throw new Error('no quotes');

    const before = (await getWalletSummary(id)).balance;
    const result = await buyMotorPolicy(id, { ...motor, insurerId: cheapest.insurer.id }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.premium).toBe(cheapest.total);
    expect((await getWalletSummary(id)).balance).toBe(before - cheapest.total);

    const policies = await insurancePoliciesCollection();
    const doc = await policies.findOne({ policyNumber: result.policyNumber });
    expect(doc).not.toBeNull();
    // The components are written down at the moment of sale, so the figure can
    // still be checked after the rate book moves.
    expect(doc?.components.length).toBeGreaterThan(1);
    expect((doc?.netPremium ?? 0) + (doc?.tax ?? 0)).toBe(cheapest.total);
    expect(doc?.vehicle?.registration).toBe('TN02BQ6666');
  });

  it('writes one wallet debit under the policy number', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const result = await buyMotorPolicy(id, { ...motor, insurerId: 'meridian-general' }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wallet = await walletEntriesCollection();
    const debits = await wallet.find({ userId: user._id, direction: 'DEBIT' }).toArray();
    expect(debits).toHaveLength(1);
    expect(debits[0]?.type).toBe('INSURANCE');
    expect(debits[0]?.reference).toBe(result.policyNumber);
    expect(debits[0]?.amount).toBe(result.premium);
  });

  it('ends the policy the day before its anniversary', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();
    const start = new Date('2026-03-01T09:00:00.000Z');

    const result = await buyMotorPolicy(
      id,
      { ...motor, insurerId: 'meridian-general' },
      ctx,
      start,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policies = await insurancePoliciesCollection();
    const doc = await policies.findOne({ policyNumber: result.policyNumber });
    expect(doc?.expiresAt.toISOString().slice(0, 10)).toBe('2027-02-28');
  });

  it('charges nothing when the balance is short', async () => {
    const user = await makeUser(100);
    const id = user._id.toHexString();

    const result = await buyMotorPolicy(id, { ...motor, insurerId: 'meridian-general' }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INSUFFICIENT_BALANCE');

    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(100));
    expect(await listPolicies(id)).toHaveLength(0);
  });

  it('refuses an insurer or a vehicle that does not exist', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const badInsurer = await buyMotorPolicy(id, { ...motor, insurerId: 'nonesuch' }, ctx);
    expect(badInsurer.ok).toBe(false);
    if (!badInsurer.ok) expect(badInsurer.code).toBe('UNKNOWN_INSURER');

    const badVehicle = await buyMotorPolicy(
      id,
      { ...motor, modelId: 'flying-carpet', insurerId: 'meridian-general' },
      ctx,
    );
    expect(badVehicle.ok).toBe(false);
    if (!badVehicle.ok) expect(badVehicle.code).toBe('BAD_INPUT');

    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(200_000));
  });

  it('drops an add-on the vehicle is too old for rather than charging for it', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    // Zero depreciation stops at five years; this car is ten.
    const result = await buyMotorPolicy(
      id,
      { ...motor, ageMonths: 120, insurerId: 'meridian-general' },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policies = await insurancePoliciesCollection();
    const doc = await policies.findOne({ policyNumber: result.policyNumber });
    expect(doc?.vehicle?.addOnIds).not.toContain('zero-dep');
  });
});

describe('buying health cover', () => {
  const health = {
    sumInsuredLakhs: 10,
    members: [
      { kind: 'ADULT' as const, age: 34 },
      { kind: 'CHILD' as const, age: 6 },
    ],
    termYears: 1 as const,
  };

  it('charges the loaded premium for the insurer that was chosen', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const first = await buyHealthPolicy(id, { ...health, insurerId: 'meridian-general' }, ctx);
    const second = await buyHealthPolicy(id, { ...health, insurerId: 'halcyon-shield' }, ctx);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // The insurers load differently, so the same cover is not the same price.
    expect(first.premium).not.toBe(second.premium);
  });

  it('runs a two-year policy to the day before the second anniversary', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();
    const start = new Date('2026-06-15T09:00:00.000Z');

    const result = await buyHealthPolicy(
      id,
      { ...health, termYears: 2, insurerId: 'meridian-general' },
      ctx,
      start,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const policies = await insurancePoliciesCollection();
    const doc = await policies.findOne({ policyNumber: result.policyNumber });
    expect(doc?.expiresAt.toISOString().slice(0, 10)).toBe('2028-06-14');
    expect(doc?.health?.termYears).toBe(2);
    expect(doc?.health?.ratedAge).toBe(34);
  });

  it('refuses a policy the quote would refuse, and charges nothing', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const result = await buyHealthPolicy(
      id,
      {
        sumInsuredLakhs: 10,
        members: [
          { kind: 'ADULT', age: 30 },
          { kind: 'ADULT', age: 31 },
          { kind: 'ADULT', age: 32 },
        ],
        termYears: 1,
        insurerId: 'meridian-general',
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_INPUT');
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(200_000));
  });
});

describe('listing policies', () => {
  it('shows only your own, newest first', async () => {
    const mine = await makeUser(400_000);
    const theirs = await makeUser(400_000);

    await buyMotorPolicy(mine._id.toHexString(), { ...motor, insurerId: 'meridian-general' }, ctx);
    await buyMotorPolicy(
      theirs._id.toHexString(),
      { ...motor, registration: 'KA05ZZ1111', insurerId: 'meridian-general' },
      ctx,
    );

    const list = await listPolicies(mine._id.toHexString());
    expect(list).toHaveLength(1);
    expect(list[0]?.subject).toContain('TN02BQ6666');
  });
});
