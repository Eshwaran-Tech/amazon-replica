import { describe, expect, it } from 'vitest';

import {
  cardFare,
  FARE_SLABS,
  findIssuer,
  findNetwork,
  findTollClass,
  MAX_METRO_TOP_UP,
  MAX_TAG_TOP_UP,
  METRO_NETWORKS,
  METRO_TOP_UPS,
  MIN_METRO_TOP_UP,
  MIN_TAG_TOP_UP,
  slabFare,
  TAG_ISSUERS,
  TAG_TOP_UPS,
  TOLL_CLASSES,
} from '@/data/transit';
import {
  findCorridor,
  findStation,
  METRO_STATIONS,
  monthlyPassRupees,
  RETURN_TRIP_MULTIPLIER,
  stationsOn,
  TOLL_CORRIDORS,
  tollRupees,
  trackKm,
} from '@/data/transit-routes';
import { normaliseCardNumber, prettyCardNumber, quoteJourney } from '@/services/metro';

/**
 * Tolls and metro fares.
 *
 * Pure arithmetic, so it can be pinned exactly. The two rules worth guarding
 * are the ones a commuter would notice being wrong: a return within 24 hours is
 * one and a half single trips, and a fare is a distance *slab*, not a rate.
 */

describe('the books', () => {
  it('has a unique id on every issuer, class, network, corridor and station', () => {
    const groups = [
      TAG_ISSUERS.map((entry) => entry.id),
      TOLL_CLASSES.map((entry) => entry.id),
      METRO_NETWORKS.map((entry) => entry.id),
      TOLL_CORRIDORS.map((entry) => entry.id),
      METRO_STATIONS.map((entry) => entry.id),
    ];
    for (const ids of groups) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('looks up by id case-insensitively and refuses anything else', () => {
    expect(findIssuer('MERIDIAN-TAG')?.id).toBe('meridian-tag');
    expect(findIssuer('nonesuch')).toBeUndefined();
    expect(findIssuer(null)).toBeUndefined();

    expect(findTollClass('car')?.id).toBe('CAR');
    expect(findTollClass('lorry')).toBeUndefined();

    expect(findNetwork('DELHI')?.city).toBe('Delhi');
    expect(findNetwork('atlantis')).toBeUndefined();

    expect(findCorridor('DEL-JAI')?.highway).toBe('NH 48');
    expect(findCorridor('nowhere')).toBeUndefined();
  });

  it('puts every station on a network that exists', () => {
    for (const station of METRO_STATIONS) {
      expect(findNetwork(station.networkId), station.name).toBeDefined();
    }
  });

  it('gives every network at least two stations, so a journey is possible', () => {
    for (const network of METRO_NETWORKS) {
      expect(stationsOn(network.id).length, network.city).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers top-up amounts inside the limits it enforces', () => {
    for (const amount of TAG_TOP_UPS) {
      expect(amount).toBeGreaterThanOrEqual(MIN_TAG_TOP_UP);
      expect(amount).toBeLessThanOrEqual(MAX_TAG_TOP_UP);
    }
    for (const amount of METRO_TOP_UPS) {
      expect(amount).toBeGreaterThanOrEqual(MIN_METRO_TOP_UP);
      expect(amount).toBeLessThanOrEqual(MAX_METRO_TOP_UP);
    }
  });

  it('keeps every issuer’s minimum balance below its smallest recharge', () => {
    // Otherwise the smallest top-up on offer would leave the tag still refused.
    const smallest = Math.min(...TAG_TOP_UPS);
    for (const issuer of TAG_ISSUERS) {
      expect(issuer.minBalanceRupees, issuer.name).toBeLessThanOrEqual(smallest);
    }
  });
});

describe('tolls', () => {
  const corridor = TOLL_CORRIDORS[0];

  it('charges a car the published figure and every other class more', () => {
    if (!corridor) throw new Error('no corridors');
    const car = tollRupees(corridor, 1);
    expect(car).toBe(corridor.carRupees);

    for (const tollClass of TOLL_CLASSES) {
      const amount = tollRupees(corridor, tollClass.multiplier);
      expect(amount, tollClass.label).toBeGreaterThanOrEqual(car);
    }
  });

  it('charges a return within 24 hours at one and a half single trips', () => {
    if (!corridor) throw new Error('no corridors');
    const single = tollRupees(corridor, 1);
    const returning = tollRupees(corridor, 1, { returnTrip: true });
    expect(returning).toBe(Math.round(single * RETURN_TRIP_MULTIPLIER));
    // Cheaper than two singles, which is the whole point of the concession.
    expect(returning).toBeLessThan(single * 2);
  });

  it('prices a monthly pass well under a month of single crossings', () => {
    if (!corridor) throw new Error('no corridors');
    const pass = monthlyPassRupees(corridor, 1);
    expect(pass).toBeGreaterThan(0);
    // A pass covers one plaza, not the whole corridor -- so it must be less
    // than 22 full-corridor crossings by roughly the plaza count.
    expect(pass).toBeLessThan(tollRupees(corridor, 1) * 22);
  });

  it('rises with the class multiplier, never falls', () => {
    if (!corridor) throw new Error('no corridors');
    const sorted = [...TOLL_CLASSES].sort((a, b) => a.multiplier - b.multiplier);
    let previous = 0;
    for (const tollClass of sorted) {
      const amount = tollRupees(corridor, tollClass.multiplier);
      expect(amount, tollClass.label).toBeGreaterThanOrEqual(previous);
      previous = amount;
    }
  });

  it('quotes every corridor in whole rupees', () => {
    for (const entry of TOLL_CORRIDORS) {
      expect(Number.isInteger(tollRupees(entry, 1.6)), entry.name).toBe(true);
      expect(Number.isInteger(monthlyPassRupees(entry, 3.35)), entry.name).toBe(true);
    }
  });
});

describe('metro fares', () => {
  it('charges by slab, so two distances inside one band cost the same', () => {
    expect(slabFare(2.1)).toBe(slabFare(4.9));
    expect(slabFare(2.1)).not.toBe(slabFare(1.5));
  });

  it('never gets cheaper as the distance grows', () => {
    let previous = 0;
    for (let km = 0; km < 60; km += 0.5) {
      const fare = slabFare(km);
      expect(fare, `${km} km`).toBeGreaterThanOrEqual(previous);
      previous = fare;
    }
  });

  it('caps at the last slab rather than running away', () => {
    const last = FARE_SLABS[FARE_SLABS.length - 1]?.fareRupees ?? 0;
    expect(slabFare(500)).toBe(last);
    expect(slabFare(5000)).toBe(last);
  });

  it('treats a negative distance as zero rather than throwing', () => {
    expect(slabFare(-5)).toBe(slabFare(0));
  });

  it('makes a card cheaper than a token everywhere it is offered', () => {
    for (const network of METRO_NETWORKS) {
      const token = slabFare(15);
      const card = cardFare(15, network);
      expect(card, network.city).toBeLessThan(token);
      expect(card).toBe(Math.round(token * (1 - network.cardDiscountPercent / 100)));
    }
  });

  it('measures more track than crow between two stations', () => {
    const from = findStation('del-cp');
    const to = findStation('del-sak');
    if (!from || !to) throw new Error('missing station');

    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const crow = Math.sqrt(dx * dx + dy * dy);
    expect(trackKm(from, to)).toBeGreaterThan(crow);
  });

  it('is symmetric and zero between a station and itself', () => {
    const a = findStation('del-cp');
    const b = findStation('del-noi');
    if (!a || !b) throw new Error('missing station');
    expect(trackKm(a, b)).toBeCloseTo(trackKm(b, a), 6);
    expect(trackKm(a, a)).toBe(0);
  });
});

describe('quoting a journey', () => {
  it('prices a real journey and shows what the card saves', () => {
    const quote = quoteJourney('del-cp', 'del-hns');
    expect(quote).not.toBeNull();
    if (!quote) return;

    expect(quote.fromName).toBe('Connaught Place');
    expect(quote.toName).toBe('Huda City Centre');
    expect(quote.cardFare).toBeLessThan(quote.tokenFare);
    expect(quote.saving).toBe(quote.tokenFare - quote.cardFare);
    expect(quote.km).toBeGreaterThan(0);
  });

  it('refuses a journey between two networks', () => {
    // A Delhi card cannot be charged for a ride in Mumbai.
    expect(quoteJourney('del-cp', 'mum-and')).toBeNull();
  });

  it('refuses a journey to the same station, and an unknown one', () => {
    expect(quoteJourney('del-cp', 'del-cp')).toBeNull();
    expect(quoteJourney('del-cp', 'nowhere')).toBeNull();
    expect(quoteJourney('', '')).toBeNull();
  });

  it('quotes every network end to end without failing', () => {
    for (const network of METRO_NETWORKS) {
      const stations = stationsOn(network.id);
      const first = stations[0];
      const last = stations[stations.length - 1];
      if (!first || !last) throw new Error('missing station');
      const quote = quoteJourney(first.id, last.id);
      expect(quote, network.city).not.toBeNull();
      expect(quote?.tokenFare ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('card numbers', () => {
  it('accepts twelve digits, spaced or hyphenated, and nothing else', () => {
    expect(normaliseCardNumber('1234 5678 9012')).toBe('123456789012');
    expect(normaliseCardNumber('1234-5678-9012')).toBe('123456789012');
    expect(normaliseCardNumber('123456789012')).toBe('123456789012');

    expect(normaliseCardNumber('12345678901')).toBeNull();
    expect(normaliseCardNumber('1234567890123')).toBeNull();
    expect(normaliseCardNumber('1234 5678 90ab')).toBeNull();
    expect(normaliseCardNumber('')).toBeNull();
  });

  it('groups a number in fours for reading', () => {
    expect(prettyCardNumber('123456789012')).toBe('1234 5678 9012');
  });
});
