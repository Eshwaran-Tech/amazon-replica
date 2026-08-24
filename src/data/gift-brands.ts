/**
 * Brands whose gift cards this store sells.
 *
 * Every one is invented. The reference sells cards for real retailers, and
 * this store will not put someone else's name and mark on a card it issues --
 * a gift card is a promise that a named business will honour it, and these
 * businesses do not exist to honour anything.
 *
 * What is real is the mechanism: buying one debits your Eshwaran Pay balance and
 * mints a code that only spends at that brand, and the store says so.
 */

export const BRAND_CATEGORIES = [
  'Fashion',
  'Jewellery',
  'Grocery & Food',
  'Furniture & Electronics',
  'Gaming',
  'OTT & Recharges',
  'Beauty & Health',
  'Travel & Hospitality',
] as const;
export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

export interface GiftBrand {
  /** URL id, lowercase kebab. */
  id: string;
  name: string;
  category: BrandCategory;
  /** One line on the card, as a brand tile carries. */
  tagline: string;
  /** Two hues for the tile artwork, so no two brands look alike. */
  hue: number;
  hueAlt: number;
  /** Percentage off the face value, or zero. Real: it is what you pay. */
  discountPercent: number;
  /** Denominations offered, in whole rupees. */
  denominations: readonly number[];
  /** Where the card can be spent, as the tile prints it. */
  redeemableAt: 'Online' | 'In-store' | 'Online & in-store';
  /** Months the code stays live. */
  validityMonths: number;
  /** Featured on the "Brands of the Month" strip. */
  featured?: boolean;
}

const COMMON = [500, 1000, 2000, 5000] as const;
const SMALL = [100, 250, 500, 1000, 2000] as const;
const LARGE = [1000, 2000, 5000, 10_000] as const;

export const GIFT_BRANDS: readonly GiftBrand[] = [
  // ------------------------------------------------------------- Fashion
  {
    id: 'linden-row',
    name: 'Linden Row',
    category: 'Fashion',
    tagline: 'Everyday clothing, plainly cut',
    hue: 214,
    hueAlt: 190,
    discountPercent: 8,
    denominations: COMMON,
    redeemableAt: 'Online & in-store',
    validityMonths: 12,
    featured: true,
  },
  {
    id: 'marlowe-co',
    name: 'Marlowe & Co',
    category: 'Fashion',
    tagline: 'Tailoring for people who sit down',
    hue: 348,
    hueAlt: 22,
    discountPercent: 5,
    denominations: COMMON,
    redeemableAt: 'In-store',
    validityMonths: 12,
  },
  {
    id: 'quill-thread',
    name: 'Quill & Thread',
    category: 'Fashion',
    tagline: 'Shirts, and not much else',
    hue: 168,
    hueAlt: 140,
    discountPercent: 0,
    denominations: SMALL,
    redeemableAt: 'Online',
    validityMonths: 6,
  },
  {
    id: 'harrow-lane',
    name: 'Harrow Lane',
    category: 'Fashion',
    tagline: 'Footwear that survives a monsoon',
    hue: 32,
    hueAlt: 5,
    discountPercent: 12,
    denominations: COMMON,
    redeemableAt: 'Online & in-store',
    validityMonths: 12,
    featured: true,
  },

  // ----------------------------------------------------------- Jewellery
  {
    id: 'auric-fine',
    name: 'Auric Fine',
    category: 'Jewellery',
    tagline: 'Gold by weight, priced by the day',
    hue: 44,
    hueAlt: 28,
    discountPercent: 0,
    denominations: LARGE,
    redeemableAt: 'In-store',
    validityMonths: 12,
    featured: true,
  },
  {
    id: 'seraphine',
    name: 'Seraphine',
    category: 'Jewellery',
    tagline: 'Small stones, long guarantees',
    hue: 288,
    hueAlt: 320,
    discountPercent: 3,
    denominations: LARGE,
    redeemableAt: 'Online & in-store',
    validityMonths: 12,
  },
  {
    id: 'kestrel-silver',
    name: 'Kestrel Silver',
    category: 'Jewellery',
    tagline: 'Silver, and the sense to keep it simple',
    hue: 205,
    hueAlt: 230,
    discountPercent: 6,
    denominations: COMMON,
    redeemableAt: 'Online',
    validityMonths: 12,
  },

  // ------------------------------------------------------- Grocery & Food
  {
    id: 'greenbasket',
    name: 'Greenbasket',
    category: 'Grocery & Food',
    tagline: 'The weekly shop, delivered',
    hue: 118,
    hueAlt: 92,
    discountPercent: 4,
    denominations: SMALL,
    redeemableAt: 'Online',
    validityMonths: 12,
    featured: true,
  },
  {
    id: 'clove-copper',
    name: 'Clove & Copper',
    category: 'Grocery & Food',
    tagline: 'Restaurants worth the table',
    hue: 8,
    hueAlt: 32,
    discountPercent: 10,
    denominations: SMALL,
    redeemableAt: 'In-store',
    validityMonths: 6,
  },
  {
    id: 'stonefire',
    name: 'Stonefire Pizza',
    category: 'Grocery & Food',
    tagline: 'Twelve inches, thirty minutes',
    hue: 18,
    hueAlt: 44,
    discountPercent: 14,
    denominations: [250, 500, 1000, 2000],
    redeemableAt: 'Online & in-store',
    validityMonths: 6,
  },

  // -------------------------------------------- Furniture & Electronics
  {
    id: 'northbay',
    name: 'Northbay Living',
    category: 'Furniture & Electronics',
    tagline: 'Furniture that comes assembled',
    hue: 200,
    hueAlt: 172,
    discountPercent: 6,
    denominations: LARGE,
    redeemableAt: 'Online & in-store',
    validityMonths: 12,
  },
  {
    id: 'voltcraft',
    name: 'Voltcraft',
    category: 'Furniture & Electronics',
    tagline: 'Appliances with a real warranty desk',
    hue: 258,
    hueAlt: 224,
    discountPercent: 5,
    denominations: LARGE,
    redeemableAt: 'In-store',
    validityMonths: 12,
    featured: true,
  },

  // -------------------------------------------------------------- Gaming
  {
    id: 'pixelforge',
    name: 'Pixelforge',
    category: 'Gaming',
    tagline: 'Credit for the store you already use',
    hue: 265,
    hueAlt: 300,
    discountPercent: 0,
    denominations: [100, 500, 1000, 2500, 5000],
    redeemableAt: 'Online',
    validityMonths: 12,
    featured: true,
  },
  {
    id: 'arcadia-play',
    name: 'Arcadia Play',
    category: 'Gaming',
    tagline: 'Console credit, no subscription',
    hue: 196,
    hueAlt: 168,
    discountPercent: 0,
    denominations: [500, 1000, 2000, 5000],
    redeemableAt: 'Online',
    validityMonths: 12,
  },
  {
    id: 'lanternbox',
    name: 'Lanternbox',
    category: 'Gaming',
    tagline: 'Indie titles and the odd bundle',
    hue: 42,
    hueAlt: 12,
    discountPercent: 8,
    denominations: [100, 250, 500, 1000],
    redeemableAt: 'Online',
    validityMonths: 6,
  },

  // -------------------------------------------------- OTT & Recharges
  {
    id: 'reelhouse',
    name: 'Reelhouse',
    category: 'OTT & Recharges',
    tagline: 'Films, and no autoplaying trailers',
    hue: 350,
    hueAlt: 320,
    discountPercent: 5,
    denominations: [199, 499, 999, 1499],
    redeemableAt: 'Online',
    validityMonths: 12,
  },
  {
    id: 'mobile-topup',
    name: 'Mobile Top-up',
    category: 'OTT & Recharges',
    tagline: 'Credit against any prepaid number',
    hue: 205,
    hueAlt: 232,
    discountPercent: 2,
    denominations: [199, 299, 499, 999],
    redeemableAt: 'Online',
    validityMonths: 12,
  },

  // ------------------------------------------------- Beauty & Health
  {
    id: 'saffron-leaf',
    name: 'Saffron Leaf',
    category: 'Beauty & Health',
    tagline: 'Skincare with the list on the front',
    hue: 330,
    hueAlt: 300,
    discountPercent: 9,
    denominations: SMALL,
    redeemableAt: 'Online & in-store',
    validityMonths: 12,
    featured: true,
  },
  {
    id: 'verdant-apothecary',
    name: 'Verdant Apothecary',
    category: 'Beauty & Health',
    tagline: 'Chemist, dispensary, and no upsell',
    hue: 152,
    hueAlt: 178,
    discountPercent: 4,
    denominations: SMALL,
    redeemableAt: 'In-store',
    validityMonths: 12,
  },

  // -------------------------------------------- Travel & Hospitality
  {
    id: 'wayfarer-trips',
    name: 'Wayfarer Trips',
    category: 'Travel & Hospitality',
    tagline: 'Flights, stays, and a human on the phone',
    hue: 188,
    hueAlt: 214,
    discountPercent: 3,
    denominations: LARGE,
    redeemableAt: 'Online',
    validityMonths: 12,
    featured: true,
  },
  {
    id: 'cinnabar-hotels',
    name: 'Cinnabar Hotels',
    category: 'Travel & Hospitality',
    tagline: 'Rooms across forty towns',
    hue: 12,
    hueAlt: 340,
    discountPercent: 7,
    denominations: LARGE,
    redeemableAt: 'Online & in-store',
    validityMonths: 12,
  },
];

export function findBrand(id: string | null | undefined): GiftBrand | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return GIFT_BRANDS.find((brand) => brand.id === wanted);
}

export function brandsIn(category: BrandCategory): GiftBrand[] {
  return GIFT_BRANDS.filter((brand) => brand.category === category);
}

/** The strip at the top of the brand store. */
export const BRANDS_OF_THE_MONTH: readonly GiftBrand[] = GIFT_BRANDS.filter(
  (brand) => brand.featured,
);

/** Categories that actually have a brand in them, in the table's order. */
export function populatedCategories(): BrandCategory[] {
  return BRAND_CATEGORIES.filter((category) => brandsIn(category).length > 0);
}
