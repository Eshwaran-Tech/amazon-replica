/**
 * The Prime Video catalogue.
 *
 * Original titles and channel names, written for this project. The reference
 * screenshot carries real studios' artwork and real broadcasters' logos --
 * Apple TV, BBC Player, Lionsgate and the rest -- which belong to those
 * companies and are not reproduced here. Posters are drawn from the gradient
 * and initials below rather than from anyone's key art.
 *
 * Prices are in rupees and converted at the edge, so this file stays readable.
 */

export type VideoTier = 'INCLUDED' | 'RENTAL' | 'FREE';

export interface VideoTitle {
  id: string;
  name: string;
  year: number;
  genre: string;
  /** Minutes, or null for a series. */
  runtime: number | null;
  seasons: number | null;
  maturity: string;
  /** INCLUDED with membership, RENTAL to buy, FREE for the ad tier. */
  tier: VideoTier;
  /** Rupees; only meaningful for RENTAL. */
  rentRupees: number;
  /** Tailwind gradient classes for the generated poster. */
  gradient: string;
  tagline: string;
}

export interface VideoChannel {
  id: string;
  name: string;
  /** Rupees per month. */
  priceRupees: number;
  blurb: string;
  gradient: string;
}

/** Included with a Prime membership. */
const INCLUDED: VideoTitle[] = [
  {
    id: 'in-the-grey',
    name: 'In the Grey',
    year: 2026,
    genre: 'Crime drama',
    runtime: null,
    seasons: 2,
    maturity: '16+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-slate-700 to-slate-900',
    tagline: 'A fraud desk, a missing ledger, and nobody clean.',
  },
  {
    id: 'reacher-of-tides',
    name: 'Reach of Tides',
    year: 2026,
    genre: 'Thriller',
    runtime: null,
    seasons: 1,
    maturity: '16+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-blue-800 to-slate-900',
    tagline: 'A coastal town keeps its secrets below the waterline.',
  },
  {
    id: 'the-traitors-two',
    name: 'The Second Table',
    year: 2026,
    genre: 'Reality',
    runtime: null,
    seasons: 2,
    maturity: '13+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-amber-700 to-red-900',
    tagline: 'Twelve strangers. One of them is lying every night.',
  },
  {
    id: 'the-governor',
    name: 'The Governor',
    year: 2025,
    genre: 'Political drama',
    runtime: null,
    seasons: 3,
    maturity: '16+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-emerald-800 to-slate-900',
    tagline: 'Power changes hands. The files stay put.',
  },
  {
    id: 'adarsh-classroom',
    name: 'Adarsh Classroom',
    year: 2026,
    genre: 'Comedy',
    runtime: null,
    seasons: 2,
    maturity: '7+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-cyan-600 to-teal-800',
    tagline: 'The worst school in the district, and its best teacher.',
  },
  {
    id: 'nagabandham',
    name: 'Nagabandham',
    year: 2025,
    genre: 'Mythic action',
    runtime: 148,
    seasons: null,
    maturity: '16+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-orange-700 to-rose-900',
    tagline: 'The oath that bound the river is breaking.',
  },
  {
    id: 'sterling-point',
    name: 'Sterling Point',
    year: 2026,
    genre: 'Heist',
    runtime: 121,
    seasons: null,
    maturity: '13+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-zinc-600 to-zinc-900',
    tagline: 'One vault, four accountants, ninety minutes.',
  },
  {
    id: 'devils-mouth',
    name: "Devil's Mouth",
    year: 2025,
    genre: 'Horror',
    runtime: 106,
    seasons: null,
    maturity: '18+',
    tier: 'INCLUDED',
    rentRupees: 0,
    gradient: 'from-red-900 to-black',
    tagline: 'The cave was sealed for a reason.',
  },
];

/** Early-access rentals, before they reach the included tier. */
const RENTALS: VideoTitle[] = [
  {
    id: 'obsession',
    name: 'Obsession',
    year: 2026,
    genre: 'Psychological thriller',
    runtime: 134,
    seasons: null,
    maturity: '18+',
    tier: 'RENTAL',
    rentRupees: 149,
    gradient: 'from-yellow-600 to-amber-900',
    tagline: 'He only wanted to be remembered correctly.',
  },
  {
    id: 'disclosure-day',
    name: 'Disclosure Day',
    year: 2026,
    genre: 'Legal drama',
    runtime: 127,
    seasons: null,
    maturity: '16+',
    tier: 'RENTAL',
    rentRupees: 149,
    gradient: 'from-slate-500 to-slate-800',
    tagline: 'Everything comes out at nine. Nothing survives till ten.',
  },
  {
    id: 'euphoria-lines',
    name: 'Euphoria Lines',
    year: 2026,
    genre: 'Musical',
    runtime: 118,
    seasons: null,
    maturity: '16+',
    tier: 'RENTAL',
    rentRupees: 129,
    gradient: 'from-fuchsia-600 to-purple-900',
    tagline: 'The last night of the last tour.',
  },
  {
    id: 'mortal-combat',
    name: 'Mortal Circuit',
    year: 2026,
    genre: 'Action',
    runtime: 132,
    seasons: null,
    maturity: '18+',
    tier: 'RENTAL',
    rentRupees: 179,
    gradient: 'from-red-700 to-orange-900',
    tagline: 'Win the round or leave the arena in pieces.',
  },
  {
    id: 'the-mummy-road',
    name: 'The Long Road Home',
    year: 2025,
    genre: 'Adventure',
    runtime: 141,
    seasons: null,
    maturity: '13+',
    tier: 'RENTAL',
    rentRupees: 99,
    gradient: 'from-amber-600 to-yellow-900',
    tagline: 'Two thousand miles, one working headlight.',
  },
  {
    id: 'michael-drama',
    name: 'Michael',
    year: 2026,
    genre: 'Biographical',
    runtime: 152,
    seasons: null,
    maturity: '13+',
    tier: 'RENTAL',
    rentRupees: 149,
    gradient: 'from-indigo-700 to-slate-900',
    tagline: 'The record everyone remembers. The year nobody does.',
  },
];

/** The free, ad-supported tier. */
const FREE: VideoTitle[] = [
  {
    id: 'rakshak',
    name: 'Rakshak: Border Diaries',
    year: 2025,
    genre: 'Action series',
    runtime: null,
    seasons: 2,
    maturity: '16+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-orange-700 to-amber-900',
    tagline: 'Six months at the line, told by the people who held it.',
  },
  {
    id: 'hostel-hustlers',
    name: 'Hostel Hustlers',
    year: 2026,
    genre: 'Comedy series',
    runtime: null,
    seasons: 3,
    maturity: '13+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-sky-600 to-blue-900',
    tagline: 'Rent is due. Nobody has a job. Everyone has a plan.',
  },
  {
    id: 'hunter-unmasked',
    name: 'Hunter: Unmasked',
    year: 2025,
    genre: 'Crime series',
    runtime: null,
    seasons: 1,
    maturity: '18+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-emerald-700 to-slate-900',
    tagline: 'The case was closed. The city was not.',
  },
  {
    id: 'yeh-meri-family',
    name: 'Yeh Meri Family',
    year: 2026,
    genre: 'Family drama',
    runtime: null,
    seasons: 2,
    maturity: '7+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-rose-500 to-pink-800',
    tagline: 'One summer, one scooter, one very long argument.',
  },
  {
    id: 'jamnapaar',
    name: 'Jamnapaar',
    year: 2026,
    genre: 'Slice of life',
    runtime: null,
    seasons: 1,
    maturity: '13+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-violet-600 to-indigo-900',
    tagline: 'East of the river, everybody knows your business.',
  },
  {
    id: 'gutar-gu',
    name: 'Gutar Gu',
    year: 2025,
    genre: 'Romance',
    runtime: null,
    seasons: 2,
    maturity: '13+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-teal-500 to-cyan-800',
    tagline: 'First love, second thoughts, third period chemistry.',
  },
  {
    id: 'dehati-ladke',
    name: 'Dehati Ladke',
    year: 2026,
    genre: 'Comedy series',
    runtime: null,
    seasons: 2,
    maturity: '16+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-lime-600 to-green-900',
    tagline: 'Small town, big opinions, no filter.',
  },
  {
    id: 'half-ca',
    name: 'Half CA',
    year: 2026,
    genre: 'Drama series',
    runtime: null,
    seasons: 2,
    maturity: '13+',
    tier: 'FREE',
    rentRupees: 0,
    gradient: 'from-blue-600 to-slate-900',
    tagline: 'Two attempts left, and a family that keeps counting.',
  },
];

export const VIDEO_TITLES: VideoTitle[] = [...INCLUDED, ...RENTALS, ...FREE];

export const INCLUDED_TITLES = INCLUDED;
export const RENTAL_TITLES = RENTALS;
export const FREE_TITLES = FREE;

/** Add-on channels, each billed monthly from the wallet. */
export const VIDEO_CHANNELS: VideoChannel[] = [
  {
    id: 'lantern-tv',
    name: 'Lantern TV',
    priceRupees: 199,
    blurb: 'Prestige drama and originals',
    gradient: 'from-slate-600 to-slate-900',
  },
  {
    id: 'moviesphere',
    name: 'MovieSphere',
    priceRupees: 149,
    blurb: 'A rotating film library',
    gradient: 'from-blue-600 to-indigo-900',
  },
  {
    id: 'ironleaf-play',
    name: 'Ironleaf Play',
    priceRupees: 129,
    blurb: 'Action and genre cinema',
    gradient: 'from-cyan-600 to-blue-900',
  },
  {
    id: 'goldmine-reels',
    name: 'Goldmine Reels',
    priceRupees: 79,
    blurb: 'Classics and remasters',
    gradient: 'from-amber-600 to-orange-900',
  },
  {
    id: 'anime-hours',
    name: 'Anime Hours',
    priceRupees: 99,
    blurb: 'Simulcast and back catalogue',
    gradient: 'from-violet-600 to-purple-900',
  },
  {
    id: 'kerala-one',
    name: 'Kerala One',
    priceRupees: 89,
    blurb: 'Malayalam film and television',
    gradient: 'from-emerald-600 to-green-900',
  },
  {
    id: 'chaupal-plus',
    name: 'Chaupal Plus',
    priceRupees: 79,
    blurb: 'Punjabi cinema and series',
    gradient: 'from-rose-600 to-red-900',
  },
  {
    id: 'beacon-player',
    name: 'Beacon Player',
    priceRupees: 169,
    blurb: 'Documentary and current affairs',
    gradient: 'from-zinc-600 to-zinc-900',
  },
  {
    id: 'league-court',
    name: 'League Court',
    priceRupees: 249,
    blurb: 'Live league basketball',
    gradient: 'from-orange-600 to-red-900',
  },
];

const TITLES_BY_ID = new Map(VIDEO_TITLES.map((title) => [title.id, title]));
const CHANNELS_BY_ID = new Map(VIDEO_CHANNELS.map((channel) => [channel.id, channel]));

export function findTitle(id: string): VideoTitle | undefined {
  return TITLES_BY_ID.get(id);
}

export function findChannel(id: string): VideoChannel | undefined {
  return CHANNELS_BY_ID.get(id);
}
