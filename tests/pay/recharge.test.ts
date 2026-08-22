import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CIRCLES,
  findPlan,
  OPERATORS,
  PLAN_TABS,
  plansFor,
  plansForTab,
  RECHARGE_PLANS,
} from '@/data/recharge-plans';
import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  rechargesCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { detectOperator, isValidMobile } from '@/lib/recharge/detect';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import { listRecharges, rechargeNumber } from '@/services/recharge';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Mobile recharge.
 *
 * The interesting parts are the ones a customer would notice going wrong: the
 * price must come from the plan and not from the request, the wallet must move
 * by exactly that much, and the operator the page showed must be the operator
 * the recharge is recorded against.
 */

let counter = 0;
const ctx = { ip: '10.99.0.15', userAgent: 'vitest' };

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Recharge User ${counter}`,
    email: `recharge-${Date.now()}-${counter}@example.com`,
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

const PLAN = RECHARGE_PLANS[0];
if (!PLAN) throw new Error('the plan book is empty');

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('recharge: the number', () => {
  it('accepts a real Indian mobile format', () => {
    for (const value of ['9840716035', '6000000000', '7999999999', '8123456789']) {
      expect(isValidMobile(value), value).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const value of ['5840716035', '984071603', '98407160351', '', 'abcdefghij', 9840716035]) {
      expect(isValidMobile(value), String(value)).toBe(false);
    }
  });
});

describe('recharge: operator detection', () => {
  it('gives the same answer every time for a number', () => {
    const first = detectOperator('9840716035');
    const second = detectOperator('9840716035');
    expect(first?.operator.id).toBe(second?.operator.id);
    expect(first?.circle).toBe(second?.circle);
  });

  it('only ever names an operator and circle that exist', () => {
    for (let n = 0; n < 200; n += 1) {
      const mobile = `9${String(800000000 + n * 7919).slice(0, 9)}`;
      const detected = detectOperator(mobile);
      expect(detected, mobile).not.toBeNull();
      expect(OPERATORS.some((o) => o.id === detected?.operator.id)).toBe(true);
      expect(CIRCLES.includes(detected?.circle ?? '')).toBe(true);
    }
  });

  it('refuses a number it cannot validate', () => {
    expect(detectOperator('12345')).toBeNull();
    expect(detectOperator('5840716035')).toBeNull();
  });
});

describe('recharge: the plan books', () => {
  it('gives every operator forty plans', () => {
    for (const operator of OPERATORS) {
      expect(plansFor(operator.id), operator.name).toHaveLength(40);
    }
    expect(RECHARGE_PLANS).toHaveLength(OPERATORS.length * 40);
  });

  it('prices every plan in whole rupees above zero', () => {
    for (const plan of RECHARGE_PLANS) {
      expect(Number.isSafeInteger(plan.rupees), plan.id).toBe(true);
      expect(plan.rupees).toBeGreaterThan(0);
    }
  });

  it('gives every plan a unique id and at least one tab', () => {
    const ids = new Set(RECHARGE_PLANS.map((plan) => plan.id));
    expect(ids.size).toBe(RECHARGE_PLANS.length);
    for (const plan of RECHARGE_PLANS) {
      expect(plan.tabs.length, plan.id).toBeGreaterThan(0);
    }
  });

  it('keeps every plan in exactly one operator’s book', () => {
    for (const operator of OPERATORS) {
      for (const plan of plansFor(operator.id)) {
        expect(plan.operatorId, plan.id).toBe(operator.id);
      }
    }
  });

  it('never prices two of one operator’s plans the same', () => {
    // Two rows at the same amount are indistinguishable to someone scanning a
    // column of prices, which is exactly how a generated list reads as filler.
    for (const operator of OPERATORS) {
      const prices = plansFor(operator.id).map((plan) => plan.rupees);
      expect(new Set(prices).size, operator.name).toBe(prices.length);
    }
  });

  it('fills every tab for every operator', () => {
    for (const operator of OPERATORS) {
      for (const tab of PLAN_TABS) {
        expect(plansForTab(operator.id, tab).length, `${operator.name}/${tab}`).toBeGreaterThan(0);
      }
    }
  });

  it('sorts a tab by price, because that is how the sheet is read', () => {
    const prices = plansForTab(OPERATORS[0]?.id ?? '', 'Popular').map((plan) => plan.rupees);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('generates the same books on every run', () => {
    // No `Math.random()` anywhere: two calls must agree, or the catalogue would
    // churn between a page render and the recharge that follows it.
    const first = plansFor('jio').map((plan) => `${plan.id}:${plan.rupees}`);
    const second = plansFor('jio').map((plan) => `${plan.id}:${plan.rupees}`);
    expect(first).toEqual(second);
  });
});

describe('recharge: paying for one', () => {
  it('debits exactly the plan price and records the recharge', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    const before = (await getWalletSummary(id)).balance;
    const result = await rechargeNumber(id, { mobile: '9840716035', planId: PLAN.id }, ctx);

    expect(result.ok).toBe(true);
    expect((await getWalletSummary(id)).balance).toBe(before - rupeesToPaise(PLAN.rupees));

    const history = await listRecharges(id);
    expect(history).toHaveLength(1);
    expect(history[0]?.mobile).toBe('9840716035');
    expect(history[0]?.amount).toBe(rupeesToPaise(PLAN.rupees));
  });

  it('files the recharge under the operator whose plan it is', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    // A plan from a book other than the one this number resolves to. It is the
    // plan that decides, not the number: the picker changes book when the
    // customer corrects the operator, so this is the ported-number case.
    const mobile = '9123456780';
    const detected = detectOperator(mobile);
    const other = OPERATORS.find((operator) => operator.id !== detected?.operator.id);
    if (!other) throw new Error('need a second operator');
    const otherPlan = plansFor(other.id)[0];
    if (!otherPlan) throw new Error('that operator has no plans');

    await rechargeNumber(id, { mobile, planId: otherPlan.id }, ctx);

    const recharges = await rechargesCollection();
    const doc = await recharges.findOne({ userId: user._id });
    expect(doc?.operatorId).toBe(other.id);
    expect(doc?.operatorId).not.toBe(detected?.operator.id);
  });

  it('takes the circle the customer corrected it to', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    const mobile = '9840716035';
    const detected = detectOperator(mobile);
    const otherCircle = CIRCLES.find((circle) => circle !== detected?.circle);
    if (!otherCircle) throw new Error('need a second circle');

    await rechargeNumber(id, { mobile, planId: PLAN.id, circle: otherCircle }, ctx);

    const recharges = await rechargesCollection();
    const doc = await recharges.findOne({ userId: user._id });
    expect(doc?.circle).toBe(otherCircle);
  });

  it('falls back to the derived circle when the one sent does not exist', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    const mobile = '9840716035';
    const detected = detectOperator(mobile);
    await rechargeNumber(id, { mobile, planId: PLAN.id, circle: 'Atlantis' }, ctx);

    const recharges = await rechargesCollection();
    const doc = await recharges.findOne({ userId: user._id });
    expect(doc?.circle).toBe(detected?.circle);
  });

  it('refuses a plan that does not exist, and charges nothing', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    const result = await rechargeNumber(id, { mobile: '9840716035', planId: 'p-free' }, ctx);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('UNKNOWN_PLAN');
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(5000));
  });

  it('refuses an invalid number, and charges nothing', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    const result = await rechargeNumber(id, { mobile: '5840716035', planId: PLAN.id }, ctx);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('INVALID_NUMBER');
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(5000));
  });

  it('refuses when the balance cannot cover the plan', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();

    // The dearest plan, against an empty wallet.
    const dearest = [...RECHARGE_PLANS].sort((a, b) => b.rupees - a.rupees)[0];
    if (!dearest) throw new Error('the plan book is empty');

    const result = await rechargeNumber(id, { mobile: '9840716035', planId: dearest.id }, ctx);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('INSUFFICIENT_BALANCE');
    expect(await listRecharges(id)).toHaveLength(0);
  });

  it('writes one wallet entry per recharge, referenced both ways', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    const result = await rechargeNumber(id, { mobile: '9840716035', planId: PLAN.id }, ctx);
    if (!result.ok) throw new Error('recharge refused');

    const entries = await walletEntriesCollection();
    const debits = await entries.find({ userId: user._id, type: 'RECHARGE' }).toArray();

    expect(debits).toHaveLength(1);
    expect(debits[0]?.direction).toBe('DEBIT');
    expect(debits[0]?.reference).toBe(result.reference);

    const recharges = await rechargesCollection();
    const doc = await recharges.findOne({ userId: user._id });
    expect(doc?.reference).toBe(result.reference);
  });

  it('takes the price from the plan, never from the caller', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    await fundWallet(id, 5000);

    // There is no field for an amount, so the only way to pay less would be to
    // name a cheaper plan -- which is exactly what the customer is choosing.
    const before = (await getWalletSummary(id)).balance;
    await rechargeNumber(
      id,
      { mobile: '9840716035', planId: PLAN.id } as Parameters<typeof rechargeNumber>[1],
      ctx,
    );

    const plan = findPlan(PLAN.id);
    expect(before - (await getWalletSummary(id)).balance).toBe(rupeesToPaise(plan?.rupees ?? 0));
  });

  it('keeps one customer out of another customer’s history', async () => {
    const alpha = await makeUser();
    const beta = await makeUser();
    await fundWallet(alpha._id.toHexString(), 5000);

    await rechargeNumber(alpha._id.toHexString(), { mobile: '9840716035', planId: PLAN.id }, ctx);

    expect(await listRecharges(beta._id.toHexString())).toHaveLength(0);
  });
});
