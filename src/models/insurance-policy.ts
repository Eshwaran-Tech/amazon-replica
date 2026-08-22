import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

/**
 * A policy record.
 *
 * **This store issues no insurance.** Nothing here is a contract of insurance
 * and no risk is carried by anybody. The record exists so that a premium paid
 * out of the wallet has something to point at in the ledger, and so the
 * customer can see what they were quoted and what they paid.
 *
 * The premium *breakdown* is stored, not just the total. A stored total on its
 * own cannot be checked against anything later: if the rate table changes
 * tomorrow, recomputing the premium gives a different answer and there is
 * nothing to say which one was charged. The components are written down at the
 * moment of sale for the same reason an order stores its line prices.
 */

export const POLICY_KINDS = ['MOTOR', 'HEALTH'] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];

export interface PremiumComponent {
  label: string;
  /** Negative for a discount line. */
  amount: Paise;
}

export interface InsurancePolicyDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: PolicyKind;
  /** Shown to the customer; also the wallet entry's reference. */
  policyNumber: string;
  insurerId: string;
  insurerName: string;

  /** Motor only. */
  vehicle: {
    registration: string;
    modelId: string;
    modelLabel: string;
    ageMonths: number;
    idv: Paise;
    plan: string;
    claimFreeYears: number;
    addOnIds: string[];
  } | null;

  /** Health only. */
  health: {
    sumInsuredLakhs: number;
    members: Array<{ kind: 'ADULT' | 'CHILD'; age: number }>;
    termYears: number;
    ratedAge: number;
  } | null;

  /** What the premium was made of, at the moment it was charged. */
  components: PremiumComponent[];
  netPremium: Paise;
  tax: Paise;
  premium: Paise;

  startsAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface PolicyView {
  id: string;
  kind: PolicyKind;
  policyNumber: string;
  insurerName: string;
  /** "TN 02 BQ 6666" or "2 adults, 1 child - Rs 10L". */
  subject: string;
  premium: Paise;
  components: PremiumComponent[];
  startsAt: Date;
  expiresAt: Date;
  createdAt: Date;
}
