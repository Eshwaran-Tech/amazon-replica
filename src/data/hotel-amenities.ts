/**
 * What a property offers, and what a room is sold with.
 *
 * The amenity vocabulary is the ordinary one any booking site uses -- it
 * describes a building, not a brand. The icon names map to lucide, so a card
 * and a detail page draw the same thing for the same amenity.
 */

export const AMENITIES = [
  'Restaurant',
  'Parking',
  'Power Backup',
  'Room Service',
  'Bar',
  'Swimming Pool',
  'Free Wifi',
  'Air Conditioning',
  'Gym',
  'Spa',
  'Laundry',
  'Airport Transfer',
  'Beach Access',
  'Elevator',
  'Wheelchair Access',
  'Pet Friendly',
] as const;

export type Amenity = (typeof AMENITIES)[number];

/** Lucide icon name per amenity, so one table drives every surface. */
export const AMENITY_ICONS: Record<Amenity, string> = {
  Restaurant: 'UtensilsCrossed',
  Parking: 'CircleParking',
  'Power Backup': 'Zap',
  'Room Service': 'ConciergeBell',
  Bar: 'Martini',
  'Swimming Pool': 'Waves',
  'Free Wifi': 'Wifi',
  'Air Conditioning': 'AirVent',
  Gym: 'Dumbbell',
  Spa: 'Flower2',
  Laundry: 'WashingMachine',
  'Airport Transfer': 'CarFront',
  'Beach Access': 'Umbrella',
  Elevator: 'MoveVertical',
  'Wheelchair Access': 'Accessibility',
  'Pet Friendly': 'PawPrint',
};

/** The six the filter column offers, matching the reference's shortlist. */
export const FILTERABLE_AMENITIES: readonly Amenity[] = [
  'Swimming Pool',
  'Free Wifi',
  'Parking',
  'Restaurant',
  'Gym',
  'Spa',
];

/**
 * How a room is sold.
 *
 * "Room Only" and "Room with breakfast" are the two the reference shows, and
 * the difference is a real one: breakfast costs more and is stated on the tile
 * rather than discovered at the desk.
 */
export const MEAL_PLANS = ['Room Only', 'Room with breakfast'] as const;
export type MealPlan = (typeof MEAL_PLANS)[number];

/** What the plan adds to the base tariff, as a multiplier. */
export const MEAL_PLAN_UPLIFT: Record<MealPlan, number> = {
  'Room Only': 1,
  'Room with breakfast': 1.14,
};

/**
 * Cancellation terms.
 *
 * Non-refundable is cheaper, and that is the whole trade. It is stated on the
 * tile because a guest who finds out afterwards has been misled.
 */
export const CANCELLATION_POLICIES = ['Free Cancellation', 'Non Refundable'] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];

/** Bed layouts a generated room can carry. */
export const BED_TYPES = ['Queen Bed', 'King Bed', '2 x King Beds', '2 x Twin Beds'] as const;
export type BedType = (typeof BED_TYPES)[number];

/** Room names, by how far up the tariff they sit. */
export const ROOM_TIERS = [
  'Standard Room',
  'Standard AC Room',
  'Deluxe Room',
  'Deluxe Room with Balcony',
  'Premium Room',
  'Luxury Room with Balcony',
  'Executive Suite',
] as const;
export type RoomTier = (typeof ROOM_TIERS)[number];
