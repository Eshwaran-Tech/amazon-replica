/**
 * Bus operators and the coach types they run.
 *
 * **These operators are this project's own.** The reference lists Mahadev
 * Travels, VRL, SRS, KSRTC and the rest -- real companies whose names, ratings
 * and fares belong to them. Inventing a 1.7-star rating for a named real
 * operator is not a licensing question, it is a statement about a business that
 * happens to be false. The coach classes, the (2+1) seat layouts and the
 * amenity list are industry-standard descriptions and are used as such.
 */

export interface BusOperator {
  id: string;
  name: string;
  /** Nudges fare up or down against the distance-derived base. */
  fareIndex: number;
  /** Rough service quality, which the generated rating varies around. */
  standard: number;
  /** Coach types this operator runs. */
  coaches: string[];
  /** Amenities it fits as standard; the rest are drawn per departure. */
  standardAmenities: string[];
}

/** Amenity keys, matching the reference's filter list. */
export const AMENITIES = [
  'Blankets',
  'Charging Point',
  'Emergency Contact Number',
  'Movie',
  'Wifi',
  'Water Bottle',
] as const;

export type Amenity = (typeof AMENITIES)[number];

/** Coach classes, which drive the bus-type filter. */
export const COACH_TYPES = ['AC', 'Non AC', 'Sleeper', 'Seater'] as const;
export type CoachType = (typeof COACH_TYPES)[number];

export const BUS_OPERATORS: BusOperator[] = [
  {
    id: 'westline',
    name: 'Westline Travels',
    fareIndex: 1.0,
    standard: 4.1,
    coaches: ['A/C Seater / Sleeper (2+1)', 'A/C Sleeper (2+1)'],
    standardAmenities: ['Charging Point', 'Water Bottle', 'Emergency Contact Number'],
  },
  {
    id: 'greenmile',
    name: 'Greenmile Coach',
    fareIndex: 1.18,
    standard: 4.4,
    coaches: ['Electric A/C Seater (2+2)', 'Electric A/C Sleeper (2+1)'],
    standardAmenities: ['Charging Point', 'Wifi', 'Water Bottle', 'Emergency Contact Number'],
  },
  {
    id: 'deccan-arrow',
    name: 'Deccan Arrow',
    fareIndex: 1.09,
    standard: 4.0,
    coaches: ['Volvo Multi-Axle A/C Sleeper (2+1)', 'A/C Seater / Sleeper (2+1)'],
    standardAmenities: ['Blankets', 'Charging Point', 'Water Bottle'],
  },
  {
    id: 'saffron-lines',
    name: 'Saffron Lines',
    fareIndex: 0.92,
    standard: 3.6,
    coaches: ['Non A/C Seater / Sleeper (2+1)', 'Non A/C Sleeper (2+1)'],
    standardAmenities: ['Charging Point'],
  },
  {
    id: 'coral-express',
    name: 'Coral Express',
    fareIndex: 1.25,
    standard: 4.5,
    coaches: ['Volvo Multi-Axle A/C Seater (2+2)', 'A/C Sleeper (2+1)'],
    standardAmenities: ['Blankets', 'Charging Point', 'Wifi', 'Movie', 'Water Bottle'],
  },
  {
    id: 'nilgiri-roadways',
    name: 'Nilgiri Roadways',
    fareIndex: 0.86,
    standard: 3.4,
    coaches: ['Non A/C Seater (2+2)', 'A/C Seater (2+2)'],
    standardAmenities: ['Emergency Contact Number'],
  },
  {
    id: 'harbour-line',
    name: 'Harbour Line Travels',
    fareIndex: 1.04,
    standard: 3.9,
    coaches: ['A/C Sleeper (2+1)', 'A/C Seater / Sleeper (2+1)'],
    standardAmenities: ['Blankets', 'Charging Point', 'Water Bottle'],
  },
  {
    id: 'ironvale-transit',
    name: 'Ironvale Transit',
    fareIndex: 0.98,
    standard: 3.8,
    coaches: ['A/C Seater / Sleeper (2+1)', 'Non A/C Sleeper (2+1)'],
    standardAmenities: ['Charging Point', 'Water Bottle'],
  },
  {
    id: 'lantern-state',
    name: 'Lantern State Carrier',
    fareIndex: 0.79,
    standard: 3.2,
    coaches: ['Non A/C Seater (3+2)', 'A/C Seater (2+2)'],
    standardAmenities: ['Emergency Contact Number'],
  },
  {
    id: 'blueridge',
    name: 'Blueridge Motors',
    fareIndex: 1.13,
    standard: 4.2,
    coaches: ['Volvo Multi-Axle A/C Sleeper (2+1)', 'A/C Seater / Sleeper (2+1)'],
    standardAmenities: ['Blankets', 'Charging Point', 'Wifi', 'Water Bottle'],
  },
];

const BY_ID = new Map(BUS_OPERATORS.map((operator) => [operator.id, operator]));

export function findOperator(id: string): BusOperator | undefined {
  return BY_ID.get(id);
}

/** The coach classes a description belongs to, for the bus-type filter. */
export function coachTypes(coach: string): CoachType[] {
  const lower = coach.toLowerCase();
  const types: CoachType[] = [];
  types.push(lower.includes('non a/c') ? 'Non AC' : 'AC');
  if (lower.includes('sleeper')) types.push('Sleeper');
  if (lower.includes('seater')) types.push('Seater');
  return types;
}
