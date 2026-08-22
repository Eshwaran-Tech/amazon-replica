import { holidayOn, isBusyDay } from '@/data/holidays';
import {
  AMENITIES,
  BED_TYPES,
  MEAL_PLAN_UPLIFT,
  ROOM_TIERS,
  type Amenity,
  type BedType,
  type CancellationPolicy,
  type MealPlan,
  type RoomTier,
} from '@/data/hotel-amenities';
import { findCity, matchLocality, type HotelCity } from '@/data/hotel-cities';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * Hotel search.
 *
 * Deterministic, like the flight, bus and train searches beside it: the same
 * destination and dates produce the same properties on every machine and every
 * reload. No `Math.random()`, no `Date.now()` inside the generator.
 *
 * The destinations and their localities are real. Every property, tariff,
 * room, rule and review is this store's own.
 *
 * Two things are modelled rather than decorated, because without them the page
 * is a picture:
 *
 *  1. **A stay has a length.** Every price on this page is per night, and the
 *     payable amount is that times the nights times the rooms. A page that
 *     shows a nightly rate and charges it once is the commonest way a booking
 *     flow lies.
 *  2. **Occupancy costs money.** Two rooms is not one room, and a third adult
 *     in a room is not free. The tariff moves with what was actually asked for.
 */

export interface HotelRoom {
  id: string;
  tier: RoomTier;
  bed: BedType;
  /** Square feet, as a tariff sheet quotes. */
  size: number;
  /** How many adults it sleeps before an extra bed is needed. */
  sleeps: number;
  mealPlan: MealPlan;
  cancellation: CancellationPolicy;
  /** Per night, for one room, before tax. */
  price: Paise;
  /** Struck-through rate, when this room is discounted. */
  listPrice: Paise | null;
  discountPercent: number;
  view: string;
}

export interface HotelReview {
  id: string;
  title: string;
  body: string;
  author: string;
  /** Whole days before the day the page is rendered. */
  daysAgo: number;
  /** Out of 5, one decimal. */
  rating: number;
}

export interface Hotel {
  id: string;
  name: string;
  /** 1 to 5. */
  starRating: number;
  locality: string;
  /** Street line, as the detail page prints it. */
  address: string;
  city: HotelCity;
  /** Out of 5, one decimal -- the guest score, not the star rating. */
  rating: number;
  ratingCount: number;
  /** Cheapest room, per night, before tax. */
  price: Paise;
  listPrice: Paise | null;
  discountPercent: number;
  freeBreakfast: boolean;
  amenities: Amenity[];
  rooms: HotelRoom[];
  /** Stable 0-based index into the photo pool. */
  photoIndex: number;
  photoCount: number;
  /** Minutes past midnight. */
  checkInMinutes: number;
  checkOutMinutes: number;
  petsAllowed: boolean;
  /** Youngest age the property will take without a guardian. */
  minimumAge: number;
}

export interface HotelSearchInput {
  city: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`. */
  checkOut: string;
  rooms: number;
  adults: number;
  /** One age per child. */
  children: number[];
  /** Free text from the box, so "Calangute" narrows inside Goa. */
  term?: string;
}

export type HotelSearchResult =
  | {
      ok: true;
      hotels: Hotel[];
      city: HotelCity;
      /** Set when the search term named a neighbourhood rather than the city. */
      locality?: string;
      nights: number;
      rooms: number;
      guests: number;
    }
  | { ok: false; code: 'UNKNOWN_CITY' | 'BAD_DATES' | 'BAD_PARTY'; message: string };

/** The most rooms and guests one search may ask for. */
export const MAX_ROOMS = 8;
export const MAX_ADULTS_PER_ROOM = 4;
export const MAX_CHILDREN = 6;
/** A stay longer than this is a lease, not a booking. */
export const MAX_NIGHTS = 30;
export const CHILD_MAX_AGE = 12;

/** FNV-1a, matching the project's other deterministic generators. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, list: readonly T[], fallback: T): T {
  return list[Math.floor(random() * list.length)] ?? fallback;
}

/** `YYYY-MM-DD` for a date, in the machine's own timezone. */
export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return dateKey;
  const moved = new Date(year, month - 1, day + days);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
}

/** Nights between two `YYYY-MM-DD` keys; zero or negative means bad dates. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const [ay, am, ad] = checkIn.split('-').map(Number);
  const [by, bm, bd] = checkOut.split('-').map(Number);
  if ([ay, am, ad, by, bm, bd].some((part) => part === undefined || Number.isNaN(part))) return 0;

  const start = new Date(ay as number, (am as number) - 1, ad as number);
  const end = new Date(by as number, (bm as number) - 1, bd as number);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Every date in the stay, check-out excluded -- a night is a date you sleep. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const nights = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, nights) }, (_, index) => addDays(checkIn, index));
}

export function formatTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${suffix}`;
}

const NAME_HEADS = [
  'Coral',
  'Willow',
  'Cedar',
  'Marigold',
  'Tamarind',
  'Banyan',
  'Lotus',
  'Palm',
  'Frangipani',
  'Jasmine',
  'Bamboo',
  'Driftwood',
  'Monsoon',
  'Casuarina',
  'Mangrove',
  'Sandalwood',
];

const NAME_TAILS = [
  'Verandah',
  'Courtyard',
  'Retreat',
  'Sands',
  'Haven',
  'Terrace',
  'House',
  'Villa',
  'Cove',
  'Bungalow',
  'Quarters',
  'Lodge',
  'Manor',
  'Rest',
  'Grove',
  'Yard',
];

/** What a property of this size and setting calls itself. */
function suffixFor(random: () => number, stars: number, kind: HotelCity['kind']): string {
  if (stars >= 5)
    return pick(
      random,
      kind === 'BEACH' || kind === 'ISLAND'
        ? ['Beach Resort', 'Resort & Spa', 'Resort']
        : ['Grand', 'Hotel & Spa', 'Residency'],
      'Resort',
    );
  if (stars === 4)
    return pick(
      random,
      kind === 'BEACH' || kind === 'ISLAND'
        ? ['Resort', 'Beach Resort', 'Suites']
        : ['Hotel', 'Suites', 'Residency'],
      'Hotel',
    );
  if (stars === 3) return pick(random, ['Hotel', 'Inn', 'Residency', 'Stay'], 'Hotel');
  return pick(random, ['Inn', 'Stay', 'Lodge', 'Guest House'], 'Inn');
}

const STREET_TYPES = ['Road', 'Lane', 'Cross', 'Main Road', 'Beach Road', 'Marg'];

/**
 * Amenities the setting decides, not chance.
 *
 * Everything else can be fitted anywhere; these follow from where the property
 * stands, so they are never rolled for.
 */
const SETTING_AMENITIES: readonly Amenity[] = ['Beach Access'];

/** Star rating drives almost everything, so it gets its own curve. */
function starFactor(stars: number): number {
  return [0.7, 1.0, 1.9, 3.6, 8.0][stars - 1] ?? 1;
}

/**
 * What a night costs before tax.
 *
 * Destination, stars, the size of the party and how busy the dates are, in that
 * order of weight. A weekend or a gazetted holiday moves it, which is why the
 * calendar marks them.
 */
export function stayFactor(input: {
  nights: string[];
  rooms: number;
  adults: number;
  children: number[];
}): number {
  // Beyond two adults a room needs an extra bed, and that is charged.
  const perRoomAdults = Math.ceil(input.adults / Math.max(1, input.rooms));
  const extraAdults = Math.max(0, perRoomAdults - 2);
  const occupancy = 1 + extraAdults * 0.25 + input.children.filter((age) => age >= 6).length * 0.08;

  if (input.nights.length === 0) return occupancy;

  const nightly = input.nights.map((date) => {
    const [year, month, day] = date.split('-').map(Number);
    const weekday =
      year === undefined || month === undefined || day === undefined
        ? 1
        : new Date(year, month - 1, day).getDay();
    const weekend = weekday === 5 || weekday === 6;
    const busy = isBusyDay(date) || holidayOn(date) !== undefined;
    return (weekend ? 1.18 : 1) * (busy ? 1.12 : 1);
  });

  const mean = nightly.reduce((sum, factor) => sum + factor, 0) / nightly.length;
  return occupancy * mean;
}

/** Whole rupees, to the nearest five, which is how a tariff is printed. */
function toTariff(rupees: number): Paise {
  return rupeesToPaise(Math.max(5, Math.round(rupees / 5) * 5));
}

/**
 * Room types for one property.
 *
 * A budget stay sells one room; a resort sells three. They ascend in tier,
 * size and price, so the cheapest is always the one the card advertises.
 */
function roomsFor(hotel: Hotel, random: () => number): HotelRoom[] {
  const count = hotel.starRating >= 4 ? 3 : hotel.starRating === 3 ? 2 : 1;
  const firstTier = Math.min(
    ROOM_TIERS.length - count,
    Math.max(0, hotel.starRating - 1 + Math.floor(random() * 2)),
  );

  // A multiplicative ladder, drawn once for the property.
  //
  // The step has to clear the widest swing the plan and the cancellation terms
  // can produce (1.14 / 0.92 = 1.24), or a Deluxe on a non-refundable rate ends
  // up dearer than the Premium above it -- which an additive ladder did, and
  // which makes the tariff sheet read as broken.
  const step = 1.32 + random() * 0.2;

  return Array.from({ length: count }, (_, index) => {
    const tier = ROOM_TIERS[firstTier + index] ?? 'Deluxe Room';
    const uplift = step ** index;
    const mealPlan: MealPlan =
      hotel.freeBreakfast || random() < 0.45 ? 'Room with breakfast' : 'Room Only';
    const cancellation: CancellationPolicy =
      random() < 0.55 ? 'Free Cancellation' : 'Non Refundable';

    // Non-refundable is cheaper. That is the entire trade, so it is real here.
    const price = toTariff(
      (hotel.price / 100) *
        uplift *
        MEAL_PLAN_UPLIFT[mealPlan] *
        (cancellation === 'Non Refundable' ? 0.92 : 1),
    );

    const discountPercent = random() < 0.55 ? 8 + Math.floor(random() * 42) : 0;

    return {
      id: `${hotel.id}-r${index + 1}`,
      tier,
      bed: pick(random, BED_TYPES, 'Queen Bed'),
      // Climbs with the tier, like the price does. A 365 sq ft Executive
      // Suite sitting above a 590 sq ft Premium Room is the sort of detail
      // that tells a reader the numbers were rolled rather than meant.
      size: Math.round((240 + index * 190 + random() * 140) / 5) * 5,
      sleeps: 2 + (index > 1 ? 1 : 0),
      mealPlan,
      cancellation,
      price,
      listPrice: discountPercent > 0 ? toTariff(price / 100 / (1 - discountPercent / 100)) : null,
      discountPercent,
      view: pick(
        random,
        hotel.city.kind === 'BEACH' || hotel.city.kind === 'ISLAND'
          ? ['Sea View', 'Garden View', 'Pool View', 'City View']
          : ['City View', 'Garden View', 'Pool View', 'Courtyard View'],
        'City View',
      ),
    };
  });
}

const REVIEW_AUTHORS = [
  'Anjali R',
  'Farhan S',
  'Meera K',
  'Rohit D',
  'Sneha P',
  'Imran Q',
  'Kavya N',
  'Arjun T',
  'Nikita B',
  'Vikram J',
  'Priya M',
  'Sameer A',
  'Divya L',
  'Rahul V',
  'Tanvi G',
];

const GOOD_TITLES = ['Excellent Stay', 'Good Stay', 'Lovely Stay', 'Would Return'];
const MIXED_TITLES = ['Decent Stay', 'Mixed Stay', 'Fair Stay'];
const BAD_TITLES = ['Terrible Stay', 'Disappointing Stay', 'Poor Stay'];

const GOOD_BODIES = [
  'Rooms were clean and the staff were quick with everything we asked for. The location made it easy to walk everywhere.',
  'Great value for what we paid. Breakfast had enough choice and the pool was kept spotless.',
  'Quiet, comfortable and exactly as described. Check-in took under five minutes.',
  'Staff went out of their way when our flight landed late. The room was ready anyway.',
  'Second time here and it has not slipped. Same room, same standard, same welcome.',
  'The bed was genuinely comfortable, which is rarer than it should be. Slept properly for once.',
  'Housekeeping came every morning without being chased, and the towels were actually fresh.',
  'Asked for a quieter room and they moved us in ten minutes with no fuss about it.',
  'Breakfast ran late for us because our train was early. They just opened the kitchen.',
  'Good wifi throughout, including in the room, which is why I could work from here at all.',
];

const MIXED_BODIES = [
  'The room was fine but the air conditioning took a while to cool down. Staff were helpful when we asked.',
  'Good location, though the walls are thin and we could hear the corridor. Breakfast was decent.',
  'Clean enough and the price was fair. Wifi dropped out most evenings.',
  'Nothing wrong with it, nothing memorable either. Would stay again if the price held.',
  'The pool was lovely; the restaurant was slow. Ate out on the second night.',
  'Lift was out of order for our whole stay and we were on the fourth floor.',
  'Bathroom was spotless but the room smelled of the corridor carpet.',
];

const BAD_BODIES = [
  'The photos do not match the room we were given. Asked to move and was told nothing else was free.',
  'Booked a sea-facing room and got one looking at the car park. Nobody at the desk could explain it.',
  'Hot water only worked in the mornings and the lock on the door did not catch properly.',
  'Charged for breakfast we had already paid for, and it took three visits to the desk to undo.',
  'Checked in at midnight to a room that had not been made up. Waited an hour in the lobby.',
  'Air conditioning rattled all night. Reception said the engineer comes on Mondays.',
];

/**
 * Guest reviews.
 *
 * Weighted by the property's own score, so a 4.6 hotel is not full of
 * complaints and a 2.8 one is not full of praise. The bad ones are kept in --
 * a review list where nothing ever goes wrong is not a review list.
 */
export function reviewsFor(hotel: Hotel): HotelReview[] {
  const random = makeRandom(hash(`hotel-reviews:${hotel.id}`));
  const count = 4 + Math.floor(random() * 5);

  // No guest writes the same sentence as the guest above them. Picking freely
  // from a short pool put one body on three of seven reviews, which reads as a
  // generated list the moment anyone glances down the page.
  const used = new Set<string>();

  function freshBody(pool: readonly string[]): string {
    const available = pool.filter((body) => !used.has(body));
    const chosen = pick(random, available.length > 0 ? available : pool, pool[0] ?? '');
    used.add(chosen);
    return chosen;
  }

  return Array.from({ length: count }, (_, index) => {
    // Centred on the hotel's score, so the list averages out near it.
    const rating = Math.min(
      5,
      Math.max(1, Number((hotel.rating + (random() - 0.5) * 2.6).toFixed(1))),
    );
    const good = rating >= 4;
    const bad = rating < 3;

    return {
      id: `${hotel.id}-rev${index + 1}`,
      title: pick(random, good ? GOOD_TITLES : bad ? BAD_TITLES : MIXED_TITLES, 'Good Stay'),
      body: freshBody(good ? GOOD_BODIES : bad ? BAD_BODIES : MIXED_BODIES),
      author: pick(random, REVIEW_AUTHORS, 'A Guest'),
      daysAgo: 1 + Math.floor(random() * 240),
      rating,
    };
  });
}

/** How many photos the pool holds; the fetch script writes exactly this many. */
export const PHOTO_POOL_SIZE = 24;

/**
 * The properties in one destination.
 *
 * Seeded by the destination alone: which hotels exist in Goa is a fact about
 * Goa, not about the week you searched it. Only the tariff moves with dates.
 */
function propertiesIn(city: HotelCity): Hotel[] {
  const random = makeRandom(hash(`hotels:${city.id}`));
  const count = 22 + Math.floor(random() * 10);

  const used = new Set<string>();
  const hotels: Hotel[] = [];

  for (let index = 0; index < count; index += 1) {
    // Weighted towards the middle: most of any city is three and four star.
    const roll = random();
    const starRating = roll < 0.12 ? 2 : roll < 0.42 ? 3 : roll < 0.8 ? 4 : 5;

    const head = pick(random, NAME_HEADS, 'Coral');
    const tail = pick(random, NAME_TAILS, 'Retreat');
    const suffix = suffixFor(random, starRating, city.kind);
    const article = random() < 0.35 ? 'The ' : '';
    let name = `${article}${head} ${tail}${suffix ? ` ${suffix}` : ''}`.trim();

    // A destination with two identically named hotels is a bug, not a quirk.
    if (used.has(name))
      name = `${name} ${city.localities[index % city.localities.length] ?? ''}`.trim();
    if (used.has(name)) continue;
    used.add(name);

    const locality = pick(random, city.localities, city.name);

    // The guest score tracks the stars but does not copy them: a well-run
    // three star out-scores a tired five star, which is the whole point of
    // showing both numbers.
    const rating = Math.min(
      5,
      Math.max(1.5, Number((2.9 + starRating * 0.28 + (random() - 0.45) * 1.5).toFixed(1))),
    );

    const price = toTariff(
      900 * city.priceIndex * starFactor(starRating) * (0.78 + random() * 0.62),
    );
    const discountPercent = random() < 0.62 ? 8 + Math.floor(random() * 50) : 0;

    const amenities = new Set<Amenity>(['Restaurant', 'Parking', 'Power Backup']);
    if (starRating >= 3) amenities.add('Free Wifi').add('Air Conditioning').add('Room Service');
    if (starRating >= 4) amenities.add('Swimming Pool').add('Laundry').add('Elevator');
    if (starRating >= 5) amenities.add('Spa').add('Gym').add('Airport Transfer').add('Bar');
    if (city.kind === 'BEACH' || city.kind === 'ISLAND') amenities.add('Beach Access');

    // The extras are the ones any property might fit. Setting-specific ones are
    // left out: a hotel in Pune advertising beach access is the sort of detail
    // that makes a whole page stop being believable.
    for (const amenity of AMENITIES) {
      if (SETTING_AMENITIES.includes(amenity)) continue;
      if (random() < 0.22) amenities.add(amenity);
    }

    hotels.push({
      id: `${city.id}-${index + 1}`,
      name,
      starRating,
      locality,
      address: `${1 + Math.floor(random() * 260)}, ${pick(random, city.localities, city.name)} ${pick(random, STREET_TYPES, 'Road')}, ${locality}`,
      city,
      rating,
      ratingCount: 12 + Math.floor(random() * 4200),
      price,
      listPrice: discountPercent > 0 ? toTariff(price / 100 / (1 - discountPercent / 100)) : null,
      discountPercent,
      freeBreakfast: random() < 0.42,
      amenities: AMENITIES.filter((amenity) => amenities.has(amenity)),
      photoIndex: Math.floor(random() * PHOTO_POOL_SIZE),
      photoCount: 40 + Math.floor(random() * 260),
      checkInMinutes: pick(random, [11 * 60, 12 * 60, 13 * 60, 14 * 60], 12 * 60),
      checkOutMinutes: pick(random, [10 * 60, 10 * 60 + 30, 11 * 60, 12 * 60], 11 * 60),
      petsAllowed: random() < 0.18,
      minimumAge: 18,
      rooms: [],
    });
  }

  // Rooms are seeded per property, so one hotel's tariff sheet does not shift
  // when a different hotel is generated ahead of it.
  return hotels.map((hotel) => ({
    ...hotel,
    rooms: roomsFor(hotel, makeRandom(hash(`rooms:${hotel.id}`))),
  }));
}

export function searchHotels(input: HotelSearchInput, today: Date): HotelSearchResult {
  const city = findCity(input.city);
  if (!city) {
    return { ok: false, code: 'UNKNOWN_CITY', message: 'Choose a destination from the list.' };
  }

  const nights = nightsBetween(input.checkIn, input.checkOut);
  if (nights <= 0) {
    return { ok: false, code: 'BAD_DATES', message: 'Check-out must be after check-in.' };
  }
  if (nights > MAX_NIGHTS) {
    return {
      ok: false,
      code: 'BAD_DATES',
      message: `A stay can run up to ${MAX_NIGHTS} nights. Split a longer trip into two bookings.`,
    };
  }
  if (input.checkIn < todayKey(today)) {
    return { ok: false, code: 'BAD_DATES', message: 'Check-in cannot be in the past.' };
  }

  const rooms = Math.floor(input.rooms);
  const adults = Math.floor(input.adults);
  if (!Number.isFinite(rooms) || rooms < 1 || rooms > MAX_ROOMS) {
    return { ok: false, code: 'BAD_PARTY', message: `Book between 1 and ${MAX_ROOMS} rooms.` };
  }
  if (!Number.isFinite(adults) || adults < 1 || adults > rooms * MAX_ADULTS_PER_ROOM) {
    return {
      ok: false,
      code: 'BAD_PARTY',
      message: `Up to ${MAX_ADULTS_PER_ROOM} adults per room. Add a room for a larger party.`,
    };
  }
  if (input.children.length > MAX_CHILDREN) {
    return { ok: false, code: 'BAD_PARTY', message: `Up to ${MAX_CHILDREN} children per booking.` };
  }
  if (input.children.some((age) => !Number.isInteger(age) || age < 0 || age > CHILD_MAX_AGE)) {
    return {
      ok: false,
      code: 'BAD_PARTY',
      message: `Give an age from 0 to ${CHILD_MAX_AGE} for every child.`,
    };
  }

  const stayNights = nightsOf(input.checkIn, input.checkOut);
  const locality = input.term ? matchLocality(city, input.term) : undefined;

  // One factor for these dates and this party, applied once. Applying it again
  // further down -- to the room, or at the bill -- is how a page ends up
  // quoting one number on the card and charging another at the desk.
  const factor = stayFactor({ nights: stayNights, rooms, adults, children: input.children });

  const hotels: Hotel[] = propertiesIn(city)
    .filter((hotel) => !locality || hotel.locality === locality)
    .map((hotel) => {
      const dated = hotel.rooms.map((room) => ({
        ...room,
        price: toTariff((room.price / 100) * factor),
        listPrice:
          room.discountPercent > 0
            ? toTariff(((room.price / 100) * factor) / (1 - room.discountPercent / 100))
            : null,
      }));

      // The card advertises the cheapest room, because that is the room the
      // guest is offered the moment they click it.
      const cheapest = dated.reduce(
        (lowest, room) => (room.price < lowest.price ? room : lowest),
        dated[0] as HotelRoom,
      );

      return {
        ...hotel,
        price: cheapest.price,
        listPrice: cheapest.listPrice,
        discountPercent: cheapest.discountPercent,
        rooms: dated,
      };
    });

  return {
    ok: true,
    hotels,
    city,
    ...(locality ? { locality } : {}),
    nights,
    rooms,
    guests: adults + input.children.length,
  };
}

/** One property by id, re-derived rather than trusted from a URL. */
export function findHotel(result: HotelSearchResult, id: string): Hotel | undefined {
  if (!result.ok) return undefined;
  return result.hotels.find((hotel) => hotel.id === id);
}

export function findRoom(hotel: Hotel, roomId: string): HotelRoom | undefined {
  return hotel.rooms.find((room) => room.id === roomId);
}

/**
 * Tax on a stay.
 *
 * India charges GST on hotel rooms by tariff band, and the rate genuinely
 * changes at the band edges -- which is why a cheap room and a suite do not
 * carry the same percentage.
 */
export function taxRateFor(perNight: Paise): number {
  const rupees = perNight / 100;
  if (rupees <= 1000) return 0;
  if (rupees <= 7500) return 12;
  return 18;
}

export interface StayQuote {
  nights: number;
  rooms: number;
  /** One room, one night. */
  perNight: Paise;
  /** Per night x nights x rooms, before tax. */
  roomTotal: Paise;
  discount: Paise;
  taxRate: number;
  taxes: Paise;
  total: Paise;
}

/**
 * What a stay costs, start to finish.
 *
 * The single authority on a hotel price, the way `calculateTotals` is for the
 * cart. Every surface that shows a number calls this; nothing recomputes it,
 * and the browser never sends one.
 */
export function quoteStay(
  room: HotelRoom,
  input: { checkIn: string; checkOut: string; rooms: number },
): StayQuote {
  const nights = Math.max(0, nightsBetween(input.checkIn, input.checkOut));
  const rooms = Math.max(1, Math.floor(input.rooms));

  // The room already carries the rate for these dates and this party: the
  // search applied the stay factor once. All that is left is arithmetic.
  const perNight = room.price;
  const roomTotal = perNight * nights * rooms;
  const discount = ((room.listPrice ?? perNight) - perNight) * nights * rooms;

  const taxRate = taxRateFor(perNight);
  const taxes = Math.round((roomTotal * taxRate) / 100);

  return {
    nights,
    rooms,
    perNight,
    roomTotal,
    discount,
    taxRate,
    taxes,
    total: roomTotal + taxes,
  };
}

export type HotelSort = 'POPULAR' | 'RATING' | 'PRICE_LOW' | 'PRICE_HIGH';

export interface HotelFilters {
  /** Inclusive per-night bounds in paise. */
  minPrice?: number;
  maxPrice?: number;
  /** Star ratings to keep, any-of. */
  stars?: number[];
  /** Lowest guest score to keep. */
  minRating?: number;
  /** All-of: a guest who ticks pool and gym wants both. */
  amenities?: Amenity[];
  freeBreakfast?: boolean;
  sort?: HotelSort;
}

/** The price buckets the filter column offers, in rupees. */
export const PRICE_BANDS: ReadonlyArray<{ min: number; max: number | null; label: string }> = [
  { min: 0, max: 2000, label: '₹0 - ₹2,000' },
  { min: 2000, max: 4000, label: '₹2,000 - ₹4,000' },
  { min: 4000, max: 8000, label: '₹4,000 - ₹8,000' },
  { min: 8000, max: null, label: '₹8,000 & above' },
];

export const RATING_BANDS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 4.5, label: '4.5 & above' },
  { min: 4, label: '4.0 & above' },
  { min: 3, label: '3.0 & above' },
];

export function applyHotelFilters(hotels: Hotel[], filters: HotelFilters): Hotel[] {
  let result = hotels;

  if (typeof filters.minPrice === 'number') {
    const floor = filters.minPrice;
    result = result.filter((hotel) => hotel.price >= floor);
  }
  if (typeof filters.maxPrice === 'number') {
    const ceiling = filters.maxPrice;
    result = result.filter((hotel) => hotel.price <= ceiling);
  }

  if (filters.stars?.length) {
    result = result.filter((hotel) => filters.stars?.includes(hotel.starRating));
  }

  if (typeof filters.minRating === 'number') {
    const floor = filters.minRating;
    result = result.filter((hotel) => hotel.rating >= floor);
  }

  if (filters.amenities?.length) {
    result = result.filter((hotel) =>
      filters.amenities?.every((amenity) => hotel.amenities.includes(amenity)),
    );
  }

  if (filters.freeBreakfast) {
    result = result.filter((hotel) => hotel.freeBreakfast);
  }

  const sorted = [...result];
  switch (filters.sort) {
    case 'RATING':
      sorted.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
      break;
    case 'PRICE_LOW':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'PRICE_HIGH':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'POPULAR':
    default:
      // Popularity is a score, not a column: a property with four thousand
      // reviews at 4.2 belongs above one with nine at 4.9.
      sorted.sort((a, b) => popularity(b) - popularity(a));
      break;
  }

  return sorted;
}

/** Guest score weighted by how many guests stood behind it. */
export function popularity(hotel: Hotel): number {
  return hotel.rating * Math.log10(hotel.ratingCount + 10) + hotel.starRating * 0.15;
}

/** "Very Good", "Excellent" -- the word beside the score. */
export function ratingWord(rating: number): string {
  if (rating >= 4.5) return 'Excellent';
  if (rating >= 4) return 'Very Good';
  if (rating >= 3.5) return 'Good';
  if (rating >= 3) return 'Fair';
  return 'Poor';
}
