import { describe, expect, it } from 'vitest';

import { DISCOUNT_SLABS, quoteBulk, slabFor } from '@/data/bulk-gifting';
import { BRAND_CATEGORIES, brandsIn, findBrand, GIFT_BRANDS } from '@/data/gift-brands';
import { FEATURED_OCCASIONS, findOccasion, OCCASIONS, occasionsIn } from '@/data/gift-occasions';
import {
  allDesigns,
  applyGiftFilters,
  brandListings,
  DELIVERY_OPTIONS,
  DENOMINATIONS,
  designListings,
  designsFor,
  findDelivery,
  findDesign,
  findVoucherType,
  MAX_AMOUNT_RUPEES,
  MIN_AMOUNT_RUPEES,
  quoteGift,
  VOUCHER_TYPES,
} from '@/services/gift-store';

/**
 * The gift card catalogue.
 *
 * Two things have to hold or the storefront is decoration. Every design the
 * pages link to must exist as artwork on disk, since a card face that 404s is
 * the whole product missing. And the money must add up the same way on every
 * surface: the tile, the buy form and the charge all call `quoteGift`, so its
 * arithmetic is the only arithmetic.
 */

describe('occasions', () => {
  it('finds one by id and nothing by a bad one', () => {
    expect(findOccasion('birthday')?.name).toBe('Birthday');
    expect(findOccasion('BIRTHDAY')?.name).toBe('Birthday');
    expect(findOccasion('nonesuch')).toBeUndefined();
    expect(findOccasion(null)).toBeUndefined();
  });

  it('gives every occasion a unique id and at least four designs', () => {
    const ids = new Set(OCCASIONS.map((occasion) => occasion.id));
    expect(ids.size).toBe(OCCASIONS.length);
    for (const occasion of OCCASIONS) {
      expect(occasion.designs, occasion.name).toBeGreaterThanOrEqual(4);
      expect(occasion.greeting.length).toBeGreaterThan(0);
    }
  });

  it('sorts every occasion into a group, and features only everyday ones', () => {
    const grouped = [
      ...occasionsIn('EVERYDAY'),
      ...occasionsIn('FESTIVE'),
      ...occasionsIn('CORPORATE'),
    ];
    expect(grouped).toHaveLength(OCCASIONS.length);

    expect(FEATURED_OCCASIONS.length).toBeGreaterThanOrEqual(4);
    for (const occasion of FEATURED_OCCASIONS) {
      expect(occasion.group).toBe('EVERYDAY');
    }
  });
});

describe('designs', () => {
  it('numbers every design inside its occasion, without a gap', () => {
    for (const occasion of OCCASIONS) {
      const designs = designsFor(occasion);
      expect(designs).toHaveLength(occasion.designs);
      designs.forEach((design, index) => {
        expect(design.index).toBe(index);
        expect(design.id).toBe(`${occasion.id}-${String(index).padStart(2, '0')}`);
      });
    }
  });

  it('gives every design a unique id across the whole catalogue', () => {
    const ids = allDesigns().map((design) => design.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every design at artwork under the public path', () => {
    for (const design of allDesigns()) {
      expect(design.artwork).toBe(`/gift-cards/${design.id}.svg`);
    }
  });

  it('finds a design by id, and refuses one that is out of range', () => {
    expect(findDesign('birthday-00')?.occasion.id).toBe('birthday');
    expect(findDesign('BIRTHDAY-00')?.occasion.id).toBe('birthday');

    const birthday = findOccasion('birthday');
    if (!birthday) throw new Error('missing occasion');
    // One past the end is a design that has no artwork behind it.
    expect(findDesign(`birthday-${String(birthday.designs).padStart(2, '0')}`)).toBeUndefined();

    expect(findDesign('nonesuch-00')).toBeUndefined();
    expect(findDesign('birthday')).toBeUndefined();
    expect(findDesign('')).toBeUndefined();
    expect(findDesign(null)).toBeUndefined();
  });
});

describe('brands', () => {
  it('gives every brand a unique id and at least one denomination', () => {
    const ids = new Set(GIFT_BRANDS.map((brand) => brand.id));
    expect(ids.size).toBe(GIFT_BRANDS.length);
    for (const brand of GIFT_BRANDS) {
      expect(brand.denominations.length, brand.name).toBeGreaterThan(0);
      expect(Math.min(...brand.denominations)).toBeGreaterThan(0);
    }
  });

  it('sorts every brand into a category the table knows', () => {
    for (const brand of GIFT_BRANDS) {
      expect(BRAND_CATEGORIES).toContain(brand.category);
    }
    const grouped = BRAND_CATEGORIES.flatMap((category) => brandsIn(category));
    expect(grouped).toHaveLength(GIFT_BRANDS.length);
  });

  it('finds one by id and nothing by a bad one', () => {
    expect(findBrand('linden-row')?.name).toBe('Linden Row');
    expect(findBrand('nonesuch')).toBeUndefined();
    expect(findBrand(null)).toBeUndefined();
  });

  it('keeps every discount inside a sane range', () => {
    for (const brand of GIFT_BRANDS) {
      expect(brand.discountPercent).toBeGreaterThanOrEqual(0);
      expect(brand.discountPercent).toBeLessThanOrEqual(30);
    }
  });
});

describe('delivery and vouchers', () => {
  it('finds a delivery type by id, case-insensitively', () => {
    expect(findDelivery('email')?.name).toBe('Email');
    expect(findDelivery('PHYSICAL')?.feeRupees).toBeGreaterThan(0);
    expect(findDelivery('carrier-pigeon')).toBeUndefined();
  });

  it('charges for a physical card and nothing for the rest', () => {
    for (const option of DELIVERY_OPTIONS) {
      if (option.id === 'PHYSICAL') expect(option.feeRupees).toBeGreaterThan(0);
      else expect(option.feeRupees).toBe(0);
    }
  });

  it('finds a voucher kind and gives each one something to spend on', () => {
    expect(findVoucherType('shopping')?.name).toBe('Shopping Voucher');
    expect(findVoucherType('nonesuch')).toBeUndefined();
    for (const type of VOUCHER_TYPES) {
      expect(type.spendableOn.length).toBeGreaterThan(0);
    }
  });
});

describe('the quote', () => {
  const email = DELIVERY_OPTIONS.find((option) => option.id === 'EMAIL');
  const physical = DELIVERY_OPTIONS.find((option) => option.id === 'PHYSICAL');
  if (!email || !physical) throw new Error('missing delivery option');

  it('multiplies the face value by the quantity', () => {
    const quote = quoteGift({ amountRupees: 500, quantity: 3, delivery: email });
    expect(quote.faceValue).toBe(50_000);
    expect(quote.subtotal).toBe(150_000);
    expect(quote.total).toBe(150_000);
  });

  it('charges the delivery fee per card, not per order', () => {
    const one = quoteGift({ amountRupees: 500, quantity: 1, delivery: physical });
    const four = quoteGift({ amountRupees: 500, quantity: 4, delivery: physical });
    expect(four.deliveryFee).toBe(one.deliveryFee * 4);
    expect(four.total).toBe(four.subtotal + four.deliveryFee);
  });

  it('takes a brand discount off what you pay, not off the face value', () => {
    // The whole point of the discount: a ₹1,000 card at 8% off costs ₹920 and
    // is still worth ₹1,000 at the till.
    const brand = GIFT_BRANDS.find((entry) => entry.discountPercent > 0);
    if (!brand) throw new Error('no discounted brand');

    const quote = quoteGift({ amountRupees: 1000, quantity: 1, delivery: email, brand });
    expect(quote.faceValue).toBe(100_000);
    expect(quote.subtotal).toBe(100_000);
    expect(quote.discount).toBe(Math.round((100_000 * brand.discountPercent) / 100));
    expect(quote.total).toBe(quote.subtotal - quote.discount);
    expect(quote.total).toBeLessThan(quote.faceValue);
  });

  it('never charges a fraction of a paisa', () => {
    for (const brand of GIFT_BRANDS) {
      for (const amount of brand.denominations) {
        const quote = quoteGift({ amountRupees: amount, quantity: 7, delivery: email, brand });
        expect(Number.isInteger(quote.total)).toBe(true);
        expect(Number.isInteger(quote.discount)).toBe(true);
      }
    }
  });

  it('treats a quantity below one as one', () => {
    expect(quoteGift({ amountRupees: 500, quantity: 0, delivery: email }).quantity).toBe(1);
    expect(quoteGift({ amountRupees: 500, quantity: -4, delivery: email }).quantity).toBe(1);
  });

  it('offers denominations inside the amount bounds', () => {
    for (const value of DENOMINATIONS) {
      expect(value).toBeGreaterThanOrEqual(MIN_AMOUNT_RUPEES);
      expect(value).toBeLessThanOrEqual(MAX_AMOUNT_RUPEES);
    }
  });
});

describe('filters and sorts', () => {
  const pool = () => [...brandListings(), ...designListings()];

  it('keeps only one occasion when one is chosen', () => {
    for (const listing of applyGiftFilters(pool(), { occasion: 'birthday' })) {
      expect(listing.design?.occasion.id).toBe('birthday');
    }
  });

  it('keeps only the brands asked for, any-of', () => {
    const one = applyGiftFilters(pool(), { brands: ['linden-row'] });
    expect(one.every((listing) => listing.brand?.id === 'linden-row')).toBe(true);

    const two = applyGiftFilters(pool(), { brands: ['linden-row', 'auric-fine'] });
    expect(two.length).toBeGreaterThanOrEqual(one.length);
  });

  it('keeps only listings offering a delivery type', () => {
    for (const listing of applyGiftFilters(pool(), { delivery: ['PHYSICAL'] })) {
      expect(listing.delivery).toContain('PHYSICAL');
    }
    // A brand card is a code, so it never survives a physical filter.
    expect(applyGiftFilters(brandListings(), { delivery: ['PHYSICAL'] })).toHaveLength(0);
  });

  it('honours an amount ceiling', () => {
    for (const listing of applyGiftFilters(pool(), { maxRupees: 500 })) {
      expect(listing.fromRupees).toBeLessThanOrEqual(500);
    }
  });

  it('sorts by starting price in both directions', () => {
    const low = applyGiftFilters(pool(), { sort: 'PRICE_LOW' }).map((l) => l.fromRupees);
    expect(low).toEqual([...low].sort((a, b) => a - b));

    const high = applyGiftFilters(pool(), { sort: 'PRICE_HIGH' }).map((l) => l.fromRupees);
    expect(high).toEqual([...high].sort((a, b) => b - a));
  });

  it('puts the biggest discount first when featured', () => {
    const featured = applyGiftFilters(brandListings(), { sort: 'FEATURED' });
    const discounts = featured.map((listing) => listing.discountPercent);
    expect(discounts).toEqual([...discounts].sort((a, b) => b - a));
  });

  it('never invents a listing the pool did not hold', () => {
    const all = pool();
    const ids = new Set(all.map((listing) => listing.id));
    for (const listing of applyGiftFilters(all, { sort: 'NEWEST', maxRupees: 2000 })) {
      expect(ids.has(listing.id)).toBe(true);
    }
  });

  it('gives a brand listing and a design listing ids that cannot collide', () => {
    const brandIds = brandListings().map((listing) => listing.id);
    const designIds = designListings().map((listing) => listing.id);
    for (const id of brandIds) expect(id.startsWith('brand:')).toBe(true);
    for (const id of designIds) expect(id.startsWith('brand:')).toBe(false);
  });
});

describe('bulk discount slabs', () => {
  it('rises with the order value and never falls', () => {
    const percents = DISCOUNT_SLABS.map((slab) => slab.percent);
    const thresholds = DISCOUNT_SLABS.map((slab) => slab.fromRupees);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
  });

  it('gives nothing below the first slab', () => {
    const first = DISCOUNT_SLABS[0];
    if (!first) throw new Error('no slabs');
    expect(slabFor(first.fromRupees - 1)).toBeNull();
    expect(slabFor(first.fromRupees)?.percent).toBe(first.percent);
  });

  it('picks the best slab an order qualifies for', () => {
    const last = DISCOUNT_SLABS[DISCOUNT_SLABS.length - 1];
    if (!last) throw new Error('no slabs');
    expect(slabFor(last.fromRupees * 10)?.percent).toBe(last.percent);
  });

  it('works the arithmetic out in whole rupees', () => {
    const quote = quoteBulk(500, 1000);
    expect(quote.orderRupees).toBe(500_000);
    expect(quote.percent).toBe(3);
    expect(quote.savingRupees).toBe(15_000);
    expect(quote.payableRupees).toBe(485_000);
    expect(Number.isInteger(quote.savingRupees)).toBe(true);
  });

  it('names the next slab and what it would take to reach it', () => {
    const quote = quoteBulk(10, 1000);
    expect(quote.percent).toBe(0);
    expect(quote.nextSlab?.fromRupees).toBe(25_000);
    expect(quote.toNextRupees).toBe(15_000);
  });

  it('has no next slab once the top one is reached', () => {
    const quote = quoteBulk(100_000, 10_000);
    expect(quote.nextSlab).toBeNull();
    expect(quote.toNextRupees).toBe(0);
  });

  it('refuses to be talked into a negative or absurd order', () => {
    expect(quoteBulk(-5, 1000).orderRupees).toBe(0);
    expect(quoteBulk(500, -1000).orderRupees).toBe(0);
    expect(quoteBulk(Number.NaN, 1000).orderRupees).toBe(0);
    // Bounded rather than unbounded, so the figure stays a number.
    expect(quoteBulk(10 ** 9, 10 ** 9).orderRupees).toBe(100_000 * 10_000);
  });
});
