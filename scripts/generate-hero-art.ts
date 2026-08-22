/**
 * Generates the dark, full-bleed hero backdrops for the home carousel.
 *
 * Same reasoning as the product art: original, local, deterministic. Local
 * assets keep `img-src 'self'` honest and mean `next.config.ts` needs no remote
 * image allow-list (which would make `/_next/image` an open image proxy).
 *
 * Each slide gets a dark base with a category-tinted glow, an angular shard
 * field and a faint grid -- enough depth to sit behind large white type without
 * competing with it.
 *
 * Run: pnpm art
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HERO_DIR = join(process.cwd(), 'public', 'hero');

const WIDTH = 1920;
const HEIGHT = 780;

export interface HeroSlideArt {
  id: string;
  /** Base hue for the glow. */
  hue: number;
  /** Secondary hue for the accent shards. */
  accentHue: number;
}

export const HERO_SLIDE_ART: HeroSlideArt[] = [
  { id: 'gaming', hue: 268, accentHue: 320 },
  { id: 'electronics', hue: 205, accentHue: 190 },
  { id: 'mobiles', hue: 232, accentHue: 265 },
  { id: 'fashion', hue: 340, accentHue: 20 },
  { id: 'home', hue: 160, accentHue: 190 },
  { id: 'fitness', hue: 152, accentHue: 96 },
  { id: 'deals', hue: 28, accentHue: 45 },
];

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

function heroSvg(slide: HeroSlideArt, index: number): string {
  const random = makeRandom(0x9e3779b9 + index * 7919);

  // Angular shards on the right two-thirds, leaving the left clear for type.
  const shards = Array.from({ length: 16 }, (_, n) => {
    const x = 700 + random() * 1150;
    const y = random() * HEIGHT;
    const w = 60 + random() * 260;
    const h = 6 + random() * 26;
    const rotate = -30 + random() * 60;
    const opacity = (0.05 + random() * 0.18).toFixed(3);
    const hue = n % 3 === 0 ? slide.accentHue : slide.hue;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="${(h / 2).toFixed(1)}" fill="hsl(${hue} 90% 65%)" opacity="${opacity}" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`;
  }).join('');

  const orbs = Array.from({ length: 4 }, (_, n) => {
    const cx = 820 + random() * 1000;
    const cy = 80 + random() * (HEIGHT - 160);
    const r = 120 + random() * 300;
    const hue = n % 2 === 0 ? slide.hue : slide.accentHue;
    return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="url(#orb${n})" opacity="0.5"/>
    <radialGradient id="orb${n}" cx="50%" cy="50%">
      <stop offset="0%" stop-color="hsl(${hue} 85% 60%)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="hsl(${hue} 85% 60%)" stop-opacity="0"/>
    </radialGradient>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice" role="img">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${slide.hue} 42% 11%)"/>
      <stop offset="55%" stop-color="hsl(${slide.hue} 46% 7%)"/>
      <stop offset="100%" stop-color="hsl(${slide.accentHue} 40% 5%)"/>
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#05070c" stop-opacity="0.92"/>
      <stop offset="45%" stop-color="#05070c" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#05070c" stop-opacity="0.1"/>
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M64 0H0V64" fill="none" stroke="hsl(${slide.hue} 60% 70%)" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#base)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  ${orbs}
  ${shards}
  <!-- Left-to-right scrim: guarantees contrast for the headline regardless of
       what the generated shapes land on. -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>
</svg>
`;
}

export function generateHeroArt(): number {
  // NEVER `rmSync` this directory. It is shared with user-supplied banner
  // images and videos (see `heroImageIfPresent` / `heroVideoIfPresent`), and an
  // earlier version that cleared it destroyed seven user-uploaded banners as a
  // side effect of regenerating glyphs. This script owns exactly the
  // `<slide-id>.svg` files it writes, and touches nothing else.
  mkdirSync(HERO_DIR, { recursive: true });

  HERO_SLIDE_ART.forEach((slide, index) => {
    writeFileSync(join(HERO_DIR, `${slide.id}.svg`), heroSvg(slide, index), 'utf8');
  });

  return HERO_SLIDE_ART.length;
}

// Allow running this file directly as well as from the main art script.
if (process.argv[1]?.endsWith('generate-hero-art.ts')) {
  console.log(`Generated ${generateHeroArt()} hero backdrops in public/hero/`);
}
