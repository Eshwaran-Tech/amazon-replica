import { randomBytes } from 'node:crypto';

import { ObjectId, type Filter } from 'mongodb';

import {
  bonusFor,
  findStore,
  MAX_BALANCE_RUPEES,
  MAX_RELOADS_PER_MONTH,
  MAX_TOP_UP,
  MIN_TOP_UP,
} from '@/data/content-stores';
import {
  autoReloadsCollection,
  contentCreditsCollection,
  walletEntriesCollection,
} from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import type {
  AutoReloadDoc,
  ContentCreditDoc,
  ContentStore,
  CreditEntryView,
} from '@/models/content-credit';
import type { WalletEntryDoc } from '@/models/wallet';

import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * App store and Play credit.
 *
 * A scoped balance, derived from a ledger. The rules that make it a credit
 * rather than a second wallet:
 *
 *  - It is **spent before the Eshwaran Pay balance** on anything it covers, which
 *    is what `spendCredit` is for and why the video rentals call it.
 *  - It **cannot be withdrawn**, and there is deliberately no path here that
 *    moves it back into the wallet.
 *  - **Automatic reload** may charge the wallet without the customer pressing
 *    anything, so it is capped per month and every firing is written to the
 *    ledger with its own reference.
 */

function reference(): string {
  return `CR-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function monthKeyOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Sums a store's ledger for one customer. CREDIT adds, DEBIT subtracts. */
export async function creditBalance(userId: string, store: ContentStore): Promise<Paise> {
  if (!ObjectId.isValid(userId)) return 0;

  const credits = await contentCreditsCollection();
  const rows = await credits
    .aggregate<{ _id: 'CREDIT' | 'DEBIT'; total: number }>([
      { $match: { userId: new ObjectId(userId), store } },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ])
    .toArray();

  let balance = 0;
  for (const row of rows) balance += row._id === 'CREDIT' ? row.total : -row.total;
  return balance;
}

export async function creditBalances(userId: string): Promise<Record<ContentStore, Paise>> {
  const [appstore, play] = await Promise.all([
    creditBalance(userId, 'APPSTORE'),
    creditBalance(userId, 'PLAY'),
  ]);
  return { APPSTORE: appstore, PLAY: play };
}

export async function listCreditEntries(
  userId: string,
  store?: ContentStore,
  limit = 15,
): Promise<CreditEntryView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const credits = await contentCreditsCollection();
  const filter: Filter<ContentCreditDoc> = { userId: new ObjectId(userId) };
  if (store) filter.store = store;

  const docs = await credits.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    store: doc.store,
    type: doc.type,
    direction: doc.direction,
    amount: doc.amount,
    reference: doc.reference,
    note: doc.note,
    createdAt: doc.createdAt,
  }));
}

/**
 * Writes one ledger entry, returning false if its reference already exists.
 *
 * The uniqueness is the index's, not a read-then-write, so a retry that gets as
 * far as the second write is refused by the database rather than crediting
 * twice.
 */
async function writeEntry(doc: ContentCreditDoc): Promise<boolean> {
  const credits = await contentCreditsCollection();
  try {
    await credits.insertOne(doc);
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export type TopUpResult =
  | { ok: true; reference: string; charged: Paise; credited: Paise; bonus: Paise; balance: Paise }
  | {
      ok: false;
      code: 'BAD_STORE' | 'BAD_AMOUNT' | 'CAP' | 'INSUFFICIENT_BALANCE' | 'DUPLICATE';
      message: string;
    };

/**
 * Buys credit out of the Eshwaran Pay balance.
 *
 * The bonus is computed here from the amount, never taken from the form -- so a
 * tampered bonus field has nowhere to land.
 */
export async function topUpCredit(
  userId: string,
  input: { store: string; rupees: number },
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<TopUpResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_STORE', message: 'Sign in and try again.' };
  }

  const store = findStore(input.store);
  if (!store) return { ok: false, code: 'BAD_STORE', message: 'Choose a store.' };

  const rupees = Math.round(input.rupees);
  if (!Number.isFinite(rupees) || rupees < MIN_TOP_UP || rupees > MAX_TOP_UP) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: `A top-up is between ₹${MIN_TOP_UP} and ₹${MAX_TOP_UP.toLocaleString('en-IN')}.`,
    };
  }

  const charged = rupeesToPaise(rupees);
  const bonus = rupeesToPaise(bonusFor(rupees));

  const held = await creditBalance(userId, store.id);
  if (held + charged + bonus > rupeesToPaise(MAX_BALANCE_RUPEES)) {
    return {
      ok: false,
      code: 'CAP',
      message: `A store credit balance is capped at ₹${MAX_BALANCE_RUPEES.toLocaleString('en-IN')}.`,
    };
  }

  const { balance: wallet } = await getWalletSummary(userId);
  if (wallet < charged) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough. Add money and try again.',
    };
  }

  const ref = reference();
  const credited = await creditFromWallet(userId, store.id, {
    charge: charged,
    credit: charged,
    bonus,
    reference: ref,
    type: 'TOP_UP',
    note: `${store.name} top-up`,
    now,
  });
  if (!credited) {
    return { ok: false, code: 'DUPLICATE', message: 'That top-up has already gone through.' };
  }

  await recordAuditAndAlert(
    {
      action: 'credit.topped.up',
      actorId: userId,
      targetType: 'contentCredit',
      targetId: ref,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { store: store.id, charged, bonus, reference: ref },
    },
    'info',
  );

  return {
    ok: true,
    reference: ref,
    charged,
    credited: charged + bonus,
    bonus,
    balance: await creditBalance(userId, store.id),
  };
}

/** The wallet debit and the credit entries, in that order. */
async function creditFromWallet(
  userId: string,
  store: ContentStore,
  input: {
    charge: Paise;
    credit: Paise;
    bonus: Paise;
    reference: string;
    type: 'TOP_UP' | 'AUTO_RELOAD';
    note: string;
    now: Date;
  },
): Promise<boolean> {
  // Debit first: a crash between the two leaves the customer charged with
  // nothing credited, which support can see and put right. The other order
  // hands out credit to anyone who can crash a request.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'CONTENT_CREDIT',
    direction: 'DEBIT',
    amount: input.charge,
    status: 'COMPLETED',
    currency: 'INR',
    reference: input.reference,
    failureReason: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await wallet.insertOne(debit);

  const written = await writeEntry({
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    store,
    type: input.type,
    direction: 'CREDIT',
    amount: input.credit,
    reference: input.reference,
    note: input.note,
    createdAt: input.now,
  });
  if (!written) return false;

  if (input.bonus > 0) {
    await writeEntry({
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      store,
      type: 'BONUS',
      direction: 'CREDIT',
      amount: input.bonus,
      // Suffixed so the bonus has its own row under the same unique index.
      reference: `${input.reference}-B`,
      note: 'Top-up bonus',
      createdAt: input.now,
    });
  }

  return true;
}

// -------------------------------------------------------------- auto-reload

export async function getAutoReload(
  userId: string,
  store: ContentStore,
): Promise<AutoReloadDoc | null> {
  if (!ObjectId.isValid(userId)) return null;
  const collection = await autoReloadsCollection();
  return collection.findOne({ userId: new ObjectId(userId), store });
}

export async function setAutoReload(
  userId: string,
  store: ContentStore,
  input: { enabled: boolean; thresholdRupees: number; amountRupees: number },
  now = new Date(),
): Promise<boolean> {
  if (!ObjectId.isValid(userId)) return false;

  const collection = await autoReloadsCollection();
  await collection.updateOne(
    { userId: new ObjectId(userId), store },
    {
      $set: {
        enabled: input.enabled,
        thresholdRupees: input.thresholdRupees,
        amountRupees: input.amountRupees,
        maxPerMonth: MAX_RELOADS_PER_MONTH,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: new ObjectId(userId),
        store,
        reloadsThisMonth: 0,
        monthKey: monthKeyOf(now),
      },
    },
    { upsert: true },
  );
  return true;
}

/**
 * Tops the balance up if the rule says to.
 *
 * Called from `spendCredit`, which is the only place it can honestly go: the
 * whole point of the feature is that it fires when the balance runs low, and
 * the balance only runs low when something is spent.
 *
 * The month counter is advanced with a conditional update rather than a read
 * and a write, so two purchases landing together cannot both see "0 reloads so
 * far" and both fire.
 */
async function maybeReload(userId: string, store: ContentStore, now: Date): Promise<void> {
  const rule = await getAutoReload(userId, store);
  if (!rule?.enabled) return;

  const balance = await creditBalance(userId, store);
  if (balance >= rupeesToPaise(rule.thresholdRupees)) return;

  const monthKey = monthKeyOf(now);
  const collection = await autoReloadsCollection();

  // Reset the counter when the month turns, and claim a slot in the same
  // update. `reloadsThisMonth` moving is what makes the claim exclusive.
  if (rule.monthKey !== monthKey) {
    await collection.updateOne(
      { _id: rule._id, monthKey: rule.monthKey },
      { $set: { monthKey, reloadsThisMonth: 0 } },
    );
  }

  const claimed = await collection.findOneAndUpdate(
    { _id: rule._id, monthKey, reloadsThisMonth: { $lt: rule.maxPerMonth } },
    { $inc: { reloadsThisMonth: 1 } },
    { returnDocument: 'after' },
  );
  if (!claimed) return;

  const charge = rupeesToPaise(rule.amountRupees);
  const { balance: wallet } = await getWalletSummary(userId);
  if (wallet < charge) {
    // Not enough in the wallet: give the slot back rather than burning one.
    await collection.updateOne({ _id: rule._id }, { $inc: { reloadsThisMonth: -1 } });
    return;
  }

  const ref = reference();
  await creditFromWallet(userId, store, {
    charge,
    credit: charge,
    bonus: rupeesToPaise(bonusFor(rule.amountRupees)),
    reference: ref,
    type: 'AUTO_RELOAD',
    note: `Automatic reload below ₹${rule.thresholdRupees}`,
    now,
  });

  await recordAuditAndAlert(
    {
      action: 'credit.auto.reloaded',
      actorId: userId,
      targetType: 'contentCredit',
      targetId: ref,
      ip: null,
      userAgent: null,
      metadata: { store, charge, reference: ref },
    },
    'info',
  );
}

// ------------------------------------------------------------------- spend

export interface SpendOutcome {
  /** Taken off the store credit. */
  fromCredit: Paise;
  /** Still to come from the wallet. */
  fromWallet: Paise;
}

/**
 * Spends store credit against a purchase, as far as it goes.
 *
 * Returns what is left for the wallet to cover, so the caller charges the
 * remainder. Credit first is the rule -- it is the more restricted instrument,
 * so spending it first is what a customer would want and what every store that
 * issues credit does.
 *
 * Called by the video rentals. It is a no-op for anybody with no credit, which
 * is why the rental path did not have to change shape to accommodate it.
 */
export async function spendCredit(
  userId: string,
  store: ContentStore,
  amount: Paise,
  note: string,
  now = new Date(),
): Promise<SpendOutcome> {
  if (!ObjectId.isValid(userId) || amount <= 0) {
    return { fromCredit: 0, fromWallet: amount };
  }

  const balance = await creditBalance(userId, store);
  if (balance <= 0) {
    await maybeReload(userId, store, now);
    const refreshed = await creditBalance(userId, store);
    if (refreshed <= 0) return { fromCredit: 0, fromWallet: amount };
    return spendFrom(userId, store, amount, refreshed, note, now);
  }

  return spendFrom(userId, store, amount, balance, note, now);
}

async function spendFrom(
  userId: string,
  store: ContentStore,
  amount: Paise,
  balance: Paise,
  note: string,
  now: Date,
): Promise<SpendOutcome> {
  const fromCredit = Math.min(balance, amount);
  if (fromCredit <= 0) return { fromCredit: 0, fromWallet: amount };

  await writeEntry({
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    store,
    type: 'SPEND',
    direction: 'DEBIT',
    amount: fromCredit,
    reference: reference(),
    note,
    createdAt: now,
  });

  // Checked after the spend, because that is when the balance is actually low.
  await maybeReload(userId, store, now);

  return { fromCredit, fromWallet: amount - fromCredit };
}
