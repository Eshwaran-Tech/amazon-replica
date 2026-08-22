import { describe, expect, it } from 'vitest';

import { AGE_BANDS, bandFor, SUM_INSURED_LAKHS, WAITING_PERIODS } from '@/data/health-plans';
import { INSURERS, PREMIUM_TAX_PERCENT } from '@/data/insurers';
import {
  coveredGroups,
  notCoveredGroups,
  quoteHealth,
  waitingPeriods,
  type Member,
} from '@/services/health-insurance';

/**
 * Health premiums.
 *
 * Pure arithmetic, so it can be pinned exactly. Everything here is something a
 * customer would notice being wrong: what a family costs against one person,
 * whether the discounts stack the way the page says, and whether a policy the
 * page would refuse can be smuggled past the validation.
 */

const adult = (age: number): Member => ({ kind: 'ADULT', age });
const child = (age: number): Member => ({ kind: 'CHILD', age });

function quote(members: Member[], sumInsuredLakhs = 10, termYears: 1 | 2 = 1) {
  const result = quoteHealth({ sumInsuredLakhs, members, termYears });
  if (!result.ok) throw new Error('expected a quote, got ' + result.code);
  return result.quote;
}

describe('age bands', () => {
  it('covers every age from 18 to 99 with exactly one band', () => {
    for (let age = 18; age <= 99; age += 1) {
      const matches = AGE_BANDS.filter((band) => age >= band.from && age <= band.to);
      expect(matches, `age ${age}`).toHaveLength(1);
    }
  });

  it('never gets cheaper as age rises', () => {
    for (let index = 1; index < AGE_BANDS.length; index += 1) {
      const previous = AGE_BANDS[index - 1];
      const current = AGE_BANDS[index];
      expect(current?.ratePerLakh ?? 0).toBeGreaterThan(previous?.ratePerLakh ?? 0);
    }
  });

  it('has no gap or overlap between consecutive bands', () => {
    for (let index = 1; index < AGE_BANDS.length; index += 1) {
      expect(AGE_BANDS[index]?.from).toBe((AGE_BANDS[index - 1]?.to ?? 0) + 1);
    }
  });

  it('returns nothing outside the tabled range', () => {
    expect(bandFor(17)).toBeUndefined();
    expect(bandFor(100)).toBeUndefined();
  });
});

describe('what a premium is made of', () => {
  it('prices a family on its eldest member, not on an average', () => {
    // Averaging 62 and 24 would land in the 36-45 band and understate the
    // premium by a long way. A floater is rated on the eldest.
    const family = quote([adult(62), adult(24)]);
    expect(family.ratedAge).toBe(62);
    expect(family.ratedBand).toBe('56 to 65');
  });

  it('costs less per head than the same people insured separately', () => {
    const alone = quote([adult(38)]).total;
    const together = quote([adult(38), adult(35)]).total;
    expect(together).toBeGreaterThan(alone);
    expect(together).toBeLessThan(alone * 2);
  });

  it('multiplies the discounts rather than adding them', () => {
    const family = quote([adult(30), adult(28)]);
    const percentages = family.discounts.map((discount) => discount.percent);
    expect(percentages.length).toBeGreaterThan(1);

    const added = percentages.reduce((sum, percent) => sum + percent, 0);
    const multiplied = (1 - percentages.reduce((f, p) => f * (1 - p / 100), 1)) * 100;
    expect(multiplied).toBeLessThan(added);

    // What was actually taken off matches the multiplicative figure, not the
    // sum -- adding them is how a quote comes out under what gets charged.
    const share = (family.discountAmount / family.basePremium) * 100;
    expect(share).toBeCloseTo(multiplied, 1);
  });

  it('gives the lifetime discount only when the eldest is 35 or under', () => {
    expect(quote([adult(35)]).discounts.map((d) => d.id)).toContain('young');
    expect(quote([adult(36)]).discounts.map((d) => d.id)).not.toContain('young');
    // The eldest decides it, not the youngest.
    expect(quote([adult(40), adult(28)]).discounts.map((d) => d.id)).not.toContain('young');
  });

  it('gives the family discount from two members, children included', () => {
    expect(quote([adult(40)]).discounts.map((d) => d.id)).not.toContain('family');
    expect(quote([adult(40), child(6)]).discounts.map((d) => d.id)).toContain('family');
  });

  it('charges the stated tax on the discounted premium, not the base', () => {
    const one = quote([adult(45)]);
    expect(one.taxPercent).toBe(PREMIUM_TAX_PERCENT);
    expect(one.tax).toBe(Math.round((one.netPremium * PREMIUM_TAX_PERCENT) / 100 / 100) * 100);
    expect(one.total).toBe(one.netPremium + one.tax);
  });

  it('quotes in whole rupees', () => {
    for (const lakhs of SUM_INSURED_LAKHS) {
      const one = quote([adult(47), child(11)], lakhs);
      for (const amount of [one.basePremium, one.netPremium, one.tax, one.total]) {
        expect(amount % 100, `${lakhs}L`).toBe(0);
      }
    }
  });

  it('scales with the sum insured, to the rupee', () => {
    const five = quote([adult(30)], 5).total;
    const ten = quote([adult(30)], 10).total;
    // Not exactly double: each component is rounded to whole rupees on the way
    // through, so doubling a rounded figure and rounding a doubled one can land
    // a rupee apart. What matters is that it does not drift further than that.
    expect(Math.abs(ten - five * 2)).toBeLessThanOrEqual(100);
  });

  it('makes a two-year policy cheaper per year than two one-year ones', () => {
    const members = [adult(38), adult(36), child(8)];
    const oneYear = quote(members, 10, 1).total;
    const twoYear = quote(members, 10, 2);
    expect(twoYear.total).toBeLessThan(oneYear * 2);
    expect(twoYear.perYear).toBeLessThan(oneYear);
  });
});

describe('insurer loadings', () => {
  it('quotes every insurer, and the same one twice for the same figure', () => {
    for (const insurer of INSURERS) {
      const first = quoteHealth({
        sumInsuredLakhs: 10,
        members: [adult(34)],
        termYears: 1,
        insurerId: insurer.id,
      });
      const second = quoteHealth({
        sumInsuredLakhs: 10,
        members: [adult(34)],
        termYears: 1,
        insurerId: insurer.id,
      });
      if (!first.ok || !second.ok) throw new Error('expected a quote');
      expect(first.quote.total).toBe(second.quote.total);
      expect(first.quote.insurer?.id).toBe(insurer.id);
    }
  });

  it('refuses an insurer that does not exist rather than quoting unloaded', () => {
    const result = quoteHealth({
      sumInsuredLakhs: 10,
      members: [adult(34)],
      termYears: 1,
      insurerId: 'nonesuch',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN_INSURER');
  });
});

describe('who may be on a policy', () => {
  const cases: Array<{ label: string; members: Member[]; code: string }> = [
    { label: 'nobody', members: [], code: 'BAD_MEMBERS' },
    { label: 'three adults', members: [adult(30), adult(31), adult(32)], code: 'BAD_MEMBERS' },
    {
      label: 'five children',
      members: [adult(30), child(1), child(2), child(3), child(4), child(5)],
      code: 'BAD_MEMBERS',
    },
    { label: 'an adult of 17', members: [adult(17)], code: 'BAD_AGE' },
    { label: 'an adult of 100', members: [adult(100)], code: 'BAD_AGE' },
    { label: 'a child of 26', members: [adult(40), child(26)], code: 'BAD_AGE' },
    { label: 'a fractional age', members: [adult(30.5)], code: 'BAD_AGE' },
    { label: 'children with no adult', members: [child(8)], code: 'BAD_MEMBERS' },
  ];

  for (const testCase of cases) {
    it(`refuses ${testCase.label}`, () => {
      const result = quoteHealth({
        sumInsuredLakhs: 10,
        members: testCase.members,
        termYears: 1,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe(testCase.code);
    });
  }

  it('refuses a sum insured that is not on the list', () => {
    const result = quoteHealth({ sumInsuredLakhs: 7, members: [adult(30)], termYears: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_SUM');
  });
});

describe('the benefits page', () => {
  it('groups the covered and excluded lists without losing an entry', () => {
    const covered = coveredGroups();
    const excluded = notCoveredGroups();
    expect(covered.flatMap((group) => group.benefits).length).toBeGreaterThan(0);
    expect(excluded.flatMap((group) => group.benefits).length).toBeGreaterThan(0);

    // No benefit appears in two groups, which would double-count it.
    const ids = covered.flatMap((group) => group.benefits.map((benefit) => benefit.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('orders the waiting periods soonest first', () => {
    const periods = waitingPeriods();
    expect(periods).toHaveLength(WAITING_PERIODS.length);
    for (let index = 1; index < periods.length; index += 1) {
      expect(periods[index]?.months ?? 0).toBeGreaterThanOrEqual(periods[index - 1]?.months ?? 0);
    }
  });
});
