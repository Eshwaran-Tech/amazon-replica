import { describe, expect, it } from 'vitest';

import {
  ELECTRICITY_SLABS,
  GAS_SLABS,
  SEWERAGE_CESS_PERCENT,
  WATER_SLABS,
} from '@/data/bill-tariffs';
import { ACCOUNT_FORMATS, BILL_CATEGORIES, normaliseAccount } from '@/data/billers';
import {
  channelsToNextStep,
  NCF_BASE_CHANNELS,
  NCF_BASE_RUPEES,
  NCF_BLOCK_RUPEES,
  NCF_CAP_RUPEES,
  networkCapacityFee,
} from '@/data/television';
import { applySlabs, cycleFor, makeRandom, slabTotal } from '@/lib/bills/derive';
import { rupeesToPaise } from '@/lib/utils/money';
import {
  CARD_MONTHLY_RATE,
  lateFeeFor,
  MIN_DUE_FLOOR_RUPEES,
  MIN_DUE_PERCENT,
  minimumDue,
  prepaymentEffect,
  revolveCost,
  splitInstalment,
} from '@/services/bills/credit';
import { instalment } from '@/services/emi';

/**
 * The arithmetic under Bill Payments.
 *
 * Pure functions, so they can be pinned exactly. Everything here is something a
 * customer would notice being wrong to the rupee -- and two of them are things
 * that are commonly got wrong in real billing software.
 */

describe('telescopic slabs', () => {
  it('charges each band at its own rate, not the whole reading at the top one', () => {
    // The classic error: 250 units billed at the 201-400 rate is 1,800.
    // Telescopically it is 100x4 + 100x5.60 + 50x7.20 = 1,320.
    const lines = applySlabs(250, ELECTRICITY_SLABS);
    expect(slabTotal(lines)).toBeCloseTo(100 * 4 + 100 * 5.6 + 50 * 7.2, 6);
    expect(slabTotal(lines)).toBeLessThan(250 * 7.2);
  });

  it('splits into exactly the bands the reading reaches', () => {
    expect(applySlabs(80, ELECTRICITY_SLABS)).toHaveLength(1);
    expect(applySlabs(150, ELECTRICITY_SLABS)).toHaveLength(2);
    expect(applySlabs(250, ELECTRICITY_SLABS)).toHaveLength(3);
    expect(applySlabs(5000, ELECTRICITY_SLABS)).toHaveLength(ELECTRICITY_SLABS.length);
  });

  it('never loses or invents a unit', () => {
    for (const units of [0, 1, 99, 100, 101, 400, 401, 1234]) {
      const lines = applySlabs(units, ELECTRICITY_SLABS);
      expect(
        lines.reduce((sum, line) => sum + line.units, 0),
        `${units} units`,
      ).toBe(units);
    }
  });

  it('is monotonic: more units never costs less', () => {
    let previous = -1;
    for (let units = 0; units <= 1200; units += 7) {
      const total = slabTotal(applySlabs(units, ELECTRICITY_SLABS));
      expect(total, `${units} units`).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });

  it('treats a negative reading as zero rather than crediting anybody', () => {
    expect(slabTotal(applySlabs(-50, ELECTRICITY_SLABS))).toBe(0);
    expect(slabTotal(applySlabs(-50, WATER_SLABS))).toBe(0);
    expect(slabTotal(applySlabs(-50, GAS_SLABS))).toBe(0);
  });

  it('has a rising rate in every book, which is what makes a slab a slab', () => {
    for (const [name, slabs] of [
      ['electricity', ELECTRICITY_SLABS],
      ['water', WATER_SLABS],
      ['gas', GAS_SLABS],
    ] as const) {
      for (let index = 1; index < slabs.length; index += 1) {
        expect(slabs[index]?.rate ?? 0, name).toBeGreaterThan(slabs[index - 1]?.rate ?? 0);
      }
      expect(slabs[slabs.length - 1]?.upTo, name).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('makes the water cess rise with consumption, because it is a percentage', () => {
    const light = slabTotal(applySlabs(8, WATER_SLABS));
    const heavy = slabTotal(applySlabs(45, WATER_SLABS));
    const cessLight = (light * SEWERAGE_CESS_PERCENT) / 100;
    const cessHeavy = (heavy * SEWERAGE_CESS_PERCENT) / 100;
    expect(cessHeavy).toBeGreaterThan(cessLight);
    // And it is exactly the stated share, not a flat fee dressed up as one.
    expect(cessHeavy / heavy).toBeCloseTo(SEWERAGE_CESS_PERCENT / 100, 10);
  });
});

describe('account formats', () => {
  it('has a format for every category', () => {
    for (const category of BILL_CATEGORIES) {
      expect(ACCOUNT_FORMATS[category], category).toBeDefined();
    }
  });

  it('accepts a number copied off a bill with its spacing', () => {
    expect(normaliseAccount('MUNICIPAL_TAX', '08 042 013796')).toBe('08042013796');
    expect(normaliseAccount('CREDIT_CARD', '9876543210 4291')).toBe('98765432104291');
    expect(normaliseAccount('LOAN', 'hl-4820-1736')).toBe('HL48201736');
    expect(normaliseAccount('LPG', '1234 5678 9012 34567')).toBe('12345678901234567');
  });

  it('refuses the wrong shape rather than fetching a bill for it', () => {
    expect(normaliseAccount('ELECTRICITY', '12345')).toBeNull();
    expect(normaliseAccount('POSTPAID', '1234567890')).toBeNull(); // must start 6-9
    expect(normaliseAccount('LANDLINE', '4428152200')).toBeNull(); // needs the leading zero
    expect(normaliseAccount('BROADBAND', 'FB204815')).toBeNull();
    expect(normaliseAccount('LPG', '1234567890123456')).toBeNull(); // 16, not 17
    expect(normaliseAccount('EDUCATION', '1823048172')).toBeNull(); // year must be 19xx/20xx
  });

  it('never accepts a card number in the credit card field', () => {
    // Sixteen digits is a card number. The field takes fourteen: a mobile and
    // four digits. This is the guard that keeps a PAN out of the codebase.
    expect(normaliseAccount('CREDIT_CARD', '4111111111111111')).toBeNull();
    expect(ACCOUNT_FORMATS.CREDIT_CARD.pattern.source).not.toContain('16');
  });
});

describe('the network capacity fee', () => {
  it('is flat for the first hundred pay channels, and nothing for none', () => {
    expect(networkCapacityFee(0)).toBe(0);
    expect(networkCapacityFee(1)).toBe(NCF_BASE_RUPEES);
    expect(networkCapacityFee(NCF_BASE_CHANNELS)).toBe(NCF_BASE_RUPEES);
  });

  it('steps at the hundredth channel, not a block later', () => {
    expect(networkCapacityFee(101)).toBe(NCF_BASE_RUPEES + NCF_BLOCK_RUPEES);
  });

  it('is capped', () => {
    expect(networkCapacityFee(200)).toBe(NCF_CAP_RUPEES);
    expect(networkCapacityFee(5000)).toBe(NCF_CAP_RUPEES);
  });

  it('counts to the channel that actually moves the fee', () => {
    // The bug worth guarding: at exactly 100, one more channel steps the fee,
    // and reporting a whole block there is wrong when the warning matters most.
    for (const at of [0, 50, 99, 100, 101, 124, 125]) {
      const toGo = channelsToNextStep(at);
      if (toGo === null) continue;
      expect(networkCapacityFee(at + toGo), `from ${at}`).toBeGreaterThan(networkCapacityFee(at));
      expect(networkCapacityFee(at + toGo - 1), `from ${at}`).toBe(networkCapacityFee(at));
    }
  });

  it('reports nothing to go once it is capped', () => {
    expect(channelsToNextStep(200)).toBeNull();
    expect(channelsToNextStep(1000)).toBeNull();
  });
});

describe('a credit card minimum due', () => {
  it('is a percentage of the balance, with a floor', () => {
    expect(minimumDue(rupeesToPaise(100_000))).toBe(
      rupeesToPaise((100_000 * MIN_DUE_PERCENT) / 100),
    );
    // Small balances hit the floor.
    expect(minimumDue(rupeesToPaise(1000))).toBe(rupeesToPaise(MIN_DUE_FLOOR_RUPEES));
  });

  it('never asks for more than the balance', () => {
    expect(minimumDue(rupeesToPaise(50))).toBe(rupeesToPaise(50));
    expect(minimumDue(0)).toBe(0);
  });

  it('is stated in whole rupees', () => {
    for (const balance of [12_345, 98_765, 3_333, 777]) {
      expect(minimumDue(rupeesToPaise(balance)) % 100, String(balance)).toBe(0);
    }
  });
});

describe('what revolving costs', () => {
  it('takes years and costs more than the spending on a real balance', () => {
    const outcome = revolveCost(rupeesToPaise(50_000));
    expect(outcome.neverClears).toBe(false);
    expect(outcome.months).toBeGreaterThan(60);
    // The point of the whole feature: the interest exceeds what was borrowed.
    expect(outcome.interest).toBeGreaterThan(rupeesToPaise(50_000));
    expect(outcome.totalPaid).toBe(rupeesToPaise(50_000) + outcome.interest);
  });

  it('costs more the larger the balance, and more the dearer the rate', () => {
    const small = revolveCost(rupeesToPaise(10_000));
    const large = revolveCost(rupeesToPaise(100_000));
    expect(large.interest).toBeGreaterThan(small.interest);
    expect(large.months).toBeGreaterThan(small.months);

    const cheap = revolveCost(rupeesToPaise(50_000), 1);
    const dear = revolveCost(rupeesToPaise(50_000), CARD_MONTHLY_RATE);
    expect(dear.interest).toBeGreaterThan(cheap.interest);
  });

  it('reports honestly when the minimum can never clear it', () => {
    // A minimum below the interest rate never gets anywhere, and saying "600
    // months" would be less honest than saying it does not clear.
    const outcome = revolveCost(rupeesToPaise(500_000), 20);
    expect(outcome.neverClears).toBe(true);
  });

  it('clears instantly when there is nothing outstanding', () => {
    expect(revolveCost(0)).toMatchObject({ months: 0, interest: 0, neverClears: false });
  });
});

describe('loan arithmetic', () => {
  const principal = rupeesToPaise(30_00_000);
  const rate = 8.6;
  const months = 240;
  const emi = instalment(principal, rate, months);

  it('splits an instalment into interest on the outstanding, then principal', () => {
    const split = splitInstalment(principal, rate, emi);
    expect(split.interest + split.principal).toBe(emi);
    // Early in a twenty-year loan, most of the payment is interest.
    expect(split.interest).toBeGreaterThan(split.principal);
  });

  it('shifts toward principal as the balance falls', () => {
    const early = splitInstalment(principal, rate, emi);
    const late = splitInstalment(Math.round(principal / 10), rate, emi);
    expect(late.principal).toBeGreaterThan(early.principal);
    expect(late.interest).toBeLessThan(early.interest);
  });

  it('never charges more interest than the instalment itself', () => {
    const split = splitInstalment(principal * 10, rate, emi);
    expect(split.interest).toBeLessThanOrEqual(emi);
    expect(split.principal).toBeGreaterThanOrEqual(0);
  });

  it('makes a prepayment save more than the prepayment itself', () => {
    const lump = emi * 12;
    const effect = prepaymentEffect(principal, rate, emi, lump);

    expect(effect.monthsSaved).toBeGreaterThan(12);
    // The saving compounds over the remaining tenure, so it exceeds the lump.
    expect(effect.interestSaved).toBeGreaterThan(lump);
    expect(effect.interestWith).toBeLessThan(effect.interestWithout);
  });

  it('saves more the bigger the prepayment, and nothing for none', () => {
    const one = prepaymentEffect(principal, rate, emi, emi);
    const six = prepaymentEffect(principal, rate, emi, emi * 6);
    expect(six.interestSaved).toBeGreaterThan(one.interestSaved);
    expect(six.monthsSaved).toBeGreaterThanOrEqual(one.monthsSaved);

    const none = prepaymentEffect(principal, rate, emi, 0);
    expect(none.monthsSaved).toBe(0);
    expect(none.interestSaved).toBe(0);
  });

  it('reports a loan whose instalment cannot cover the interest rather than looping', () => {
    const stuck = prepaymentEffect(rupeesToPaise(10_00_000), 24, rupeesToPaise(1000), 0);
    expect(stuck.monthsWithout).toBe(600);
  });
});

describe('late fees', () => {
  it('rises in bands and never falls', () => {
    let previous = -1;
    for (const outstanding of [100, 600, 5_000, 20_000, 40_000, 200_000]) {
      const fee = lateFeeFor(rupeesToPaise(outstanding));
      expect(fee, String(outstanding)).toBeGreaterThanOrEqual(previous);
      previous = fee;
    }
  });

  it('charges nothing on a very small balance', () => {
    expect(lateFeeFor(rupeesToPaise(100))).toBe(0);
  });
});

describe('billing cycles', () => {
  const now = new Date('2026-08-21T10:00:00.000Z');

  it('covers one month for a monthly bill and two for a bi-monthly one', () => {
    const monthly = cycleFor(makeRandom(1), now, { months: 1 });
    const bimonthly = cycleFor(makeRandom(1), now, { months: 2 });

    const days = (cycle: { from: Date; to: Date }) =>
      Math.round((cycle.to.getTime() - cycle.from.getTime()) / (24 * 60 * 60 * 1000));

    expect(days(monthly)).toBeGreaterThan(26);
    expect(days(monthly)).toBeLessThan(33);
    expect(days(bimonthly)).toBeGreaterThan(56);
    expect(days(bimonthly)).toBeLessThan(64);
  });

  it('reads the meter in the past, never in the future', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const cycle = cycleFor(makeRandom(seed), now, { months: 1 });
      expect(cycle.to.getTime(), `seed ${seed}`).toBeLessThan(now.getTime());
      expect(cycle.from.getTime()).toBeLessThan(cycle.to.getTime());
    }
  });

  it('counts days late only once the due date has passed', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const cycle = cycleFor(makeRandom(seed), now, { months: 1, dueInDays: 18 });
      if (cycle.dueOn.getTime() > now.getTime()) {
        expect(cycle.daysLate, `seed ${seed}`).toBe(0);
      } else {
        expect(cycle.daysLate, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
