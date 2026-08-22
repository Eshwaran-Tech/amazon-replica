'use client';

import { ArrowRight, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { cn } from '@/lib/utils/cn';

import { HeroScene, type HeroTheme } from './hero-scene';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

/**
 * Reads the user's motion preference.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: a media query is
 * an external store, and subscribing to it with an effect means an extra render
 * pass and a window where the carousel auto-advances before we know the user
 * asked it not to. This also gives a correct server snapshot instead of a
 * hydration mismatch.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    // Server render: assume motion is allowed. The client corrects this on
    // hydration, long before the first 6-second advance would fire.
    () => false,
  );
}

export interface HeroSlide {
  id: string;
  /** Selects the animated 3D backdrop's palette and glyph. */
  theme: HeroTheme;
  badge: string;
  title: string;
  subtitle: string;
  /** Still fallback, used as the video poster when `video` is set. */
  image: string;
  /**
   * Optional looping background video (e.g. `/hero/gaming.mp4`).
   *
   * Drop an MP4 (H.264) or WebM into `public/hero/` and reference it here. It
   * plays muted, inline and looping -- the only combination browsers allow to
   * autoplay -- and falls back to `image` as the poster while it buffers, on
   * failure, and whenever the user prefers reduced motion.
   */
  video?: string;

  /**
   * A pre-composed banner image (e.g. `/hero/fashion.jpg`) whose headline, CTA
   * and badges are already part of the artwork.
   *
   * When set, the text overlay is **not** rendered -- drawing our own headline
   * over one that is baked into the image would double it. The whole slide
   * becomes a single link instead, and `title`/`subtitle` are used for the
   * image's alt text so the message is still available to screen readers,
   * which cannot read text that is part of a picture.
   */
  banner?: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}

interface HeroCarouselProps {
  slides: HeroSlide[];
  /** Milliseconds between automatic advances. */
  interval?: number;
}

/**
 * Full-bleed hero carousel.
 *
 * Carousels are usually an accessibility disaster, so the details here matter
 * more than the animation:
 *
 *  - `aria-roledescription="carousel"` and per-slide `"slide"` labels, so a
 *    screen reader announces what this is and where it is.
 *  - Auto-advance **pauses on hover and on keyboard focus**. Content that moves
 *    out from under someone mid-read is WCAG 2.2.2; pausing on focus is what
 *    makes it usable by keyboard at all.
 *  - Auto-advance is **disabled entirely** under `prefers-reduced-motion`. For
 *    users with vestibular disorders, motion is not decoration.
 *  - Arrow keys move between slides when the region has focus.
 *  - Only the active slide is in the tab order; `inert` on the others stops
 *    Tab from landing on an invisible "Shop now" button.
 *  - The live region announces changes politely rather than interrupting.
 *
 * The slide images are decorative (`alt=""`); the headline carries the meaning.
 */
/**
 * Theme-tinted scrims.
 *
 * A single neutral scrim flattens the artwork; tinting it to the slide's own
 * palette keeps the backdrop glowing through while still guaranteeing headline
 * contrast. Mirrors the `SCRIM` map in the reference implementation.
 */
const SCRIM: Record<HeroTheme, string> = {
  fashion: 'from-[#26060f]/95 via-[#5e1130]/65 to-transparent',
  electronics: 'from-[#04181c]/95 via-[#07333a]/70 to-transparent',
  gaming: 'from-[#150522]/95 via-[#340e52]/70 to-transparent',
  mobiles: 'from-[#0b1220]/95 via-[#1e293b]/70 to-transparent',
  home: 'from-[#032220]/95 via-[#064e47]/70 to-transparent',
  fitness: 'from-[#04200c]/95 via-[#0c4a1e]/70 to-transparent',
  deals: 'from-[#1c1004]/95 via-[#3c2405]/65 to-transparent',
};

export function HeroCarousel({ slides, interval = 5000 }: HeroCarouselProps) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  /**
   * Whether a drag is in progress, as *state* rather than a ref.
   *
   * The ref below holds the moment-to-moment pixel delta, which changes far too
   * often to re-render on. But render reads this flag (for the cursor and to
   * suspend the transform transition), and reading a ref during render is a
   * React rules violation -- it does not schedule a re-render, so the UI can
   * show a stale value. It flips twice per gesture, so the cost is nil.
   */
  const [isDragging, setIsDragging] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const regionRef = useRef<HTMLDivElement>(null);

  /**
   * Drag state lives in a ref, not state: it updates on every pointermove and
   * re-rendering at that rate would make the gesture stutter. Only the visual
   * offset is state.
   */
  const drag = useRef({ startX: 0, dx: 0, active: false });

  /**
   * Set when a gesture moved far enough to count as a drag, so the click that
   * follows a drag can be swallowed. Without this, dragging across a banner
   * (which is one large link) navigates on release.
   */
  const suppressClick = useRef(false);

  /** Rate-limits trackpad wheel gestures to one slide per swipe. */
  const wheelLockedUntil = useRef(0);

  const go = useCallback(
    (next: number) => setActive(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;

    const timer = setInterval(() => setActive((index) => (index + 1) % slides.length), interval);
    return () => clearInterval(timer);
  }, [paused, reducedMotion, interval, slides.length]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(active - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(active + 1);
    }
  }

  // --- pointer drag -------------------------------------------------------
  // Pointer Events rather than separate mouse/touch handlers: one code path
  // covers mouse, touch and pen, and `setPointerCapture` keeps the gesture
  // alive when the cursor leaves the element mid-drag.

  /** Past this many pixels the gesture is a drag, not a click. */
  const DRAG_THRESHOLD = 8;
  /** Past this, releasing changes slide. Below it, the slide snaps back. */
  const COMMIT_THRESHOLD = 60;

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Ignore right/middle click, and anything that is not a primary press.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    drag.current = { startX: event.clientX, dx: 0, active: true };
    suppressClick.current = false;
    setIsDragging(true);
    setPaused(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;

    drag.current.dx = event.clientX - drag.current.startX;
    if (Math.abs(drag.current.dx) > DRAG_THRESHOLD) suppressClick.current = true;

    // Damped so the slide trails the cursor rather than tracking it 1:1 --
    // it reads as resistance and makes the snap-back feel intentional.
    setDragOffset(drag.current.dx * 0.4);
  }

  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;

    const { dx } = drag.current;
    drag.current.active = false;
    setIsDragging(false);
    setDragOffset(0);
    setPaused(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dx <= -COMMIT_THRESHOLD) go(active + 1);
    else if (dx >= COMMIT_THRESHOLD) go(active - 1);
  }

  /**
   * Swallows the click that browsers fire after a drag ends. Capture phase, so
   * it runs before the link's own handler.
   */
  function onClickCapture(event: React.MouseEvent) {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
  }

  // --- trackpad / horizontal wheel ---------------------------------------
  /**
   * Horizontal scroll changes slide. Two sources produce it:
   *
   *  - a trackpad two-finger horizontal swipe, which reports real `deltaX`
   *  - Shift + wheel, the long-standing convention for horizontal scrolling.
   *    Most browsers already translate that into `deltaX`, but not all do on
   *    every platform, so `shiftKey` is honoured explicitly and the vertical
   *    delta is read as horizontal intent.
   *
   * A plain (unmodified) vertical wheel is deliberately **ignored**. A mouse
   * wheel has no horizontal axis, so treating its `deltaY` as "next slide"
   * would mean scrolling down the homepage never gets past the hero -- the
   * page would sit there cycling banners. Deliberate intent (drag, shift, or a
   * horizontal trackpad gesture) is the price of not trapping the scroll.
   */
  function onWheel(event: React.WheelEvent) {
    const horizontal = event.shiftKey
      ? event.deltaX || event.deltaY
      : Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : 0;

    if (Math.abs(horizontal) < 12) return;

    // A single trackpad swipe emits a long burst of events; without a lock it
    // would fly through every slide at once.
    const now = performance.now();
    if (now < wheelLockedUntil.current) return;
    wheelLockedUntil.current = now + 450;

    go(horizontal > 0 ? active + 1 : active - 1);
  }

  if (slides.length === 0) return null;

  return (
    <section
      ref={regionRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured promotions"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!regionRef.current?.contains(event.relatedTarget as Node)) setPaused(false);
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={onClickCapture}
      onWheel={onWheel}
      // `pan-y` hands vertical gestures back to the page so the carousel never
      // blocks scrolling on touch, while horizontal ones come to us.
      // `select-none` stops a drag turning into a text selection.
      className="relative isolate touch-pan-y overflow-hidden select-none"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* 500px / 560px from md, matching the reference. */}
      <div className="relative h-[500px] md:h-[560px]">
        {slides.map((slide, index) => {
          const isActive = index === active;

          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
              aria-hidden={!isActive}
              // Keeps Tab out of off-screen slides. React 19 supports `inert`
              // as a real boolean prop -- passing an empty string (the old HTML
              // idiom) makes React treat it as `false`, so the attribute is
              // silently never applied and hidden "Shop now" buttons stay
              // focusable. React logs a warning for exactly this mistake.
              inert={!isActive}
              // 900ms cross-fade, matching the reference's `speed`.
              className={cn(
                'absolute inset-0 transition-opacity duration-[900ms] ease-out',
                isActive ? 'opacity-100' : 'pointer-events-none opacity-0',
                // While dragging, the transform must not be animated or the
                // slide lags the cursor by the transition duration.
                !isDragging && 'transition-transform',
              )}
              style={
                isActive && dragOffset !== 0
                  ? { transform: `translateX(${dragOffset}px)` }
                  : undefined
              }
            >
              {/* ---------------------------------------------------------
                  Banner mode: a pre-composed image with its own headline and
                  CTA. No text overlay, no scrims -- the artwork is the whole
                  slide. The link carries an accessible name and the image an
                  alt, because a screen reader cannot read text baked into a
                  picture.
                  --------------------------------------------------------- */}
              {slide.banner ? (
                <Link
                  href={slide.primary.href}
                  aria-label={`${slide.title}. ${slide.subtitle}`}
                  className="group absolute inset-0 block"
                >
                  <Image
                    src={slide.banner}
                    alt={`${slide.title}. ${slide.subtitle}`}
                    fill
                    priority={index === 0}
                    sizes="100vw"
                    // These banners are ~3:2 while the hero band is ~2.6:1, so
                    // `cover` must crop somewhere. Anchoring to the top keeps
                    // the headline and the hero product shot, and sacrifices
                    // the banner's own bottom category strip -- which the page
                    // already has as a real "Shop by Category" section, so
                    // losing it removes a duplicate rather than content.
                    //
                    // On a phone the crop is horizontal too, so anchor left as
                    // well: every one of these banners sets its headline on the
                    // left.
                    className="hero-bg object-cover object-left-top sm:object-top"
                  />
                </Link>
              ) : null}

              {/* Backdrop precedence when there is no banner: a real video when
                  one has been dropped in, otherwise the animated 3D scene. The
                  scene is the default because it is a few KB,
                  resolution-independent, and needs no buffering -- video is an
                  upgrade, not a requirement. */}
              {slide.banner ? null : !slide.video ? (
                <HeroScene theme={slide.theme} />
              ) : !reducedMotion ? (
                <video
                  // `muted` + `playsInline` are not stylistic: without both,
                  // every mobile browser refuses to autoplay, and iOS would
                  // otherwise take the video fullscreen on play.
                  autoPlay
                  muted
                  loop
                  playsInline
                  // Shown while buffering and if the source fails, so the slide
                  // is never a blank rectangle.
                  poster={slide.image}
                  preload={index === 0 ? 'auto' : 'none'}
                  // Decorative: the headline carries the meaning.
                  aria-hidden="true"
                  tabIndex={-1}
                  className="absolute inset-0 h-full w-full object-cover"
                >
                  <source src={slide.video} />
                </video>
              ) : (
                <Image
                  src={slide.image}
                  alt=""
                  fill
                  unoptimized={slide.image.endsWith('.svg')}
                  priority={index === 0}
                  sizes="100vw"
                  // Slow Ken Burns zoom, so a still backdrop still breathes.
                  className="hero-bg object-cover"
                />
              )}

              {/* Scrims and the text overlay exist only for generated or video
                  backdrops. A banner already carries its own contrast and
                  copy. */}
              {slide.banner ? null : (
                <>
                  {/* Two scrims. The horizontal one is tinted to the slide's own
                      palette so the artwork glows through instead of being
                      flattened to grey; the vertical one darkens top and bottom,
                      where the nav bar and the overlapping category card sit. */}
                  <div className={cn('absolute inset-0 bg-gradient-to-r', SCRIM[slide.theme])} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
                </>
              )}

              {/* `pb-24` biases the content upward: the category card overlaps
                  the bottom of the hero, and centred text would sit behind it. */}
              <div
                className={cn(
                  'relative flex h-full items-center pb-20 sm:pb-24',
                  slide.banner && 'hidden',
                )}
              >
                <div className="mx-auto w-full max-w-[110rem] px-5 sm:px-6 lg:px-12">
                  <div className="max-w-2xl text-white">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide backdrop-blur-md">
                      {/* Pinging dot: a static one reads as a bullet, the pulse
                          reads as "live". Motion stops under reduced-motion. */}
                      <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="bg-accent-500 absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
                        <span className="bg-accent-500 relative inline-flex h-2 w-2 rounded-full" />
                      </span>
                      {slide.badge}
                    </span>

                    <h2 className="mt-5 text-4xl leading-[1.05] font-black tracking-tight drop-shadow-lg sm:text-5xl md:text-6xl">
                      {slide.title}
                    </h2>

                    <p className="mt-4 max-w-xl text-base text-gray-100/90 drop-shadow sm:text-lg md:text-xl">
                      {slide.subtitle}
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <Link
                        href={slide.primary.href}
                        className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-bold shadow-lg transition-colors sm:text-base"
                      >
                        {slide.primary.label}
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>

                      <Link
                        href={slide.secondary.href}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/5 px-6 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/15"
                      >
                        <Zap className="text-accent-400 h-4 w-4" aria-hidden="true" />
                        {slide.secondary.label}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ arrows */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(active - 1)}
            aria-label="Previous slide"
            className="absolute top-1/2 left-2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/70 sm:flex lg:left-5"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => go(active + 1)}
            aria-label="Next slide"
            className="absolute top-1/2 right-2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/70 sm:flex lg:right-5"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      )}

      {/* -------------------------------------------------------------- dots */}
      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 sm:bottom-6">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => go(index)}
              aria-label={`Go to slide ${index + 1}: ${slide.title}`}
              aria-current={index === active}
              // 44px tap target via padding, while the visible dot stays small.
              className="group flex h-11 w-6 items-center justify-center"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-all duration-300',
                  index === active
                    ? 'bg-accent-500 w-7'
                    : 'w-1.5 bg-white/45 group-hover:bg-white/80',
                )}
              />
            </button>
          ))}
        </div>
      )}

      {/* Politely announces the change; `atomic` so the whole sentence is read. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        Slide {active + 1} of {slides.length}: {slides[active]?.title}
      </p>
    </section>
  );
}
