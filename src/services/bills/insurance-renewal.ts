import { ObjectId } from 'mongodb';

import { findInsurer, NCB_LADDER, type PlanType } from '@/data/insurers';
import { insurancePoliciesCollection } from '@/lib/db/collections';
import type { Paise } from '@/lib/utils/money';
import type { InsurancePolicyDoc, PolicyKind } from '@/models/insurance-policy';
import { quoteHealth } from '@/services/health-insurance';
import { buyHealthPolicy, buyMotorPolicy } from '@/services/insurance-purchase';
import { quoteFrom } from '@/services/motor-insurance';

import '@/lib/server-guard';

/**
 * Renewing a policy.
 *
 * The one bill on this page that is not derived from a number somebody typed:
 * it comes from the policies **this store actually issued**, in
 * `insurancePolicies`. Nothing is guessed and nothing is invented -- if you
 * have no policy here, there is nothing to renew, and the page says so rather
 * than conjuring one.
 *
 * Two things make a renewal quote differ from the original, and both are real:
 *
 *  - **A claim-free year moves you up the no-claim-bonus ladder**, so a motor
 *    renewal is usually *cheaper* than the policy it replaces. That is the
 *    single most valuable thing about renewing on time and almost no renewal
 *    notice makes it legible.
 *  - **The vehicle is a year older**, so its declared value has fallen and the
 *    own-damage rate has risen. Those pull the other way.
 *
 * Both are applied, and the page shows the two against each other.
 */

export interface RenewalOffer {
  policyId: string;
  policyNumber: string;
  kind: PolicyKind;
  insurerId: string;
  insurerName: string;
  subject: string;
  expiresAt: Date;
  /** Negative once it has lapsed. */
  daysToExpiry: number;
  /** Cover continues for this many days past expiry, on a motor policy. */
  graceDays: number;
  lapsed: boolean;
  /** What was paid last time. */
  lastPremium: Paise;
  /** What renewing costs now. */
  premium: Paise;
  /** Renewal minus last time. Negative is cheaper. */
  change: Paise;
  /** Why it moved, in the customer's terms. */
  reasons: string[];
  /** Motor only: the bonus this renewal earns. */
  ncb: { from: number; to: number } | null;
}

/**
 * A motor policy renewed on time earns the next rung of the bonus ladder.
 *
 * Let it lapse past the grace period and the whole bonus is lost -- back to
 * zero, however many claim-free years came before. That is the real rule and
 * the reason a renewal notice is worth reading.
 */
export const MOTOR_GRACE_DAYS = 90;

function nextNcb(current: number): number {
  const rungs = NCB_LADDER.map((rung) => rung.claimFreeYears);
  const index = rungs.indexOf(current);
  return rungs[Math.min(rungs.length - 1, index + 1)] ?? current;
}

function subjectOf(doc: InsurancePolicyDoc): string {
  if (doc.vehicle) return `${doc.vehicle.registration} · ${doc.vehicle.modelLabel}`;
  if (doc.health) {
    const adults = doc.health.members.filter((member) => member.kind === 'ADULT').length;
    const children = doc.health.members.length - adults;
    const parts = [`${adults} adult${adults === 1 ? '' : 's'}`];
    if (children > 0) parts.push(`${children} child${children === 1 ? '' : 'ren'}`);
    return `${parts.join(', ')} · ${doc.health.sumInsuredLakhs}L cover`;
  }
  return doc.policyNumber;
}

/** Every policy the customer holds, with what renewing each would cost. */
export async function renewalOffers(userId: string, now = new Date()): Promise<RenewalOffer[]> {
  if (!ObjectId.isValid(userId)) return [];

  const policies = await insurancePoliciesCollection();
  const docs = await policies
    .find({ userId: new ObjectId(userId) })
    .sort({ expiresAt: 1 })
    .limit(20)
    .toArray();

  const offers: RenewalOffer[] = [];
  for (const doc of docs) {
    const offer = offerFor(doc, now);
    if (offer) offers.push(offer);
  }
  return offers;
}

export async function offerForPolicy(
  userId: string,
  policyNumber: string,
  now = new Date(),
): Promise<RenewalOffer | null> {
  if (!ObjectId.isValid(userId)) return null;

  const policies = await insurancePoliciesCollection();
  // The owner is in the filter, so a guessed policy number reaches nothing.
  const doc = await policies.findOne({
    userId: new ObjectId(userId),
    policyNumber: policyNumber.trim().toUpperCase(),
  });
  return doc ? offerFor(doc, now) : null;
}

function offerFor(doc: InsurancePolicyDoc, now: Date): RenewalOffer | null {
  const insurer = findInsurer(doc.insurerId);
  if (!insurer) return null;

  const daysToExpiry = Math.round(
    (doc.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  const reasons: string[] = [];

  if (doc.vehicle) {
    const wasNcb = doc.vehicle.claimFreeYears;
    // The bonus only steps up if the policy has not been left to lapse past the
    // grace period. Past that, it is lost entirely -- which is the rule.
    const lapsedHard = daysToExpiry < -MOTOR_GRACE_DAYS;
    const toNcb = lapsedHard ? 0 : nextNcb(wasNcb);

    // A year older: lower declared value, higher own-damage rate.
    const ageMonths = Math.min(360, doc.vehicle.ageMonths + 12);

    const quote = quoteFrom(insurer, {
      modelId: doc.vehicle.modelId,
      ageMonths,
      plan: doc.vehicle.plan as PlanType,
      // Null, so the renewal takes the depreciated value rather than last
      // year's -- which is what actually happens at renewal.
      idv: null,
      claimFreeYears: toNcb,
      addOnIds: doc.vehicle.addOnIds,
    });
    if (!quote) return null;

    if (lapsedHard) {
      reasons.push(
        `The policy lapsed more than ${MOTOR_GRACE_DAYS} days ago, so the no-claim bonus is lost and starts again at 0%.`,
      );
    } else if (toNcb > wasNcb) {
      const percent = NCB_LADDER.find((rung) => rung.claimFreeYears === toNcb)?.percent ?? 0;
      reasons.push(`A claim-free year takes the bonus to ${percent}% off own damage.`);
    }
    reasons.push(
      `The vehicle is a year older, so the declared value has fallen to ${(quote.idv / 100).toLocaleString('en-IN')} and the own-damage rate has risen.`,
    );
    if (quote.addOns.length < doc.vehicle.addOnIds.length) {
      reasons.push('An add-on is no longer offered at this vehicle age and has been dropped.');
    }

    return {
      policyId: doc._id.toHexString(),
      policyNumber: doc.policyNumber,
      kind: doc.kind,
      insurerId: insurer.id,
      insurerName: insurer.name,
      subject: subjectOf(doc),
      expiresAt: doc.expiresAt,
      daysToExpiry,
      graceDays: MOTOR_GRACE_DAYS,
      lapsed: daysToExpiry < 0,
      lastPremium: doc.premium,
      premium: quote.total,
      change: quote.total - doc.premium,
      reasons,
      ncb: { from: wasNcb, to: toNcb },
    };
  }

  if (doc.health) {
    const health = doc.health;
    // A year older can cross an age band, which is where a health premium
    // jumps. The quote is taken on the ages as they are now.
    const members = health.members.map((member) => ({
      kind: member.kind,
      age: Math.min(99, member.age + health.termYears),
    }));

    const quoted = quoteHealth({
      sumInsuredLakhs: health.sumInsuredLakhs,
      members,
      termYears: health.termYears === 2 ? 2 : 1,
      insurerId: insurer.id,
    });
    if (!quoted.ok) return null;

    reasons.push(
      `Everybody is ${health.termYears} year${health.termYears === 1 ? '' : 's'} older; the policy now rates in the ${quoted.quote.ratedBand} band.`,
    );
    const hadYoung = health.ratedAge <= 35;
    const hasYoung = quoted.quote.discounts.some((discount) => discount.id === 'young');
    if (hadYoung && !hasYoung) {
      reasons.push('The eldest member is now over 35, so the lifetime discount no longer applies.');
    }

    return {
      policyId: doc._id.toHexString(),
      policyNumber: doc.policyNumber,
      kind: doc.kind,
      insurerId: insurer.id,
      insurerName: insurer.name,
      subject: subjectOf(doc),
      expiresAt: doc.expiresAt,
      daysToExpiry,
      graceDays: 0,
      lapsed: daysToExpiry < 0,
      lastPremium: doc.premium,
      premium: quoted.quote.total,
      change: quoted.quote.total - doc.premium,
      reasons,
      ncb: null,
    };
  }

  return null;
}

export type RenewResult =
  | { ok: true; policyNumber: string; premium: Paise }
  | { ok: false; code: 'NOT_FOUND' | 'FAILED'; message: string };

/**
 * Renews one policy.
 *
 * Writes a **new** policy rather than extending the old one, so the record of
 * what was covered on which terms in which year survives. An insurance history
 * that overwrites itself cannot answer the only question anybody ever asks of
 * it, which is what was in force at the time.
 */
export async function renewPolicy(
  userId: string,
  policyNumber: string,
  context: { ip: string | null; userAgent: string | null },
  now = new Date(),
): Promise<RenewResult> {
  if (!ObjectId.isValid(userId)) {
    return { ok: false, code: 'NOT_FOUND', message: 'Sign in and try again.' };
  }

  const policies = await insurancePoliciesCollection();
  const doc = await policies.findOne({
    userId: new ObjectId(userId),
    policyNumber: policyNumber.trim().toUpperCase(),
  });
  if (!doc) {
    return { ok: false, code: 'NOT_FOUND', message: 'No policy of yours has that number.' };
  }

  const offer = offerFor(doc, now);
  if (!offer) {
    return { ok: false, code: 'FAILED', message: 'That policy cannot be renewed here.' };
  }

  if (doc.vehicle) {
    const result = await buyMotorPolicy(
      userId,
      {
        modelId: doc.vehicle.modelId,
        insurerId: doc.insurerId,
        registration: doc.vehicle.registration,
        ageMonths: Math.min(360, doc.vehicle.ageMonths + 12),
        plan: doc.vehicle.plan as PlanType,
        idv: null,
        claimFreeYears: offer.ncb?.to ?? doc.vehicle.claimFreeYears,
        addOnIds: doc.vehicle.addOnIds,
      },
      context,
      now,
    );
    return result.ok
      ? { ok: true, policyNumber: result.policyNumber, premium: result.premium }
      : { ok: false, code: 'FAILED', message: result.message };
  }

  if (doc.health) {
    const health = doc.health;
    const result = await buyHealthPolicy(
      userId,
      {
        insurerId: doc.insurerId,
        sumInsuredLakhs: health.sumInsuredLakhs,
        members: health.members.map((member) => ({
          kind: member.kind,
          age: Math.min(99, member.age + health.termYears),
        })),
        termYears: health.termYears === 2 ? 2 : 1,
      },
      context,
      now,
    );
    return result.ok
      ? { ok: true, policyNumber: result.policyNumber, premium: result.premium }
      : { ok: false, code: 'FAILED', message: result.message };
  }

  return { ok: false, code: 'FAILED', message: 'That policy cannot be renewed here.' };
}
