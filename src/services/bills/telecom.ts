import { findBiller } from '@/data/billers';
import {
  BROADBAND_ADDONS,
  BROADBAND_PLANS,
  CALL_RATES,
  ISD_PER_MINUTE,
  LANDLINE_PLANS,
  POSTPAID_PLANS,
  POSTPAID_VAS,
  ROAMING_PER_DAY,
  TELECOM_GST_PERCENT,
  type BroadbandPlan,
  type PostpaidPlan,
} from '@/data/telecom-plans';
import { accountRandom, between, cycleFor, holderName, pick } from '@/lib/bills/derive';
import type { Paise } from '@/lib/utils/money';

import { billRupees, sumLines, type BillBase, type BillLine } from './types';

/**
 * Postpaid, landline and broadband.
 *
 * Three products that look alike on a tile and are nothing alike on a bill.
 * Each gets its own function, its own itemisation and its own page, because
 * folding them into one "telecom bill" would mean showing a landline customer a
 * data overage line and a broadband customer an ISD one.
 *
 * The tax is 18% GST on all three, which is correct -- telecom is inside GST,
 * unlike the piped gas next door.
 */

function gstOn(rupees: number): number {
  return (rupees * TELECOM_GST_PERCENT) / 100;
}

// ---------------------------------------------------------------- postpaid

export interface PostpaidBill extends BillBase {
  category: 'POSTPAID';
  plan: PostpaidPlan;
  /** Data used across every connection on the plan, in GB. */
  dataUsedGb: number;
  /** Beyond the quota. Zero when inside it. */
  overageGb: number;
  isdMinutes: number;
  roamingDays: number;
  vas: Array<{ label: string; rupees: number }>;
  /**
   * The plan that would have cost least for this month's usage.
   *
   * Null when the current plan is already it. This is the thing a postpaid
   * bill never tells you and the reason people stay on the wrong plan for
   * years -- so it is computed against the whole book, not hand-waved.
   */
  betterPlan: { plan: PostpaidPlan; wouldHaveCost: Paise; saves: Paise } | null;
}

/** What one plan would have cost, given a month's usage. Pre-tax, in rupees. */
function postpaidCost(
  plan: PostpaidPlan,
  usage: { dataGb: number; isdMinutes: number; roamingDays: number; vasRupees: number },
): number {
  const overage = Math.max(0, usage.dataGb - plan.dataGb);
  const isdBeyond = Math.max(0, usage.isdMinutes - plan.isdMinutes);
  return (
    plan.rentalRupees +
    overage * plan.overagePerGb +
    isdBeyond * ISD_PER_MINUTE +
    usage.roamingDays * ROAMING_PER_DAY +
    usage.vasRupees
  );
}

export function postpaidBill(
  billerId: string,
  account: string,
  now = new Date(),
): PostpaidBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'POSTPAID') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 14 });

  const plan = pick(POSTPAID_PLANS, random);
  // Usage clusters around the quota, with a real tail past it.
  const dataUsedGb = Math.round(plan.dataGb * (0.55 + random() * 0.95));
  const overageGb = Math.max(0, dataUsedGb - plan.dataGb);
  const isdMinutes = random() < 0.25 ? between(random, 5, 90) : 0;
  const roamingDays = random() < 0.12 ? between(random, 1, 7) : 0;

  const vas: Array<{ label: string; rupees: number }> = [];
  for (const entry of POSTPAID_VAS) {
    if (random() < 0.22) vas.push({ label: entry.label, rupees: entry.rupees });
  }
  const vasRupees = vas.reduce((sum, entry) => sum + entry.rupees, 0);

  const isdBeyond = Math.max(0, isdMinutes - plan.isdMinutes);

  const lines: BillLine[] = [
    {
      label: `${plan.name} rental`,
      amount: billRupees(plan.rentalRupees),
      note:
        plan.connections > 1
          ? `${plan.connections} connections on a shared ${plan.dataGb} GB pool`
          : `${plan.dataGb} GB included`,
    },
  ];

  if (overageGb > 0) {
    lines.push({
      label: 'Data beyond the plan',
      amount: billRupees(overageGb * plan.overagePerGb),
      note: `${overageGb} GB at ₹${plan.overagePerGb} a GB`,
    });
  }
  if (isdBeyond > 0) {
    lines.push({
      label: 'ISD calls',
      amount: billRupees(isdBeyond * ISD_PER_MINUTE),
      note: `${isdBeyond} minutes at ₹${ISD_PER_MINUTE} a minute`,
    });
  }
  if (roamingDays > 0) {
    lines.push({
      label: 'International roaming',
      amount: billRupees(roamingDays * ROAMING_PER_DAY),
      note: `${roamingDays} day${roamingDays === 1 ? '' : 's'} at ₹${ROAMING_PER_DAY} a day`,
    });
  }
  for (const entry of vas) {
    lines.push({
      label: entry.label,
      amount: billRupees(entry.rupees),
      note: 'Monthly subscription',
    });
  }

  const preTax = lines.reduce((sum, line) => sum + line.amount, 0) / 100;
  lines.push({
    label: `GST (${TELECOM_GST_PERCENT}%)`,
    amount: billRupees(gstOn(preTax)),
  });

  // What every plan in the book would have cost for exactly this usage.
  const usage = { dataGb: dataUsedGb, isdMinutes, roamingDays, vasRupees };
  const currentCost = postpaidCost(plan, usage);
  let best: PostpaidBill['betterPlan'] = null;
  for (const candidate of POSTPAID_PLANS) {
    if (candidate.id === plan.id) continue;
    // Only a plan that carries at least as many connections is a swap the
    // customer could actually make without giving up a line.
    if (candidate.connections < plan.connections) continue;
    const cost = postpaidCost(candidate, usage);
    if (cost < currentCost - 1 && (!best || cost < best.wouldHaveCost / 100)) {
      best = {
        plan: candidate,
        wouldHaveCost: billRupees(cost * (1 + TELECOM_GST_PERCENT / 100)),
        saves: billRupees((currentCost - cost) * (1 + TELECOM_GST_PERCENT / 100)),
      };
    }
  }

  return {
    category: 'POSTPAID',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    plan,
    dataUsedGb,
    overageGb,
    isdMinutes,
    roamingDays,
    vas,
    betterPlan: best,
    lines,
    total: sumLines(lines),
  };
}

// ---------------------------------------------------------------- landline

export interface LandlineBill extends BillBase {
  category: 'LANDLINE';
  planName: string;
  rentalRupees: number;
  freeMinutes: number;
  /** Minutes by call type, and what each cost. */
  calls: Array<{
    label: string;
    minutes: number;
    perMinute: number;
    chargeable: number;
    rupees: number;
  }>;
  totalMinutes: number;
  /** Minutes covered by the allowance, spent cheapest-rate-last. */
  freeUsed: number;
}

export function landlineBill(
  billerId: string,
  account: string,
  now = new Date(),
): LandlineBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'LANDLINE') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 16 });

  const plan = pick(LANDLINE_PLANS, random);
  const minutes: Record<string, number> = {
    local: between(random, 40, 900),
    std: between(random, 0, 320),
    isd: random() < 0.18 ? between(random, 3, 60) : 0,
  };
  const totalMinutes = Object.values(minutes).reduce((sum, value) => sum + value, 0);

  // The allowance is applied to the *dearest* calls first, which is how a
  // free-minutes bundle is actually settled -- and the opposite of what a
  // customer expects, so the bill shows it rather than burying it.
  const order = [...CALL_RATES].sort((a, b) => b.perMinute - a.perMinute);
  let allowance = plan.freeMinutes;
  const charged: Record<string, number> = {};
  for (const rate of order) {
    const used = minutes[rate.id] ?? 0;
    const covered = Math.min(allowance, used);
    allowance -= covered;
    charged[rate.id] = used - covered;
  }

  const calls = CALL_RATES.map((rate) => ({
    label: rate.label,
    minutes: minutes[rate.id] ?? 0,
    perMinute: rate.perMinute,
    chargeable: charged[rate.id] ?? 0,
    rupees: (charged[rate.id] ?? 0) * rate.perMinute,
  }));

  const lines: BillLine[] = [
    {
      label: `${plan.name} rental`,
      amount: billRupees(plan.rentalRupees),
      note: `${plan.freeMinutes} minutes included`,
    },
  ];
  for (const call of calls) {
    if (call.rupees > 0) {
      lines.push({
        label: call.label,
        amount: billRupees(call.rupees),
        note: `${call.chargeable} chargeable of ${call.minutes} minutes, at ₹${call.perMinute} a minute`,
      });
    }
  }

  const preTax = lines.reduce((sum, line) => sum + line.amount, 0) / 100;
  lines.push({ label: `GST (${TELECOM_GST_PERCENT}%)`, amount: billRupees(gstOn(preTax)) });

  return {
    category: 'LANDLINE',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    planName: plan.name,
    rentalRupees: plan.rentalRupees,
    freeMinutes: plan.freeMinutes,
    calls,
    totalMinutes,
    freeUsed: plan.freeMinutes - allowance,
    lines,
    total: sumLines(lines),
  };
}

// --------------------------------------------------------------- broadband

export interface BroadbandBill extends BillBase {
  category: 'BROADBAND';
  plan: BroadbandPlan;
  /** Data used this month, in GB. */
  dataUsedGb: number;
  /** True once the fair-use limit was passed and the line was throttled. */
  throttled: boolean;
  /** Days spent at the throttled speed. */
  throttledDays: number;
  addons: Array<{ label: string; rupees: number }>;
  /**
   * The next tier up, and whether it would have kept the line at full speed.
   *
   * Broadband past a fair-use limit is throttled rather than charged, so the
   * cost of being on the wrong plan is measured in days at 2 Mbps rather than
   * in rupees. That is worth saying out loud.
   */
  upgrade: { plan: BroadbandPlan; extraPerMonth: Paise; wouldHaveThrottled: boolean } | null;
}

export function broadbandBill(
  billerId: string,
  account: string,
  now = new Date(),
): BroadbandBill | null {
  const biller = findBiller(billerId);
  if (!biller || biller.category !== 'BROADBAND') return null;

  const random = accountRandom(billerId, account);
  const holder = holderName(random);
  const cycle = cycleFor(random, now, { months: 1, dueInDays: 12 });

  const plan = pick(BROADBAND_PLANS, random);
  const dataUsedGb = Math.round(plan.fupGb * (0.35 + random() * 1.15));
  const throttled = dataUsedGb > plan.fupGb;
  // How far into the month the limit was hit, so the days at low speed follow.
  const throttledDays = throttled
    ? Math.min(28, Math.round(30 * (1 - plan.fupGb / dataUsedGb)))
    : 0;

  const addons: Array<{ label: string; rupees: number }> = [];
  for (const entry of BROADBAND_ADDONS) {
    if (random() < 0.2) addons.push({ label: entry.label, rupees: entry.rupees });
  }

  const lines: BillLine[] = [
    {
      label: `${plan.name} rental`,
      amount: billRupees(plan.rentalRupees),
      note: `${plan.speedMbps} Mbps, ${plan.fupGb} GB at full speed`,
    },
  ];
  for (const addon of addons) {
    lines.push({ label: addon.label, amount: billRupees(addon.rupees), note: 'Monthly' });
  }

  const preTax = lines.reduce((sum, line) => sum + line.amount, 0) / 100;
  lines.push({ label: `GST (${TELECOM_GST_PERCENT}%)`, amount: billRupees(gstOn(preTax)) });

  const next = BROADBAND_PLANS.find((candidate) => candidate.speedMbps > plan.speedMbps);
  const upgrade = next
    ? {
        plan: next,
        extraPerMonth: billRupees(
          (next.rentalRupees - plan.rentalRupees) * (1 + TELECOM_GST_PERCENT / 100),
        ),
        wouldHaveThrottled: dataUsedGb > next.fupGb,
      }
    : null;

  return {
    category: 'BROADBAND',
    billerId,
    billerName: biller.name,
    account,
    holder,
    cycle,
    plan,
    dataUsedGb,
    throttled,
    throttledDays,
    addons,
    upgrade,
    lines,
    total: sumLines(lines),
  };
}
