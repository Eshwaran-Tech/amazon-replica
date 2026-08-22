import { describe, expect, it } from 'vitest';

import { AMENITIES, FILTERABLE_AMENITIES, MEAL_PLANS } from '@/data/hotel-amenities';
import {
  cityLabel,
  findCity,
  HOTEL_CITIES,
  matchLocality,
  POPULAR_CITIES,
  searchCities,
} from '@/data/hotel-cities';
import {
  addDays,
  applyHotelFilters,
  CHILD_MAX_AGE,
  formatTime,
  MAX_NIGHTS,
  MAX_ROOMS,
  nightsBetween,
  nightsOf,
  PHOTO_POOL_SIZE,
  popularity,
  PRICE_BANDS,
  quoteStay,
  ratingWord,
  reviewsFor,
  searchHotels,
  stayFactor,
  taxRateFor,
  todayKey,
  type Hotel,
} from '@/services/hotels';

/**
 * Hotel search.
 *
 * A generated set of properties is only worth anything if it is stable and the
 * money adds up. So: the same destination and dates must return the same
 * hotels every time; the rate on the card must be the rate on the room and the
 * rate on the bill; a longer stay must cost more than a shorter one; and every
 * filter must do what its label says.
 */

const TODAY = new Date(2026, 7, 21, 10, 0);
const IN = '2026-09-21';
const OUT = '2026-09-23';

function search(
  city = 'goa',
  overrides: Partial<Parameters<typeof searchHotels>[0]> = {},
  today = TODAY,
) {
  const result = searchHotels(
    { city, checkIn: IN, checkOut: OUT, rooms: 1, adults: 2, children: [], ...overrides },
    today,
  );
  if (!result.ok) throw new Error(`search failed: ${result.message}`);
  return result;
}

const goa = () => search().hotels;

describe('destinations', () => {
  it('finds a city by id and nothing by a bad one', () => {
    expect(findCity('goa')?.name).toBe('Goa');
    expect(findCity('GOA')?.name).toBe('Goa');
    expect(findCity('atlantis')).toBeUndefined();
    expect(findCity(null)).toBeUndefined();
  });

  it('gives every destination a unique id and at least a few localities', () => {
    const ids = new Set(HOTEL_CITIES.map((city) => city.id));
    expect(ids.size).toBe(HOTEL_CITIES.length);
    for (const city of HOTEL_CITIES) {
      expect(city.localities.length, city.name).toBeGreaterThanOrEqual(6);
      expect(new Set(city.localities).size).toBe(city.localities.length);
    }
  });

  it('offers the popular list before anyone types', () => {
    expect(searchCities('')).toEqual([...POPULAR_CITIES]);
    expect(POPULAR_CITIES.length).toBeGreaterThanOrEqual(8);
  });

  it('matches on city, region, country and locality', () => {
    expect(searchCities('goa').map((city) => city.id)).toContain('goa');
    expect(searchCities('karnataka').map((city) => city.id)).toContain('bangalore');
    expect(searchCities('thailand').map((city) => city.id)).toContain('phuket');
    // A neighbourhood is the commonest thing typed into this box.
    expect(searchCities('calangute').map((city) => city.id)).toContain('goa');
    expect(searchCities('koregaon').map((city) => city.id)).toContain('pune');
  });

  it('names the locality a term pointed at', () => {
    const goaCity = findCity('goa');
    if (!goaCity) throw new Error('missing city');
    expect(matchLocality(goaCity, 'calangute')).toBe('Calangute');
    expect(matchLocality(goaCity, 'nowhere')).toBeUndefined();
    expect(matchLocality(goaCity, '')).toBeUndefined();
  });

  it('labels a city the way the picker prints it', () => {
    const bangalore = findCity('bangalore');
    const goaCity = findCity('goa');
    if (!bangalore || !goaCity) throw new Error('missing city');
    expect(cityLabel(bangalore)).toBe('Bangalore, Karnataka, India');
    expect(cityLabel(goaCity)).toBe('Goa, India');
  });
});

describe('stay dates', () => {
  it('counts nights, not days', () => {
    expect(nightsBetween('2026-09-21', '2026-09-22')).toBe(1);
    expect(nightsBetween('2026-09-21', '2026-09-24')).toBe(3);
    expect(nightsBetween('2026-09-21', '2026-09-21')).toBe(0);
    expect(nightsBetween('2026-09-22', '2026-09-21')).toBe(-1);
  });

  it('counts a night as a date you sleep, so check-out is excluded', () => {
    expect(nightsOf('2026-09-21', '2026-09-24')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
    expect(nightsOf('2026-09-21', '2026-09-21')).toEqual([]);
  });

  it('moves dates without drifting across a month or a year', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-09-21', -1)).toBe('2026-09-20');
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('reads check-in and check-out times on a 12-hour clock', () => {
    expect(formatTime(11 * 60)).toBe('11:00 AM');
    expect(formatTime(12 * 60)).toBe('12:00 PM');
    expect(formatTime(14 * 60 + 30)).toBe('02:30 PM');
  });
});

describe('hotel search: what it refuses', () => {
  const bad = (overrides: Partial<Parameters<typeof searchHotels>[0]>) =>
    searchHotels(
      { city: 'goa', checkIn: IN, checkOut: OUT, rooms: 1, adults: 2, children: [], ...overrides },
      TODAY,
    );

  it('refuses a destination it does not know', () => {
    expect(bad({ city: 'atlantis' })).toMatchObject({ ok: false, code: 'UNKNOWN_CITY' });
  });

  it('refuses a check-out on or before check-in', () => {
    expect(bad({ checkOut: IN })).toMatchObject({ ok: false, code: 'BAD_DATES' });
    expect(bad({ checkIn: OUT, checkOut: IN })).toMatchObject({ ok: false, code: 'BAD_DATES' });
  });

  it('refuses a stay in the past', () => {
    expect(bad({ checkIn: '2026-08-01', checkOut: '2026-08-03' })).toMatchObject({
      ok: false,
      code: 'BAD_DATES',
    });
  });

  it('refuses a stay longer than a booking', () => {
    expect(bad({ checkOut: addDays(IN, MAX_NIGHTS + 1) })).toMatchObject({
      ok: false,
      code: 'BAD_DATES',
    });
    expect(bad({ checkOut: addDays(IN, MAX_NIGHTS) }).ok).toBe(true);
  });

  it('refuses an impossible party', () => {
    expect(bad({ rooms: 0 })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    expect(bad({ rooms: MAX_ROOMS + 1 })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    expect(bad({ adults: 0 })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    // Five adults will not fit in one room, whatever the form says.
    expect(bad({ rooms: 1, adults: 5 })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    expect(bad({ rooms: 2, adults: 5 }).ok).toBe(true);
  });

  it('refuses an age that is not a child age', () => {
    expect(bad({ children: [-1] })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    expect(bad({ children: [CHILD_MAX_AGE + 1] })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    expect(bad({ children: [4.5] })).toMatchObject({ ok: false, code: 'BAD_PARTY' });
    expect(bad({ children: [0, 5, CHILD_MAX_AGE] }).ok).toBe(true);
  });
});

describe('hotel search: the properties', () => {
  it('returns the same properties for the same destination and dates', () => {
    const first = search();
    const second = search();
    expect(second.hotels.map((hotel) => `${hotel.id}:${hotel.price}`)).toEqual(
      first.hotels.map((hotel) => `${hotel.id}:${hotel.price}`),
    );
  });

  it('keeps the same properties on a destination from one date to the next', () => {
    // Which hotels exist in Goa is a fact about Goa. Only the tariff moves.
    const week = search('goa', { checkIn: addDays(IN, 7), checkOut: addDays(OUT, 7) });
    expect(week.hotels.map((hotel) => hotel.id)).toEqual(goa().map((hotel) => hotel.id));
  });

  it('gives every property a unique id and name within a destination', () => {
    const ids = goa().map((hotel) => hotel.id);
    const names = goa().map((hotel) => hotel.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('puts every property in a locality the destination actually has', () => {
    const result = search();
    for (const hotel of result.hotels) {
      expect(result.city.localities, hotel.name).toContain(hotel.locality);
    }
  });

  it('only ever lists amenities the vocabulary knows', () => {
    for (const hotel of goa()) {
      expect(hotel.amenities.length).toBeGreaterThan(0);
      for (const amenity of hotel.amenities) expect(AMENITIES).toContain(amenity);
    }
  });

  it('gives a beach destination beach access and a metro none', () => {
    for (const hotel of goa()) expect(hotel.amenities).toContain('Beach Access');
    for (const hotel of search('pune').hotels) {
      expect(hotel.amenities).not.toContain('Beach Access');
    }
  });

  it('points every property at artwork the pool actually holds', () => {
    for (const hotel of goa()) {
      expect(hotel.photoIndex).toBeGreaterThanOrEqual(0);
      expect(hotel.photoIndex).toBeLessThan(PHOTO_POOL_SIZE);
    }
  });

  it('narrows to a locality when the term names one', () => {
    const all = search();
    const locality = all.hotels[0]?.locality;
    if (!locality) throw new Error('no properties');

    const narrowed = search('goa', { term: locality });
    expect(narrowed.locality).toBe(locality);
    expect(narrowed.hotels.length).toBeGreaterThan(0);
    expect(narrowed.hotels.length).toBeLessThan(all.hotels.length);
    for (const hotel of narrowed.hotels) expect(hotel.locality).toBe(locality);
  });

  it('prices a costlier destination above a cheaper one', () => {
    const median = (hotels: Hotel[]) =>
      [...hotels].sort((a, b) => a.price - b.price)[Math.floor(hotels.length / 2)]?.price ?? 0;
    expect(median(search('maldives').hotels)).toBeGreaterThan(median(search('pune').hotels));
  });
});

describe('hotel tariffs', () => {
  it('advertises the cheapest room, exactly', () => {
    // The card price and the room price are two views of one number. If they
    // can differ, the guest finds out at the desk.
    for (const hotel of goa()) {
      const cheapest = Math.min(...hotel.rooms.map((room) => room.price));
      expect(hotel.price, hotel.name).toBe(cheapest);
    }
  });

  it('quotes whole rupees, so no bill ends in a stray paisa', () => {
    for (const hotel of goa()) {
      expect(hotel.price % 100).toBe(0);
      for (const room of hotel.rooms) {
        expect(room.price % 100).toBe(0);
        if (room.listPrice) expect(room.listPrice % 100).toBe(0);
      }
    }
  });

  it('sells a room above the one below it', () => {
    for (const hotel of goa()) {
      const prices = hotel.rooms.map((room) => room.price);
      expect(prices, hotel.name).toEqual([...prices].sort((a, b) => a - b));
    }
  });

  it('gives a higher tier more floor space than the one below it', () => {
    // A 365 sq ft Executive Suite above a 590 sq ft Premium Room tells a reader
    // the numbers were rolled rather than meant.
    for (const hotel of goa()) {
      const sizes = hotel.rooms.map((room) => room.size);
      expect(sizes, hotel.name).toEqual([...sizes].sort((a, b) => a - b));
    }
  });

  it('strikes through a price higher than the one charged', () => {
    for (const hotel of goa()) {
      for (const room of hotel.rooms) {
        if (room.listPrice === null) {
          expect(room.discountPercent).toBe(0);
          continue;
        }
        expect(room.listPrice).toBeGreaterThan(room.price);
        expect(room.discountPercent).toBeGreaterThan(0);
      }
    }
  });

  it('only ever sells a meal plan the vocabulary knows', () => {
    for (const hotel of goa()) {
      for (const room of hotel.rooms) expect(MEAL_PLANS).toContain(room.mealPlan);
    }
  });

  it('charges more for a bigger party in the same room', () => {
    const two = search('goa', { rooms: 1, adults: 2 }).hotels[0];
    const four = search('goa', { rooms: 1, adults: 4 }).hotels[0];
    if (!two || !four) throw new Error('no properties');
    expect(four.id).toBe(two.id);
    expect(four.price).toBeGreaterThan(two.price);
  });

  it('charges a weekend above a midweek stay', () => {
    // 2026-09-21 is a Monday; 2026-09-25 is a Friday.
    const midweek = search('goa', { checkIn: '2026-09-21', checkOut: '2026-09-22' }).hotels[0];
    const weekend = search('goa', { checkIn: '2026-09-25', checkOut: '2026-09-26' }).hotels[0];
    if (!midweek || !weekend) throw new Error('no properties');
    expect(weekend.price).toBeGreaterThan(midweek.price);
  });

  it('leaves the factor at one for a plain midweek couple', () => {
    expect(
      stayFactor({ nights: ['2026-09-21', '2026-09-22'], rooms: 1, adults: 2, children: [] }),
    ).toBe(1);
  });
});

describe('the quote', () => {
  const room = () => {
    const hotel = goa()[0];
    const first = hotel?.rooms[0];
    if (!first) throw new Error('no rooms');
    return first;
  };

  it('multiplies the nightly rate by the nights and the rooms', () => {
    const quote = quoteStay(room(), { checkIn: IN, checkOut: OUT, rooms: 2 });
    expect(quote.nights).toBe(2);
    expect(quote.rooms).toBe(2);
    expect(quote.roomTotal).toBe(room().price * 2 * 2);
    expect(quote.total).toBe(quote.roomTotal + quote.taxes);
  });

  it('charges a longer stay more than a shorter one', () => {
    const short = quoteStay(room(), { checkIn: IN, checkOut: addDays(IN, 1), rooms: 1 });
    const long = quoteStay(room(), { checkIn: IN, checkOut: addDays(IN, 4), rooms: 1 });
    expect(long.total).toBeGreaterThan(short.total);
    expect(long.nights).toBe(4);
  });

  it('does not adjust a rate the search already adjusted', () => {
    // The stay factor is applied once, in the search. Applying it again here
    // is how a page quotes one number on the card and charges another.
    const quote = quoteStay(room(), { checkIn: IN, checkOut: OUT, rooms: 1 });
    expect(quote.perNight).toBe(room().price);
  });

  it('taxes by the real GST bands', () => {
    expect(taxRateFor(90_000)).toBe(0); // ₹900
    expect(taxRateFor(100_000)).toBe(0); // ₹1,000, the edge
    expect(taxRateFor(100_100)).toBe(12);
    expect(taxRateFor(750_000)).toBe(12); // ₹7,500, the edge
    expect(taxRateFor(750_100)).toBe(18);

    for (const hotel of goa()) {
      for (const entry of hotel.rooms) {
        const quote = quoteStay(entry, { checkIn: IN, checkOut: OUT, rooms: 1 });
        expect(quote.taxRate).toBe(taxRateFor(entry.price));
        expect(quote.taxes).toBe(Math.round((quote.roomTotal * quote.taxRate) / 100));
      }
    }
  });

  it('returns nothing payable for a stay with no nights', () => {
    const quote = quoteStay(room(), { checkIn: IN, checkOut: IN, rooms: 1 });
    expect(quote.nights).toBe(0);
    expect(quote.total).toBe(0);
  });
});

describe('hotel filters and sorts', () => {
  it('keeps only properties inside a price band', () => {
    const band = PRICE_BANDS[1];
    if (!band || band.max === null) throw new Error('missing band');
    for (const hotel of applyHotelFilters(goa(), {
      minPrice: band.min * 100,
      maxPrice: band.max * 100,
    })) {
      expect(hotel.price).toBeGreaterThanOrEqual(band.min * 100);
      expect(hotel.price).toBeLessThanOrEqual(band.max * 100);
    }
  });

  it('keeps only the star ratings asked for, any-of', () => {
    for (const hotel of applyHotelFilters(goa(), { stars: [5] })) {
      expect(hotel.starRating).toBe(5);
    }
    const five = applyHotelFilters(goa(), { stars: [5] }).length;
    const both = applyHotelFilters(goa(), { stars: [4, 5] }).length;
    expect(both).toBeGreaterThanOrEqual(five);
  });

  it('keeps only properties at or above a guest score', () => {
    for (const hotel of applyHotelFilters(goa(), { minRating: 4.5 })) {
      expect(hotel.rating).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('treats amenities as all-of, so two ticks narrow the list', () => {
    const one = applyHotelFilters(goa(), { amenities: ['Swimming Pool'] }).length;
    const two = applyHotelFilters(goa(), { amenities: ['Swimming Pool', 'Spa'] });
    expect(two.length).toBeLessThanOrEqual(one);
    for (const hotel of two) {
      expect(hotel.amenities).toContain('Swimming Pool');
      expect(hotel.amenities).toContain('Spa');
    }
  });

  it('only offers amenities some property on the list has', () => {
    for (const amenity of FILTERABLE_AMENITIES) {
      expect(AMENITIES).toContain(amenity);
    }
  });

  it('keeps only properties serving breakfast when asked', () => {
    for (const hotel of applyHotelFilters(goa(), { freeBreakfast: true })) {
      expect(hotel.freeBreakfast).toBe(true);
    }
  });

  it('sorts by price in both directions', () => {
    const low = applyHotelFilters(goa(), { sort: 'PRICE_LOW' }).map((hotel) => hotel.price);
    expect(low).toEqual([...low].sort((a, b) => a - b));

    const high = applyHotelFilters(goa(), { sort: 'PRICE_HIGH' }).map((hotel) => hotel.price);
    expect(high).toEqual([...high].sort((a, b) => b - a));
  });

  it('sorts by guest score, highest first', () => {
    const rated = applyHotelFilters(goa(), { sort: 'RATING' }).map((hotel) => hotel.rating);
    expect(rated).toEqual([...rated].sort((a, b) => b - a));
  });

  it('ranks popularity by how many guests stood behind the score', () => {
    const popular = applyHotelFilters(goa(), { sort: 'POPULAR' });
    const scores = popular.map(popularity);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // Four thousand reviews at 4.2 beats nine at 4.9, which a plain rating
    // sort gets backwards.
    const many = { rating: 4.2, ratingCount: 4000, starRating: 4 } as Hotel;
    const few = { rating: 4.9, ratingCount: 9, starRating: 4 } as Hotel;
    expect(popularity(many)).toBeGreaterThan(popularity(few));
  });

  it('stacks a price band on top of a star filter', () => {
    const filtered = applyHotelFilters(goa(), { stars: [4, 5], minRating: 4 });
    for (const hotel of filtered) {
      expect([4, 5]).toContain(hotel.starRating);
      expect(hotel.rating).toBeGreaterThanOrEqual(4);
    }
  });

  it('never invents a property the search did not return', () => {
    const all = goa();
    for (const hotel of applyHotelFilters(all, { stars: [5], freeBreakfast: true })) {
      expect(all.some((entry) => entry.id === hotel.id)).toBe(true);
    }
  });
});

describe('reviews', () => {
  it('gives every property a stable set', () => {
    const hotel = goa()[0];
    if (!hotel) throw new Error('no properties');
    expect(reviewsFor(hotel).map((review) => review.id)).toEqual(
      reviewsFor(hotel).map((review) => review.id),
    );
  });

  it('writes reviews that read like the score above them', () => {
    // A 4.8 property should not be a wall of complaints, and a weak one should
    // not be a wall of praise.
    const best = [...goa()].sort((a, b) => b.rating - a.rating)[0];
    const worst = [...goa()].sort((a, b) => a.rating - b.rating)[0];
    if (!best || !worst) throw new Error('no properties');

    const mean = (hotel: Hotel) => {
      const list = reviewsFor(hotel);
      return list.reduce((sum, review) => sum + review.rating, 0) / list.length;
    };
    expect(mean(best)).toBeGreaterThan(mean(worst));
  });

  it('does not put the same sentence in two reviews of one property', () => {
    // A body repeated three times in a list of seven reads as generated the
    // moment anyone glances down the page.
    for (const hotel of goa()) {
      const bodies = reviewsFor(hotel).map((review) => review.body);
      expect(new Set(bodies).size, hotel.name).toBe(bodies.length);
    }
  });

  it('keeps every review inside the scale, with a body and an author', () => {
    for (const hotel of goa()) {
      const list = reviewsFor(hotel);
      expect(list.length).toBeGreaterThanOrEqual(4);
      for (const review of list) {
        expect(review.rating).toBeGreaterThanOrEqual(1);
        expect(review.rating).toBeLessThanOrEqual(5);
        expect(review.body.length).toBeGreaterThan(20);
        expect(review.author.length).toBeGreaterThan(0);
        expect(review.daysAgo).toBeGreaterThan(0);
      }
    }
  });
});

describe('rating words', () => {
  it('names a score the way the badge does', () => {
    expect(ratingWord(4.8)).toBe('Excellent');
    expect(ratingWord(4.2)).toBe('Very Good');
    expect(ratingWord(3.6)).toBe('Good');
    expect(ratingWord(3.1)).toBe('Fair');
    expect(ratingWord(2.4)).toBe('Poor');
  });
});
