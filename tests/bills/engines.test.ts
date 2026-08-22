import { describe, expect, it } from 'vitest';

import { BILLERS, billersIn, BILL_CATEGORIES, findBiller } from '@/data/billers';
import { BOUQUETS, CHANNELS, DTH_OPERATORS, alaCarteValue, findChannel } from '@/data/television';
import { CYLINDERS } from '@/data/lpg';
import { educationBill, financialYear, propertyTaxBill } from '@/services/bills/civic';
import { cardBill, loanBill } from '@/services/bills/credit';
import {
  checkBooking,
  deliveryCalendar,
  fromDayKey,
  lpgConnection,
  quoteRefill,
} from '@/services/bills/lpg';
import { quoteBill, quoteDth } from '@/services/bills/quote';
import { broadbandBill, landlineBill, postpaidBill } from '@/services/bills/telecom';
import {
  cableBill,
  dthAccount,
  quoteSelection,
  resolveSelection,
} from '@/services/bills/television';
import { electricityBill, gasBill, waterBill } from '@/services/bills/utility';

/**
 * The bill engines.
 *
 * Every one of them is derived from the account number, so the first thing to
 * pin is that the derivation is **stable** -- a bill that changed between the
 * page and the payment would charge somebody a different figure from the one
 * they agreed to. After that, the per-category rules.
 */

const NOW = new Date('2026-08-21T10:00:00.000Z');

describe('the biller book', () => {
  it('has a unique id on every biller', () => {
    const ids = BILLERS.map((biller) => biller.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers at least one biller for every category that takes a number', () => {
    for (const category of BILL_CATEGORIES) {
      if (category === 'DTH') continue; // its own operator book
      expect(billersIn(category).length, category).toBeGreaterThan(0);
    }
  });

  it('looks up case-insensitively and refuses anything else', () => {
    expect(findBiller('COROMANDEL-POWER')?.category).toBe('ELECTRICITY');
    expect(findBiller('nonesuch')).toBeUndefined();
    expect(findBiller(null)).toBeUndefined();
  });

  it('refuses a biller from the wrong category', () => {
    // A water connection number pointed at a power company must not fetch.
    expect(waterBill('coromandel-power', '48210937', NOW)).toBeNull();
    expect(electricityBill('capital-water', '104578291630', NOW)).toBeNull();
    expect(cardBill('meridian-loans', '98765432104291', NOW)).toBeNull();
  });
});

describe('derivation is stable', () => {
  it('gives the same bill for the same number, every time', () => {
    const first = electricityBill('coromandel-power', '104578291630', NOW);
    const second = electricityBill('coromandel-power', '104578291630', NOW);
    expect(first?.units).toBe(second?.units);
    expect(first?.total).toBe(second?.total);
    expect(first?.holder).toBe(second?.holder);
  });

  it('gives a different account for a different number', () => {
    const a = electricityBill('coromandel-power', '104578291630', NOW);
    const b = electricityBill('coromandel-power', '104578291631', NOW);
    expect(a?.total).not.toBe(b?.total);
  });

  it('gives a different account for the same number at another biller', () => {
    const a = electricityBill('coromandel-power', '104578291630', NOW);
    const b = electricityBill('deccan-electric', '104578291630', NOW);
    expect(a?.total).not.toBe(b?.total);
  });
});

describe('electricity', () => {
  it('reconciles the reading with the units drawn', () => {
    for (const account of ['104578291630', '900011112222', '555512340000']) {
      const bill = electricityBill('coromandel-power', account, NOW);
      expect(bill).not.toBeNull();
      if (!bill) continue;
      expect(bill.currentReading - bill.previousReading).toBe(bill.units);
      expect(bill.slabs.reduce((sum, line) => sum + line.units, 0)).toBe(bill.units);
    }
  });

  it('charges a fixed amount per sanctioned kW whatever the reading', () => {
    const bill = electricityBill('coromandel-power', '104578291630', NOW);
    const fixed = bill?.lines.find((line) => line.label === 'Fixed charge');
    expect(fixed?.amount).toBe((bill?.sanctionedLoad ?? 0) * 45 * 100);
  });

  it('always names the marginal rate, and never past the top slab', () => {
    for (const account of ['104578291630', '900011112222', '555512340000']) {
      const bill = electricityBill('coromandel-power', account, NOW);
      if (!bill) continue;
      expect(bill.marginalRate).toBeGreaterThan(0);
      if (bill.unitsToNextSlab !== null) {
        expect(bill.nextSlabRate).toBeGreaterThan(bill.marginalRate);
      }
    }
  });

  it('shows six months of history ending in this month', () => {
    const bill = electricityBill('coromandel-power', '104578291630', NOW);
    expect(bill?.history).toHaveLength(6);
    expect(bill?.history[5]?.units).toBe(bill?.units);
  });
});

describe('water and piped gas', () => {
  it('bills water over two months and reports litres per person a day', () => {
    const bill = waterBill('capital-water', '48210937', NOW);
    expect(bill).not.toBeNull();
    if (!bill) return;
    expect(bill.lpcd).toBe(Math.round((bill.kilolitres * 1000) / (bill.household * 60)));
    expect(bill.currentReading - bill.previousReading).toBe(bill.kilolitres);
  });

  it('taxes piped gas as VAT rather than GST, because it is outside GST', () => {
    const bill = gasBill('harbour-gas', '900482173', NOW);
    const tax = bill?.lines.find((line) => line.label.startsWith('VAT'));
    expect(tax).toBeDefined();
    expect(bill?.lines.some((line) => line.label.includes('GST'))).toBe(false);
  });

  it('converts gas to cylinders by calorific value', () => {
    const bill = gasBill('harbour-gas', '900482173', NOW);
    if (!bill) return;
    expect(bill.cylinderEquivalent).toBeCloseTo(Math.round((bill.scm / 34) * 10) / 10, 6);
  });
});

describe('telecom', () => {
  it('charges overage only past the quota', () => {
    for (const account of ['9876543210', '9000011111', '7012345678']) {
      const bill = postpaidBill('jio-postpaid', account, NOW);
      if (!bill) continue;
      expect(bill.overageGb).toBe(Math.max(0, bill.dataUsedGb - bill.plan.dataGb));
      const overageLine = bill.lines.find((line) => line.label === 'Data beyond the plan');
      if (bill.overageGb === 0) expect(overageLine).toBeUndefined();
      else expect(overageLine?.amount).toBe(bill.overageGb * bill.plan.overagePerGb * 100);
    }
  });

  it('never recommends a plan with fewer connections', () => {
    for (let n = 0; n < 60; n += 1) {
      const bill = postpaidBill('jio-postpaid', `98765432${String(n).padStart(2, '0')}`, NOW);
      if (!bill?.betterPlan) continue;
      expect(bill.betterPlan.plan.connections).toBeGreaterThanOrEqual(bill.plan.connections);
      expect(bill.betterPlan.saves).toBeGreaterThan(0);
      expect(bill.betterPlan.wouldHaveCost).toBeLessThan(bill.total);
    }
  });

  it('spends a landline allowance on the dearest calls first', () => {
    const bill = landlineBill('bsnl-landline', '04428152200', NOW);
    if (!bill) return;

    // Whatever was charged, no cheaper call type is charged while a dearer one
    // still has free minutes going spare.
    const byRate = [...bill.calls].sort((a, b) => b.perMinute - a.perMinute);
    let seenChargeable = false;
    for (const call of byRate) {
      const fullyFree = call.chargeable === 0 && call.minutes > 0;
      if (seenChargeable) expect(fullyFree).toBe(false);
      if (call.chargeable > 0) seenChargeable = true;
    }
    expect(bill.freeUsed).toBeLessThanOrEqual(bill.freeMinutes);
  });

  it('throttles broadband rather than charging for the overage', () => {
    for (const account of ['FBR204815', 'ABC123456', 'ZZZ999111', 'QQQ100200']) {
      const bill = broadbandBill('fibrenet', account, NOW);
      if (!bill) continue;
      expect(bill.throttled).toBe(bill.dataUsedGb > bill.plan.fupGb);
      // No line anywhere charges for data. That is the whole point.
      expect(bill.lines.some((line) => line.label.toLowerCase().includes('data'))).toBe(false);
      if (!bill.throttled) expect(bill.throttledDays).toBe(0);
    }
  });
});

describe('cable and DTH', () => {
  it('drops an à la carte channel a bouquet already carries', () => {
    const selection = resolveSelection(['moviesphere-max'], ['moviesphere', 'arena-one']);
    expect(selection.channels.map((channel) => channel.id)).toEqual(['arena-one']);
  });

  it('never bills a free-to-air channel or counts it toward the fee', () => {
    const selection = resolveSelection([], ['bharat-one', 'bharat-news', 'lantern-tv']);
    expect(selection.channels).toHaveLength(1);
    const quote = quoteSelection(selection);
    expect(quote.payChannelCount).toBe(1);
  });

  it('prices an empty selection at nothing', () => {
    const quote = quoteSelection(resolveSelection([], []));
    expect(quote.monthlyTotal).toBe(0);
    expect(quote.ncf).toBe(0);
  });

  it('prices every bouquet below the sum of its channels', () => {
    for (const bouquet of BOUQUETS) {
      expect(alaCarteValue(bouquet), bouquet.name).toBeGreaterThan(bouquet.priceRupees);
    }
  });

  it('lists only channels that exist inside every bouquet', () => {
    for (const bouquet of BOUQUETS) {
      for (const id of bouquet.channelIds) {
        expect(findChannel(id), `${bouquet.name}/${id}`).toBeDefined();
      }
    }
  });

  it('makes a longer DTH term cheaper per month, never dearer', () => {
    const account = dthAccount('skyreach', '3002481792');
    expect(account).not.toBeNull();
    if (!account) return;

    let previous = Number.POSITIVE_INFINITY;
    for (const term of account.terms) {
      expect(term.perMonth, `${term.months}m`).toBeLessThanOrEqual(previous);
      previous = term.perMonth;
      expect(term.amount).toBeGreaterThan(0);
    }
  });

  it('counts DTH days remaining from the balance and the monthly outgo', () => {
    for (const operator of DTH_OPERATORS) {
      const account = dthAccount(operator.id, '3002481792');
      if (!account) continue;
      expect(account.daysRemaining).toBe(Math.floor((account.balance / account.monthlyOutgo) * 30));
    }
  });

  it('carries a bill for a cable subscriber', () => {
    const bill = cableBill('delta-cable', '300248179254', NOW);
    expect(bill).not.toBeNull();
    expect(bill?.total).toBeGreaterThan(0);
  });
});

describe('loans', () => {
  it('sizes the principal to what kind of loan it is', () => {
    // Nobody writes a ninety-lakh personal loan. The prefix decides the book.
    for (let n = 0; n < 40; n += 1) {
      const suffix = String(10_000_000 + n);
      const personal = loanBill('meridian-loans', 'PL' + suffix, NOW);
      const home = loanBill('meridian-loans', 'HL' + suffix, NOW);
      if (personal) {
        expect(personal.kind).toBe('Personal loan');
        expect(personal.principal).toBeLessThanOrEqual(15 * 100_000 * 100);
      }
      if (home) {
        expect(home.kind).toBe('Home loan');
        expect(home.principal).toBeGreaterThanOrEqual(15 * 100_000 * 100);
      }
    }
  });

  it('accounts for every instalment: paid plus remaining is the tenure', () => {
    for (const account of ['HL48201736', 'CL77777777', 'EL10203040']) {
      const bill = loanBill('meridian-loans', account, NOW);
      if (!bill) continue;
      expect(bill.paidMonths + bill.remainingMonths, account).toBe(bill.tenureMonths);
      expect(bill.outstanding).toBeGreaterThan(0);
      expect(bill.outstanding).toBeLessThan(bill.principal);
    }
  });

  it('keeps the schedule consistent with itself', () => {
    const bill = loanBill('meridian-loans', 'HL48201736', NOW);
    if (!bill) return;

    let expected = bill.outstanding;
    for (const row of bill.schedule) {
      expect(row.opening).toBe(expected);
      expect(row.interest + row.principal).toBe(bill.emi);
      expect(row.closing).toBe(row.opening - row.principal);
      expected = row.closing;
    }
    // The balance only ever falls.
    expect(expected).toBeLessThan(bill.outstanding);
  });

  it('charges a foreclosure fee at a non-bank lender and not at a bank', () => {
    const bank = loanBill('meridian-loans', 'HL48201736', NOW);
    const nbfc = loanBill('beacon-finance', 'HL48201736', NOW);
    expect(bank?.foreclosure.chargePercent).toBe(0);
    expect(nbfc?.foreclosure.chargePercent).toBeGreaterThan(0);
    expect(nbfc?.foreclosure.total).toBeGreaterThan(nbfc?.foreclosure.amount ?? 0);
  });
});

describe('property tax and school fees', () => {
  it('runs the financial year from April', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00Z')).startYear).toBe(2026);
    expect(financialYear(new Date('2026-03-31T00:00:00Z')).startYear).toBe(2025);
  });

  it('splits the demand into two halves that add back up', () => {
    const bill = propertyTaxBill('coromandel-corporation', '08042013796', NOW);
    if (!bill) return;
    const halves = bill.instalments.reduce((sum, entry) => sum + entry.amount, 0);
    expect(halves).toBe(bill.annualDemand);
    expect(bill.baseTax + bill.cess).toBe(bill.annualDemand);
  });

  it('gives the rebate before the cutoff and charges a penalty after the due date', () => {
    const april = propertyTaxBill(
      'coromandel-corporation',
      '08042013796',
      new Date('2026-05-01T00:00:00Z'),
    );
    expect(april?.rebate.available).toBe(true);
    expect(april?.fullYearPayable).toBeLessThan(april?.annualDemand ?? 0);

    const december = propertyTaxBill(
      'coromandel-corporation',
      '08042013796',
      new Date('2026-12-15T00:00:00Z'),
    );
    expect(december?.rebate.available).toBe(false);
    expect(december?.fullYearPayable).toBeGreaterThan(december?.annualDemand ?? 0);
    expect(december?.instalments[0]?.penalty ?? 0).toBeGreaterThan(0);
  });

  it('closes the rebate on the last day of June, not the first of July', () => {
    const bill = propertyTaxBill('coromandel-corporation', '08042013796', NOW);
    expect(bill?.rebate.before.getMonth()).toBe(5);
    expect(bill?.rebate.before.getDate()).toBe(30);
  });

  it('gives a college years and a school classes', () => {
    const college = educationBill('stonebridge-college', '2022100200', NOW);
    const school = educationBill('lantern-school', '2023048172', NOW);
    expect(college?.className).toMatch(/year$/);
    expect(school?.className).toMatch(/^Class /);
    expect(college?.terms).toHaveLength(2);
    expect(school?.terms).toHaveLength(3);
  });

  it('caps the late fee', () => {
    const bill = educationBill('lantern-school', '2023048172', NOW);
    if (!bill) return;
    for (const term of bill.terms) {
      expect(term.lateFee).toBeLessThanOrEqual(bill.lateFeeCap * 100);
      if (term.paid) expect(term.lateFee).toBe(0);
      expect(term.payable).toBe(term.paid ? 0 : term.amount + term.lateFee);
    }
  });
});

describe('LPG', () => {
  it('refuses a subsidised refill inside the minimum gap, and allows a commercial one', () => {
    // Walk accounts until one lands inside the gap, so the rule is exercised.
    for (let n = 0; n < 60; n += 1) {
      const id = String(10_000_000_000_000_000 + n);
      const connection = lpgConnection('meridian-lpg', id, NOW);
      if (!connection || connection.daysUntilEligible === 0) continue;

      const day = deliveryCalendar('meridian-lpg', NOW).find((entry) =>
        entry.slots.some((slot) => slot.available),
      );
      const slot = day?.slots.find((entry) => entry.available);
      if (!day || !slot) continue;

      const subsidised = checkBooking(connection, 'domestic-14', day.key, slot.slot.id, NOW);
      expect(subsidised.ok).toBe(false);
      if (!subsidised.ok) expect(subsidised.code).toBe('TOO_SOON');

      const commercial = checkBooking(connection, 'commercial-19', day.key, slot.slot.id, NOW);
      expect(commercial.ok).toBe(true);
      return;
    }
    throw new Error('no account inside the refill gap was found');
  });

  it('refuses a slot that is full and a day outside the window', () => {
    const connection = lpgConnection('meridian-lpg', '12345678901234567', NOW);
    if (!connection) return;
    expect(checkBooking(connection, 'domestic-14', '2020-01-01', 'morning', NOW).ok).toBe(false);
    expect(checkBooking(connection, 'nonesuch', '2026-08-22', 'morning', NOW).ok).toBe(false);
  });

  it('shows the subsidy as a transfer, never as money off the price', () => {
    const connection = lpgConnection('meridian-lpg', '12345678901234567', NOW);
    if (!connection) return;
    const quote = quoteRefill('domestic-14', connection);
    const cylinder = CYLINDERS.find((entry) => entry.id === 'domestic-14');
    // The payable is the full door price. The subsidy is reported separately.
    expect(quote?.payable).toBe((cylinder?.priceRupees ?? 0) * 100);
    if (quote?.subsidyApplies) expect(quote.subsidyTransfer).toBeGreaterThan(0);
  });

  it('carries no subsidy on a commercial cylinder', () => {
    const connection = lpgConnection('meridian-lpg', '12345678901234567', NOW);
    if (!connection) return;
    expect(quoteRefill('commercial-19', connection)?.subsidyTransfer).toBe(0);
  });

  it('keys a day by its local date, not by UTC', () => {
    // The bug this guards: a date set to local midnight rolls back a day under
    // `toISOString()` in any timezone ahead of UTC, so the calendar said one
    // day and the booking carried the one before it.
    for (const day of deliveryCalendar('meridian-lpg', NOW)) {
      expect(day.key).toBe(
        [
          day.date.getFullYear(),
          String(day.date.getMonth() + 1).padStart(2, '0'),
          String(day.date.getDate()).padStart(2, '0'),
        ].join('-'),
      );
      // And the label the customer reads matches the key they click.
      const parsed = fromDayKey(day.key);
      expect(parsed?.getDate()).toBe(day.date.getDate());
      expect(parsed?.getMonth()).toBe(day.date.getMonth());
    }
  });

  it('books the day that was clicked, all the way to the stored date', () => {
    for (let n = 0; n < 80; n += 1) {
      const id = String(10_000_000_000_000_000 + n);
      const connection = lpgConnection('meridian-lpg', id, NOW);
      if (!connection || connection.daysUntilEligible > 0) continue;

      const day = deliveryCalendar('meridian-lpg', NOW).find((entry) =>
        entry.slots.some((slot) => slot.available),
      );
      const slot = day?.slots.find((entry) => entry.available);
      if (!day || !slot) continue;

      const quoted = quoteBill(
        'LPG',
        'meridian-lpg',
        id,
        { kind: 'REFILL', cylinderId: 'domestic-14', date: day.key, slotId: slot.slot.id },
        NOW,
      );
      expect(quoted.ok).toBe(true);
      if (!quoted.ok) return;

      const stored = quoted.quote.booking?.deliverOn;
      expect(stored?.getDate()).toBe(day.date.getDate());
      expect(stored?.getMonth()).toBe(day.date.getMonth());
      return;
    }
    throw new Error('no eligible LPG account was found');
  });

  it('is closed on Sunday', () => {
    for (const day of deliveryCalendar('meridian-lpg', NOW)) {
      if (day.date.getDay() === 0) {
        expect(day.slots.every((slot) => !slot.available)).toBe(true);
      }
    }
  });
});

describe('the quote dispatcher', () => {
  it('quotes every category that takes a number', () => {
    const samples: Array<[string, string, string]> = [
      ['ELECTRICITY', 'coromandel-power', '104578291630'],
      ['WATER', 'capital-water', '48210937'],
      ['PIPED_GAS', 'harbour-gas', '900482173'],
      ['POSTPAID', 'jio-postpaid', '9876543210'],
      ['LANDLINE', 'bsnl-landline', '04428152200'],
      ['BROADBAND', 'fibrenet', 'FBR204815'],
      ['CABLE', 'delta-cable', '300248179254'],
      ['CREDIT_CARD', 'meridian-card', '98765432104291'],
      ['LOAN', 'meridian-loans', 'HL48201736'],
      ['MUNICIPAL_TAX', 'coromandel-corporation', '08042013796'],
      ['EDUCATION', 'lantern-school', '2023048172'],
    ];

    for (const [category, biller, account] of samples) {
      const result = quoteBill(
        category as Parameters<typeof quoteBill>[0],
        biller,
        account,
        { kind: 'FULL' },
        NOW,
      );
      expect(result.ok, category).toBe(true);
      if (result.ok) {
        expect(result.quote.amount, category).toBeGreaterThan(0);
        expect(result.quote.components.length, category).toBeGreaterThan(0);
        expect(result.quote.summary, category).toBeTruthy();
      }
    }
  });

  it('quotes the same figure the engine produced', () => {
    const bill = electricityBill('coromandel-power', '104578291630', NOW);
    const quoted = quoteBill(
      'ELECTRICITY',
      'coromandel-power',
      '104578291630',
      { kind: 'FULL' },
      NOW,
    );
    expect(quoted.ok && quoted.quote.amount).toBe(bill?.total);
  });

  it('quotes a card minimum below its total', () => {
    const full = quoteBill('CREDIT_CARD', 'meridian-card', '98765432104291', { kind: 'FULL' }, NOW);
    const min = quoteBill(
      'CREDIT_CARD',
      'meridian-card',
      '98765432104291',
      { kind: 'MINIMUM' },
      NOW,
    );
    expect(full.ok && min.ok).toBe(true);
    if (full.ok && min.ok) expect(min.quote.amount).toBeLessThan(full.quote.amount);
  });

  it('refuses a part payment outside what is owed', () => {
    const tooMuch = quoteBill(
      'CREDIT_CARD',
      'meridian-card',
      '98765432104291',
      { kind: 'CUSTOM', rupees: 99_999_999 },
      NOW,
    );
    expect(tooMuch.ok).toBe(false);
    if (!tooMuch.ok) expect(tooMuch.code).toBe('BAD_AMOUNT');

    const tooLittle = quoteBill(
      'CREDIT_CARD',
      'meridian-card',
      '98765432104291',
      { kind: 'CUSTOM', rupees: 1 },
      NOW,
    );
    expect(tooLittle.ok).toBe(false);
  });

  it('refuses a malformed account before doing any work', () => {
    const result = quoteBill('ELECTRICITY', 'coromandel-power', 'nonsense', { kind: 'FULL' }, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('BAD_ACCOUNT');
  });

  it('sends insurance premiums to the renewal path rather than deriving one', () => {
    const result = quoteBill(
      'INSURANCE_PREMIUM',
      'meridian-general',
      'MP1A2B3C4D',
      { kind: 'FULL' },
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it('quotes a DTH recharge from the selection and the term', () => {
    const result = quoteDth('skyreach', '3002481792', {
      kind: 'DTH',
      bouquets: ['moviesphere-max'],
      channels: ['arena-one'],
      months: 12,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.quote.amount).toBeGreaterThan(0);

    const empty = quoteDth('skyreach', '3002481792', {
      kind: 'DTH',
      bouquets: [],
      channels: [],
      months: 1,
    });
    expect(empty.ok).toBe(false);
  });

  it('has a channel for every genre listed', () => {
    expect(CHANNELS.length).toBeGreaterThan(20);
    expect(new Set(CHANNELS.map((channel) => channel.id)).size).toBe(CHANNELS.length);
  });
});
