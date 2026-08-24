import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { videoEntitlementsCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import { findChannel, findTitle } from '@/data/video-catalogue';
import type { VideoEntitlementKind } from '@/models/video';
import type { WalletEntryDoc } from '@/models/wallet';

import { creditBalance, spendCredit } from './content-credit';
import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Rentals and channel subscriptions.
 *
 * Paid out of **App Store credit first, and the Eshwaran Pay wallet for whatever
 * is left**. Credit is the more restricted instrument -- it buys digital
 * content and cannot be withdrawn -- so spending it first is both what a
 * customer would want and what every store that issues credit does. A customer
 * holding no credit is unaffected, which is why the path did not have to change
 * shape to accommodate it.
 *
 * An entitlement is defined by its expiry and nothing else. A rental runs 48
 * hours, a channel 30 days, and both simply stop working when the clock passes
 * them -- there is no flag to fall out of step and no job to run.
 */

/** Hours a rental stays watchable once started. */
export const RENTAL_WINDOW_HOURS = 48;
/** Days a channel subscription runs before it lapses. */
export const CHANNEL_WINDOW_DAYS = 30;

export interface Entitlement {
  kind: VideoEntitlementKind;
  refId: string;
  expiresAt: Date;
  hoursLeft: number;
}

/** Everything the customer can watch right now. */
export async function listEntitlements(
  userId: string | null,
  now = new Date(),
): Promise<Entitlement[]> {
  if (!userId || !ObjectId.isValid(userId)) return [];

  const entitlements = await videoEntitlementsCollection();
  const docs = await entitlements
    .find({ userId: new ObjectId(userId), expiresAt: { $gt: now } })
    .toArray();

  return docs.map((doc) => ({
    kind: doc.kind,
    refId: doc.refId,
    expiresAt: doc.expiresAt,
    hoursLeft: Math.max(0, Math.ceil((doc.expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000))),
  }));
}

export type PurchaseResult =
  | { ok: true; expiresAt: Date }
  | {
      ok: false;
      code: 'UNKNOWN' | 'ALREADY_HELD' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

/**
 * Charges the wallet and writes the entitlement.
 *
 * The debit goes first: if the process dies between the two the customer is
 * charged and un-entitled, which support can fix. The other order hands out
 * free entitlements to anyone who can crash the request at the right moment.
 */
async function purchase(
  userId: string,
  kind: VideoEntitlementKind,
  refId: string,
  price: Paise,
  windowMs: number,
  auditAction: 'video.rented' | 'video.channel.subscribed',
  context: { ip: string | null; userAgent: string | null },
  now: Date,
): Promise<PurchaseResult> {
  const entitlements = await videoEntitlementsCollection();
  const filter = { userId: new ObjectId(userId), kind, refId };

  const held = await entitlements.findOne({ ...filter, expiresAt: { $gt: now } });
  if (held) {
    return {
      ok: false,
      code: 'ALREADY_HELD',
      message:
        kind === 'RENTAL'
          ? 'You already have this rental. It is in Your library until it expires.'
          : 'You are already subscribed to this channel.',
    };
  }

  // Checked against credit *and* wallet together, so a customer with enough
  // between the two is not turned away for being short in one of them.
  const credit = await creditBalance(userId, 'APPSTORE');
  const { balance } = await getWalletSummary(userId);
  if (credit + balance < price) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message:
        credit > 0
          ? 'Your App Store credit and Eshwaran Pay balance together are not enough. Add money and try again.'
          : 'Your Eshwaran Pay balance is not enough. Add money and try again.',
    };
  }

  const reference = `PV-${randomBytes(3).toString('hex').toUpperCase()}`;

  // Credit first, then the wallet covers the remainder. `spendCredit` is a
  // no-op for anybody holding none, and returns the whole price for the wallet.
  const spent = await spendCredit(
    userId,
    'APPSTORE',
    price,
    kind === 'RENTAL' ? 'Rental' : 'Channel subscription',
    now,
  );

  if (spent.fromWallet > 0) {
    const wallet = await walletEntriesCollection();
    const debit: WalletEntryDoc = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      type: 'VIDEO',
      direction: 'DEBIT',
      amount: spent.fromWallet,
      status: 'COMPLETED',
      currency: 'INR',
      reference,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await wallet.insertOne(debit);
  }

  const expiresAt = new Date(now.getTime() + windowMs);
  await entitlements.updateOne(
    filter,
    {
      $set: {
        userId: new ObjectId(userId),
        kind,
        refId,
        pricePaid: price,
        startedAt: now,
        expiresAt,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  await recordAuditAndAlert(
    {
      action: auditAction,
      actorId: userId,
      targetType: kind === 'RENTAL' ? 'videoTitle' : 'videoChannel',
      targetId: refId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { price, fromCredit: spent.fromCredit, fromWallet: spent.fromWallet },
    },
    'info',
  );

  return { ok: true, expiresAt };
}

export async function rentTitle(
  userId: string,
  titleId: string,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<PurchaseResult> {
  const title = findTitle(titleId);
  if (!title || title.tier !== 'RENTAL' || !ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN', message: 'That title is not available to rent.' };
  }

  return purchase(
    userId,
    'RENTAL',
    title.id,
    rupeesToPaise(title.rentRupees),
    RENTAL_WINDOW_HOURS * 60 * 60 * 1000,
    'video.rented',
    context,
    now,
  );
}

export async function subscribeChannel(
  userId: string,
  channelId: string,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<PurchaseResult> {
  const channel = findChannel(channelId);
  if (!channel || !ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN', message: 'That channel is not available.' };
  }

  return purchase(
    userId,
    'CHANNEL',
    channel.id,
    rupeesToPaise(channel.priceRupees),
    CHANNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    'video.channel.subscribed',
    context,
    now,
  );
}
