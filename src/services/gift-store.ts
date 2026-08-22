import { findBrand, GIFT_BRANDS, type GiftBrand } from '@/data/gift-brands';
import { findOccasion, OCCASIONS, type Occasion } from '@/data/gift-occasions';
import { rupeesToPaise, type Paise } from '@/lib/utils/money';

/**
 * The gift card catalogue.
 *
 * Everything the storefront shows is derived from two tables -- the occasions
 * and the brands -- so a design cannot exist without an occasion to belong to,
 * and a brand card cannot be sold for a denomination the brand does not offer.
 *
 * There is nothing generated at random here. A design's id is its occasion and
 * its number, which is also its artwork filename, so a card that appears on the
 * results grid is the same card on the buy page and on the voucher afterwards.
 */

/** How a card reaches the recipient. */
export const DELIVERY_TYPES = ['EMAIL', 'PHOTO', 'VIDEO', 'PHYSICAL'] as const;
export type DeliveryType = (typeof DELIVERY_TYPES)[number];

export interface DeliveryOption {
  id: DeliveryType;
  name: string;
  /** What the tile says under the name. */
  blurb: string;
  /** Charged on top of the face value, in whole rupees. */
  feeRupees: number;
  /** How soon it lands, as the tile prints it. */
  speed: string;
}

/**
 * The four ways to send one.
 *
 * A physical card costs something to print and post, and that is charged rather
 * than absorbed and hidden -- the fee is on the tile, on the summary and on the
 * receipt.
 */
export const DELIVERY_OPTIONS: readonly DeliveryOption[] = [
  {
    id: 'EMAIL',
    name: 'Email',
    blurb: 'The code lands in their inbox.',
    feeRupees: 0,
    speed: 'Instant',
  },
  {
    id: 'PHOTO',
    name: 'Your photo',
    blurb: 'Your own picture on the card face.',
    feeRupees: 0,
    speed: 'Instant',
  },
  {
    id: 'VIDEO',
    name: 'Video based',
    blurb: 'A short clip plays before the code.',
    feeRupees: 0,
    speed: 'Instant',
  },
  {
    id: 'PHYSICAL',
    name: 'Physical',
    blurb: 'Printed, boxed and posted.',
    feeRupees: 49,
    speed: '2 to 4 days',
  },
];

export function findDelivery(id: string | null | undefined): DeliveryOption | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toUpperCase();
  return DELIVERY_OPTIONS.find((option) => option.id === wanted);
}

/** Denominations an Amazon Pay gift card is sold in, in whole rupees. */
export const DENOMINATIONS = [100, 250, 500, 1000, 2000, 5000, 10_000] as const;

/** A custom amount is allowed between these, as the reference permits. */
export const MIN_AMOUNT_RUPEES = 10;
export const MAX_AMOUNT_RUPEES = 10_000;

/** The most cards one order may carry. */
export const MAX_QUANTITY = 50;

/** A message longer than this will not print on a card. */
export const MAX_MESSAGE = 240;

/**
 * Voucher kinds.
 *
 * The reference shows four balances. This store keeps one Amazon Pay balance
 * and records which kind a voucher was, because pretending to hold four
 * separately spendable pots would be a lie the checkout would immediately
 * expose. What each kind means is printed on the page.
 */
export const VOUCHER_KINDS = ['SHOPPING', 'FRESH', 'GOLD', 'PRIME'] as const;
export type VoucherKind = (typeof VOUCHER_KINDS)[number];

export interface VoucherType {
  id: VoucherKind;
  name: string;
  /** What it is meant for, in one line. */
  purpose: string;
  /** The categories it is issued against, for the explainer panel. */
  spendableOn: readonly string[];
  hue: number;
}

export const VOUCHER_TYPES: readonly VoucherType[] = [
  {
    id: 'SHOPPING',
    name: 'Shopping Voucher',
    purpose: 'Issued against physical products across the store.',
    spendableOn: [
      'Fashion & beauty',
      'Grocery',
      'Electronics & appliances',
      'Pharmacy',
      'Home & kitchen',
    ],
    hue: 34,
  },
  {
    id: 'FRESH',
    name: 'Fresh Voucher',
    purpose: 'Issued against grocery and other perishables.',
    spendableOn: [
      'Grocery & staples',
      'Fruit & vegetables',
      'Bath & grooming',
      'Cleaning supplies',
      'Baby care',
    ],
    hue: 142,
  },
  {
    id: 'GOLD',
    name: 'Gold Voucher',
    purpose: 'Issued against gold coins, bars and jewellery.',
    spendableOn: ['Gold coins & bars', 'Gold jewellery', 'Silver coins'],
    hue: 44,
  },
  {
    id: 'PRIME',
    name: 'Prime Voucher',
    purpose: 'Issued against a Prime membership.',
    spendableOn: ['Prime membership'],
    hue: 200,
  },
];

export function findVoucherType(id: string | null | undefined): VoucherType | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toUpperCase();
  return VOUCHER_TYPES.find((type) => type.id === wanted);
}

/**
 * The occasion name as a noun, for a title.
 *
 * Several occasions are named for the filter column -- "For Diwali", "For baby
 * & expecting parents" -- which reads correctly in a checkbox list and badly in
 * a heading: "For Diwali Gift Card". Stripping the leading preposition gives
 * one name that works in both places without keeping two.
 */
export function occasionNoun(occasion: Occasion): string {
  return occasion.name.replace(/^For\s+/i, '');
}

export interface GiftDesign {
  /** "birthday-03" -- also the artwork filename. */
  id: string;
  occasion: Occasion;
  /** Zero-based, within the occasion. */
  index: number;
  /** What the card face reads. */
  greeting: string;
  artwork: string;
}

/** Every design for one occasion, in the order the artwork was drawn. */
export function designsFor(occasion: Occasion): GiftDesign[] {
  return Array.from({ length: occasion.designs }, (_, index) => ({
    id: `${occasion.id}-${String(index).padStart(2, '0')}`,
    occasion,
    index,
    greeting: occasion.greeting,
    artwork: `/gift-cards/${occasion.id}-${String(index).padStart(2, '0')}.svg`,
  }));
}

/** The whole catalogue, occasion by occasion. */
export function allDesigns(): GiftDesign[] {
  return OCCASIONS.flatMap((occasion) => designsFor(occasion));
}

/**
 * One design by id.
 *
 * Re-derived from the occasion table rather than looked up in a list, so a
 * tampered id finds nothing instead of pointing at artwork that exists with a
 * greeting that does not.
 */
export function findDesign(id: string | null | undefined): GiftDesign | undefined {
  if (!id) return undefined;
  const match = /^([a-z-]+)-(\d{2})$/.exec(id.trim().toLowerCase());
  if (!match?.[1] || !match[2]) return undefined;

  const occasion = findOccasion(match[1]);
  if (!occasion) return undefined;

  const index = Number(match[2]);
  if (!Number.isInteger(index) || index < 0 || index >= occasion.designs) return undefined;

  return designsFor(occasion)[index];
}

/** A handful from an occasion, for the landing page rows. */
export function sampleDesigns(occasion: Occasion, count: number): GiftDesign[] {
  return designsFor(occasion).slice(0, count);
}

// --------------------------------------------------------------- the pricing

export interface GiftQuote {
  /** Face value of one card. */
  faceValue: Paise;
  quantity: number;
  /** Face value times quantity. */
  subtotal: Paise;
  /** Brand discount, when the card is for a brand that offers one. */
  discount: Paise;
  /** Delivery fee times quantity, for a physical card. */
  deliveryFee: Paise;
  total: Paise;
}

/**
 * What an order costs.
 *
 * The single authority on a gift-card price, the way `calculateTotals` is for
 * the cart and `quoteStay` is for a hotel. Every surface that shows a number
 * calls this, and the browser never sends one.
 *
 * A brand discount is taken off what you pay, not off what the recipient gets:
 * a ₹1,000 card at 8% off costs ₹920 and is still worth ₹1,000 at the till.
 * That is the whole point of the discount, so it is modelled that way.
 */
export function quoteGift(input: {
  amountRupees: number;
  quantity: number;
  delivery: DeliveryOption;
  brand?: GiftBrand | undefined;
}): GiftQuote {
  const faceValue = rupeesToPaise(Math.round(input.amountRupees));
  const quantity = Math.max(1, Math.floor(input.quantity));

  const subtotal = faceValue * quantity;
  const discount = input.brand ? Math.round((subtotal * input.brand.discountPercent) / 100) : 0;
  const deliveryFee = rupeesToPaise(input.delivery.feeRupees) * quantity;

  return {
    faceValue,
    quantity,
    subtotal,
    discount,
    deliveryFee,
    total: subtotal - discount + deliveryFee,
  };
}

// -------------------------------------------------------------- the results

export type GiftSort = 'FEATURED' | 'PRICE_LOW' | 'PRICE_HIGH' | 'NEWEST';

export interface GiftFilters {
  occasion?: string;
  /** Brand ids, any-of. */
  brands?: string[];
  delivery?: DeliveryType[];
  minRupees?: number;
  maxRupees?: number;
  sort?: GiftSort;
}

export interface GiftListing {
  /** Design id, or brand id prefixed, so the two never collide. */
  id: string;
  title: string;
  subtitle: string;
  artwork: string;
  /** Cheapest denomination this listing sells at. */
  fromRupees: number;
  /** Brand listings carry one; occasion designs do not. */
  brand?: GiftBrand;
  design?: GiftDesign;
  delivery: DeliveryType[];
  discountPercent: number;
}

/** The occasion designs, as listings. */
export function designListings(): GiftListing[] {
  return allDesigns().map((design) => ({
    id: design.id,
    title: `Amazon Pay Gift Card | ${design.occasion.name}`,
    subtitle: design.greeting,
    artwork: design.artwork,
    fromRupees: MIN_AMOUNT_RUPEES,
    design,
    delivery: ['EMAIL', 'PHOTO', 'VIDEO', 'PHYSICAL'],
    discountPercent: 0,
  }));
}

/** The brand cards, as listings. */
export function brandListings(): GiftListing[] {
  return GIFT_BRANDS.map((brand) => ({
    id: `brand:${brand.id}`,
    title: `${brand.name} Gift Card`,
    subtitle: brand.tagline,
    artwork: `/gift-cards/brand-${brand.id}.svg`,
    fromRupees: Math.min(...brand.denominations),
    brand,
    // A brand card is a code, so it is only ever delivered as one.
    delivery: ['EMAIL'],
    discountPercent: brand.discountPercent,
  }));
}

export function applyGiftFilters(listings: GiftListing[], filters: GiftFilters): GiftListing[] {
  let result = listings;

  if (filters.occasion) {
    result = result.filter((listing) => listing.design?.occasion.id === filters.occasion);
  }

  if (filters.brands?.length) {
    result = result.filter((listing) => filters.brands?.includes(listing.brand?.id ?? ''));
  }

  if (filters.delivery?.length) {
    result = result.filter((listing) =>
      filters.delivery?.some((type) => listing.delivery.includes(type)),
    );
  }

  if (typeof filters.minRupees === 'number') {
    const floor = filters.minRupees;
    result = result.filter((listing) => listing.fromRupees >= floor);
  }
  if (typeof filters.maxRupees === 'number') {
    const ceiling = filters.maxRupees;
    result = result.filter((listing) => listing.fromRupees <= ceiling);
  }

  const sorted = [...result];
  switch (filters.sort) {
    case 'PRICE_LOW':
      sorted.sort((a, b) => a.fromRupees - b.fromRupees);
      break;
    case 'PRICE_HIGH':
      sorted.sort((a, b) => b.fromRupees - a.fromRupees);
      break;
    case 'NEWEST':
      // Newest is the last design drawn for an occasion, so the index descends.
      sorted.sort((a, b) => (b.design?.index ?? 0) - (a.design?.index ?? 0));
      break;
    case 'FEATURED':
    default:
      // A discount first, then the featured brands, then the catalogue order.
      sorted.sort(
        (a, b) =>
          b.discountPercent - a.discountPercent ||
          Number(Boolean(b.brand?.featured)) - Number(Boolean(a.brand?.featured)),
      );
      break;
  }

  return sorted;
}

/** Brand ids that some listing on the page actually offers, for the chips. */
export function brandsOffered(listings: GiftListing[]): GiftBrand[] {
  const seen = new Set<string>();
  for (const listing of listings) {
    if (listing.brand) seen.add(listing.brand.id);
  }
  return GIFT_BRANDS.filter((brand) => seen.has(brand.id));
}

export { findBrand, findOccasion };
