import { randomBytes } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { findInsurer } from '@/data/insurers';
import { modelLabel } from '@/data/vehicles';
import { insurancePoliciesCollection, walletEntriesCollection } from '@/lib/db/collections';
import { recordAuditAndAlert } from '@/lib/security/audit';
import type { Paise } from '@/lib/utils/money';
import type {
  InsurancePolicyDoc,
  PolicyKind,
  PolicyView,
  PremiumComponent,
} from '@/models/insurance-policy';
import type { WalletEntryDoc } from '@/models/wallet';

import { quoteHealth, type HealthQuoteInput } from './health-insurance';
import { quoteFrom, type QuoteInput } from './motor-insurance';
import { getWalletSummary } from './wallet';

import '@/lib/server-guard';

/**
 * Paying a premium.
 *
 * **This store issues no insurance.** Nothing below creates a contract of
 * insurance, and no risk is carried by anybody -- see the notes in
 * `data/insurers.ts` and `data/health-plans.ts`. What it does is move money out
 * of the Eshwaran Pay wallet and write down what it was for, so a premium behaves
 * like every other charge in this codebase: one ledger, one reference.
 *
 * **The premium is recomputed on the server.** The form carries a vehicle, an
 * insurer and a set of add-ons -- never an amount. The browser cannot name its
 * own price, the same rule checkout, Prime and the recharge book all follow.
 */

/** A term of cover, ending the day before the anniversary. */
function policyEnd(start: Date, years: number): Date {
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + years);
  end.setDate(end.getDate() - 1);
  return end;
}

function policyNumber(kind: PolicyKind): string {
  const prefix = kind === 'MOTOR' ? 'MP' : 'HP';
  return prefix + '-' + randomBytes(4).toString('hex').toUpperCase();
}

export type BuyPolicyResult =
  | { ok: true; policyNumber: string; premium: Paise; kind: PolicyKind }
  | {
      ok: false;
      code: 'BAD_INPUT' | 'UNKNOWN_INSURER' | 'INSUFFICIENT_BALANCE';
      message: string;
    };

export interface BuyMotorInput extends QuoteInput {
  insurerId: string;
  registration: string;
}

export async function buyMotorPolicy(
  userId: string,
  input: BuyMotorInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<BuyPolicyResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_INPUT', message: 'Sign in and try again.' };
  }

  const insurer = findInsurer(input.insurerId);
  if (!insurer) {
    return { ok: false, code: 'UNKNOWN_INSURER', message: 'That insurer is no longer quoting.' };
  }

  // Recomputed here from the vehicle and the options, never taken from the
  // form. Whatever the quotes page showed, this is the figure that is charged.
  const quote = quoteFrom(insurer, input);
  if (!quote) {
    return { ok: false, code: 'BAD_INPUT', message: 'Choose a vehicle from the list.' };
  }

  const components: PremiumComponent[] = quote.lines.map((line) => ({
    label: line.label,
    amount: line.amount,
  }));

  return persist(
    userId,
    {
      kind: 'MOTOR',
      insurerId: insurer.id,
      insurerName: insurer.name,
      vehicle: {
        registration: input.registration,
        modelId: quote.model.id,
        modelLabel: modelLabel(quote.model),
        ageMonths: input.ageMonths,
        idv: quote.idv,
        plan: quote.plan,
        claimFreeYears: input.claimFreeYears,
        addOnIds: quote.addOns.map((entry) => entry.addOn.id),
      },
      health: null,
      components,
      netPremium: quote.netPremium,
      tax: quote.tax,
      premium: quote.total,
      years: 1,
    },
    context,
    now,
  );
}

export interface BuyHealthInput extends HealthQuoteInput {
  insurerId: string;
}

export async function buyHealthPolicy(
  userId: string,
  input: BuyHealthInput,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<BuyPolicyResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'BAD_INPUT', message: 'Sign in and try again.' };
  }

  const insurer = findInsurer(input.insurerId);
  if (!insurer) {
    return { ok: false, code: 'UNKNOWN_INSURER', message: 'That insurer is no longer quoting.' };
  }

  const quoted = quoteHealth(input);
  if (!quoted.ok) return { ok: false, code: 'BAD_INPUT', message: quoted.message };
  const quote = quoted.quote;

  // The discount lines are shown against the base, which is what a customer
  // checks a quote against. They do not sum to the discount actually applied,
  // because that one is multiplicative -- so the line is labelled as being on
  // the base rather than made to add up to a figure that was never charged.
  const components: PremiumComponent[] = [
    { label: 'Premium, ' + quote.ratedBand + ' band', amount: quote.basePremium },
    ...quote.discounts.map((discount) => ({
      label: discount.name + ' (' + discount.percent + '% of base)',
      amount: -Math.round((quote.basePremium * discount.percent) / 100),
    })),
    { label: 'Tax (' + quote.taxPercent + '%)', amount: quote.tax },
  ];

  return persist(
    userId,
    {
      kind: 'HEALTH',
      insurerId: insurer.id,
      insurerName: insurer.name,
      vehicle: null,
      health: {
        sumInsuredLakhs: quote.sumInsuredLakhs,
        members: quote.members,
        termYears: quote.termYears,
        ratedAge: quote.ratedAge,
      },
      components,
      netPremium: quote.netPremium,
      tax: quote.tax,
      premium: quote.total,
      years: quote.termYears,
    },
    context,
    now,
  );
}

interface PersistInput {
  kind: PolicyKind;
  insurerId: string;
  insurerName: string;
  vehicle: InsurancePolicyDoc['vehicle'];
  health: InsurancePolicyDoc['health'];
  components: PremiumComponent[];
  netPremium: Paise;
  tax: Paise;
  premium: Paise;
  years: number;
}

async function persist(
  userId: string,
  input: PersistInput,
  context: { ip: string | null; userAgent: string | null },
  now: Date,
): Promise<BuyPolicyResult> {
  const { balance } = await getWalletSummary(userId);
  if (balance < input.premium) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BALANCE',
      message: 'Your Eshwaran Pay balance is not enough for this premium. Add money and try again.',
    };
  }

  const number = policyNumber(input.kind);

  // Debit first. If the process dies between the two writes the customer is
  // charged with no policy recorded, which support can see and put right. The
  // other order hands out free cover to anyone who can crash a request.
  const wallet = await walletEntriesCollection();
  const debit: WalletEntryDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    type: 'INSURANCE',
    direction: 'DEBIT',
    amount: input.premium,
    status: 'COMPLETED',
    currency: 'INR',
    reference: number,
    failureReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await wallet.insertOne(debit);

  const policies = await insurancePoliciesCollection();
  const doc: InsurancePolicyDoc = {
    _id: new ObjectId(),
    userId: new ObjectId(userId),
    kind: input.kind,
    policyNumber: number,
    insurerId: input.insurerId,
    insurerName: input.insurerName,
    vehicle: input.vehicle,
    health: input.health,
    components: input.components,
    netPremium: input.netPremium,
    tax: input.tax,
    premium: input.premium,
    startsAt: now,
    expiresAt: policyEnd(now, input.years),
    createdAt: now,
  };
  await policies.insertOne(doc);

  await recordAuditAndAlert(
    {
      action: 'insurance.policy.bought',
      actorId: userId,
      targetType: 'insurancePolicy',
      targetId: doc._id.toHexString(),
      ip: context.ip,
      userAgent: context.userAgent,
      // No registration number and no ages: an audit row is read by staff and
      // does not need the customer's personal details to be useful.
      metadata: {
        kind: input.kind,
        insurerId: input.insurerId,
        premium: input.premium,
        policyNumber: number,
      },
    },
    'info',
  );

  return { ok: true, policyNumber: number, premium: input.premium, kind: input.kind };
}

function subjectOf(doc: InsurancePolicyDoc): string {
  if (doc.vehicle) return doc.vehicle.registration + ' - ' + doc.vehicle.modelLabel;
  if (doc.health) {
    const adults = doc.health.members.filter((member) => member.kind === 'ADULT').length;
    const children = doc.health.members.length - adults;
    const parts = [adults + (adults === 1 ? ' adult' : ' adults')];
    if (children > 0) parts.push(children + (children === 1 ? ' child' : ' children'));
    return parts.join(', ') + ' - ' + doc.health.sumInsuredLakhs + 'L cover';
  }
  return doc.policyNumber;
}

/** A customer's policies, newest first. Ownership is in the query. */
export async function listPolicies(userId: string, limit = 10): Promise<PolicyView[]> {
  if (!ObjectId.isValid(userId)) return [];

  const policies = await insurancePoliciesCollection();
  const docs = await policies
    .find({ userId: new ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    id: doc._id.toHexString(),
    kind: doc.kind,
    policyNumber: doc.policyNumber,
    insurerName: doc.insurerName,
    subject: subjectOf(doc),
    premium: doc.premium,
    components: doc.components,
    startsAt: doc.startsAt,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
  }));
}
