/**
 * Airlines the flight search can show.
 *
 * `domestic` and `international` decide which carriers appear on a route:
 * putting Emirates on a Jaipur->Indore hop, or IndiGo on Delhi->Sydney, is
 * the kind of wrong that makes a listing obviously fabricated.
 *
 * `fareIndex` scales the computed base fare, so a full-service carrier costs
 * more than a low-cost one on the same route without either being hard-coded.
 */

export interface Airline {
  /** IATA designator, e.g. "6E". Also the flight-number prefix. */
  code: string;
  name: string;
  domestic: boolean;
  international: boolean;
  /** 1.0 is the baseline; 1.35 is roughly a full-service premium. */
  fareIndex: number;
}

export const AIRLINES: Airline[] = [
  { code: '6E', name: 'IndiGo', domestic: true, international: true, fareIndex: 1.0 },
  { code: 'AI', name: 'Air India', domestic: true, international: true, fareIndex: 1.28 },
  { code: 'SG', name: 'SpiceJet', domestic: true, international: false, fareIndex: 0.94 },
  { code: 'QP', name: 'Akasa Air', domestic: true, international: false, fareIndex: 1.02 },
  { code: 'IX', name: 'Air India Express', domestic: true, international: true, fareIndex: 0.92 },
  { code: 'UK', name: 'Vistara', domestic: true, international: true, fareIndex: 1.35 },

  { code: 'EK', name: 'Emirates', domestic: false, international: true, fareIndex: 1.55 },
  { code: 'QR', name: 'Qatar Airways', domestic: false, international: true, fareIndex: 1.52 },
  { code: 'EY', name: 'Etihad Airways', domestic: false, international: true, fareIndex: 1.45 },
  { code: 'SQ', name: 'Singapore Airlines', domestic: false, international: true, fareIndex: 1.6 },
  { code: 'TG', name: 'Thai Airways', domestic: false, international: true, fareIndex: 1.38 },
  { code: 'MH', name: 'Malaysia Airlines', domestic: false, international: true, fareIndex: 1.3 },
  { code: 'BA', name: 'British Airways', domestic: false, international: true, fareIndex: 1.62 },
  { code: 'UL', name: 'SriLankan Airlines', domestic: false, international: true, fareIndex: 1.2 },
];

const BY_CODE = new Map(AIRLINES.map((airline) => [airline.code, airline]));

export function findAirline(code: string): Airline | undefined {
  return BY_CODE.get(code.trim().toUpperCase());
}

export function airlinesFor(isDomestic: boolean): Airline[] {
  return AIRLINES.filter((airline) => (isDomestic ? airline.domestic : airline.international));
}
