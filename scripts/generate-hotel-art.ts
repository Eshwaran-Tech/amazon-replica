/**
 * Generates the artwork pool for hotel listings.
 *
 * Original, local, deterministic -- the same reasoning as the hero and product
 * art. Local assets keep `img-src 'self'` honest and mean `next.config.ts`
 * needs no remote image allow-list (which would make `/_next/image` an open
 * image proxy).
 *
 * There is a second reason here, and it is the stronger one. The properties on
 * this store's hotel pages are generated: they do not exist. Putting a real
 * photograph of a real hotel beside a made-up name and a made-up tariff would
 * be the one dishonest thing on the page, whatever the licence said. Drawn
 * artwork cannot be mistaken for a photograph of a building somebody could turn
 * up at.
 *
 * Each piece is a flat vector scene -- a facade, a pool, a shoreline, a room.
 *
 * Colour is assigned by *role*, not by walking the hue wheel. An earlier
 * version stepped the hue by the golden angle for variety and produced lime
 * skies over magenta swimming pools: variety is worth nothing if the result
 * cannot be a place. Sea is sea-coloured, foliage is green, sand is sand. Only
 * the time of day and the accents move.
 *
 * Run: pnpm tsx scripts/generate-hotel-art.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = join(process.cwd(), 'public', 'hotels');

const WIDTH = 800;
const HEIGHT = 520;

/** Must match `PHOTO_POOL_SIZE` in `services/hotels.ts`. */
const POOL_SIZE = 24;

type Scene = 'FACADE' | 'POOL' | 'SHORE' | 'ROOM';

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

interface Sky {
  name: string;
  top: string;
  mid: string;
  bottom: string;
  /** The sun or moon; null for an overcast noon. */
  orb: string | null;
  /** How dark the scene under it should sit, 0 (noon) to 1 (night). */
  dusk: number;
}

/** Four believable times of day. Nothing else is offered. */
const SKIES: Sky[] = [
  {
    name: 'noon',
    top: 'hsl(206 72% 58%)',
    mid: 'hsl(199 66% 72%)',
    bottom: 'hsl(192 52% 84%)',
    orb: 'hsl(48 96% 82%)',
    dusk: 0,
  },
  {
    name: 'golden',
    top: 'hsl(30 84% 60%)',
    mid: 'hsl(38 88% 70%)',
    bottom: 'hsl(46 82% 82%)',
    orb: 'hsl(40 98% 76%)',
    dusk: 0.35,
  },
  {
    name: 'dusk',
    top: 'hsl(248 46% 34%)',
    mid: 'hsl(318 40% 50%)',
    bottom: 'hsl(24 70% 64%)',
    orb: 'hsl(20 92% 68%)',
    dusk: 0.7,
  },
  {
    name: 'night',
    top: 'hsl(222 52% 14%)',
    mid: 'hsl(216 46% 22%)',
    bottom: 'hsl(206 38% 32%)',
    orb: 'hsl(210 40% 88%)',
    dusk: 1,
  },
];

/** The fallback sky, so an index arithmetic slip cannot produce no sky at all. */
const NOON: Sky = SKIES[0] as Sky;

/** Fixed roles. Sea is sea-coloured whatever else is going on. */
const SEA = (shift: number, dusk: number) =>
  `hsl(${(190 + shift).toFixed(0)} ${(62 - dusk * 22).toFixed(0)}% ${(42 - dusk * 18).toFixed(0)}%)`;
const FOLIAGE = (shift: number, dusk: number) =>
  `hsl(${(118 + shift).toFixed(0)} ${(42 - dusk * 14).toFixed(0)}% ${(28 - dusk * 12).toFixed(0)}%)`;
const SAND = (dusk: number) =>
  `hsl(42 ${(56 - dusk * 18).toFixed(0)}% ${(80 - dusk * 34).toFixed(0)}%)`;
const STONE = (shift: number, dusk: number, light: number) =>
  `hsl(${(28 + shift).toFixed(0)} ${(14 - dusk * 4).toFixed(0)}% ${(light - dusk * 10).toFixed(0)}%)`;

function orb(random: () => number, sky: Sky): string {
  if (!sky.orb) return '';
  const cx = 110 + random() * (WIDTH - 220);
  const cy = 54 + random() * 86;
  const r = 26 + random() * 20;
  return `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${sky.orb}" opacity="${sky.name === 'noon' ? 0.75 : 0.92}"/>`;
}

/** Stars, but only after dark -- a noon sky with stars reads as a mistake. */
function stars(random: () => number, sky: Sky): string {
  if (sky.dusk < 0.6) return '';
  return Array.from({ length: sky.dusk > 0.9 ? 40 : 16 }, () => {
    const x = random() * WIDTH;
    const y = random() * (HEIGHT * 0.5);
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.8 + random() * 1.4).toFixed(1)}" fill="#ffffff" opacity="${(0.25 + random() * 0.55).toFixed(2)}"/>`;
  }).join('');
}

/** A grid of lit and unlit windows -- what reads as "building" at card size. */
function windows(
  random: () => number,
  box: { x: number; y: number; w: number; h: number },
  dusk: number,
): string {
  const cols = Math.max(2, Math.round(box.w / 36));
  const rows = Math.max(2, Math.round(box.h / 42));
  const pad = 10;
  const cellW = (box.w - pad * 2) / cols;
  const cellH = (box.h - pad * 2) / rows;
  // Nobody has every light on at noon, and few have them all off at midnight.
  const litChance = 0.12 + dusk * 0.55;

  const panes: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lit = random() < litChance;
      panes.push(
        `<rect x="${(box.x + pad + col * cellW + cellW * 0.16).toFixed(1)}" y="${(box.y + pad + row * cellH + cellH * 0.2).toFixed(1)}" width="${(cellW * 0.68).toFixed(1)}" height="${(cellH * 0.56).toFixed(1)}" rx="2" fill="${lit ? 'hsl(44 94% 72%)' : 'hsl(206 24% 30%)'}" opacity="${lit ? 0.95 : 0.5}"/>`,
      );
    }
  }
  return panes.join('');
}

function palms(random: () => number, count: number, dusk: number, shift: number): string {
  const trunk = FOLIAGE(shift - 40, dusk);
  const leaf = FOLIAGE(shift, dusk);

  return Array.from({ length: count }, () => {
    const x = 50 + random() * (WIDTH - 100);
    const base = HEIGHT - 46 - random() * 46;
    const height = 96 + random() * 92;
    const lean = -18 + random() * 36;
    const top = base - height;

    const fronds = Array.from({ length: 7 }, (_, n) => {
      const angle = -168 + n * 36 + random() * 10;
      const rad = (angle * Math.PI) / 180;
      const length = 36 + random() * 26;
      return `<path d="M${(x + lean).toFixed(1)} ${top.toFixed(1)} q ${(Math.cos(rad) * length * 0.6).toFixed(1)} ${(Math.sin(rad) * length * 0.6 - 12).toFixed(1)} ${(Math.cos(rad) * length).toFixed(1)} ${(Math.sin(rad) * length).toFixed(1)}" fill="none" stroke="${leaf}" stroke-width="6" stroke-linecap="round"/>`;
    }).join('');

    return `<path d="M${x.toFixed(1)} ${base.toFixed(1)} Q ${(x + lean * 0.4).toFixed(1)} ${(base - height / 2).toFixed(1)} ${(x + lean).toFixed(1)} ${top.toFixed(1)}" fill="none" stroke="${trunk}" stroke-width="8" stroke-linecap="round"/>${fronds}`;
  }).join('');
}

function facade(random: () => number, sky: Sky, shift: number): string {
  const ground = HEIGHT - 96;

  const blocks = Array.from({ length: 3 + Math.floor(random() * 3) }, (_, n) => {
    const w = 96 + random() * 140;
    const x = 30 + n * (WIDTH / 5.4) + random() * 26;
    const h = 150 + random() * 210;
    const y = ground - h;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" rx="6" fill="${STONE(shift, sky.dusk, 34 - n * 2)}"/>${windows(random, { x, y, w, h }, sky.dusk)}`;
  }).join('');

  // A porte-cochere and an awning, so the middle block reads as the entrance.
  const door = WIDTH / 2 - 46;

  return `${blocks}
  <rect x="0" y="${ground}" width="${WIDTH}" height="${HEIGHT - ground}" fill="${STONE(shift, sky.dusk, 22)}"/>
  <rect x="0" y="${ground}" width="${WIDTH}" height="3" fill="hsl(44 80% 62%)" opacity="0.45"/>
  <rect x="${door.toFixed(0)}" y="${(ground - 62).toFixed(0)}" width="92" height="62" rx="4" fill="hsl(44 90% 68%)" opacity="${(0.35 + sky.dusk * 0.5).toFixed(2)}"/>
  <rect x="${(door - 22).toFixed(0)}" y="${(ground - 78).toFixed(0)}" width="136" height="14" rx="6" fill="${STONE(shift, sky.dusk, 42)}"/>
  ${palms(random, 2, sky.dusk, shift)}`;
}

function pool(random: () => number, sky: Sky, shift: number): string {
  const deckTop = HEIGHT - 262;
  const poolTop = HEIGHT - 186;

  const loungers = Array.from({ length: 3 }, (_, n) => {
    const x = 62 + n * 196 + random() * 30;
    const y = deckTop + 22;
    return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})">
      <rect x="0" y="14" width="72" height="9" rx="4" fill="hsl(40 26% ${(92 - sky.dusk * 44).toFixed(0)}%)"/>
      <rect x="50" y="-3" width="24" height="19" rx="4" fill="hsl(40 26% ${(92 - sky.dusk * 44).toFixed(0)}%)" transform="rotate(-24 50 -3)"/>
      <rect x="4" y="23" width="6" height="12" rx="3" fill="${STONE(shift, sky.dusk, 30)}"/>
      <rect x="62" y="23" width="6" height="12" rx="3" fill="${STONE(shift, sky.dusk, 30)}"/>
    </g>`;
  }).join('');

  const ripples = Array.from({ length: 8 }, () => {
    const y = poolTop + 18 + random() * 118;
    const x = 56 + random() * (WIDTH - 220);
    const w = 60 + random() * 160;
    return `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="4" rx="2" fill="#ffffff" opacity="${(0.12 + random() * 0.26).toFixed(2)}"/>`;
  }).join('');

  return `<rect x="0" y="${deckTop}" width="${WIDTH}" height="${(HEIGHT - deckTop).toFixed(0)}" fill="${SAND(sky.dusk * 0.8)}"/>
  ${loungers}
  <rect x="34" y="${poolTop}" width="${WIDTH - 68}" height="156" rx="16" fill="${SEA(shift, sky.dusk)}"/>
  <rect x="34" y="${poolTop}" width="${WIDTH - 68}" height="156" rx="16" fill="url(#water)"/>
  ${ripples}
  ${palms(random, 2, sky.dusk, shift)}`;
}

function shore(random: () => number, sky: Sky, shift: number): string {
  const horizon = HEIGHT - 232;

  const waves = Array.from({ length: 5 }, (_, n) => {
    const y = horizon + n * 30;
    const lift = 8 + random() * 14;
    return `<path d="M0 ${y.toFixed(0)} q ${(WIDTH / 4).toFixed(0)} ${(-lift).toFixed(0)} ${(WIDTH / 2).toFixed(0)} 0 t ${(WIDTH / 2).toFixed(0)} 0 V ${HEIGHT} H0 Z" fill="${SEA(shift - n * 3, Math.max(0, sky.dusk - n * 0.06))}" opacity="${(0.95 - n * 0.06).toFixed(2)}"/>`;
  }).join('');

  const foam = Array.from({ length: 4 }, () => {
    const y = HEIGHT - 96 - random() * 40;
    const x = random() * WIDTH;
    return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(50 + random() * 70).toFixed(0)}" ry="5" fill="#ffffff" opacity="${(0.2 + random() * 0.3).toFixed(2)}"/>`;
  }).join('');

  return `${waves}
  ${foam}
  <path d="M0 ${HEIGHT - 74} q ${(WIDTH / 3).toFixed(0)} -24 ${(WIDTH * 0.66).toFixed(0)} 6 T ${WIDTH} ${HEIGHT - 62} V ${HEIGHT} H0 Z" fill="${SAND(sky.dusk)}"/>
  ${palms(random, 3, sky.dusk, shift)}`;
}

function room(random: () => number, sky: Sky, shift: number): string {
  const wall = STONE(shift, 0.15, 26);
  const linen = `hsl(38 22% ${(92 - sky.dusk * 12).toFixed(0)}%)`;
  const bedX = 158;
  const bedY = HEIGHT - 236;

  const pillows = Array.from(
    { length: 2 },
    (_, n) =>
      `<rect x="${(bedX + 30 + n * 132).toFixed(0)}" y="${(bedY + 18).toFixed(0)}" width="112" height="52" rx="14" fill="${linen}"/>`,
  ).join('');

  return `<rect width="${WIDTH}" height="${HEIGHT}" fill="${wall}"/>
  <!-- The window is the light source, so the rest of the scene reads as indoors. -->
  <rect x="${WIDTH - 258}" y="56" width="208" height="232" rx="8" fill="${sky.mid}"/>
  <rect x="${WIDTH - 258}" y="56" width="208" height="232" rx="8" fill="url(#glow)"/>
  <rect x="${(WIDTH - 158).toFixed(0)}" y="56" width="4" height="232" fill="${STONE(shift, 0.4, 18)}"/>
  <rect x="${(WIDTH - 268).toFixed(0)}" y="46" width="228" height="10" rx="4" fill="${STONE(shift, 0.2, 34)}"/>
  <rect x="${bedX}" y="${bedY}" width="428" height="152" rx="10" fill="${STONE(shift, 0.1, 36)}"/>
  <rect x="${bedX}" y="${(bedY + 74).toFixed(0)}" width="428" height="78" rx="10" fill="${linen}"/>
  <rect x="${bedX}" y="${(bedY + 108).toFixed(0)}" width="428" height="20" fill="hsl(${(196 + shift).toFixed(0)} 34% 46%)" opacity="0.55"/>
  ${pillows}
  <rect x="${(bedX - 64).toFixed(0)}" y="${(bedY + 58).toFixed(0)}" width="50" height="94" rx="6" fill="${STONE(shift, 0.3, 30)}"/>
  <circle cx="${(bedX - 39).toFixed(0)}" cy="${(bedY + 36).toFixed(0)}" r="17" fill="hsl(44 92% 72%)" opacity="0.9"/>
  <circle cx="${(bedX - 39).toFixed(0)}" cy="${(bedY + 36).toFixed(0)}" r="42" fill="url(#lamp)"/>
  <rect x="0" y="${HEIGHT - 62}" width="${WIDTH}" height="62" fill="${STONE(shift, 0.5, 20)}"/>
  <rect x="${(WIDTH - 210).toFixed(0)}" y="${(HEIGHT - 156).toFixed(0)}" width="150" height="16" rx="4" fill="${STONE(shift, 0.2, 34)}"/>`;
}

function artFor(index: number): string {
  const random = makeRandom(0x9e3779b9 + index * 2654435761);
  const scene: Scene = (['FACADE', 'POOL', 'SHORE', 'ROOM'] as const)[index % 4] ?? 'FACADE';
  // Times of day cycle at a different rate from scenes, so a facade is not
  // always at noon and a shore is not always at dusk.
  const sky = SKIES[(index * 3 + Math.floor(index / 4)) % SKIES.length] ?? NOON;
  const shift = -10 + (index % 7) * 3;

  const body =
    scene === 'FACADE'
      ? facade(random, sky, shift)
      : scene === 'POOL'
        ? pool(random, sky, shift)
        : scene === 'SHORE'
          ? shore(random, sky, shift)
          : room(random, sky, shift);

  const backdrop =
    scene === 'ROOM'
      ? ''
      : `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>${stars(random, sky)}${orb(random, sky)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" preserveAspectRatio="xMidYMid slice" role="img">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${sky.top}"/>
      <stop offset="58%" stop-color="${sky.mid}"/>
      <stop offset="100%" stop-color="${sky.bottom}"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.2"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="34%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lamp" cx="50%" cy="50%">
      <stop offset="0%" stop-color="hsl(44 92% 72%)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="hsl(44 92% 72%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${backdrop}
  ${body}
</svg>
`;
}

export function generateHotelArt(): number {
  // This script owns exactly the `hotel-NN.svg` files it writes and touches
  // nothing else in the directory -- the same rule the hero generator learned
  // the hard way when an `rmSync` destroyed user-supplied banners.
  mkdirSync(OUT_DIR, { recursive: true });

  for (let index = 0; index < POOL_SIZE; index += 1) {
    writeFileSync(
      join(OUT_DIR, `hotel-${String(index).padStart(2, '0')}.svg`),
      artFor(index),
      'utf8',
    );
  }

  return POOL_SIZE;
}

if (process.argv[1]?.endsWith('generate-hotel-art.ts')) {
  console.log(`Generated ${generateHotelArt()} hotel scenes in public/hotels/`);
}
