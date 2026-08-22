import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  transitAccountsCollection,
  transitEntriesCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import type { WalletEntryDoc } from '@/models/wallet';
import { issueTag, logCrossing, rechargeTag, tagsFor } from '@/services/fastag';
import { addCard, cardsFor, logJourney, rechargeCard } from '@/services/metro';
import { getWalletSummary } from '@/services/wallet';

/**
 * Money on a tag and on a card.
 *
 * The arithmetic is tested elsewhere; this is about what happens to real money.
 * The invariants that matter: a tag holds only what is spendable at a barrier,
 * a recharge nobody could afford charges nothing, the same registration cannot
 * carry two tags, and every balance equals the ledger underneath it.
 */

let counter = 0;
const ctx = { ip: '10.99.0.7', userAgent: 'vitest' };

async function makeUser(balanceRupees: number): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Transit User ${counter}`,
    email: `transit-${Date.now()}-${counter}@example.com`,
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
      reference: `SEED-${counter}`,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await wallet.insertOne(credit);
  }

  return user;
}

/** Sums a tag's ledger directly, so the service cannot mark its own homework. */
async function tagLedger(number: string): Promise<number> {
  const accounts = await transitAccountsCollection();
  const account = await accounts.findOne({ number });
  if (!account) return 0;

  const entries = await transitEntriesCollection();
  const docs = await entries.find({ accountId: account._id }).toArray();
  return docs.reduce(
    (sum, doc) => sum + (doc.direction === 'CREDIT' ? doc.amount : -doc.amount),
    0,
  );
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('buying a FASTag', () => {
  it('credits only the spendable part and charges the whole lot', async () => {
    const user = await makeUser(5000);
    const before = (await getWalletSummary(user._id.toHexString())).balance;

    const result = await issueTag(
      user._id.toHexString(),
      {
        registration: 'tn 02 bq-6666',
        issuerId: 'meridian-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 500,
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Deposit 200 + issuance 100 + recharge 500.
    expect(result.charged).toBe(rupeesToPaise(800));
    // Only the recharge reaches a barrier.
    expect(result.balance).toBe(rupeesToPaise(500));

    const after = (await getWalletSummary(user._id.toHexString())).balance;
    expect(before - after).toBe(rupeesToPaise(800));
    expect(await tagLedger('TN02BQ6666')).toBe(rupeesToPaise(500));
  });

  it('normalises the registration, so spacing does not create a second tag', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();
    const input = {
      issuerId: 'kestrel-tag',
      tollClass: 'CAR' as const,
      firstTopUpRupees: 200,
    };

    const first = await issueTag(id, { ...input, registration: 'KA 01 AB 1234' }, ctx);
    expect(first.ok).toBe(true);

    const second = await issueTag(id, { ...input, registration: 'ka01ab1234' }, ctx);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('DUPLICATE');

    expect(await tagsFor(id)).toHaveLength(1);
  });

  it('charges nothing and leaves nothing behind when the balance is short', async () => {
    const user = await makeUser(100);
    const id = user._id.toHexString();

    const result = await issueTag(
      id,
      {
        registration: 'MH 12 AB 4321',
        issuerId: 'halcyon-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 2000,
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INSUFFICIENT_BALANCE');

    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(100));
    // The empty account is cleaned up, so a second attempt is not blocked.
    expect(await tagsFor(id)).toHaveLength(0);
  });

  it('refuses a plate that is not a plate', async () => {
    const user = await makeUser(5000);
    for (const registration of ['', 'XX99ZZ9999', 'hello', '12 AB 34 CD']) {
      const result = await issueTag(
        user._id.toHexString(),
        { registration, issuerId: 'meridian-tag', tollClass: 'CAR', firstTopUpRupees: 500 },
        ctx,
      );
      expect(result.ok, registration).toBe(false);
    }
  });

  it('refuses a first recharge outside the issuer’s limits', async () => {
    const user = await makeUser(500_000);
    for (const amount of [0, 50, 99, 20_001, 1_000_000]) {
      const result = await issueTag(
        user._id.toHexString(),
        {
          registration: 'DL 03 CX 7788',
          issuerId: 'meridian-tag',
          tollClass: 'CAR',
          firstTopUpRupees: amount,
        },
        ctx,
      );
      expect(result.ok, String(amount)).toBe(false);
      if (!result.ok) expect(result.code).toBe('BAD_AMOUNT');
    }
  });
});

describe('recharging a tag', () => {
  it('moves money from the wallet onto the tag, rupee for rupee', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();
    await issueTag(
      id,
      {
        registration: 'GJ 05 KK 9090',
        issuerId: 'kestrel-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 200,
      },
      ctx,
    );

    const before = (await getWalletSummary(id)).balance;
    const result = await rechargeTag(id, { registration: 'gj05kk9090', amountRupees: 1000 }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.amount).toBe(rupeesToPaise(1000));
    expect(result.balance).toBe(rupeesToPaise(1200));
    expect((await getWalletSummary(id)).balance).toBe(before - rupeesToPaise(1000));
  });

  it('reaches no tag on another customer’s registration', async () => {
    const owner = await makeUser(5000);
    const stranger = await makeUser(5000);

    await issueTag(
      owner._id.toHexString(),
      {
        registration: 'RJ 14 PP 1111',
        issuerId: 'meridian-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 500,
      },
      ctx,
    );

    const result = await rechargeTag(
      stranger._id.toHexString(),
      { registration: 'RJ 14 PP 1111', amountRupees: 500 },
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_TAG');
    // And the stranger was not charged for the privilege.
    expect((await getWalletSummary(stranger._id.toHexString())).balance).toBe(rupeesToPaise(5000));
  });

  it('charges nothing when the wallet cannot cover it', async () => {
    const user = await makeUser(1000);
    const id = user._id.toHexString();
    await issueTag(
      id,
      {
        registration: 'UP 16 QQ 2222',
        issuerId: 'kestrel-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 200,
      },
      ctx,
    );

    const before = (await getWalletSummary(id)).balance;
    const result = await rechargeTag(id, { registration: 'UP16QQ2222', amountRupees: 5000 }, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INSUFFICIENT_BALANCE');
    expect((await getWalletSummary(id)).balance).toBe(before);
    expect(await tagLedger('UP16QQ2222')).toBe(rupeesToPaise(200));
  });
});

describe('recording a crossing', () => {
  it('debits the tag by the toll for its own vehicle class', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();

    await issueTag(
      id,
      {
        registration: 'KL 07 RR 3333',
        issuerId: 'meridian-tag',
        tollClass: 'BUS',
        firstTopUpRupees: 5000,
      },
      ctx,
    );

    const walletBefore = (await getWalletSummary(id)).balance;
    const result = await logCrossing(id, { registration: 'KL07RR3333', corridorId: 'del-jai' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A bus is charged 3.35x a car's 385, not the car figure.
    expect(result.charged).toBe(rupeesToPaise(1290));
    expect(result.balance).toBe(rupeesToPaise(5000) - rupeesToPaise(1290));

    // A crossing is not a wallet transaction -- it comes off the tag.
    expect((await getWalletSummary(id)).balance).toBe(walletBefore);
    expect(await tagLedger('KL07RR3333')).toBe(result.balance);
  });

  it('charges a return trip more than a single, but less than two', async () => {
    const user = await makeUser(20_000);
    const id = user._id.toHexString();
    await issueTag(
      id,
      {
        registration: 'AP 09 SS 4444',
        issuerId: 'meridian-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 5000,
      },
      ctx,
    );

    const single = await logCrossing(id, { registration: 'AP09SS4444', corridorId: 'mum-pun' });
    const returning = await logCrossing(id, {
      registration: 'AP09SS4444',
      corridorId: 'mum-pun',
      returnTrip: true,
    });

    expect(single.ok && returning.ok).toBe(true);
    if (!single.ok || !returning.ok) return;
    expect(returning.charged).toBeGreaterThan(single.charged);
    expect(returning.charged).toBeLessThan(single.charged * 2);
  });

  it('refuses an unknown route and a tag that is not yours', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();
    await issueTag(
      id,
      {
        registration: 'TS 08 TT 5555',
        issuerId: 'meridian-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 500,
      },
      ctx,
    );

    const badRoute = await logCrossing(id, { registration: 'TS08TT5555', corridorId: 'nowhere' });
    expect(badRoute.ok).toBe(false);

    const noTag = await logCrossing(id, { registration: 'PB 10 UU 6666', corridorId: 'del-jai' });
    expect(noTag.ok).toBe(false);
    if (!noTag.ok) expect(noTag.code).toBe('NO_TAG');
  });
});

describe('metro cards', () => {
  it('issues one card per network and loads it in full', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();

    const result = await addCard(id, { networkId: 'delhi', firstTopUpRupees: 500 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.balance).toBe(rupeesToPaise(500));
    expect(result.number).toHaveLength(12);
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(4500));

    // A second card on the same network is refused, and nothing is charged.
    const again = await addCard(id, { networkId: 'delhi', firstTopUpRupees: 500 }, ctx);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('DUPLICATE');
    expect((await getWalletSummary(id)).balance).toBe(rupeesToPaise(4500));
    expect(await cardsFor(id)).toHaveLength(1);
  });

  it('lets one customer hold a card in two cities', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();

    expect((await addCard(id, { networkId: 'mumbai', firstTopUpRupees: 200 }, ctx)).ok).toBe(true);
    expect((await addCard(id, { networkId: 'chennai', firstTopUpRupees: 200 }, ctx)).ok).toBe(true);
    expect(await cardsFor(id)).toHaveLength(2);
  });

  it('recharges by card number and refuses somebody else’s', async () => {
    const owner = await makeUser(5000);
    const stranger = await makeUser(5000);
    const ownerId = owner._id.toHexString();

    const issued = await addCard(ownerId, { networkId: 'bengaluru', firstTopUpRupees: 200 }, ctx);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const mine = await rechargeCard(ownerId, { number: issued.pretty, amountRupees: 500 }, ctx);
    expect(mine.ok).toBe(true);
    if (mine.ok) expect(mine.balance).toBe(rupeesToPaise(700));

    const theirs = await rechargeCard(
      stranger._id.toHexString(),
      { number: issued.number, amountRupees: 500 },
      ctx,
    );
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.code).toBe('NO_CARD');
    expect((await getWalletSummary(stranger._id.toHexString())).balance).toBe(rupeesToPaise(5000));
  });

  it('charges the card fare for a journey, not the token fare', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();

    const issued = await addCard(id, { networkId: 'chennai', firstTopUpRupees: 500 }, ctx);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const result = await logJourney(id, {
      number: issued.number,
      fromId: 'che-cen',
      toId: 'che-air',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Chennai gives 20% off, so a 40-rupee token journey is 32 on the card.
    expect(result.charged).toBe(rupeesToPaise(32));
    expect(result.balance).toBe(rupeesToPaise(500) - rupeesToPaise(32));
  });

  it('refuses a journey on a network the card does not belong to', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();

    const issued = await addCard(id, { networkId: 'kolkata', firstTopUpRupees: 500 }, ctx);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const wrongNetwork = await logJourney(id, {
      number: issued.number,
      fromId: 'del-cp',
      toId: 'del-sak',
    });
    expect(wrongNetwork.ok).toBe(false);
    if (!wrongNetwork.ok) expect(wrongNetwork.code).toBe('BAD_JOURNEY');

    const sameStation = await logJourney(id, {
      number: issued.number,
      fromId: 'kol-esp',
      toId: 'kol-esp',
    });
    expect(sameStation.ok).toBe(false);
  });
});

describe('the wallet ledger', () => {
  it('records every transit charge under its own type and a shared reference', async () => {
    const user = await makeUser(5000);
    const id = user._id.toHexString();

    await issueTag(
      id,
      {
        registration: 'HR 26 VV 7777',
        issuerId: 'meridian-tag',
        tollClass: 'CAR',
        firstTopUpRupees: 500,
      },
      ctx,
    );
    await addCard(id, { networkId: 'hyderabad', firstTopUpRupees: 200 }, ctx);

    const wallet = await walletEntriesCollection();
    const debits = await wallet.find({ userId: user._id, direction: 'DEBIT' }).toArray();

    expect(debits.map((doc) => doc.type).sort()).toEqual(['FASTAG', 'METRO']);

    // Each wallet debit is matched by a credit on the tag or card under the
    // same reference, which is what makes the pair traceable.
    const entries = await transitEntriesCollection();
    for (const debit of debits) {
      const credit = await entries.findOne({ reference: debit.reference });
      expect(credit, debit.reference).not.toBeNull();
      expect(credit?.direction).toBe('CREDIT');
    }
  });
});
