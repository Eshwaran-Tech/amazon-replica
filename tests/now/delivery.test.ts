import { describe, expect, it } from 'vitest';

import { estimateDelivery, FALLBACK_PIN, isValidPin } from '@/services/delivery';

/**
 * The Now store's delivery estimate.
 *
 * Two things are worth pinning. The postal geography is real data and must stay
 * correct -- 600 is Chennai whatever else changes. The slot is an estimate, and
 * its value is that it is *stable*: a figure that moved on every render would
 * be worse than no figure at all.
 */

describe('delivery: PIN validation', () => {
  it('accepts a six-digit PIN', () => {
    expect(isValidPin('600007')).toBe(true);
    expect(isValidPin('110001')).toBe(true);
  });

  it('rejects anything that is not one', () => {
    for (const value of [
      '',
      '60000',
      '6000078',
      '0abcde',
      '012345',
      'ABCDEF',
      ' 600007 ',
      600007,
    ]) {
      expect(isValidPin(value), String(value)).toBe(false);
    }
  });

  it('returns null rather than guessing for a malformed PIN', () => {
    expect(estimateDelivery('nope')).toBeNull();
    expect(estimateDelivery('12345')).toBeNull();
  });
});

describe('delivery: postal geography', () => {
  it.each([
    ['600007', 'Chennai', 'Tamil Nadu'],
    ['560001', 'Bengaluru', 'Karnataka'],
    ['400001', 'Mumbai', 'Maharashtra'],
    ['110001', 'New Delhi', 'Delhi'],
    ['700001', 'Kolkata', 'West Bengal'],
    ['500081', 'Hyderabad', 'Telangana'],
  ])('reads %s as %s, %s', (pin, city, state) => {
    const estimate = estimateDelivery(pin);
    expect(estimate?.city).toBe(city);
    expect(estimate?.state).toBe(state);
    expect(estimate?.label).toBe(`${city}, ${state}`);
  });

  it('names the circle alone when the district is not a single city', () => {
    // 612 is Tamil Nadu, but not one of the metro sorting districts.
    const estimate = estimateDelivery('612001');
    expect(estimate?.city).toBeNull();
    expect(estimate?.state).toBe('Tamil Nadu');
    expect(estimate?.label).toBe('Tamil Nadu');
  });

  it('falls back to the country rather than inventing a place', () => {
    // 999 is not an allocated circle.
    const estimate = estimateDelivery('999999');
    expect(estimate?.city).toBeNull();
    expect(estimate?.state).toBeNull();
    expect(estimate?.label).toBe('India');
  });
});

describe('delivery: the slot', () => {
  it('is the same every time for the same PIN', () => {
    const first = estimateDelivery('600007');
    const second = estimateDelivery('600007');
    expect(first?.minutes).toBe(second?.minutes);
  });

  it('stays inside the window it advertises', () => {
    for (const pin of ['600007', '560001', '612001', '999999', '182101', '831001']) {
      const minutes = estimateDelivery(pin)?.minutes ?? 0;
      expect(minutes, pin).toBeGreaterThanOrEqual(8);
      expect(minutes, pin).toBeLessThanOrEqual(39);
    }
  });

  it('quotes a metro sorting district faster than an outlying one', () => {
    // The one claim the estimate makes beyond "it is stable".
    for (const pin of ['600007', '560001', '400001', '110001']) {
      expect(estimateDelivery(pin)?.minutes, pin).toBeLessThan(20);
    }
    for (const pin of ['612001', '999999']) {
      expect(estimateDelivery(pin)?.minutes, pin).toBeGreaterThanOrEqual(18);
    }
  });

  it('ships a fallback PIN that actually resolves', () => {
    const estimate = estimateDelivery(FALLBACK_PIN);
    expect(estimate).not.toBeNull();
    expect(estimate?.city).toBe('Chennai');
  });
});
