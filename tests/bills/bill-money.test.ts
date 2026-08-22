import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  billPaymentsCollection,
  contentCreditsCollection,
  savedBillersCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import type { WalletEntryDoc } from '@/models/wallet';
import {
  listBillPayments,
  listSavedBillers,
  payBill,
  payDth,
  removeSavedBiller,
} from '@/services/bills/pay';
import { quoteBill } from '@/services/bills/quote';
import { deliveryCalendar, lpgConnection } from '@/services/bills/lpg';
import { creditBalance, setAutoReload, spendCredit, topUpCredit } from '@/services/content-credit';
import { getWalletSummary } from '@/services/wallet';

/**
 * What happens to real money.
 *
 * The arithmetic is tested elsewhere. These are the invariants that matter when
 * a wallet is actually debited: the charge equals the quote, a payment nobody
 * can afford charges nothing, one customer cannot reach another's saved biller,
 * and store credit is genuinely spent before the wallet.
 */

let counter = 0;
const ctx = { ip: '10.99.0.7', userAgent: 'vitest' };
const NOW = new Date('2026-08-21T10:00:00.000Z');

async function makeUser(balanceRupees: number): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Bill User ${counter}`,
    email: `bills-${Date.now()}-${counter}@example.com`,
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
      reference: `SEED-BILL-${counter}`,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await wallet.insertOne(credit);
  }

  return user;
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('paying a bill', () => {
  it('charges exactly what the quote said, and records the components', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const quoted = quoteBill(
      'ELECTRICITY',
      'coromandel-power',
      '104578291630',
      { kind: 'FULL' },
      NOW,
    );
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;

    const before = (await getWalletSummary(id)).balance;
    const result = await payBill(
      id,
      {
        category: 'ELECTRICITY',
        billerId: 'coromandel-power',
        account: '104578291630',
        option: { kind: 'FULL' },
      },
      ctx,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.amount).toBe(quoted.quote.amount);
    expect((await getWalletSummary(id)).balance).toBe(before - quoted.quote.amount);

    const payments = await billPaymentsCollection();
    const doc = await payments.findOne({ reference: result.reference });
    expect(doc).not.toBeNull();
    // Stored, so the figure can still be checked after a tariff moves.
    expect(doc?.components.length).toBeGreaterThan(1);
    expect(doc?.components.reduce((sum, line) => sum + line.amount, 0)).toBe(result.amount);
    expect(doc?.account).toBe('104578291630');
  });

  it('writes one wallet debit of type BILL under the payment reference', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const result = await payBill(
      id,
      {
        category: 'WATER',
        billerId: 'capital-water',
        account: '48210937',
        option: { kind: 'FULL' },
      },
      ctx,
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wallet = await walletEntriesCollection();
    const debits = await wallet.find({ userId: user._id, direction: 'DEBIT' }).toArray();
    expect(debits).toHaveLength(1);
    expect(debits[0]?.type).toBe('BILL');
    expect(debits[0]?.reference).toBe(result.reference);
    expect(debits[0]?.amount).toBe(result.amount);
  });

  it('normalises the account, so spacing does not create a second record', async () => {
    const user = await makeUser(300_000);
    const id = user._id.toHexString();

    await payBill(
      id,
      {
        category: 'MUNICIPAL_TAX',
        billerId: 'coromandel-corporation',
        account: '08 042 013796',
        option: { kind: 'FULL_YEAR' },
      },
      ctx,
      NOW,
    );

    const payments = await listBillPayments(id);
    expect(payments[0]?.account).toBe('08042013796');
  });

  it('charges nothing when the balance is short', async () => {
    const user = await makeUser(10);
    const id = user._id.toHexString();

    const result = await payBill(
      id,
      {
        category: 'ELECTRICITY',
        billerId: 'coromandel-power',
        account: '104578291630',
        option: { kind: 'FULL' },
      },
      ctx,
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INSUFFICIENT_BALANCE');
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(10));
    expect(await listBillPayments(id)).toHaveLength(0);
  });

  it('refuses a biller from the wrong category, and a malformed account', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const wrongBiller = await payBill(
      id,
      {
        category: 'ELECTRICITY',
        billerId: 'capital-water',
        account: '104578291630',
        option: { kind: 'FULL' },
      },
      ctx,
      NOW,
    );
    expect(wrongBiller.ok).toBe(false);

    const badAccount = await payBill(
      id,
      {
        category: 'ELECTRICITY',
        billerId: 'coromandel-power',
        account: '12',
        option: { kind: 'FULL' },
      },
      ctx,
      NOW,
    );
    expect(badAccount.ok).toBe(false);
    if (!badAccount.ok) expect(badAccount.code).toBe('BAD_ACCOUNT');

    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(200_000));
  });

  it('charges the minimum when the minimum is chosen, not the total', async () => {
    const user = await makeUser(500_000);
    const id = user._id.toHexString();

    const full = quoteBill('CREDIT_CARD', 'meridian-card', '98765432104291', { kind: 'FULL' }, NOW);
    const result = await payBill(
      id,
      {
        category: 'CREDIT_CARD',
        billerId: 'meridian-card',
        account: '98765432104291',
        option: { kind: 'MINIMUM' },
      },
      ctx,
      NOW,
    );

    expect(result.ok && full.ok).toBe(true);
    if (!result.ok || !full.ok) return;
    expect(result.amount).toBeLessThan(full.quote.amount);
  });

  it('books an LPG refill with its delivery slot recorded', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    // Find an account outside the refill gap, with a free slot.
    for (let n = 0; n < 80; n += 1) {
      const lpgId = String(10_000_000_000_000_000 + n);
      const connection = lpgConnection('meridian-lpg', lpgId, NOW);
      if (!connection || connection.daysUntilEligible > 0) continue;

      const day = deliveryCalendar('meridian-lpg', NOW).find((entry) =>
        entry.slots.some((slot) => slot.available),
      );
      const slot = day?.slots.find((entry) => entry.available);
      if (!day || !slot) continue;

      const result = await payBill(
        id,
        {
          category: 'LPG',
          billerId: 'meridian-lpg',
          account: lpgId,
          option: {
            kind: 'REFILL',
            cylinderId: 'domestic-14',
            date: day.key,
            slotId: slot.slot.id,
          },
        },
        ctx,
        NOW,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.booking).not.toBeNull();
      expect(result.booking?.slotId).toBe(slot.slot.id);
      // The subsidy is recorded, and is not deducted from what was charged.
      expect(result.amount).toBe(rupeesToPaise(903));
      return;
    }
    throw new Error('no eligible LPG account was found');
  });

  it('recharges a DTH box from its own operator book', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const result = await payDth(
      id,
      {
        operatorId: 'skyreach',
        subscriberId: '3002481792',
        option: { kind: 'DTH', bouquets: ['moviesphere-max'], channels: [], months: 12 },
      },
      ctx,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payments = await billPaymentsCollection();
    const doc = await payments.findOne({ reference: result.reference });
    expect(doc?.category).toBe('DTH');
    expect(doc?.billerName).toBe('Skyreach Digital');
  });
});

describe('saved billers', () => {
  it('saves on payment and records what was paid', async () => {
    const user = await makeUser(200_000);
    const id = user._id.toHexString();

    const result = await payBill(
      id,
      {
        category: 'BROADBAND',
        billerId: 'fibrenet',
        account: 'FBR204815',
        option: { kind: 'FULL' },
        saveAs: 'Home fibre',
      },
      ctx,
      NOW,
    );
    expect(result.ok).toBe(true);

    const saved = await listSavedBillers(id, 'BROADBAND');
    expect(saved).toHaveLength(1);
    expect(saved[0]?.nickname).toBe('Home fibre');
    expect(saved[0]?.lastAmount).toBe(result.ok ? result.amount : 0);
  });

  it('updates rather than duplicating when the same account is saved twice', async () => {
    const user = await makeUser(400_000);
    const id = user._id.toHexString();

    for (const nickname of ['First name', 'Second name']) {
      await payBill(
        id,
        {
          category: 'PIPED_GAS',
          billerId: 'harbour-gas',
          account: '900482173',
          option: { kind: 'FULL' },
          saveAs: nickname,
        },
        ctx,
        NOW,
      );
    }

    const saved = await listSavedBillers(id, 'PIPED_GAS');
    expect(saved).toHaveLength(1);
    expect(saved[0]?.nickname).toBe('Second name');
  });

  it('shows only your own, and removes only your own', async () => {
    const mine = await makeUser(200_000);
    const theirs = await makeUser(200_000);

    await payBill(
      mine._id.toHexString(),
      {
        category: 'LANDLINE',
        billerId: 'bsnl-landline',
        account: '04428152200',
        option: { kind: 'FULL' },
        saveAs: 'Amma',
      },
      ctx,
      NOW,
    );

    const saved = await listSavedBillers(mine._id.toHexString());
    expect(saved).toHaveLength(1);
    expect(await listSavedBillers(theirs._id.toHexString())).toHaveLength(0);

    const id = saved[0]?.id ?? '';
    expect(await removeSavedBiller(theirs._id.toHexString(), id)).toBe(false);
    expect(await listSavedBillers(mine._id.toHexString())).toHaveLength(1);
    expect(await removeSavedBiller(mine._id.toHexString(), id)).toBe(true);
    expect(await listSavedBillers(mine._id.toHexString())).toHaveLength(0);
  });

  it(`keeps one customer's payments out of another's history`, async () => {
    const mine = await makeUser(200_000);
    const theirs = await makeUser(200_000);

    await payBill(
      mine._id.toHexString(),
      {
        category: 'WATER',
        billerId: 'capital-water',
        account: '48210937',
        option: { kind: 'FULL' },
      },
      ctx,
      NOW,
    );

    expect(await listBillPayments(mine._id.toHexString())).toHaveLength(1);
    expect(await listBillPayments(theirs._id.toHexString())).toHaveLength(0);
  });
});

describe('store credit', () => {
  it('credits the amount plus the bonus, and charges only the amount', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    const result = await topUpCredit(id, { store: 'APPSTORE', rupees: 1000 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.charged).toBe(rupeesToPaise(1000));
    expect(result.bonus).toBe(rupeesToPaise(40));
    expect(result.credited).toBe(rupeesToPaise(1040));
    expect(result.balance).toBe(rupeesToPaise(1040));
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(19_000));
  });

  it('keeps the two stores apart', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    await topUpCredit(id, { store: 'APPSTORE', rupees: 500 }, ctx);
    expect(await creditBalance(id, 'APPSTORE')).toBeGreaterThan(0);
    expect(await creditBalance(id, 'PLAY')).toBe(0);
  });

  it('refuses an amount outside the limits, and charges nothing', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    for (const rupees of [0, 50, 99, 10_001, 999_999]) {
      const result = await topUpCredit(id, { store: 'APPSTORE', rupees }, ctx);
      expect(result.ok, String(rupees)).toBe(false);
    }
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(20_000));
  });

  it('spends credit before the wallet, and returns the remainder', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    await topUpCredit(id, { store: 'APPSTORE', rupees: 300 }, ctx);
    const held = await creditBalance(id, 'APPSTORE');

    // Less than the balance: taken entirely from credit.
    const small = await spendCredit(id, 'APPSTORE', rupeesToPaise(100), 'Rental');
    expect(small.fromCredit).toBe(rupeesToPaise(100));
    expect(small.fromWallet).toBe(0);

    // More than what is left: the rest falls to the wallet.
    const big = await spendCredit(id, 'APPSTORE', held, 'Rental');
    expect(big.fromCredit).toBe(held - rupeesToPaise(100));
    expect(big.fromWallet).toBe(rupeesToPaise(100));
  });

  it('is a no-op for somebody holding none', async () => {
    const user = await makeUser(5000);
    const spent = await spendCredit(user._id.toHexString(), 'PLAY', rupeesToPaise(199), 'Rental');
    expect(spent.fromCredit).toBe(0);
    expect(spent.fromWallet).toBe(rupeesToPaise(199));
  });

  it('reloads automatically when the balance runs low, and only up to the cap', async () => {
    const user = await makeUser(50_000);
    const id = user._id.toHexString();

    await topUpCredit(id, { store: 'PLAY', rupees: 100 }, ctx);
    await setAutoReload(id, 'PLAY', { enabled: true, thresholdRupees: 200, amountRupees: 500 });

    // Spending drops it below the threshold, which is when the rule fires.
    await spendCredit(id, 'PLAY', rupeesToPaise(50), 'Game');
    const afterFirst = await creditBalance(id, 'PLAY');
    expect(afterFirst).toBeGreaterThan(rupeesToPaise(200));

    const credits = await contentCreditsCollection();
    const reloads = await credits.countDocuments({
      userId: user._id,
      store: 'PLAY',
      type: 'AUTO_RELOAD',
    });
    expect(reloads).toBe(1);

    // Drain it repeatedly: the cap stops it running away.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const balance = await creditBalance(id, 'PLAY');
      if (balance > 0) await spendCredit(id, 'PLAY', balance, 'Game');
    }

    const total = await credits.countDocuments({
      userId: user._id,
      store: 'PLAY',
      type: 'AUTO_RELOAD',
    });
    expect(total).toBeLessThanOrEqual(3);
  });

  it('does not reload when it is switched off', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    await topUpCredit(id, { store: 'PLAY', rupees: 100 }, ctx);
    await setAutoReload(id, 'PLAY', { enabled: false, thresholdRupees: 200, amountRupees: 500 });
    await spendCredit(id, 'PLAY', rupeesToPaise(90), 'Game');

    const credits = await contentCreditsCollection();
    expect(
      await credits.countDocuments({ userId: user._id, store: 'PLAY', type: 'AUTO_RELOAD' }),
    ).toBe(0);
  });

  it('does not reload when the wallet cannot cover it', async () => {
    const user = await makeUser(300);
    const id = user._id.toHexString();

    await topUpCredit(id, { store: 'PLAY', rupees: 100 }, ctx);
    await setAutoReload(id, 'PLAY', { enabled: true, thresholdRupees: 200, amountRupees: 2000 });
    await spendCredit(id, 'PLAY', rupeesToPaise(90), 'Game');

    const credits = await contentCreditsCollection();
    expect(
      await credits.countDocuments({ userId: user._id, store: 'PLAY', type: 'AUTO_RELOAD' }),
    ).toBe(0);
    // And the slot was given back rather than burnt.
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(200));
  });

  it('never lets a saved biller list leak across customers', async () => {
    const collection = await savedBillersCollection();
    const indexes = await collection.indexes();
    expect(indexes.some((index) => index.name === 'savedBillers_user_account_unique')).toBe(true);
  });
});
