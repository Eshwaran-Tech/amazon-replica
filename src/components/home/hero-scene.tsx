import { cn } from '@/lib/utils/cn';

export type HeroTheme =
  'fashion' | 'electronics' | 'gaming' | 'mobiles' | 'home' | 'fitness' | 'deals';

/**
 * One object in a hero composition.
 *
 * `depth` drives both the parallax animation and the visual treatment: further
 * objects are fainter and thinner-stroked, which is what makes the layering
 * read as distance rather than as overlapping stickers.
 */
interface SceneObject {
  /** Path drawn on a 0-100 grid. */
  d: string;
  depth: 'far' | 'mid' | 'near';
  /** Position from the right edge, as a percentage. Text occupies the left. */
  right: number;
  /** Position from the top, as a percentage. */
  top: number;
  /** Rendered size in rem. */
  size: number;
}

/**
 * Animated 3D hero backdrops.
 *
 * Each slide gets a *composition* of objects drawn from its subject -- a
 * controller, monitor and headset for gaming; a shirt, dress and handbag for
 * fashion -- laid out at three depths inside a CSS `perspective` container,
 * over a receding floor grid and drifting glow orbs.
 *
 * Why not video: a few KB of markup instead of megabytes per slide, no
 * buffering, resolution-independent at 2560px, no footage licensing, and no
 * widening of the CSP. Video is still supported and takes priority when a file
 * is present -- see `heroVideoIfPresent`.
 *
 * **Zero JavaScript.** Every animation is CSS, so it runs before hydration and
 * this stays a Server Component. The global `prefers-reduced-motion` rule in
 * `globals.css` stops all motion for users who ask for it: the scene remains,
 * the movement does not.
 *
 * `aria-hidden`: decoration. The headline carries the meaning.
 */
export function HeroScene({ theme, className }: { theme: HeroTheme; className?: string }) {
  const objects = THEME_SCENES[theme];

  return (
    <div aria-hidden="true" data-hero-theme={theme} className={cn('hero-scene', className)}>
      <div className="hero-scene__sky" />

      {/* Receding floor: the perspective transform plus the scrolling
          background together read as travelling forward. */}
      <div className="hero-scene__floor">
        <div className="hero-scene__grid" />
      </div>

      <div className="hero-scene__orb hero-scene__orb--a" />
      <div className="hero-scene__orb hero-scene__orb--b" />
      <div className="hero-scene__orb hero-scene__orb--c" />

      <div className="hero-scene__stage">
        {objects.map((object, index) => (
          <svg
            key={index}
            viewBox="0 0 100 100"
            className={`hero-scene__shape hero-scene__shape--${object.depth}`}
            style={{
              right: `${object.right}%`,
              top: `${object.top}%`,
              width: `${object.size}rem`,
              height: `${object.size}rem`,
              // Stagger so the objects do not all drift in lockstep, which
              // would read as one rigid sheet rather than separate depths.
              animationDelay: `${index * -2.7}s`,
            }}
          >
            <path d={object.d} />
          </svg>
        ))}
      </div>

      {/* Left-to-right scrim: guarantees headline contrast whatever the
          animation happens to be doing underneath. */}
      <div className="hero-scene__scrim" />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Object library. Line art on a 0-100 grid, drawn to stay legible when scaled
   up to fill a 1920px hero.
   ------------------------------------------------------------------------- */

const GAME_CONTROLLER =
  'M32 40h36a17 17 0 0 1 16 22l-4 13a9 9 0 0 1-16 4l-7-8H43l-7 8a9 9 0 0 1-16-4l-4-13a17 17 0 0 1 16-22Zm-4 15v10m-5-5h10m32-2h.1m7 7h.1m-7 7h.1m-7-7h.1';
const MONITOR =
  'M12 18h76a5 5 0 0 1 5 5v44a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5Zm26 54v10h24V72M28 82h44M20 30h30m-30 8h18';
const HEADSET =
  'M22 56v-8a28 28 0 0 1 56 0v8M22 54h8a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5V59a5 5 0 0 1 5-5Zm48 0h8a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5h-8a5 5 0 0 1-5-5V59a5 5 0 0 1 5-5Zm-5 24v6a8 8 0 0 1-8 8h-9';

const PHONE =
  'M35 8h30a7 7 0 0 1 7 7v70a7 7 0 0 1-7 7H35a7 7 0 0 1-7-7V15a7 7 0 0 1 7-7Zm9 70h12M42 14h16';
const TABLET =
  'M10 20h80a6 6 0 0 1 6 6v48a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6Zm88 22v14M50 78h.1';
const SMARTWATCH = 'M34 30h32v40H34zM40 30V16h20v14M40 70v14h20V70M70 42h6v14h-6M50 42v10h8';

const MENS_SHIRT = 'M36 16 18 27l7 17 8-4v44h34V40l8 4 7-17-18-11-9 9h-10l-9-9Zm9 0a5 5 0 0 0 10 0';
const WOMENS_DRESS =
  'M38 12h24l-5 13 13 49a7 7 0 0 1-7 9H37a7 7 0 0 1-7-9l13-49-5-13Zm5 13h14M36 52h28';
const HANDBAG = 'M26 38h48l5 44H21l5-44Zm12 0V27a12 12 0 0 1 24 0v11M32 50h36';
const HIGH_HEEL = 'M18 62h34l22 12h10v10H18V62Zm34 0V40M74 84V74';

const MICROPHONE =
  'M50 10a11 11 0 0 1 11 11v24a11 11 0 0 1-22 0V21a11 11 0 0 1 11-11Zm-19 33a19 19 0 0 0 38 0M50 64v14M36 84h28M44 22h12m-12 9h12m-12 9h12';
const SPEAKER =
  'M24 8h52a5 5 0 0 1 5 5v74a5 5 0 0 1-5 5H24a5 5 0 0 1-5-5V13a5 5 0 0 1 5-5Zm26 20a11 11 0 1 1 0 22 11 11 0 0 1 0-22Zm0 30a17 17 0 1 1 0 34 17 17 0 0 1 0-34Zm0 8a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z';
const SOUND_WAVE = 'M14 50h8l6-22 8 44 8-58 8 72 8-58 8 44 6-22h8';
const HEADPHONES =
  'M20 58v-8a30 30 0 0 1 60 0v8M20 56h10a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V60a4 4 0 0 1 4-4Zm50 0h10a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H70a4 4 0 0 1-4-4V60a4 4 0 0 1 4-4Z';

const DUMBBELL = 'M12 40h9v20h-9zM79 40h9v20h-9zM25 32h10v36H25zM65 32h10v36H65zM35 50h30';
const KETTLEBELL =
  'M50 18a15 15 0 0 1 15 15v3h3a21 21 0 0 1 19 27 25 25 0 0 1-74 0 21 21 0 0 1 19-27h3v-3a15 15 0 0 1 15-15Zm0 8a7 7 0 0 0-7 7v3h14v-3a7 7 0 0 0-7-7Z';
const RUNNING_SHOE =
  'M10 52h18l12 10 20 4 16 6a10 10 0 0 1 8 10v6H10V52Zm18 0V38m14 24-6-14m20 18-6-12';
const WATER_BOTTLE =
  'M42 8h16v10H42zM38 18h24v14l4 8v44a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V40l4-8V18Zm0 24h24';

const SOFA = 'M12 44a8 8 0 0 1 16 0v14h44V44a8 8 0 0 1 16 0v30H12V44Zm16 14h44M20 74v8m60-8v8';
const FLOOR_LAMP = 'M32 30 50 8l18 22H32Zm18 0v50m-14 8h28M40 40h20';
const PLANT =
  'M40 56h20l-3 34H43l-3-34Zm10 0V32m0 0c-10 0-16-8-14-18 10-2 16 6 14 18Zm0 0c10 2 18-4 18-14-10-4-18 4-18 14Z';

const PRICE_TAG =
  'M54 12h26a6 6 0 0 1 6 6v26L48 82 16 50 54 12Zm16 14a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z';
const GIFT_BOX =
  'M14 40h72v46H14zM10 26h80v14H10zM50 26v60M50 26c-8 0-16-4-16-10s10-6 16 10Zm0 0c8 0 16-4 16-10s-10-6-16 10Z';
const PERCENT_BADGE =
  'M50 8 62 18l16-1 3 16 13 9-8 14 8 14-13 9-3 16-16-1-12 10-12-10-16 1-3-16-13-9 8-14-8-14 13-9 3-16 16 1L50 8Zm-9 26a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm18 22a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM38 66l24-32';

/**
 * Compositions, one per slide.
 *
 * Objects sit on the right two-thirds; the left is reserved for the headline.
 * Each theme mixes a hero object (near, large) with two or three supporting
 * ones further back.
 */
const THEME_SCENES: Record<HeroTheme, SceneObject[]> = {
  gaming: [
    { d: MONITOR, depth: 'far', right: 26, top: 8, size: 30 },
    { d: HEADSET, depth: 'mid', right: 4, top: 40, size: 20 },
    { d: GAME_CONTROLLER, depth: 'near', right: 12, top: 18, size: 34 },
  ],
  mobiles: [
    { d: TABLET, depth: 'far', right: 22, top: 14, size: 30 },
    { d: SMARTWATCH, depth: 'mid', right: 2, top: 48, size: 16 },
    { d: PHONE, depth: 'near', right: 14, top: 6, size: 28 },
  ],
  fashion: [
    { d: WOMENS_DRESS, depth: 'far', right: 26, top: 6, size: 30 },
    { d: HANDBAG, depth: 'mid', right: 4, top: 46, size: 17 },
    { d: HIGH_HEEL, depth: 'mid', right: 32, top: 58, size: 15 },
    { d: MENS_SHIRT, depth: 'near', right: 8, top: 10, size: 30 },
  ],
  electronics: [
    { d: SPEAKER, depth: 'far', right: 8, top: 4, size: 34 },
    { d: SOUND_WAVE, depth: 'mid', right: 20, top: 52, size: 26 },
    { d: HEADPHONES, depth: 'mid', right: 34, top: 12, size: 20 },
    { d: MICROPHONE, depth: 'near', right: 24, top: 14, size: 26 },
  ],
  fitness: [
    { d: KETTLEBELL, depth: 'far', right: 26, top: 12, size: 26 },
    { d: WATER_BOTTLE, depth: 'mid', right: 4, top: 34, size: 18 },
    { d: RUNNING_SHOE, depth: 'mid', right: 32, top: 58, size: 20 },
    { d: DUMBBELL, depth: 'near', right: 10, top: 24, size: 32 },
  ],
  home: [
    { d: FLOOR_LAMP, depth: 'far', right: 30, top: 4, size: 26 },
    { d: PLANT, depth: 'mid', right: 4, top: 34, size: 18 },
    { d: SOFA, depth: 'near', right: 10, top: 30, size: 34 },
  ],
  deals: [
    { d: GIFT_BOX, depth: 'far', right: 26, top: 12, size: 26 },
    { d: PERCENT_BADGE, depth: 'mid', right: 4, top: 42, size: 20 },
    { d: PRICE_TAG, depth: 'near', right: 12, top: 16, size: 30 },
  ],
};
