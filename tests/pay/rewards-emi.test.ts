import { describe, expect, it } from 'vitest';

import { EMI_ISSUERS, findIssuer } from '@/data/emi';
import { findOffer, offerReward, REWARD_OFFERS } from '@/data/reward-offers';
import { rupeesToPaise } from '@/lib/utils/money';
import {
  cheapestPlan,
  eligibleFor,
  instalment,
  offersFor,
  planFor,
  processingFee,
} from '@/services/emi';
import { statementCsv, type Statement } from '@/services/statement';

/**
 * The arithmetic behind rewards, instalments and the statement.
 *
 * Pure functions, so they can be pinned exactly. Everything here is something a
 * customer would notice being wrong to the rupee: what an offer pays, what an
 * instalment costs, and whether an exported statement lines up in a spreadsheet.
 */

describe('reward offers', () => {
  it('finds one by id and nothing by a bad one', () => {
    expect(findOffer('shop-50')?.surface).toBe('SHOPPING');
    expect(findOffer('SHOP-50')?.surface).toBe('SHOPPING');
    expect(findOffer('nonesuch')).toBeUndefined();
    expect(findOffer(null)).toBeUndefined();
  });

  it('gives every offer a unique id and a reward worth having', () => {
    const ids = new Set(REWARD_OFFERS.map((offer) => offer.id));
    expect(ids.size).toBe(REWARD_OFFERS.length);
    for (const offer of REWARD_OFFERS) {
      expect(offer.rewardRupees, offer.id).toBeGreaterThan(0);
      expect(offer.minOrderRupees).toBeGreaterThan(0);
      expect(offer.validForDays).toBeGreaterThan(0);
    }
  });

  it('pays nothing below the minimum order', () => {
    const offer = findOffer('shop-50');
    if (!offer) throw new Error('missing offer');
    expect(offerReward(offer, rupeesToPaise(offer.minOrderRupees - 1))).toBe(0);
    expect(offerReward(offer, rupeesToPaise(offer.minOrderRupees))).toBeGreaterThan(0);
  });

  it('caps a percentage offer, because "up to" means capped', () => {
    const offer = findOffer('shop-50');
    if (!offer) throw new Error('missing offer');

    // 10% of Rs 200 is Rs 20 -- under the cap, so the percentage applies.
    expect(offerReward(offer, rupeesToPaise(200))).toBe(rupeesToPaise(20));
    // 10% of Rs 5,000 is Rs 500 -- over the Rs 50 cap, so the cap applies.
    expect(offerReward(offer, rupeesToPaise(5000))).toBe(rupeesToPaise(50));
  });

  it('pays a flat offer its full value however large the order', () => {
    const offer = findOffer('shop-flat-25');
    if (!offer) throw new Error('missing offer');
    expect(offerReward(offer, rupeesToPaise(199))).toBe(rupeesToPaise(25));
    expect(offerReward(offer, rupeesToPaise(50_000))).toBe(rupeesToPaise(25));
  });

  it('never pays a fraction of a paisa', () => {
    for (const offer of REWARD_OFFERS) {
      for (const total of [199, 333, 777, 1234, 9999]) {
        const reward = offerReward(offer, rupeesToPaise(total));
        expect(Number.isInteger(reward), `${offer.id} at ${total}`).toBe(true);
      }
    }
  });
});

describe('instalments', () => {
  it('splits a zero-rate plan evenly', () => {
    expect(instalment(rupeesToPaise(12_000), 0, 12)).toBe(rupeesToPaise(1000));
  });

  it('charges more per month over a shorter tenure', () => {
    const principal = rupeesToPaise(60_000);
    expect(instalment(principal, 15, 3)).toBeGreaterThan(instalment(principal, 15, 12));
  });

  it('charges more interest over a longer tenure', () => {
    const issuer = findIssuer('meridian-credit');
    if (!issuer) throw new Error('missing issuer');
    const principal = rupeesToPaise(60_000);

    const short = planFor(issuer, 3, principal);
    const long = planFor(issuer, 24, principal);
    expect(long.totalInterest).toBeGreaterThan(short.totalInterest);
  });

  it('works out an instalment the way the formula says', () => {
    // Rs 1,00,000 at 12% over 12 months is Rs 8,884.88 a month by the standard
    // reducing-balance formula. Pinned so a refactor cannot quietly drift.
    const monthly = instalment(rupeesToPaise(100_000), 12, 12);
    expect(monthly).toBe(888_488);
  });

  it('floors the processing fee rather than letting it round to nothing', () => {
    const issuer = findIssuer('meridian-credit');
    if (!issuer) throw new Error('missing issuer');

    // 1% of Rs 3,000 is Rs 30, under the Rs 199 floor.
    expect(processingFee(issuer, rupeesToPaise(3000))).toBe(rupeesToPaise(199));
    // 1% of Rs 1,00,000 is Rs 1,000, over it.
    expect(processingFee(issuer, rupeesToPaise(100_000))).toBe(rupeesToPaise(1000));
  });

  it('refuses to convert below the issuer minimum', () => {
    for (const issuer of EMI_ISSUERS) {
      const under = rupeesToPaise(issuer.minAmountRupees - 1);
      const at = rupeesToPaise(issuer.minAmountRupees);
      expect(eligibleFor(issuer, under), issuer.id).toBe(false);
      expect(eligibleFor(issuer, at), issuer.id).toBe(true);
    }
  });

  it('says why an issuer is missing rather than hiding it', () => {
    const offers = offersFor(rupeesToPaise(1500));
    const blocked = offers.filter((offer) => !offer.eligible);
    expect(blocked.length).toBeGreaterThan(0);
    for (const offer of blocked) {
      expect(offer.plans).toEqual([]);
      expect(offer.reason).toContain('Converts orders from');
    }
  });

  it('leaves the processing fee in place on a no-cost plan', () => {
    const issuer = findIssuer('meridian-credit');
    if (!issuer) throw new Error('missing issuer');
    const principal = rupeesToPaise(50_000);

    const plain = planFor(issuer, 12, principal);
    const noCost = planFor(issuer, 12, principal, { noCost: true });

    // The interest is discounted; the fee is not, which is the part people are
    // surprised by and the reason it is modelled rather than waved away.
    expect(noCost.noCostDiscount).toBe(plain.totalInterest);
    expect(noCost.costOfCredit).toBe(plain.processingFee);
    expect(noCost.costOfCredit).toBeLessThan(plain.costOfCredit);
    // The instalment itself is unchanged: the issuer still bills interest.
    expect(noCost.monthly).toBe(plain.monthly);
  });

  it('adds up: instalments times tenure, plus the fee', () => {
    for (const issuer of EMI_ISSUERS) {
      const principal = rupeesToPaise(Math.max(issuer.minAmountRupees, 20_000));
      for (const plan of offersFor(principal).find((o) => o.issuer.id === issuer.id)?.plans ?? []) {
        expect(plan.totalPayable).toBe(plan.monthly * plan.tenureMonths + plan.processingFee);
        expect(plan.totalInterest).toBe(plan.monthly * plan.tenureMonths - plan.principal);
      }
    }
  });

  it('finds the cheapest monthly across every issuer', () => {
    const principal = rupeesToPaise(50_000);
    const best = cheapestPlan(principal);
    if (!best) throw new Error('no plan');

    for (const offer of offersFor(principal)) {
      for (const plan of offer.plans) {
        expect(plan.monthly).toBeGreaterThanOrEqual(best.monthly);
      }
    }
  });

  it('offers nothing at all below every issuer minimum', () => {
    expect(cheapestPlan(rupeesToPaise(100))).toBeNull();
  });
});

describe('statement export', () => {
  const statement: Statement = {
    period: { from: new Date(2026, 7, 1), to: new Date(2026, 8, 1) },
    opening: 100_000,
    closing: 150_000,
    creditedInPeriod: 100_000,
    debitedInPeriod: 50_000,
    rows: [
      {
        id: 'b',
        type: 'ORDER',
        direction: 'DEBIT',
        amount: 50_000,
        status: 'COMPLETED',
        // A reference with a comma and a quote in it: the case that shifts
        // every column right if the escaping is wrong.
        reference: 'ORD-1,"X"',
        createdAt: new Date(2026, 7, 12, 9, 30),
        balanceAfter: 150_000,
      },
      {
        id: 'a',
        type: 'TOP_UP',
        direction: 'CREDIT',
        amount: 100_000,
        status: 'COMPLETED',
        reference: 'WT-1',
        createdAt: new Date(2026, 7, 4, 8, 0),
        balanceAfter: 200_000,
      },
    ],
    byType: [],
    hiddenByFilter: 0,
  };

  it('quotes every field, so a comma cannot shift the columns', () => {
    const csv = statementCsv(statement);
    for (const line of csv.split('\n').filter(Boolean)) {
      // Every cell on a data line is quoted; a bare comma between cells is the
      // only unquoted comma there should be.
      expect(line.startsWith('"')).toBe(true);
    }
    expect(csv).toContain('"ORD-1,""X"""');
  });

  it('writes the header, both rows and the balances', () => {
    const csv = statementCsv(statement);
    expect(csv).toContain('"Date","Type","Direction","Status","Reference"');
    expect(csv).toContain('"WT-1"');
    expect(csv).toContain('"Opening balance","1000.00"');
    expect(csv).toContain('"Closing balance","1500.00"');
  });

  it('exports oldest first, because a statement is read downwards', () => {
    const lines = statementCsv(statement).split('\n');
    const topUpAt = lines.findIndex((line) => line.includes('WT-1'));
    const orderAt = lines.findIndex((line) => line.includes('ORD-1'));
    expect(topUpAt).toBeLessThan(orderAt);
  });

  it('writes rupees with two decimals rather than paise', () => {
    expect(statementCsv(statement)).toContain('"500.00"');
  });
});
