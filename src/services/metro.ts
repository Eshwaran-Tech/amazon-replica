import { createHash } from 'node:crypto';

import { ObjectId } from 'mongodb';

import {
  cardFare,
  findNetwork,
  MAX_METRO_TOP_UP,
  METRO_NETWORKS,
  METRO_TOP_UPS,
  MIN_METRO_TOP_UP,
  slabFare,
} from '@/data/transit';
import { findStation, stationsOn, trackKm } from '@/data/transit-routes';
import { transitAccountsCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';
import type { TransitAccountDoc, TransitAccountView, TransitEntryView } from '@/models/transit';

import {
  balanceOf,
  findAccount,
  listAccounts,
  listEntries,
  toAccountView,
  topUp,
  transitReference,
  writeEntry,
} from './transit-ledger';

import '@/lib/server-guard';

/**
 * Metro cards.
 *
 * The same prepaid account a FASTag is, keyed by a card number instead of a
 * registration. What differs is the fare rule: a metro charges by distance
 * slab, and a card is cheaper than a token at the same gate -- which is the
 * whole reason anybody carries one.
 *
 * A journey is recorded when the customer says they made one. This store has no
 * feed from any gate, and a balance that ticked down on its own would be an
 * invented transaction wearing a fare's clothes.
 */

export const METRO_LIMITS = { min: MIN_METRO_TOP_UP, max: MAX_METRO_TOP_UP };

/** Card numbers are 12 digits, grouped in fours for reading. */
const CARD_NUMBER_PATTERN = /^\d{12}$/;

export function normaliseCardNumber(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return CARD_NUMBER_PATTERN.test(digits) ? digits : null;
}

export function prettyCardNumber(number: string): string {
  return (number.match(/.{1,4}/g) ?? [number]).join(' ');
}

/**
 * A card number for a new card.
 *
 * Derived from the network and the customer so that adding the same card twice
 * produces the same number and the unique index catches it -- rather than a
 * random number that would let one person hold ten cards on one network by
 * clicking twice. The digits carry no secret: a card number is printed on the
 * card, so there is nothing here to protect.
 */
export function deriveCardNumber(networkId: string, userId: string, sequence: number): string {
  const digest = createHash('sha256')
    .update(networkId + ':' + userId + ':' + sequence)
    .digest('hex');
  const digits = digest.replace(/\D/g, '');
  // The first two digits identify the network, as they do on a real card.
  const prefix = String(
    (METRO_NETWORKS.findIndex((network) => network.id === networkId) + 1) * 11,
  ).padStart(2, '0');
  return (prefix + digits).slice(0, 12);
}

export type AddCardResult =
  | { ok: true; number: string; pretty: string; charged: Paise; balance: Paise }
  | {
      ok: false;
      code: 'UNKNOWN_NETWORK' | 'BAD_AMOUNT' | 'DUPLICATE' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

/**
 * Issues a card on a network and loads it.
 *
 * The price comes from the network's book on the server. The form carries a
 * network id and a top-up amount, never a total.
 */
export async function addCard(
  userId: string,
  input: { networkId: string; firstTopUpRupees: number },
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<AddCardResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'UNKNOWN_NETWORK', message: 'Sign in and try again.' };
  }

  const network = findNetwork(input.networkId);
  if (!network) {
    return { ok: false, code: 'UNKNOWN_NETWORK', message: 'Choose a city from the list.' };
  }

  const first = Math.round(input.firstTopUpRupees);
  if (!Number.isFinite(first) || first < MIN_METRO_TOP_UP || first > MAX_METRO_TOP_UP) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: 'A first load is between ' + MIN_METRO_TOP_UP + ' and ' + MAX_METRO_TOP_UP + '.',
    };
  }

  const number = deriveCardNumber(network.id, userId, 1);
  const amount = rupeesToPaise(first);

  const accounts = await transitAccountsCollection();
  const doc: TransitAccountDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    kind: 'METRO',
    number,
    providerId: network.id,
    providerName: network.name,
    vehicle: null,
    securityDeposit: 0,
    issuanceFee: 0,
    minBalance: rupeesToPaise(network.minBalanceRupees),
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // In before the money moves: a second card on the same network hits the
  // unique index without anybody having been charged.
  try {
    await accounts.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return {
        ok: false,
        code: 'DUPLICATE',
        message: 'You already hold a ' + network.cardName + '. Recharge it instead.',
      };
    }
    throw error;
  }

  const paid = await topUp(
    doc,
    { charge: amount, walletType: 'METRO', note: network.cardName + ' issued' },
    now,
  );
  if (!paid.ok) {
    await accounts.deleteOne({ _id: doc._id });
    return { ok: false, code: 'INSUFFICIENT_BALANCE', message: paid.message };
  }

  await recordAuditAndAlert(
    {
      action: 'metro.card.added',
      actorId: userId,
      targetType: 'transitAccount',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { networkId: network.id, charged: amount, reference: paid.reference },
    },
    'info',
  );

  return {
    ok: true,
    number,
    pretty: prettyCardNumber(number),
    charged: amount,
    balance: await balanceOf(doc._id),
  };
}

export type RechargeCardResult =
  | { ok: true; reference: string; amount: Paise; balance: Paise; pretty: string }
  | {
      ok: false;
      code: 'NO_CARD' | 'BAD_AMOUNT' | 'INSUFFICIENT_BALANCE' | 'DUPLICATE';
      message: string;
    };

export async function rechargeCard(
  userId: string,
  input: { number: string; amountRupees: number },
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<RechargeCardResult> {
  const number = normaliseCardNumber(input.number);
  if (!number) {
    return { ok: false, code: 'NO_CARD', message: 'A card number is twelve digits.' };
  }

  const account = await findAccount(userId, 'METRO', number);
  if (!account) {
    return { ok: false, code: 'NO_CARD', message: 'That card is not on your account.' };
  }

  const amount = Math.round(input.amountRupees);
  if (!Number.isFinite(amount) || amount < MIN_METRO_TOP_UP || amount > MAX_METRO_TOP_UP) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: 'A recharge is between ' + MIN_METRO_TOP_UP + ' and ' + MAX_METRO_TOP_UP + '.',
    };
  }

  const paid = await topUp(
    account,
    { charge: rupeesToPaise(amount), walletType: 'METRO', note: 'Card recharge' },
    now,
  );
  if (!paid.ok) return { ok: false, code: paid.code, message: paid.message };

  await recordAuditAndAlert(
    {
      action: 'metro.recharged',
      actorId: userId,
      targetType: 'transitAccount',
      targetId: account._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: { amount: paid.charged, reference: paid.reference },
    },
    'info',
  );

  return {
    ok: true,
    reference: paid.reference,
    amount: paid.charged,
    balance: paid.balance,
    pretty: prettyCardNumber(number),
  };
}

export interface FareQuote {
  fromName: string;
  toName: string;
  km: number;
  /** Paid at a ticket window. */
  tokenFare: Paise;
  /** Paid with the card. */
  cardFare: Paise;
  saving: Paise;
  discountPercent: number;
}

/** What a journey costs, on a token and on a card. */
export function quoteJourney(fromId: string, toId: string): FareQuote | null {
  const from = findStation(fromId);
  const to = findStation(toId);
  if (!from || !to || from.id === to.id || from.networkId !== to.networkId) return null;

  const network = findNetwork(from.networkId);
  if (!network) return null;

  const km = trackKm(from, to);
  const token = rupeesToPaise(slabFare(km));
  const card = rupeesToPaise(cardFare(km, network));

  return {
    fromName: from.name,
    toName: to.name,
    km: Math.round(km * 10) / 10,
    tokenFare: token,
    cardFare: card,
    saving: token - card,
    discountPercent: network.cardDiscountPercent,
  };
}

export type LogJourneyResult =
  | { ok: true; charged: Paise; balance: Paise; journey: string }
  | { ok: false; code: 'NO_CARD' | 'BAD_JOURNEY' | 'DUPLICATE'; message: string };

/**
 * Records a journey the customer says they made.
 *
 * Self-reported, and the page says so. The card is charged the card fare, not
 * the token fare, because that is what a gate would have taken.
 */
export async function logJourney(
  userId: string,
  input: { number: string; fromId: string; toId: string },
  now = new Date(),
): Promise<LogJourneyResult> {
  const number = normaliseCardNumber(input.number);
  if (!number) return { ok: false, code: 'NO_CARD', message: 'A card number is twelve digits.' };

  const account = await findAccount(userId, 'METRO', number);
  if (!account) {
    return { ok: false, code: 'NO_CARD', message: 'That card is not on your account.' };
  }

  const quote = quoteJourney(input.fromId, input.toId);
  if (!quote) {
    return { ok: false, code: 'BAD_JOURNEY', message: 'Choose two stations on the same network.' };
  }

  const from = findStation(input.fromId);
  if (!from || from.networkId !== account.providerId) {
    return {
      ok: false,
      code: 'BAD_JOURNEY',
      message: 'That journey is on a different network from this card.',
    };
  }

  const written = await writeEntry(account, {
    type: 'FARE',
    direction: 'DEBIT',
    amount: quote.cardFare,
    reference: transitReference('METRO'),
    note: quote.fromName + ' to ' + quote.toName,
    now,
  });
  if (!written) {
    return { ok: false, code: 'DUPLICATE', message: 'That journey is already recorded.' };
  }

  return {
    ok: true,
    charged: quote.cardFare,
    balance: await balanceOf(account._id),
    journey: quote.fromName + ' to ' + quote.toName,
  };
}

export async function cardsFor(userId: string): Promise<TransitAccountView[]> {
  return listAccounts(userId, 'METRO');
}

export async function cardHistory(
  userId: string,
  number: string,
): Promise<{ account: TransitAccountView; entries: TransitEntryView[] } | null> {
  const normalised = normaliseCardNumber(number);
  if (!normalised) return null;

  const account = await findAccount(userId, 'METRO', normalised);
  if (!account) return null;

  return { account: await toAccountView(account), entries: await listEntries(account._id) };
}

export { METRO_NETWORKS, METRO_TOP_UPS, stationsOn };
