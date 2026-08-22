/**
 * Cable and DTH: the capacity fee, the bouquets and the à la carte book.
 *
 * **The pricing structure is the real regulated one**, and it is the reason
 * this page is a pack builder rather than a form:
 *
 *  1. You pay a **network capacity fee** for the *number* of channels carried,
 *     not for which ones. It steps -- a flat amount for the first hundred, then
 *     a block charge for each further twenty-five, up to a cap.
 *  2. **Free-to-air channels do not count** toward that number. Carrying fifty
 *     of them costs nothing and moves no step.
 *  3. On top of it you pay the **published price of each pay channel or
 *     bouquet** you take. A bouquet is cheaper than its channels bought singly,
 *     which is the whole reason bouquets exist.
 *  4. Then 18% GST on the lot.
 *
 * Nobody's bill explains any of this, which is why almost everybody pays for
 * two hundred channels to watch nine. The builder shows the step moving as you
 * add channels, and shows what the same selection costs à la carte.
 *
 * **The broadcasters are this store's own**, and share the names its streaming
 * catalogue already uses.
 */

export const NCF_BASE_CHANNELS = 100;
export const NCF_BASE_RUPEES = 130;
export const NCF_BLOCK_CHANNELS = 25;
export const NCF_BLOCK_RUPEES = 20;
/** The regulator caps it, which is the only reason a big pack is affordable. */
export const NCF_CAP_RUPEES = 160;

export const TV_GST_PERCENT = 18;

/**
 * The capacity fee for a given number of *pay* channels.
 *
 * Free-to-air channels are excluded by the caller, because they genuinely do
 * not count -- a page that charged for them would be overcharging by the
 * regulator's own rules.
 */
export function networkCapacityFee(payChannels: number): number {
  if (payChannels <= 0) return 0;
  if (payChannels <= NCF_BASE_CHANNELS) return NCF_BASE_RUPEES;
  const blocks = Math.ceil((payChannels - NCF_BASE_CHANNELS) / NCF_BLOCK_CHANNELS);
  return Math.min(NCF_CAP_RUPEES, NCF_BASE_RUPEES + blocks * NCF_BLOCK_RUPEES);
}

/**
 * How many more channels before the fee steps up.
 *
 * Counted to the *threshold that changes the fee*, not to the end of the
 * current block. At exactly 100 channels one more channel costs another twenty
 * rupees, and a builder that said "25 to go" there would be wrong at precisely
 * the moment the warning matters.
 */
export function channelsToNextStep(payChannels: number): number | null {
  if (networkCapacityFee(payChannels) >= NCF_CAP_RUPEES) return null;
  if (payChannels <= 0) return 1;
  if (payChannels <= NCF_BASE_CHANNELS) return NCF_BASE_CHANNELS + 1 - payChannels;
  const blocks = Math.ceil((payChannels - NCF_BASE_CHANNELS) / NCF_BLOCK_CHANNELS);
  return NCF_BASE_CHANNELS + blocks * NCF_BLOCK_CHANNELS + 1 - payChannels;
}

export const GENRES = [
  'Entertainment',
  'Movies',
  'News',
  'Sport',
  'Kids',
  'Music',
  'Knowledge',
  'Regional',
] as const;
export type Genre = (typeof GENRES)[number];

export interface Channel {
  id: string;
  name: string;
  genre: Genre;
  /** Published à la carte price, in whole rupees. Zero for free-to-air. */
  mrpRupees: number;
  /** Free-to-air channels are free and do not count toward the capacity fee. */
  freeToAir?: boolean;
  hd?: boolean;
}

export const CHANNELS: readonly Channel[] = [
  // --- free-to-air ---------------------------------------------------------
  { id: 'bharat-one', name: 'Bharat One', genre: 'Entertainment', mrpRupees: 0, freeToAir: true },
  { id: 'bharat-news', name: 'Bharat News', genre: 'News', mrpRupees: 0, freeToAir: true },
  { id: 'bharat-sports', name: 'Bharat Sports', genre: 'Sport', mrpRupees: 0, freeToAir: true },
  { id: 'bharat-bal', name: 'Bharat Bal', genre: 'Kids', mrpRupees: 0, freeToAir: true },
  { id: 'sansad-live', name: 'Sansad Live', genre: 'News', mrpRupees: 0, freeToAir: true },
  {
    id: 'krishi-darshan',
    name: 'Krishi Darshan',
    genre: 'Knowledge',
    mrpRupees: 0,
    freeToAir: true,
  },

  // --- entertainment -------------------------------------------------------
  { id: 'lantern-tv', name: 'Lantern TV', genre: 'Entertainment', mrpRupees: 19, hd: true },
  { id: 'lantern-tv-sd', name: 'Lantern TV SD', genre: 'Entertainment', mrpRupees: 12 },
  { id: 'beacon-player', name: 'Beacon Player', genre: 'Entertainment', mrpRupees: 19, hd: true },
  { id: 'stonefire-tv', name: 'Stonefire TV', genre: 'Entertainment', mrpRupees: 15 },
  { id: 'harrow-lane-tv', name: 'Harrow Lane TV', genre: 'Entertainment', mrpRupees: 10 },

  // --- movies --------------------------------------------------------------
  { id: 'moviesphere', name: 'MovieSphere', genre: 'Movies', mrpRupees: 19, hd: true },
  { id: 'moviesphere-sd', name: 'MovieSphere SD', genre: 'Movies', mrpRupees: 12 },
  { id: 'ironleaf-play', name: 'Ironleaf Play', genre: 'Movies', mrpRupees: 17, hd: true },
  { id: 'goldmine-reels', name: 'Goldmine Reels', genre: 'Movies', mrpRupees: 8 },
  { id: 'reelhouse', name: 'Reelhouse', genre: 'Movies', mrpRupees: 14 },

  // --- news ----------------------------------------------------------------
  { id: 'meridian-news', name: 'Meridian News', genre: 'News', mrpRupees: 6 },
  { id: 'kestrel-24', name: 'Kestrel 24', genre: 'News', mrpRupees: 5 },
  { id: 'harbour-business', name: 'Harbour Business', genre: 'News', mrpRupees: 9 },
  { id: 'capital-desk', name: 'Capital Desk', genre: 'News', mrpRupees: 4 },

  // --- sport ---------------------------------------------------------------
  { id: 'arena-one', name: 'Arena One', genre: 'Sport', mrpRupees: 19, hd: true },
  { id: 'arena-two', name: 'Arena Two', genre: 'Sport', mrpRupees: 19, hd: true },
  { id: 'arena-select', name: 'Arena Select', genre: 'Sport', mrpRupees: 15 },
  { id: 'pitchside', name: 'Pitchside', genre: 'Sport', mrpRupees: 12 },

  // --- kids ----------------------------------------------------------------
  { id: 'lanternbox-kids', name: 'Lanternbox Kids', genre: 'Kids', mrpRupees: 8 },
  { id: 'anime-hours', name: 'Anime Hours', genre: 'Kids', mrpRupees: 10 },
  { id: 'pixelforge-jr', name: 'Pixelforge Jr', genre: 'Kids', mrpRupees: 6 },

  // --- music ---------------------------------------------------------------
  { id: 'quill-music', name: 'Quill Music', genre: 'Music', mrpRupees: 4 },
  { id: 'saffron-beats', name: 'Saffron Beats', genre: 'Music', mrpRupees: 3 },

  // --- knowledge -----------------------------------------------------------
  { id: 'verdant-earth', name: 'Verdant Earth', genre: 'Knowledge', mrpRupees: 11 },
  { id: 'stonebridge-history', name: 'Stonebridge History', genre: 'Knowledge', mrpRupees: 9 },

  // --- regional ------------------------------------------------------------
  { id: 'kerala-one', name: 'Kerala One', genre: 'Regional', mrpRupees: 9 },
  { id: 'chaupal-plus', name: 'Chaupal Plus', genre: 'Regional', mrpRupees: 8 },
  { id: 'coromandel-tv', name: 'Coromandel TV', genre: 'Regional', mrpRupees: 10 },
  { id: 'deccan-tv', name: 'Deccan TV', genre: 'Regional', mrpRupees: 9 },
  { id: 'delta-bangla', name: 'Delta Bangla', genre: 'Regional', mrpRupees: 7 },
];

export function findChannel(id: string | null | undefined): Channel | undefined {
  if (!id) return undefined;
  return CHANNELS.find((channel) => channel.id === id.trim().toLowerCase());
}

export const FREE_TO_AIR = CHANNELS.filter((channel) => channel.freeToAir);
export const PAY_CHANNELS = CHANNELS.filter((channel) => !channel.freeToAir);

export interface Bouquet {
  id: string;
  name: string;
  broadcaster: string;
  /** Published bouquet price, in whole rupees. */
  priceRupees: number;
  channelIds: readonly string[];
  blurb: string;
}

/**
 * Bouquets.
 *
 * Every one is priced below the sum of its channels, because a bouquet that
 * cost more than its parts would never be sold -- and the builder shows the
 * gap, since that gap is the only reason to take one.
 */
export const BOUQUETS: readonly Bouquet[] = [
  {
    id: 'lantern-family',
    name: 'Lantern Family',
    broadcaster: 'Lantern Media',
    priceRupees: 39,
    channelIds: ['lantern-tv', 'lantern-tv-sd', 'harrow-lane-tv', 'lanternbox-kids'],
    blurb: 'Drama, general entertainment and a kids channel.',
  },
  {
    id: 'moviesphere-max',
    name: 'MovieSphere Max',
    broadcaster: 'MovieSphere Network',
    priceRupees: 45,
    channelIds: ['moviesphere', 'moviesphere-sd', 'ironleaf-play', 'goldmine-reels', 'reelhouse'],
    blurb: 'Five film channels, new releases and back catalogue.',
  },
  {
    id: 'arena-sport',
    name: 'Arena Sport',
    broadcaster: 'Arena Broadcasting',
    priceRupees: 49,
    channelIds: ['arena-one', 'arena-two', 'arena-select', 'pitchside'],
    blurb: 'Live sport across four channels.',
  },
  {
    id: 'newsdesk',
    name: 'Newsdesk',
    broadcaster: 'Meridian Media',
    priceRupees: 15,
    channelIds: ['meridian-news', 'kestrel-24', 'harbour-business', 'capital-desk'],
    blurb: 'National, business and regional news.',
  },
  {
    id: 'young-viewers',
    name: 'Young Viewers',
    broadcaster: 'Lanternbox',
    priceRupees: 18,
    channelIds: ['lanternbox-kids', 'anime-hours', 'pixelforge-jr'],
    blurb: 'Cartoons, anime and pre-school.',
  },
  {
    id: 'south-pack',
    name: 'South Pack',
    broadcaster: 'Coromandel Network',
    priceRupees: 22,
    channelIds: ['kerala-one', 'coromandel-tv', 'deccan-tv'],
    blurb: 'Malayalam, Tamil and Telugu.',
  },
  {
    id: 'curious',
    name: 'Curious',
    broadcaster: 'Verdant Media',
    priceRupees: 16,
    channelIds: ['verdant-earth', 'stonebridge-history', 'quill-music'],
    blurb: 'Natural history, documentaries and music.',
  },
];

export function findBouquet(id: string | null | undefined): Bouquet | undefined {
  if (!id) return undefined;
  return BOUQUETS.find((bouquet) => bouquet.id === id.trim().toLowerCase());
}

/** What a bouquet's channels would cost bought singly. */
export function alaCarteValue(bouquet: Bouquet): number {
  return bouquet.channelIds.reduce((sum, id) => sum + (findChannel(id)?.mrpRupees ?? 0), 0);
}

// ---------------------------------------------------------------------- DTH

export interface DthOperator {
  id: string;
  name: string;
  note: string;
  /** Rental for the set-top box, per month. Zero once it is owned. */
  boxRentalRupees: number;
  hue: number;
}

export const DTH_OPERATORS: readonly DthOperator[] = [
  {
    id: 'skyreach',
    name: 'Skyreach Digital',
    note: 'Nationwide Ku-band, HD box.',
    boxRentalRupees: 0,
    hue: 210,
  },
  {
    id: 'meridian-dish',
    name: 'Meridian Dish',
    note: '4K box on rental, or buy it outright.',
    boxRentalRupees: 60,
    hue: 28,
  },
  {
    id: 'delta-direct',
    name: 'Delta Direct',
    note: 'Strong regional carriage in the east.',
    boxRentalRupees: 40,
    hue: 340,
  },
  {
    id: 'garden-sky',
    name: 'Garden Sky',
    note: 'Southern regional packs carried in HD.',
    boxRentalRupees: 0,
    hue: 140,
  },
];

export function findDthOperator(id: string | null | undefined): DthOperator | undefined {
  if (!id) return undefined;
  return DTH_OPERATORS.find((operator) => operator.id === id.trim().toLowerCase());
}

/**
 * Paying for longer costs less per month.
 *
 * The real reason DTH pushes annual recharges, and the discount is genuine --
 * so it is shown as a rate rather than as "save big".
 */
export const DTH_TERMS: ReadonlyArray<{ months: number; label: string; discountPercent: number }> =
  [
    { months: 1, label: 'One month', discountPercent: 0 },
    { months: 3, label: 'Three months', discountPercent: 3 },
    { months: 6, label: 'Six months', discountPercent: 6 },
    { months: 12, label: 'Twelve months', discountPercent: 11 },
  ];
