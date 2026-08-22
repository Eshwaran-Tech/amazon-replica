/**
 * Occasions a gift card can be sent for.
 *
 * One table drives the storefront: the occasion rows on the landing page, the
 * filter column, the dedicated stores, and the artwork generator that draws a
 * design for each. Adding an occasion here adds it everywhere, which is the
 * only way a catalogue this wide stays consistent.
 */

export type OccasionGroup = 'EVERYDAY' | 'FESTIVE' | 'CORPORATE';

export interface Occasion {
  /** URL id, lowercase kebab. */
  id: string;
  /** "Birthday" -- the heading and the filter label. */
  name: string;
  /** How the landing page introduces the row. */
  blurb: string;
  group: OccasionGroup;
  /** Drawn on the card by the artwork generator. */
  greeting: string;
  /** Which motif the generator uses. */
  motif: Motif;
  /** Base hue for the artwork, 0-359. */
  hue: number;
  /** How many designs to draw for it. */
  designs: number;
  /** Shown on the landing page's occasion rows, in this order. */
  featured?: boolean;
}

export const MOTIFS = [
  'BALLOONS',
  'RINGS',
  'HEARTS',
  'CONFETTI',
  'BLOOM',
  'CIRCLES',
  'CLOVER',
  'HOUSE',
  'RATTLE',
  'CAP',
  'SUNSET',
  'SPROUT',
  'LAMP',
  'BOW',
  'TREE',
  'THREAD',
  'STAR',
  'TROPHY',
  'ARROW',
  'BADGE',
] as const;
export type Motif = (typeof MOTIFS)[number];

export const OCCASIONS: readonly Occasion[] = [
  // ------------------------------------------------------------- featured
  {
    id: 'birthday',
    name: 'Birthday',
    blurb: 'Wish them the day they deserve.',
    group: 'EVERYDAY',
    greeting: 'Happy Birthday',
    motif: 'BALLOONS',
    hue: 340,
    designs: 12,
    featured: true,
  },
  {
    id: 'wedding',
    name: 'Wedding & Engagement',
    blurb: 'For the couple who have everything but a registry.',
    group: 'EVERYDAY',
    greeting: 'Congratulations',
    motif: 'RINGS',
    hue: 28,
    designs: 12,
    featured: true,
  },
  {
    id: 'anniversary',
    name: 'Anniversary',
    blurb: 'Another year, and still counting.',
    group: 'EVERYDAY',
    greeting: 'Happy Anniversary',
    motif: 'HEARTS',
    hue: 350,
    designs: 8,
    featured: true,
  },
  {
    id: 'congratulations',
    name: 'Congratulations',
    blurb: 'For the news worth marking.',
    group: 'EVERYDAY',
    greeting: 'Congratulations',
    motif: 'CONFETTI',
    hue: 265,
    designs: 8,
    featured: true,
  },
  {
    id: 'thank-you',
    name: 'Appreciation and Thank you',
    blurb: 'For the favour you cannot repay in kind.',
    group: 'EVERYDAY',
    greeting: 'Thank You',
    motif: 'BLOOM',
    hue: 300,
    designs: 8,
    featured: true,
  },

  // ------------------------------------------------ other everyday moments
  {
    id: 'farewell',
    name: 'For farewell',
    blurb: 'For the desk that is about to be empty.',
    group: 'EVERYDAY',
    greeting: 'Time to say goodbye',
    motif: 'SUNSET',
    hue: 200,
    designs: 6,
  },
  {
    id: 'friends',
    name: 'For friends',
    blurb: 'No occasion required.',
    group: 'EVERYDAY',
    greeting: 'Just because',
    motif: 'CIRCLES',
    hue: 190,
    designs: 6,
  },
  {
    id: 'good-luck',
    name: 'Wishing good luck',
    blurb: 'For the exam, the interview, the leap.',
    group: 'EVERYDAY',
    greeting: 'Good Luck',
    motif: 'CLOVER',
    hue: 140,
    designs: 6,
  },
  {
    id: 'housewarming',
    name: 'For housewarming',
    blurb: 'For the keys that have just changed hands.',
    group: 'EVERYDAY',
    greeting: 'Welcome Home',
    motif: 'HOUSE',
    hue: 30,
    designs: 6,
  },
  {
    id: 'baby',
    name: 'For baby & expecting parents',
    blurb: 'For the ones who will not sleep again for a while.',
    group: 'EVERYDAY',
    greeting: 'Welcome, little one',
    motif: 'RATTLE',
    hue: 45,
    designs: 6,
  },
  {
    id: 'graduation',
    name: 'For graduation',
    blurb: 'For the end of one thing and the start of another.',
    group: 'EVERYDAY',
    greeting: 'You did it',
    motif: 'CAP',
    hue: 225,
    designs: 6,
  },
  {
    id: 'retirement',
    name: 'For retirement',
    blurb: 'For the last commute.',
    group: 'EVERYDAY',
    greeting: 'Happy Retirement',
    motif: 'SUNSET',
    hue: 20,
    designs: 6,
  },
  {
    id: 'new-beginnings',
    name: 'For new beginnings',
    blurb: 'For whatever comes next.',
    group: 'EVERYDAY',
    greeting: 'New Beginnings',
    motif: 'SPROUT',
    hue: 155,
    designs: 6,
  },
  {
    id: 'apology',
    name: 'For apology',
    blurb: 'For when the words are not quite enough.',
    group: 'EVERYDAY',
    greeting: 'Sorry',
    motif: 'BLOOM',
    hue: 355,
    designs: 6,
  },

  // ----------------------------------------------------------- the festivals
  {
    id: 'diwali',
    name: 'For Diwali',
    blurb: 'Lamps, sweets, and something they actually wanted.',
    group: 'FESTIVE',
    greeting: 'Happy Diwali',
    motif: 'LAMP',
    hue: 35,
    designs: 8,
  },
  {
    id: 'dussehra',
    name: 'For Dussehra',
    blurb: 'For the day the good side wins.',
    group: 'FESTIVE',
    greeting: 'Happy Dussehra',
    motif: 'BOW',
    hue: 15,
    designs: 6,
  },
  {
    id: 'christmas',
    name: 'For Christmas',
    blurb: 'Under the tree, without the wrapping.',
    group: 'FESTIVE',
    greeting: 'Merry Christmas',
    motif: 'TREE',
    hue: 150,
    designs: 6,
  },
  {
    id: 'raksha-bandhan',
    name: 'For Raksha Bandhan',
    blurb: 'For the thread and what it is worth.',
    group: 'FESTIVE',
    greeting: 'Happy Raksha Bandhan',
    motif: 'THREAD',
    hue: 345,
    designs: 6,
  },
  {
    id: 'mothers-day',
    name: "For Mother's Day",
    blurb: 'For the one who kept the receipts.',
    group: 'FESTIVE',
    greeting: 'Happy Mother’s Day',
    motif: 'HEARTS',
    hue: 320,
    designs: 6,
  },
  {
    id: 'fathers-day',
    name: "For Father's Day",
    blurb: 'For the one who fixed it before you noticed.',
    group: 'FESTIVE',
    greeting: 'Happy Father’s Day',
    motif: 'BADGE',
    hue: 210,
    designs: 6,
  },

  // ---------------------------------------------------------- the workplace
  {
    id: 'star-performer',
    name: 'Star Performer',
    blurb: 'For the quarter somebody carried.',
    group: 'CORPORATE',
    greeting: 'Star Performer',
    motif: 'STAR',
    hue: 250,
    designs: 4,
  },
  {
    id: 'good-job',
    name: 'Good Job',
    blurb: 'Said properly, and with something attached.',
    group: 'CORPORATE',
    greeting: 'Good Job',
    motif: 'CONFETTI',
    hue: 348,
    designs: 4,
  },
  {
    id: 'achiever',
    name: 'Achiever of the Month',
    blurb: 'For the name on the board this month.',
    group: 'CORPORATE',
    greeting: 'Achiever of the Month',
    motif: 'TROPHY',
    hue: 198,
    designs: 4,
  },
  {
    id: 'work-anniversary',
    name: 'Work Anniversary',
    blurb: 'For another year on the team.',
    group: 'CORPORATE',
    greeting: 'Happy Work Anniversary',
    motif: 'BADGE',
    hue: 175,
    designs: 4,
  },
  {
    id: 'contribution',
    name: 'Thank you for your contribution',
    blurb: 'For the work that did not have a name on it.',
    group: 'CORPORATE',
    greeting: 'Thank You',
    motif: 'ARROW',
    hue: 285,
    designs: 4,
  },
];

export function findOccasion(id: string | null | undefined): Occasion | undefined {
  if (!id) return undefined;
  const wanted = id.trim().toLowerCase();
  return OCCASIONS.find((occasion) => occasion.id === wanted);
}

export function occasionsIn(group: OccasionGroup): Occasion[] {
  return OCCASIONS.filter((occasion) => occasion.group === group);
}

/** The five rows the landing page leads with. */
export const FEATURED_OCCASIONS: readonly Occasion[] = OCCASIONS.filter(
  (occasion) => occasion.featured,
);

/** Every design the generator will draw, across every occasion. */
export const TOTAL_DESIGNS = OCCASIONS.reduce((sum, occasion) => sum + occasion.designs, 0);
