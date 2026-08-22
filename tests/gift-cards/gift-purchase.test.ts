import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GIFT_BRANDS } from '@/data/gift-brands';
import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  giftCardsCollection,
  giftOrdersCollection,
  usersCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';
import { rupeesToPaise } from '@/lib/utils/money';
import type { UserDoc } from '@/models/user';
import { redeemGiftCard } from '@/services/gift-cards';
import { buyGiftCard, listGiftOrders } from '@/services/gift-purchase';
import { completeTopUp, createTopUp, getWalletSummary } from '@/services/wallet';

/**
 * Buying a gift card.
 *
 * The loop that matters: paying debits the buyer, mints a code, and that code
 * credits somebody else exactly once. Everything tested here is something that
 * costs a real person money if it is wrong -- the amount charged, the number of
 * cards minted, whether a code can be spent twice, and whether the plain code
 * survives anywhere it should not.
 */

const ctx = { ip: '10.99.0.51', userAgent: 'vitest' };
let counter = 0;

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Gift Buyer ${counter}`,
    email: `gift-${Date.now()}-${counter}@example.com`,
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

function input(overrides: Record<string, unknown> = {}) {
  return {
    designId: 'birthday-00',
    brandId: '',
    voucherKind: '',
    delivery: 'EMAIL',
    amountRupees: 500,
    quantity: 1,
    recipientName: 'Asha Menon',
    recipientEmail: 'asha@example.com',
    message: 'Many happy returns',
    ...overrides,
  };
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('buying: the money', () => {
  it('charges the face value times the quantity', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const before = await getWalletSummary(userId);
    const result = await buyGiftCard(userId, input({ amountRupees: 500, quantity: 3 }), ctx);
    if (!result.ok) throw new Error(result.message);

    expect(result.amount).toBe(rupeesToPaise(1500));
    expect(result.codes).toHaveLength(3);
    expect((await getWalletSummary(userId)).balance).toBe(before.balance - rupeesToPaise(1500));
  });

  it('charges the delivery fee per card for a physical one', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const result = await buyGiftCard(
      userId,
      input({ delivery: 'PHYSICAL', amountRupees: 500, quantity: 2, recipientEmail: '' }),
      ctx,
    );
    if (!result.ok) throw new Error(result.message);

    // ₹500 x 2 plus ₹49 postage x 2.
    expect(result.amount).toBe(rupeesToPaise(1000 + 98));
  });

  it('takes the brand discount off what the buyer pays', async () => {
    const brand = GIFT_BRANDS.find((entry) => entry.discountPercent > 0);
    if (!brand) throw new Error('no discounted brand');
    const amount = Math.min(...brand.denominations);

    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);

    const result = await buyGiftCard(
      userId,
      input({ designId: '', brandId: brand.id, amountRupees: amount, quantity: 1 }),
      ctx,
    );
    if (!result.ok) throw new Error(result.message);

    const face = rupeesToPaise(amount);
    expect(result.amount).toBe(face - Math.round((face * brand.discountPercent) / 100));
    expect(result.amount).toBeLessThan(face);

    // And the card is still worth its face value to whoever redeems it.
    const cards = await giftCardsCollection();
    const minted = await cards.findOne({ codeSuffix: result.codes[0]?.slice(-4) ?? '' });
    expect(minted?.amount).toBe(face);
  });

  it('writes exactly one debit, tagged as a gift purchase', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 5000);

    const result = await buyGiftCard(userId, input(), ctx);
    if (!result.ok) throw new Error(result.message);

    const entries = await walletEntriesCollection();
    const debits = await entries.find({ userId: user._id, type: 'GIFT_PURCHASE' }).toArray();
    expect(debits).toHaveLength(1);
    expect(debits[0]?.direction).toBe('DEBIT');
    expect(debits[0]?.amount).toBe(result.amount);
    expect(debits[0]?.reference).toBe(result.reference);
  });

  it('refuses a purchase the balance cannot cover, and mints nothing', async () => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 1);

    const before = await getWalletSummary(userId);
    const result = await buyGiftCard(userId, input({ amountRupees: 5000 }), ctx);
    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT_BALANCE' });

    expect((await getWalletSummary(userId)).balance).toBe(before.balance);
    const orders = await giftOrdersCollection();
    expect(await orders.countDocuments({ userId: user._id })).toBe(0);
  });
});

describe('buying: what it refuses', () => {
  const buy = async (overrides: Record<string, unknown>) => {
    const user = await makeUser();
    const userId = user._id.toHexString();
    await fundWallet(userId, 10_000);
    return buyGiftCard(userId, input(overrides), ctx);
  };

  it('refuses a design that was never drawn', async () => {
    expect(await buy({ designId: 'birthday-99' })).toMatchObject({ ok: false, code: 'BAD_DESIGN' });
    expect(await buy({ designId: 'nonesuch-00' })).toMatchObject({ ok: false, code: 'BAD_DESIGN' });
  });

  it('insists on exactly one of design, brand or voucher', async () => {
    expect(await buy({ designId: '', brandId: '', voucherKind: '' })).toMatchObject({
      ok: false,
      code: 'BAD_DESIGN',
    });
    expect(await buy({ designId: 'birthday-00', brandId: 'linden-row' })).toMatchObject({
      ok: false,
      code: 'BAD_DESIGN',
    });
  });

  it('refuses a denomination the brand does not sell', async () => {
    const brand = GIFT_BRANDS[0];
    if (!brand) throw new Error('no brands');
    const notSold = Math.min(...brand.denominations) + 1;

    expect(await buy({ designId: '', brandId: brand.id, amountRupees: notSold })).toMatchObject({
      ok: false,
      code: 'BAD_AMOUNT',
    });
  });

  it('will not post a brand card, because a brand card is a code', async () => {
    expect(
      await buy({ designId: '', brandId: 'linden-row', delivery: 'PHYSICAL', amountRupees: 500 }),
    ).toMatchObject({ ok: false, code: 'BAD_DESIGN' });
  });

  it('refuses an amount outside the bounds', async () => {
    expect(await buy({ amountRupees: 0 })).toMatchObject({ ok: false, code: 'BAD_AMOUNT' });
    expect(await buy({ amountRupees: -500 })).toMatchObject({ ok: false, code: 'BAD_AMOUNT' });
    expect(await buy({ amountRupees: 100_000 })).toMatchObject({ ok: false, code: 'BAD_AMOUNT' });
  });

  it('refuses a quantity outside the bounds', async () => {
    expect(await buy({ quantity: 0 })).toMatchObject({ ok: false, code: 'BAD_QUANTITY' });
    expect(await buy({ quantity: 500 })).toMatchObject({ ok: false, code: 'BAD_QUANTITY' });
  });

  it('insists on a recipient, and an email when one is needed to deliver', async () => {
    expect(await buy({ recipientName: '   ' })).toMatchObject({ ok: false, code: 'BAD_RECIPIENT' });
    expect(await buy({ recipientEmail: 'not-an-email' })).toMatchObject({
      ok: false,
      code: 'BAD_RECIPIENT',
    });
    // A printed card needs none.
    const posted = await buy({ delivery: 'PHYSICAL', recipientEmail: '' });
    expect(posted.ok).toBe(true);
  });

  it('will not take an invented user id', async () => {
    expect(await buyGiftCard('not-an-id', input(), ctx)).toMatchObject({ ok: false });
  });
});

describe('buying: the codes', () => {
  it('mints one working card per unit ordered', async () => {
    const buyer = await makeUser();
    const buyerId = buyer._id.toHexString();
    await fundWallet(buyerId, 5000);

    const result = await buyGiftCard(buyerId, input({ amountRupees: 250, quantity: 2 }), ctx);
    if (!result.ok) throw new Error(result.message);
    expect(new Set(result.codes).size).toBe(2);

    // Each one credits a different recipient, once.
    for (const code of result.codes) {
      const recipient = await makeUser();
      const redeemed = await redeemGiftCard(recipient._id.toHexString(), code, ctx);
      expect(redeemed.ok).toBe(true);
      if (redeemed.ok) expect(redeemed.amount).toBe(rupeesToPaise(250));
    }
  });

  it('will not let one code pay twice', async () => {
    const buyer = await makeUser();
    await fundWallet(buyer._id.toHexString(), 5000);

    const result = await buyGiftCard(buyer._id.toHexString(), input({ amountRupees: 250 }), ctx);
    if (!result.ok) throw new Error(result.message);
    const code = result.codes[0];
    if (!code) throw new Error('no code');

    const first = await makeUser();
    const second = await makeUser();

    expect((await redeemGiftCard(first._id.toHexString(), code, ctx)).ok).toBe(true);
    expect(await redeemGiftCard(second._id.toHexString(), code, ctx)).toMatchObject({
      ok: false,
      code: 'INVALID',
    });
  });

  it('keeps no plain code anywhere it could be read back', async () => {
    const buyer = await makeUser();
    const buyerId = buyer._id.toHexString();
    await fundWallet(buyerId, 5000);

    const result = await buyGiftCard(buyerId, input({ amountRupees: 500 }), ctx);
    if (!result.ok) throw new Error(result.message);
    const code = result.codes[0];
    if (!code) throw new Error('no code');

    const normalised = code.replace(/[^A-Z0-9]/g, '');

    // Not in the order record: only the last four characters.
    const orders = await giftOrdersCollection();
    const order = await orders.findOne({ reference: result.reference });
    expect(JSON.stringify(order)).not.toContain(normalised);
    expect(order?.codeSuffixes[0]).toBe(code.slice(-4));

    // Not in the card record either: only a keyed hash.
    const cards = await giftCardsCollection();
    const card = await cards.findOne({ codeSuffix: normalised.slice(-4) });
    expect(JSON.stringify(card)).not.toContain(normalised);
    expect(card?.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records the order against the buyer, and nobody else', async () => {
    const mine = await makeUser();
    const theirs = await makeUser();
    await fundWallet(mine._id.toHexString(), 5000);
    await fundWallet(theirs._id.toHexString(), 5000);

    const ours = await buyGiftCard(mine._id.toHexString(), input(), ctx);
    await buyGiftCard(theirs._id.toHexString(), input(), ctx);
    if (!ours.ok) throw new Error(ours.message);

    const listed = await listGiftOrders(mine._id.toHexString());
    expect(listed).toHaveLength(1);
    expect(listed[0]?.reference).toBe(ours.reference);
    expect(await listGiftOrders('not-an-id')).toEqual([]);
  });

  it('stores the recipient email only when the delivery needed one', async () => {
    const buyer = await makeUser();
    const buyerId = buyer._id.toHexString();
    await fundWallet(buyerId, 5000);

    const emailed = await buyGiftCard(buyerId, input({ delivery: 'EMAIL' }), ctx);
    const posted = await buyGiftCard(
      buyerId,
      input({ delivery: 'PHYSICAL', recipientEmail: 'asha@example.com' }),
      ctx,
    );
    if (!emailed.ok || !posted.ok) throw new Error('purchase refused');

    const orders = await giftOrdersCollection();
    expect((await orders.findOne({ reference: emailed.reference }))?.recipientEmail).toBe(
      'asha@example.com',
    );
    // Given, but not needed, so not kept.
    expect((await orders.findOne({ reference: posted.reference }))?.recipientEmail).toBeNull();
  });
});
