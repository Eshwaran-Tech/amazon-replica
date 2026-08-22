import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import { giftCardsCollection, usersCollection } from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import { giftCardSchema } from '@/lib/validations/wallet';
import type { UserDoc } from '@/models/user';
import { mintGiftCards, normaliseGiftCode, redeemGiftCard } from '@/services/gift-cards';
import { getWalletSummary } from '@/services/wallet';

/**
 * Gift card verification.
 *
 * A code is bearer money, so the invariants worth pinning are: it credits
 * exactly once, the plain code is never stored, an expired card is refused,
 * and a wrong code cannot be told apart from a used one.
 */

let counter = 0;
const ctx = { ip: '10.99.0.9', userAgent: 'vitest' };

async function makeUser(): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Gift User ${counter}`,
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

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

describe('gift cards: the code is never stored', () => {
  it('keeps no document containing the plain code', async () => {
    const [card] = await mintGiftCards(rupeesToPaise(500), 1);
    if (!card) throw new Error('no card minted');

    const cards = await giftCardsCollection();
    const normalised = normaliseGiftCode(card.code);

    // Neither the printed form nor the normalised form appears anywhere.
    const raw = await cards.findOne({ codeHash: card.code });
    const plain = await cards.findOne({ codeHash: normalised });
    expect(raw).toBeNull();
    expect(plain).toBeNull();

    const stored = await cards.findOne({ codeSuffix: normalised.slice(-4) });
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain(normalised);
  });
});

describe('gift cards: redemption', () => {
  it('credits the gift card balance, not the wallet balance', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    const [card] = await mintGiftCards(rupeesToPaise(500), 1);
    if (!card) throw new Error('no card minted');

    const result = await redeemGiftCard(id, card.code, ctx);
    expect(result.ok).toBe(true);

    const summary = await getWalletSummary(id);
    expect(summary.giftCards).toBe(rupeesToPaise(500));
    expect(summary.wallet).toBe(0);
    expect(summary.balance).toBe(rupeesToPaise(500));
  });

  it('accepts the code however it was typed', async () => {
    const user = await makeUser();
    const [card] = await mintGiftCards(rupeesToPaise(300), 1);
    if (!card) throw new Error('no card minted');

    // Lowercased, spaces for dashes -- the same card.
    const messy = card.code.toLowerCase().replace(/-/g, ' ');
    const result = await redeemGiftCard(user._id.toHexString(), messy, ctx);
    expect(result.ok).toBe(true);
  });

  it('credits once when the same card is redeemed twice', async () => {
    const user = await makeUser();
    const id = user._id.toHexString();
    const [card] = await mintGiftCards(rupeesToPaise(500), 1);
    if (!card) throw new Error('no card minted');

    const first = await redeemGiftCard(id, card.code, ctx);
    const second = await redeemGiftCard(id, card.code, ctx);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect((await getWalletSummary(id)).giftCards).toBe(rupeesToPaise(500));
  });

  it('credits one customer only when two race the same card', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const [card] = await mintGiftCards(rupeesToPaise(700), 1);
    if (!card) throw new Error('no card minted');

    const [first, second] = await Promise.all([
      redeemGiftCard(a._id.toHexString(), card.code, ctx),
      redeemGiftCard(b._id.toHexString(), card.code, ctx),
    ]);

    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);

    const total =
      (await getWalletSummary(a._id.toHexString())).giftCards +
      (await getWalletSummary(b._id.toHexString())).giftCards;
    expect(total).toBe(rupeesToPaise(700));
  });

  it('refuses an expired card', async () => {
    const user = await makeUser();
    const [card] = await mintGiftCards(rupeesToPaise(500), 1, 1);
    if (!card) throw new Error('no card minted');

    // Age it past its window rather than waiting a day.
    const cards = await giftCardsCollection();
    await cards.updateOne(
      { codeSuffix: normaliseGiftCode(card.code).slice(-4) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    const result = await redeemGiftCard(user._id.toHexString(), card.code, ctx);
    expect(result.ok).toBe(false);
    expect((await getWalletSummary(user._id.toHexString())).giftCards).toBe(0);
  });

  it('tells an unknown code and a used code apart from each other in no way', async () => {
    const user = await makeUser();
    const [card] = await mintGiftCards(rupeesToPaise(500), 1);
    if (!card) throw new Error('no card minted');

    await redeemGiftCard(user._id.toHexString(), card.code, ctx);
    const used = await redeemGiftCard(user._id.toHexString(), card.code, ctx);
    const unknown = await redeemGiftCard(user._id.toHexString(), 'ZZZZ-ZZZZZZ-ZZZZZ', ctx);

    expect(used.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    // Same code and same wording: the form cannot be used to probe which
    // codes exist.
    if (used.ok || unknown.ok) throw new Error('unreachable');
    expect(used.code).toBe(unknown.code);
    expect(used.message).toBe(unknown.message);
  });

  it('does not throw on a malformed user id', async () => {
    const [card] = await mintGiftCards(rupeesToPaise(500), 1);
    if (!card) throw new Error('no card minted');

    const result = await redeemGiftCard('not-an-id', card.code, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('gift cards: code validation', () => {
  it('accepts a code with or without separators', () => {
    expect(giftCardSchema.safeParse({ code: '8U9S-Y3E8CQ-39MPQ' }).success).toBe(true);
    expect(giftCardSchema.safeParse({ code: '8u9s y3e8cq 39mpq' }).success).toBe(true);
  });

  it('rejects anything that is not fifteen characters', () => {
    for (const code of ['', 'ABC', '8U9S-Y3E8CQ-39MPQZZZ']) {
      expect(giftCardSchema.safeParse({ code }).success, code).toBe(false);
    }
  });
});
