import { ObjectId } from 'mongodb';

import { findCorridor, monthlyPassRupees, TOLL_CORRIDORS, tollRupees } from '@/data/transit-routes';
import {
  findIssuer,
  findTollClass,
  MAX_TAG_TOP_UP,
  MIN_TAG_TOP_UP,
  TAG_ISSUERS,
  TOLL_CLASSES,
} from '@/data/transit';
import { findModel, modelLabel, parseRegistration } from '@/data/vehicles';
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
 * FASTag.
 *
 * A tag is issued against a vehicle registration, topped up out of the
 * Eshwaran Pay wallet, and read at a plaza. This store has no feed from any plaza, so
 * the two things it can do honestly are the two things it does: **hold a real
 * balance** and **work out what a corridor costs**.
 *
 * A crossing is recorded only when the customer says they made one. That is
 * plainly a self-reported figure and the page says so -- the alternative, a
 * balance that ticks down on a timer, would be a made-up transaction dressed as
 * a toll read.
 */

export const TAG_LIMITS = { min: MIN_TAG_TOP_UP, max: MAX_TAG_TOP_UP };

export type IssueResult =
  | { ok: true; number: string; charged: Paise; balance: Paise }
  | {
      ok: false;
      code:
        'BAD_REGISTRATION' | 'UNKNOWN_ISSUER' | 'BAD_AMOUNT' | 'DUPLICATE' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface IssueInput {
  registration: string;
  issuerId: string;
  tollClass: string;
  /** Optional; a tag can be issued and topped up later. */
  modelId?: string;
  firstTopUpRupees: number;
}

/**
 * Issues a tag against a vehicle.
 *
 * The deposit and the issuance fee come from the issuer's book on the server;
 * the form carries an issuer id and a top-up, never a price. A tampered amount
 * field has nowhere to land, the same rule checkout and the recharge book both
 * follow.
 */
export async function issueTag(
  userId: string,
  input: IssueInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<IssueResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_REGISTRATION', message: 'Sign in and try again.' };
  }

  const registration = parseRegistration(input.registration);
  if (!registration) {
    return {
      ok: false,
      code: 'BAD_REGISTRATION',
      message: 'Enter the registration as it appears on the plate, for example TN 02 BQ 6666.',
    };
  }

  const issuer = findIssuer(input.issuerId);
  if (!issuer) {
    return { ok: false, code: 'UNKNOWN_ISSUER', message: 'Choose an issuer from the list.' };
  }

  const tollClass = findTollClass(input.tollClass);
  if (!tollClass) {
    return { ok: false, code: 'UNKNOWN_ISSUER', message: 'Choose what kind of vehicle it is.' };
  }

  const first = Math.round(input.firstTopUpRupees);
  if (!Number.isFinite(first) || first < MIN_TAG_TOP_UP || first > MAX_TAG_TOP_UP) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: 'A first recharge is between ' + MIN_TAG_TOP_UP + ' and ' + MAX_TAG_TOP_UP + '.',
    };
  }

  const model = input.modelId ? findModel(input.modelId) : undefined;

  const securityDeposit = rupeesToPaise(issuer.securityDepositRupees);
  const issuanceFee = rupeesToPaise(issuer.issuanceRupees);
  const firstTopUp = rupeesToPaise(first);
  const charged = securityDeposit + issuanceFee + firstTopUp;

  const accounts = await transitAccountsCollection();
  const doc: TransitAccountDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    kind: 'FASTAG',
    number: registration.normalised,
    providerId: issuer.id,
    providerName: issuer.name,
    vehicle: {
      registration: registration.pretty,
      modelId: model?.id ?? null,
      modelLabel: model ? modelLabel(model) : null,
      tollClass: tollClass.id,
    },
    securityDeposit,
    issuanceFee,
    minBalance: rupeesToPaise(issuer.minBalanceRupees),
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // The account goes in before any money moves, so a duplicate registration is
  // rejected by the unique index without having charged anybody. The index is
  // the rule here; a read-then-write could be raced past by a second click.
  try {
    await accounts.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return {
        ok: false,
        code: 'DUPLICATE',
        message: 'You already have a tag on ' + registration.pretty + '.',
      };
    }
    throw error;
  }

  // The wallet pays for the deposit, the fee and the first recharge; only the
  // recharge is spendable at a barrier, so only that part is credited to the
  // tag. Crediting the lot and taking it back off would leave a ledger that
  // says the customer once had money they never had.
  const paid = await topUp(
    doc,
    {
      charge: charged,
      credit: firstTopUp,
      walletType: 'FASTAG',
      note: 'Tag issued, first recharge',
    },
    now,
  );
  if (!paid.ok) {
    // Nothing was charged, so the empty account is removed rather than left
    // sitting there blocking a second attempt on the same registration.
    await accounts.deleteOne({ _id: doc._id });
    return { ok: false, code: 'INSUFFICIENT_BALANCE', message: paid.message };
  }

  await recordAuditAndAlert(
    {
      action: 'fastag.issued',
      actorId: userId,
      targetType: 'transitAccount',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        issuerId: issuer.id,
        tollClass: tollClass.id,
        charged,
        reference: paid.reference,
      },
    },
    'info',
  );

  return {
    ok: true,
    number: registration.pretty,
    charged,
    balance: await balanceOf(doc._id),
  };
}

export type RechargeTagResult =
  | { ok: true; reference: string; amount: Paise; balance: Paise; registration: string }
  | {
      ok: false;
      code: 'NO_TAG' | 'BAD_AMOUNT' | 'INSUFFICIENT_BALANCE' | 'DUPLICATE';
      message: string;
    };

export async function rechargeTag(
  userId: string,
  input: { registration: string; amountRupees: number },
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<RechargeTagResult> {
  const parsed = parseRegistration(input.registration);
  if (!parsed) {
    return { ok: false, code: 'NO_TAG', message: 'Enter the vehicle registration.' };
  }

  const account = await findAccount(userId, 'FASTAG', parsed.normalised);
  if (!account) {
    return {
      ok: false,
      code: 'NO_TAG',
      message: 'No tag on ' + parsed.pretty + '. Buy one first.',
    };
  }

  const amount = Math.round(input.amountRupees);
  if (!Number.isFinite(amount) || amount < MIN_TAG_TOP_UP || amount > MAX_TAG_TOP_UP) {
    return {
      ok: false,
      code: 'BAD_AMOUNT',
      message: 'A recharge is between ' + MIN_TAG_TOP_UP + ' and ' + MAX_TAG_TOP_UP + '.',
    };
  }

  const paid = await topUp(
    account,
    { charge: rupeesToPaise(amount), walletType: 'FASTAG', note: 'FASTag recharge' },
    now,
  );
  if (!paid.ok) return { ok: false, code: paid.code, message: paid.message };

  await recordAuditAndAlert(
    {
      action: 'fastag.recharged',
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
    registration: parsed.pretty,
  };
}

export type LogCrossingResult =
  | { ok: true; charged: Paise; balance: Paise; corridor: string }
  | { ok: false; code: 'NO_TAG' | 'UNKNOWN_CORRIDOR' | 'DUPLICATE'; message: string };

/**
 * Records a crossing the customer says they made.
 *
 * Self-reported, and the page says so. The balance is allowed to go negative,
 * because at a real plaza a tag below its minimum is refused and the vehicle
 * pays double in cash -- pretending the crossing did not happen would be the
 * less useful lie.
 */
export async function logCrossing(
  userId: string,
  input: { registration: string; corridorId: string; returnTrip?: boolean },
  now = new Date(),
): Promise<LogCrossingResult> {
  const parsed = parseRegistration(input.registration);
  if (!parsed) return { ok: false, code: 'NO_TAG', message: 'Enter the vehicle registration.' };

  const account = await findAccount(userId, 'FASTAG', parsed.normalised);
  if (!account) {
    return { ok: false, code: 'NO_TAG', message: 'No tag on ' + parsed.pretty + '.' };
  }

  const corridor = findCorridor(input.corridorId);
  if (!corridor) {
    return { ok: false, code: 'UNKNOWN_CORRIDOR', message: 'Choose a route from the list.' };
  }

  const tollClass = findTollClass(account.vehicle?.tollClass ?? 'CAR') ?? TOLL_CLASSES[0];
  const rupees = tollRupees(corridor, tollClass?.multiplier ?? 1, {
    ...(input.returnTrip ? { returnTrip: true } : {}),
  });
  const amount = rupeesToPaise(rupees);

  const written = await writeEntry(account, {
    type: 'TOLL',
    direction: 'DEBIT',
    amount,
    reference: transitReference('FASTAG'),
    note: corridor.name + (input.returnTrip ? ', return within 24 hours' : ''),
    now,
  });
  if (!written) {
    return { ok: false, code: 'DUPLICATE', message: 'That crossing is already recorded.' };
  }

  return {
    ok: true,
    charged: amount,
    balance: await balanceOf(account._id),
    corridor: corridor.name,
  };
}

/** What every corridor costs this vehicle class, for the estimator table. */
export function tollTable(tollClassId: string): Array<{
  id: string;
  name: string;
  highway: string;
  km: number;
  plazas: number;
  single: Paise;
  returnTrip: Paise;
  monthlyPass: Paise;
}> {
  const tollClass = findTollClass(tollClassId) ?? TOLL_CLASSES[0];
  const multiplier = tollClass?.multiplier ?? 1;

  return TOLL_CORRIDORS.map((corridor) => ({
    id: corridor.id,
    name: corridor.name,
    highway: corridor.highway,
    km: corridor.km,
    plazas: corridor.plazas,
    single: rupeesToPaise(tollRupees(corridor, multiplier)),
    returnTrip: rupeesToPaise(tollRupees(corridor, multiplier, { returnTrip: true })),
    monthlyPass: rupeesToPaise(monthlyPassRupees(corridor, multiplier)),
  }));
}

export async function tagsFor(userId: string): Promise<TransitAccountView[]> {
  return listAccounts(userId, 'FASTAG');
}

export async function tagHistory(
  userId: string,
  registration: string,
): Promise<{
  account: TransitAccountView;
  entries: TransitEntryView[];
} | null> {
  const parsed = parseRegistration(registration);
  if (!parsed) return null;

  const account = await findAccount(userId, 'FASTAG', parsed.normalised);
  if (!account) return null;

  return { account: await toAccountView(account), entries: await listEntries(account._id) };
}

export { TAG_ISSUERS, TOLL_CLASSES, TOLL_CORRIDORS };
