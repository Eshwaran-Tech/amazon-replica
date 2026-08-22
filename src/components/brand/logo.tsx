import Image from 'next/image';

import { cn } from '@/lib/utils/cn';

/**
 * Brand configuration.
 *
 * The wordmark is data, not hard-coded markup, so the component works for any
 * brand name without editing JSX. Set these in `.env.local`:
 *
 *   NEXT_PUBLIC_BRAND_NAME        wordmark text        (default "amazon")
 *   NEXT_PUBLIC_BRAND_SUFFIX      small suffix         (default ".in")
 *   NEXT_PUBLIC_BRAND_LOGO        image, replaces the text wordmark entirely
 *   NEXT_PUBLIC_BRAND_LOGO_MARK   image for the compact mobile mark
 *
 * Image paths must be local, by the same rule as product images: a remote URL
 * would be fetched by the Next.js image optimiser, turning `/_next/image` into
 * a request forwarder. Anything not starting with a single `/` is ignored.
 */
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'amazon';
const BRAND_SUFFIX = process.env.NEXT_PUBLIC_BRAND_SUFFIX ?? '.in';
const BRAND_LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO;
const BRAND_LOGO_MARK = process.env.NEXT_PUBLIC_BRAND_LOGO_MARK;

function localAsset(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** First letter, for the compact monogram. */
const MONOGRAM = BRAND_NAME.charAt(0).toUpperCase();

interface LogoProps {
  className?: string;
  /** Mark only, for tight mobile headers. */
  markOnly?: boolean;
  /** `light` = white wordmark for the dark header; `dark` = black, for white pages. */
  tone?: 'light' | 'dark';
}

/**
 * Brand wordmark.
 *
 * Alignment notes, since this is the thing that usually goes wrong:
 *
 * - The suffix sits on the **same baseline** as the wordmark (`items-baseline`),
 *   not the same box. Aligning boxes makes a smaller suffix float visually high
 *   even though the CSS looks correct.
 *
 * - The accent stroke is absolutely positioned across the wordmark span at
 *   `w-full`, with `preserveAspectRatio="none"` so the curve stretches to
 *   whatever width the text actually occupies. It previously had a fixed
 *   `7.2rem` width, which only lined up for one specific string -- rename the
 *   brand and the stroke overhung or fell short.
 *
 * - `leading-none` on the wrapper removes the line-box padding that otherwise
 *   pushes the stroke away from the letterforms.
 *
 * - Real text, not SVG paths: it scales with the user's font settings, stays
 *   selectable, and is read correctly by assistive technology.
 */
export function Logo({ className, markOnly = false, tone = 'light' }: LogoProps) {
  const override = localAsset(markOnly ? (BRAND_LOGO_MARK ?? BRAND_LOGO) : BRAND_LOGO);

  if (override) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Image
          src={override}
          // Accessible name comes from the configured brand, so it can never
          // drift from what is rendered.
          alt={BRAND_NAME}
          width={markOnly ? 32 : 132}
          height={32}
          // `unoptimized` for SVG: the optimiser refuses it unless
          // `dangerouslyAllowSVG` is on, and an <img>-loaded SVG is
          // script-sandboxed by the browser. See `product-image.tsx`.
          unoptimized={override.endsWith('.svg')}
          priority
          className="h-8 w-auto object-contain"
        />
      </span>
    );
  }

  if (markOnly) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <span
          aria-hidden="true"
          className="bg-accent-500 text-brand-950 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-extrabold"
        >
          {MONOGRAM}
        </span>
        <span className="sr-only">{BRAND_NAME}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-baseline leading-none',
        tone === 'dark' ? 'text-neutral-900' : 'text-white',
        className,
      )}
    >
      {/* `relative` + `inline-block` makes this span the positioning context
          *and* shrink-wrap the text, which is what lets the stroke below
          inherit the exact rendered width. */}
      <span className="relative inline-block">
        <span className="block text-[26px] font-extrabold tracking-[-0.03em]">{BRAND_NAME}</span>

        {/* Accent stroke: spans the wordmark automatically at any length. */}
        <svg
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
          className="text-accent-500 absolute inset-x-0 -bottom-1.5 h-2 w-full"
        >
          <path
            d="M2 6 C 28 9, 68 9, 92 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </span>

      {BRAND_SUFFIX && (
        <span
          className={cn(
            'ml-0.5 text-[13px] font-semibold tracking-tight',
            tone === 'dark' ? 'text-neutral-800' : 'text-white/85',
          )}
        >
          {BRAND_SUFFIX}
        </span>
      )}
    </span>
  );
}
