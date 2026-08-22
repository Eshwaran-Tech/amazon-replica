import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  savedCardsCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import type { WalletEntryDoc } from '@/models/wallet';
import {
  bestClaimFor,
  cashbackEarned,
  collectOffer,
  listOffers,
  spendClaim,
} from '@/services/rewards';
import { listCards, MAX_CARDS, removeCard, saveCard, tokenForCard } from '@/services/saved-cards';
import { buildStatement, monthPeriod } from '@/services/statement';
import { listTickets, raiseTicket, resolveTicket } from '@/services/support';

/**
 * Rewards, saved cards, tickets and the statement, against the database.
 *
 * The things worth testing are the ones that cost or expose something: a
 * reward that could pay twice, a card number that could be stored, a ticket
 * somebody else could close, and a running balance that disagrees with the
 * wallet.
 */

const ctx = { ip: '10.99.0.61', userAgent: 'vitest' };
let counter = 0;

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Pay User ${counter}`,
    email: `pay-${Date.now()}-${counter}@example.com`,
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

function card(overrides: Record<string, unknown> = {}) {
  return {
    cardNumber: MOCK_TEST_CARDS.success,
    holderName: 'R Eshwaran',
    expiryMonth: '12',
    expiryYear: String(new Date().getFullYear() + 3),
    makeDefault: false,
    ...overrides,
  };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('collecting a reward', () => {
  it('records the claim and dates its expiry from the offer', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const result = await collectOffer(userId, 'shop-50', false, ctx);
    if (!result.ok) throw new Error(result.message);

    const offers = await listOffers(userId, false);
    const entry = offers.find((row) => row.offer.id === 'shop-50');
    expect(entry?.claim?.status).toBe('CLAIMED');
    expect(entry?.collectable).toBe(false);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a second claim on the same offer', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    expect((await collectOffer(userId, 'shop-50', false, ctx)).ok).toBe(true);
    expect(await collectOffer(userId, 'shop-50', false, ctx)).toMatchObject({
      ok: false,
      code: 'ALREADY_CLAIMED',
    });
  });

  it('refuses an offer that does not exist', async () => {
    const user = await makeUser();
    expect(await collectOffer(user._id.toHexString(), 'nonesuch', false, ctx)).toMatchObject({
      ok: false,
      code: 'UNKNOWN_OFFER',
    });
  });

  it('hides Prime-only offers from everyone else, and refuses them', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const plain = await listOffers(userId, false);
    expect(plain.some((row) => row.offer.primeOnly)).toBe(false);

    const member = await listOffers(userId, true);
    expect(member.some((row) => row.offer.primeOnly)).toBe(true);

    expect(await collectOffer(userId, 'shop-200-prime', false, ctx)).toMatchObject({
      ok: false,
      code: 'NOT_ELIGIBLE',
    });
  });

  it('picks the claim that pays most on this order', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await collectOffer(userId, 'shop-50', false, ctx);
    await collectOffer(userId, 'shop-100', false, ctx);

    // At Rs 1,000 the Rs 100 offer wins; both qualify.
    const best = await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(1000));
    expect(best?.offer.id).toBe('shop-100');
    expect(best?.reward).toBe(rupeesToPaise(100));
  });

  it('ignores a claim for a different surface', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await collectOffer(userId, 'recharge-40', false, ctx);
    expect(await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(5000))).toBeNull();
    expect(await bestClaimFor(userId, 'RECHARGE', rupeesToPaise(500))).not.toBeNull();
  });

  it('ignores a claim the order is too small for', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await collectOffer(userId, 'shop-100', false, ctx);
    expect(await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(500))).toBeNull();
  });

  it('spends a claim exactly once', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await collectOffer(userId, 'shop-50', false, ctx);
    const best = await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(1000));
    if (!best) throw new Error('no claim');

    // The second attempt is the losing side of a race: it must change nothing.
    expect(await spendClaim(best.claimId, best.reward, 'ORD-1')).toBe(true);
    expect(await spendClaim(best.claimId, best.reward, 'ORD-2')).toBe(false);

    // And it is no longer available to a later order.
    expect(await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(1000))).toBeNull();
  });

  it('will not spend a claim that has lapsed', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await collectOffer(userId, 'shop-50', false, ctx);
    const best = await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(1000));
    if (!best) throw new Error('no claim');

    const wayLater = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000);
    expect(await spendClaim(best.claimId, best.reward, 'ORD-1', { now: wayLater })).toBe(false);
    expect(
      await bestClaimFor(userId, 'SHOPPING', rupeesToPaise(1000), { now: wayLater }),
    ).toBeNull();
  });

  it('reads what was earned from the ledger, not from the claims', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    expect(await cashbackEarned(userId)).toBe(0);

    const entries = await walletEntriesCollection();
    const now = new Date();
    const credit: WalletEntryDoc = {
      _id: new ObjectId(),
      userId: user._id,
      type: 'CASHBACK',
      direction: 'CREDIT',
      amount: rupeesToPaise(75),
      status: 'COMPLETED',
      currency: 'INR',
      reference: 'ORD-X-CB',
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await entries.insertOne(credit);

    expect(await cashbackEarned(userId)).toBe(rupeesToPaise(75));
  });
});

describe('saved cards', () => {
  it('keeps four digits and a token, and no card number', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const result = await saveCard(userId, card(), ctx);
    if (!result.ok) throw new Error(result.message);
    expect(result.last4).toBe('4242');

    const cards = await savedCardsCollection();
    const doc = await cards.findOne({ userId: user._id });

    // The number appears nowhere in the stored document.
    expect(JSON.stringify(doc)).not.toContain(MOCK_TEST_CARDS.success);
    expect(doc?.last4).toBe('4242');
    expect(doc?.token).toMatch(/^[0-9a-f]{32}$/);
    // And no CVV field exists at all.
    expect(Object.keys(doc ?? {})).not.toContain('cvv');
  });

  it('refuses anything that is not one of the test cards', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    // A number that passes a Luhn check but is not a test card.
    expect(await saveCard(userId, card({ cardNumber: '4111111111111111' }), ctx)).toMatchObject({
      ok: false,
      code: 'BAD_CARD',
    });
    expect(await saveCard(userId, card({ cardNumber: '1234' }), ctx)).toMatchObject({
      ok: false,
      code: 'BAD_CARD',
    });

    // A test card that will decline at the till is still savable: keeping a
    // card on file is not the same as charging it.
    expect((await saveCard(userId, card({ cardNumber: MOCK_TEST_CARDS.declined }), ctx)).ok).toBe(
      true,
    );
  });

  it('refuses an expiry in the past', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    expect(
      await saveCard(userId, card({ expiryYear: String(new Date().getFullYear() - 1) }), ctx),
    ).toMatchObject({ ok: false, code: 'BAD_EXPIRY' });
    expect(await saveCard(userId, card({ expiryMonth: '13' }), ctx)).toMatchObject({
      ok: false,
      code: 'BAD_EXPIRY',
    });
  });

  it('refuses the same card twice on one account', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    expect((await saveCard(userId, card(), ctx)).ok).toBe(true);
    expect(await saveCard(userId, card(), ctx)).toMatchObject({ ok: false, code: 'DUPLICATE' });
  });

  it('makes the first card the default without being asked', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await saveCard(userId, card(), ctx);
    const [first] = await listCards(userId);
    expect(first?.isDefault).toBe(true);
  });

  it('hands the default on when the default is removed', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await saveCard(userId, card(), ctx);
    // A second card needs a different token, so a second test number.
    await saveCard(userId, card({ cardNumber: MOCK_TEST_CARDS.insufficient }), ctx);

    const before = await listCards(userId);
    const defaultCard = before.find((entry) => entry.isDefault);
    if (!defaultCard) throw new Error('no default');

    await removeCard(userId, defaultCard.id, ctx);

    const after = await listCards(userId);
    expect(after).toHaveLength(1);
    expect(after[0]?.isDefault).toBe(true);
  });

  it('will not remove somebody else’s card, or hand out its token', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();

    await saveCard(mine._id.toHexString(), card(), ctx);
    const [saved] = await listCards(mine._id.toHexString());
    if (!saved) throw new Error('no card');

    expect(await removeCard(theirs._id.toHexString(), saved.id, ctx)).toMatchObject({ ok: false });
    expect(await listCards(mine._id.toHexString())).toHaveLength(1);

    expect(await tokenForCard(theirs._id.toHexString(), saved.id)).toBeNull();
    expect(await tokenForCard(mine._id.toHexString(), saved.id)).not.toBeNull();
  });

  it('caps how many can be kept', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    // Only three distinct test numbers exist, so the cap is checked by
    // inserting rows directly -- the count is what the guard reads.
    const cards = await savedCardsCollection();
    const now = new Date();
    await cards.insertMany(
      Array.from({ length: MAX_CARDS }, (_, index) => ({
        _id: new ObjectId(),
        userId: user._id,
        token: `filler-${index}-${Date.now()}`,
        last4: '0000',
        network: 'VISA' as const,
        holderName: 'Filler',
        expiryMonth: 12,
        expiryYear: now.getFullYear() + 2,
        isDefault: false,
        createdAt: now,
        lastUsedAt: null,
      })),
    );

    expect(await saveCard(userId, card(), ctx)).toMatchObject({ ok: false, code: 'TOO_MANY' });
  });
});

describe('support tickets', () => {
  const ticket = (overrides: Record<string, unknown> = {}) => ({
    topic: 'PAYMENT',
    subject: 'A top-up did not land',
    body: 'Added money twenty minutes ago and the balance has not moved.',
    relatedReference: 'wt-1234',
    ...overrides,
  });

  it('stores one and lists it as ongoing', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const result = await raiseTicket(userId, ticket(), ctx);
    if (!result.ok) throw new Error(result.message);

    const open = await listTickets(userId, 'OPEN');
    expect(open).toHaveLength(1);
    expect(open[0]?.reference).toBe(result.reference);
    // The reference is normalised, so it matches what is printed elsewhere.
    expect(open[0]?.relatedReference).toBe('WT-1234');
  });

  it('refuses a ticket with nothing in it', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    expect(await raiseTicket(userId, ticket({ subject: '  ' }), ctx)).toMatchObject({ ok: false });
    expect(await raiseTicket(userId, ticket({ body: 'short' }), ctx)).toMatchObject({ ok: false });
    expect(await raiseTicket(userId, ticket({ topic: 'NONSENSE' }), ctx)).toMatchObject({
      ok: false,
    });
  });

  it('moves a ticket to resolved, once', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    await raiseTicket(userId, ticket(), ctx);
    const [open] = await listTickets(userId, 'OPEN');
    if (!open) throw new Error('no ticket');

    expect(await resolveTicket(userId, open.id, 'Landed the next morning.')).toMatchObject({
      ok: true,
    });
    // A second close changes nothing rather than rewriting the resolved date.
    expect(await resolveTicket(userId, open.id, 'again')).toMatchObject({ ok: false });

    expect(await listTickets(userId, 'OPEN')).toHaveLength(0);
    const resolved = await listTickets(userId, 'RESOLVED');
    expect(resolved[0]?.resolvedNote).toBe('Landed the next morning.');
  });

  it('will not let one account close another’s ticket, or see it', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();

    await raiseTicket(mine._id.toHexString(), ticket(), ctx);
    const [open] = await listTickets(mine._id.toHexString(), 'OPEN');
    if (!open) throw new Error('no ticket');

    expect(await resolveTicket(theirs._id.toHexString(), open.id, 'nope')).toMatchObject({
      ok: false,
    });
    expect(await listTickets(theirs._id.toHexString())).toEqual([]);
    expect(await listTickets(mine._id.toHexString(), 'OPEN')).toHaveLength(1);
  });
});

describe('the statement', () => {
  it('carries a running balance forward and closes where the wallet is', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const entries = await walletEntriesCollection();
    const base = new Date(2026, 7, 10, 12, 0);

    await entries.insertMany([
      {
        _id: new ObjectId(),
        userId: user._id,
        type: 'TOP_UP',
        direction: 'CREDIT',
        amount: rupeesToPaise(1000),
        status: 'COMPLETED',
        currency: 'INR',
        reference: 'WT-A',
        failureReason: null,
        createdAt: base,
        updatedAt: base,
      },
      {
        _id: new ObjectId(),
        userId: user._id,
        type: 'ORDER',
        direction: 'DEBIT',
        amount: rupeesToPaise(300),
        status: 'COMPLETED',
        currency: 'INR',
        reference: 'ORD-A',
        failureReason: null,
        createdAt: new Date(2026, 7, 12, 12, 0),
        updatedAt: base,
      },
      {
        // Pending: listed, but it must not move the balance.
        _id: new ObjectId(),
        userId: user._id,
        type: 'TOP_UP',
        direction: 'CREDIT',
        amount: rupeesToPaise(5000),
        status: 'PENDING',
        currency: 'INR',
        reference: 'WT-B',
        failureReason: null,
        createdAt: new Date(2026, 7, 14, 12, 0),
        updatedAt: base,
      },
    ]);

    const statement = await buildStatement(userId, monthPeriod(2026, 7));

    expect(statement.opening).toBe(0);
    expect(statement.creditedInPeriod).toBe(rupeesToPaise(1000));
    expect(statement.debitedInPeriod).toBe(rupeesToPaise(300));
    expect(statement.closing).toBe(rupeesToPaise(700));

    // Newest first on screen; the pending row sits at the top and left the
    // balance where the order put it.
    expect(statement.rows).toHaveLength(3);
    expect(statement.rows[0]?.reference).toBe('WT-B');
    expect(statement.rows[0]?.balanceAfter).toBe(rupeesToPaise(700));
  });

  it('opens where the previous month closed', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const entries = await walletEntriesCollection();
    const july = new Date(2026, 6, 15, 12, 0);
    await entries.insertOne({
      _id: new ObjectId(),
      userId: user._id,
      type: 'TOP_UP',
      direction: 'CREDIT',
      amount: rupeesToPaise(2000),
      status: 'COMPLETED',
      currency: 'INR',
      reference: 'WT-JULY',
      failureReason: null,
      createdAt: july,
      updatedAt: july,
    });

    const august = await buildStatement(userId, monthPeriod(2026, 7));
    expect(august.opening).toBe(rupeesToPaise(2000));
    expect(august.rows).toHaveLength(0);
    expect(august.closing).toBe(rupeesToPaise(2000));
  });

  it('filters the rows without changing the summary or the balance', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();

    const entries = await walletEntriesCollection();
    const when = new Date(2026, 7, 5, 12, 0);
    await entries.insertMany([
      {
        _id: new ObjectId(),
        userId: user._id,
        type: 'TOP_UP',
        direction: 'CREDIT',
        amount: rupeesToPaise(1000),
        status: 'COMPLETED',
        currency: 'INR',
        reference: 'WT-C',
        failureReason: null,
        createdAt: when,
        updatedAt: when,
      },
      {
        _id: new ObjectId(),
        userId: user._id,
        type: 'RECHARGE',
        direction: 'DEBIT',
        amount: rupeesToPaise(299),
        status: 'COMPLETED',
        currency: 'INR',
        reference: 'RC-C',
        failureReason: null,
        createdAt: new Date(2026, 7, 6, 12, 0),
        updatedAt: when,
      },
    ]);

    const filtered = await buildStatement(userId, monthPeriod(2026, 7), { types: ['RECHARGE'] });

    expect(filtered.rows).toHaveLength(1);
    expect(filtered.hiddenByFilter).toBe(1);
    // The summary describes the account, not the view.
    expect(filtered.creditedInPeriod).toBe(rupeesToPaise(1000));
    expect(filtered.closing).toBe(rupeesToPaise(701));
    // And the balance on the shown row is still the real one.
    expect(filtered.rows[0]?.balanceAfter).toBe(rupeesToPaise(701));
  });

  it('gives nothing for an invented user id', async () => {
    const statement = await buildStatement('not-an-id', monthPeriod(2026, 7));
    expect(statement.rows).toEqual([]);
    expect(statement.closing).toBe(0);
  });
});
