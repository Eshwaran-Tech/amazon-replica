/**
 * Draws the gift card designs.
 *
 * Original, local, deterministic -- the same reasoning as the hero, product and
 * hotel art. Local assets keep `img-src 'self'` honest and mean
 * `next.config.ts` needs no remote image allow-list (which would make
 * `/_next/image` an open image proxy).
 *
 * A card face is a greeting, a motif and a colourway. All three come from the
 * occasion table in `src/data/gift-occasions.ts`, so the artwork cannot drift
 * from the catalogue: adding an occasion there draws its designs here.
 *
 * Every design for one occasion shares its greeting and motif and differs in
 * layout and palette, which is what a real range looks like -- twelve birthday
 * cards, not twelve unrelated pictures.
 *
 * Run: pnpm tsx scripts/generate-giftcard-art.ts
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GIFT_BRANDS, type GiftBrand } from '../src/data/gift-brands';
import { OCCASIONS, type Motif, type Occasion } from '../src/data/gift-occasions';

const OUT_DIR = join(process.cwd(), 'public', 'gift-cards');

const WIDTH = 640;
const HEIGHT = 400;

/** Deterministic PRNG so re-running does not churn the working tree. */
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

/** FNV-1a, matching the project's other deterministic generators. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** SVG is XML: an unescaped ampersand in a greeting breaks the whole file. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface Palette {
  /** Two stops for the background wash. */
  from: string;
  to: string;
  /** The greeting, chosen for contrast against the wash. */
  ink: string;
  /** The motif, and any rule or underline. */
  accent: string;
  /** A second accent, for motifs that need one. */
  accentAlt: string;
  /** True when the wash is dark enough to need light type. */
  dark: boolean;
}

/**
 * Five colourways per occasion hue.
 *
 * Each is a whole scheme rather than a hue plus arithmetic. A palette built by
 * rotating one number produces combinations nobody would choose -- the hotel
 * artwork learned that the hard way with its lime skies.
 */
/** Used only if the scheme list is ever emptied by an edit. */
const FALLBACK_PALETTE: Palette = {
  from: 'hsl(0 0% 96%)',
  to: 'hsl(0 0% 86%)',
  ink: 'hsl(0 0% 18%)',
  accent: 'hsl(28 78% 52%)',
  accentAlt: 'hsl(200 62% 46%)',
  dark: false,
};

function paletteFor(hue: number, variant: number): Palette {
  const h = (n: number) => (((hue + n) % 360) + 360) % 360;

  const schemes: Palette[] = [
    {
      from: `hsl(${h(0)} 82% 92%)`,
      to: `hsl(${h(28)} 76% 82%)`,
      ink: `hsl(${h(0)} 62% 24%)`,
      accent: `hsl(${h(0)} 74% 52%)`,
      accentAlt: `hsl(${h(190)} 62% 46%)`,
      dark: false,
    },
    {
      from: `hsl(${h(0)} 58% 34%)`,
      to: `hsl(${h(-32)} 62% 20%)`,
      ink: 'hsl(0 0% 100%)',
      accent: `hsl(${h(36)} 92% 68%)`,
      accentAlt: `hsl(${h(180)} 70% 70%)`,
      dark: true,
    },
    {
      from: 'hsl(0 0% 100%)',
      to: `hsl(${h(12)} 66% 90%)`,
      ink: `hsl(${h(6)} 58% 28%)`,
      accent: `hsl(${h(0)} 78% 56%)`,
      accentAlt: `hsl(${h(48)} 84% 58%)`,
      dark: false,
    },
    {
      from: `hsl(${h(200)} 62% 88%)`,
      to: `hsl(${h(0)} 70% 84%)`,
      ink: `hsl(${h(210)} 52% 26%)`,
      accent: `hsl(${h(0)} 72% 50%)`,
      accentAlt: `hsl(${h(210)} 62% 48%)`,
      dark: false,
    },
    {
      from: `hsl(${h(0)} 46% 16%)`,
      to: `hsl(${h(28)} 54% 30%)`,
      ink: 'hsl(0 0% 100%)',
      accent: `hsl(${h(44)} 94% 70%)`,
      accentAlt: `hsl(${h(0)} 74% 66%)`,
      dark: true,
    },
  ];

  // The list is a literal five entries long, so the modulo always lands --
  // but a fallback beats an assertion that stops being true if it is edited.
  return schemes[variant % schemes.length] ?? FALLBACK_PALETTE;
}

// ---------------------------------------------------------------- the motifs

function balloons(random: () => number, palette: Palette): string {
  return Array.from({ length: 6 }, (_, n) => {
    const x = 60 + n * 96 + random() * 26;
    const y = 70 + random() * 90;
    const r = 22 + random() * 12;
    const fill = n % 2 === 0 ? palette.accent : palette.accentAlt;
    return `<g opacity="0.9">
      <path d="M${x.toFixed(0)} ${(y + r).toFixed(0)} q ${(6 - random() * 12).toFixed(0)} 60 ${(2 - random() * 8).toFixed(0)} 110" fill="none" stroke="${palette.ink}" stroke-opacity="0.35" stroke-width="2"/>
      <ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 1.2).toFixed(0)}" fill="${fill}"/>
      <ellipse cx="${(x - r * 0.3).toFixed(0)}" cy="${(y - r * 0.35).toFixed(0)}" rx="${(r * 0.24).toFixed(0)}" ry="${(r * 0.3).toFixed(0)}" fill="#ffffff" opacity="0.45"/>
    </g>`;
  }).join('');
}

function rings(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const cy = 132;
  return `<g fill="none" stroke-width="9">
    <circle cx="${cx - 34}" cy="${cy}" r="42" stroke="${palette.accent}"/>
    <circle cx="${cx + 34}" cy="${cy}" r="42" stroke="${palette.accentAlt}"/>
  </g>
  <circle cx="${cx - 34}" cy="${cy - 42}" r="7" fill="${palette.accent}"/>`;
}

function heart(x: number, y: number, size: number, fill: string, opacity = 1): string {
  const s = size / 32;
  return `<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(3)})" d="M0 10 C -14 -6 -26 4 -16 16 L0 32 L16 16 C 26 4 14 -6 0 10 Z" fill="${fill}" opacity="${opacity}"/>`;
}

function hearts(random: () => number, palette: Palette): string {
  return Array.from({ length: 9 }, (_, n) => {
    const x = 56 + n * 66 + random() * 20;
    const y = 66 + random() * 110;
    const size = 26 + random() * 26;
    return heart(
      x,
      y,
      size,
      n % 2 === 0 ? palette.accent : palette.accentAlt,
      0.55 + random() * 0.4,
    );
  }).join('');
}

function confetti(random: () => number, palette: Palette): string {
  return Array.from({ length: 40 }, () => {
    const x = random() * WIDTH;
    const y = random() * (HEIGHT * 0.62);
    const w = 5 + random() * 12;
    const h = 4 + random() * 7;
    const rotate = random() * 360;
    const fill = random() < 0.5 ? palette.accent : palette.accentAlt;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="2" fill="${fill}" opacity="${(0.5 + random() * 0.5).toFixed(2)}" transform="rotate(${rotate.toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }).join('');
}

function bloom(random: () => number, palette: Palette): string {
  return Array.from({ length: 3 }, (_, n) => {
    const cx = 150 + n * 170 + random() * 30;
    const cy = 118 + random() * 40;
    const petals = Array.from({ length: 8 }, (_, p) => {
      const angle = (p / 8) * Math.PI * 2;
      return `<ellipse cx="${(cx + Math.cos(angle) * 26).toFixed(1)}" cy="${(cy + Math.sin(angle) * 26).toFixed(1)}" rx="16" ry="10" fill="${n % 2 === 0 ? palette.accent : palette.accentAlt}" opacity="0.85" transform="rotate(${((angle * 180) / Math.PI).toFixed(0)} ${(cx + Math.cos(angle) * 26).toFixed(1)} ${(cy + Math.sin(angle) * 26).toFixed(1)})"/>`;
    }).join('');
    return `${petals}<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="15" fill="${palette.ink}" opacity="0.85"/>`;
  }).join('');
}

function circlesMotif(random: () => number, palette: Palette): string {
  return Array.from({ length: 7 }, (_, n) => {
    const cx = 90 + n * 76 + random() * 20;
    const cy = 110 + random() * 60;
    const r = 30 + random() * 26;
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${n % 2 === 0 ? palette.accent : palette.accentAlt}" opacity="0.42"/>`;
  }).join('');
}

function clover(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const cy = 128;
  const leaves = Array.from({ length: 4 }, (_, n) => {
    const angle = (n / 4) * Math.PI * 2 + Math.PI / 4;
    return heart(
      cx + Math.cos(angle) * 30,
      cy + Math.sin(angle) * 30 - 16,
      44,
      palette.accent,
      0.92,
    );
  }).join('');
  return `${leaves}<path d="M${cx} ${cy + 34} q 8 42 -14 66" fill="none" stroke="${palette.accent}" stroke-width="6" stroke-linecap="round"/>`;
}

function house(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const base = 196;
  return `<path d="M${cx - 86} ${base - 46} L${cx} ${base - 116} L${cx + 86} ${base - 46} Z" fill="${palette.accent}"/>
  <rect x="${cx - 66}" y="${base - 46}" width="132" height="86" rx="6" fill="${palette.accentAlt}"/>
  <rect x="${cx - 18}" y="${base - 6}" width="36" height="46" rx="4" fill="${palette.ink}" opacity="0.75"/>
  <rect x="${cx - 52}" y="${base - 30}" width="26" height="26" rx="3" fill="#ffffff" opacity="0.7"/>
  <rect x="${cx + 26}" y="${base - 30}" width="26" height="26" rx="3" fill="#ffffff" opacity="0.7"/>`;
}

function rattle(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const cy = 122;
  return `<circle cx="${cx}" cy="${cy}" r="46" fill="${palette.accent}"/>
  <circle cx="${cx}" cy="${cy}" r="26" fill="#ffffff" opacity="0.55"/>
  <rect x="${cx - 9}" y="${cy + 42}" width="18" height="62" rx="9" fill="${palette.accentAlt}"/>
  <circle cx="${cx - 62}" cy="${cy - 26}" r="13" fill="${palette.accentAlt}"/>
  <circle cx="${cx + 64}" cy="${cy - 14}" r="10" fill="${palette.accentAlt}"/>`;
}

function cap(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const cy = 122;
  return `<path d="M${cx - 92} ${cy} L${cx} ${cy - 44} L${cx + 92} ${cy} L${cx} ${cy + 44} Z" fill="${palette.accent}"/>
  <path d="M${cx - 46} ${cy + 22} L${cx - 46} ${cy + 62} Q ${cx} ${cy + 90} ${cx + 46} ${cy + 62} L${cx + 46} ${cy + 22}" fill="${palette.accentAlt}"/>
  <path d="M${cx + 88} ${cy + 2} L${cx + 88} ${cy + 74}" stroke="${palette.accentAlt}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="${cx + 88}" cy="${cy + 80}" r="10" fill="${palette.accentAlt}"/>`;
}

function sunset(random: () => number, palette: Palette): string {
  const cy = 176;
  const rays = Array.from({ length: 5 }, (_, n) => {
    const y = cy + 26 + n * 16;
    return `<rect x="${(90 + random() * 40).toFixed(0)}" y="${y}" width="${(WIDTH - 220 - random() * 80).toFixed(0)}" height="5" rx="3" fill="${palette.accentAlt}" opacity="${(0.5 - n * 0.07).toFixed(2)}"/>`;
  }).join('');
  return `<circle cx="${WIDTH / 2}" cy="${cy}" r="62" fill="${palette.accent}" opacity="0.9"/>${rays}`;
}

function sprout(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const base = 210;
  return `<path d="M${cx} ${base} L${cx} ${base - 78}" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round"/>
  <path d="M${cx} ${base - 44} q -52 -14 -62 -58 q 46 -6 62 58 Z" fill="${palette.accent}"/>
  <path d="M${cx} ${base - 62} q 52 -12 64 -54 q -48 -8 -64 54 Z" fill="${palette.accentAlt}"/>`;
}

function lamp(random: () => number, palette: Palette): string {
  return Array.from({ length: 3 }, (_, n) => {
    const cx = 168 + n * 152;
    const cy = 150 + (n === 1 ? -18 : 0);
    return `<path d="M${cx - 52} ${cy} q 52 46 104 0 Z" fill="${palette.accent}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="52" ry="12" fill="${palette.accentAlt}"/>
    <path d="M${cx} ${cy - 6} q -6 -30 0 -44 q 6 14 0 44 Z" fill="hsl(42 96% 62%)"/>
    <circle cx="${cx}" cy="${(cy - 34).toFixed(0)}" r="${(16 + random() * 4).toFixed(0)}" fill="hsl(42 96% 68%)" opacity="0.3"/>`;
  }).join('');
}

function bow(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  return `<path d="M${cx - 60} 62 q -46 74 0 148" fill="none" stroke="${palette.accent}" stroke-width="10" stroke-linecap="round"/>
  <path d="M${cx - 60} 62 L${cx - 60} 210" stroke="${palette.accentAlt}" stroke-width="4"/>
  <path d="M${cx - 52} 136 L${cx + 84} 136" stroke="${palette.accentAlt}" stroke-width="7" stroke-linecap="round"/>
  <path d="M${cx + 84} 136 l -22 -12 l 0 24 Z" fill="${palette.accentAlt}"/>`;
}

function tree(random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const tiers = Array.from({ length: 3 }, (_, n) => {
    const y = 92 + n * 42;
    const w = 44 + n * 34;
    return `<path d="M${cx} ${y} L${cx + w} ${y + 54} L${cx - w} ${y + 54} Z" fill="${palette.accent}"/>`;
  }).join('');
  const baubles = Array.from({ length: 9 }, () => {
    const x = cx - 70 + random() * 140;
    const y = 120 + random() * 96;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="5" fill="${palette.accentAlt}"/>`;
  }).join('');
  return `${tiers}${baubles}<rect x="${cx - 12}" y="212" width="24" height="30" rx="4" fill="${palette.ink}" opacity="0.7"/>`;
}

function thread(random: () => number, palette: Palette): string {
  const cy = 134;
  const beads = Array.from({ length: 14 }, (_, n) => {
    const x = 46 + n * 40;
    const y = cy + Math.sin(n * 0.8) * 16;
    return `<circle cx="${x}" cy="${y.toFixed(0)}" r="${(5 + random() * 3).toFixed(0)}" fill="${palette.accentAlt}"/>`;
  }).join('');
  return `<path d="M40 ${cy} q 80 -34 160 0 t 160 0 t 160 0" fill="none" stroke="${palette.accent}" stroke-width="7" stroke-linecap="round"/>
  ${beads}
  <circle cx="${WIDTH / 2}" cy="${cy - 4}" r="30" fill="${palette.accent}"/>
  <circle cx="${WIDTH / 2}" cy="${cy - 4}" r="15" fill="${palette.accentAlt}"/>`;
}

function starShape(cx: number, cy: number, r: number, fill: string, opacity = 1): string {
  const points = Array.from({ length: 10 }, (_, n) => {
    const radius = n % 2 === 0 ? r : r * 0.44;
    const angle = (n / 10) * Math.PI * 2 - Math.PI / 2;
    return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
  }).join(' ');
  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"/>`;
}

function stars(random: () => number, palette: Palette): string {
  const big = starShape(WIDTH / 2, 130, 62, palette.accent);
  const small = Array.from({ length: 7 }, () => {
    const x = 40 + random() * (WIDTH - 80);
    const y = 40 + random() * 180;
    return starShape(x, y, 8 + random() * 10, palette.accentAlt, 0.6 + random() * 0.35);
  }).join('');
  return `${small}${big}`;
}

function trophy(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  return `<path d="M${cx - 46} 74 h92 v40 a46 46 0 0 1 -92 0 Z" fill="${palette.accent}"/>
  <path d="M${cx - 46} 82 h-26 a26 26 0 0 0 26 26 Z" fill="${palette.accentAlt}"/>
  <path d="M${cx + 46} 82 h26 a26 26 0 0 1 -26 26 Z" fill="${palette.accentAlt}"/>
  <rect x="${cx - 10}" y="158" width="20" height="34" fill="${palette.accentAlt}"/>
  <rect x="${cx - 44}" y="192" width="88" height="18" rx="5" fill="${palette.accent}"/>
  ${starShape(cx, 116, 20, '#ffffff', 0.75)}`;
}

function arrow(random: () => number, palette: Palette): string {
  const bars = Array.from({ length: 5 }, (_, n) => {
    const h = 34 + n * 26;
    return `<rect x="${(126 + n * 58).toFixed(0)}" y="${(206 - h).toFixed(0)}" width="38" height="${h}" rx="5" fill="${palette.accentAlt}" opacity="${(0.45 + n * 0.11).toFixed(2)}"/>`;
  }).join('');
  return `${bars}
  <path d="M120 176 L${(126 + 4 * 58 + 20).toFixed(0)} 74" fill="none" stroke="${palette.accent}" stroke-width="7" stroke-linecap="round"/>
  <path d="M${(126 + 4 * 58 + 20).toFixed(0)} 74 l -32 4 l 18 26 Z" fill="${palette.accent}" transform="rotate(${(random() * 4 - 2).toFixed(1)} ${(126 + 4 * 58 + 20).toFixed(0)} 74)"/>`;
}

function badge(_random: () => number, palette: Palette): string {
  const cx = WIDTH / 2;
  const cy = 126;
  return `<path d="M${cx - 30} ${cy + 44} L${cx - 44} ${cy + 128} L${cx} ${cy + 100} L${cx + 44} ${cy + 128} L${cx + 30} ${cy + 44} Z" fill="${palette.accentAlt}"/>
  <circle cx="${cx}" cy="${cy}" r="58" fill="${palette.accent}"/>
  <circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="4"/>
  ${starShape(cx, cy, 24, '#ffffff', 0.85)}`;
}

const MOTIF_PAINTERS: Record<Motif, (random: () => number, palette: Palette) => string> = {
  BALLOONS: balloons,
  RINGS: rings,
  HEARTS: hearts,
  CONFETTI: confetti,
  BLOOM: bloom,
  CIRCLES: circlesMotif,
  CLOVER: clover,
  HOUSE: house,
  RATTLE: rattle,
  CAP: cap,
  SUNSET: sunset,
  SPROUT: sprout,
  LAMP: lamp,
  BOW: bow,
  TREE: tree,
  THREAD: thread,
  STAR: stars,
  TROPHY: trophy,
  ARROW: arrow,
  BADGE: badge,
};

/**
 * One card face.
 *
 * The greeting sits on a band at the foot rather than over the motif: a
 * generated layout cannot know whether the art behind a word is light or dark,
 * and unreadable type on a gift card is the one thing that cannot be excused.
 */
function designSvg(occasion: Occasion, index: number): string {
  const random = makeRandom(hash(`gift:${occasion.id}:${index}`));
  const palette = paletteFor(occasion.hue, index);
  const paint = MOTIF_PAINTERS[occasion.motif];

  const bandHeight = 96;
  const bandY = HEIGHT - bandHeight;
  const greeting = escapeXml(occasion.greeting);
  // Long greetings need a smaller size or they run off the card.
  const fontSize = greeting.length > 22 ? 30 : greeting.length > 15 ? 36 : 44;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${greeting} gift card design">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.from}"/>
      <stop offset="100%" stop-color="${palette.to}"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#wash)"/>
  <!-- The motifs are drawn around (320, 140); scaling about that point fills the
       face above the band instead of leaving a dead strip across the middle.
       A uniform scale, so nothing that should be round comes out oval. -->
  <g transform="translate(320 148) scale(1.26) translate(-320 -148)">${paint(random, palette)}</g>

  <rect x="0" y="${bandY}" width="${WIDTH}" height="${bandHeight}" fill="${palette.dark ? 'rgba(0,0,0,0.34)' : 'rgba(255,255,255,0.78)'}"/>
  <rect x="0" y="${bandY}" width="${WIDTH}" height="3" fill="${palette.accent}"/>
  <text x="${WIDTH / 2}" y="${bandY + 60}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="700" fill="${palette.ink}">${greeting}</text>
</svg>
`;
}

/**
 * A brand tile.
 *
 * A wordmark set in type on a two-tone field, not a logo. These brands are
 * this store's own inventions, so there is nothing to reproduce -- and drawing
 * something logo-shaped for a brand that does not exist would only invite the
 * question of whose logo it was meant to be.
 *
 * The initial sits in a roundel so a tile is recognisable at grid size, where
 * the full name is barely legible.
 */
function brandSvg(brand: GiftBrand): string {
  const name = escapeXml(brand.name);
  const tagline = escapeXml(brand.tagline);
  const initial = escapeXml(brand.name.charAt(0).toUpperCase());
  const size = name.length > 18 ? 30 : name.length > 13 ? 36 : 42;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${name} gift card">
  <defs>
    <linearGradient id="brandwash" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${brand.hue} 54% 24%)"/>
      <stop offset="100%" stop-color="hsl(${brand.hueAlt} 58% 14%)"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#brandwash)"/>
  <circle cx="${WIDTH - 96}" cy="96" r="150" fill="hsl(${brand.hueAlt} 72% 56%)" opacity="0.16"/>
  <circle cx="72" cy="${HEIGHT - 48}" r="110" fill="hsl(${brand.hue} 78% 62%)" opacity="0.14"/>

  <circle cx="82" cy="86" r="34" fill="hsl(${brand.hue} 76% 62%)"/>
  <text x="82" y="99" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="700" fill="hsl(${brand.hue} 60% 14%)">${initial}</text>

  <text x="52" y="${HEIGHT / 2 + 26}" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="700" fill="#ffffff">${name}</text>
  <text x="54" y="${HEIGHT / 2 + 62}" font-family="system-ui, sans-serif" font-size="19" fill="#ffffff" opacity="0.72">${tagline}</text>

  <rect x="52" y="${HEIGHT - 74}" width="72" height="4" rx="2" fill="hsl(${brand.hueAlt} 82% 62%)"/>
  <text x="${WIDTH - 52}" y="${HEIGHT - 46}" text-anchor="end" font-family="system-ui, sans-serif" font-size="17" fill="#ffffff" opacity="0.6">gift card</text>
</svg>
`;
}

export function generateGiftCardArt(): number {
  mkdirSync(OUT_DIR, { recursive: true });

  // This script owns exactly the `<occasion>-NN.svg` files it writes. It
  // removes its own stale output so a shrunk occasion does not leave orphans,
  // and touches nothing else -- the rule the hero generator learned the hard
  // way when an `rmSync` destroyed user-supplied banners.
  const owned = new Set<string>();
  for (const occasion of OCCASIONS) {
    for (let index = 0; index < occasion.designs; index += 1) {
      const name = `${occasion.id}-${String(index).padStart(2, '0')}.svg`;
      writeFileSync(join(OUT_DIR, name), designSvg(occasion, index), 'utf8');
      owned.add(name);
    }
  }

  for (const brand of GIFT_BRANDS) {
    const name = `brand-${brand.id}.svg`;
    writeFileSync(join(OUT_DIR, name), brandSvg(brand), 'utf8');
    owned.add(name);
  }

  for (const name of readdirSync(OUT_DIR)) {
    if (!name.endsWith('.svg') || owned.has(name)) continue;
    unlinkSync(join(OUT_DIR, name));
  }

  return owned.size;
}

if (process.argv[1]?.endsWith('generate-giftcard-art.ts')) {
  console.log(`Drew ${generateGiftCardArt()} gift card faces in public/gift-cards/`);
}
