import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils/cn';

/**
 * Promotional banner strip.
 *
 * The artwork (`pnpm banners:fetch`) is composed with the products clustered on
 * the right and deliberate empty space on the left, so every caption is laid
 * out over that left third and the image is anchored right -- at narrow widths
 * the crop eats the empty side rather than the merchandise.
 *
 * Most of the artwork is a pale studio set, which a white caption disappears
 * into, so each banner declares the tone of its own image and the caption
 * flips between near-black and white with a matching scrim behind it. That is
 * a property of the picture, not of the site theme, so it does not change when
 * the viewer switches theme.
 *
 * Every banner links somewhere real in the catalogue; none is decorative.
 */

export interface PromoBanner {
  id: string;
  /** Resolved from disk by the page; a banner without a file is not rendered. */
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  /** Brightness of the artwork itself, which decides the caption colour. */
  tone: 'light' | 'dark';
}

interface PromoBannersProps {
  /** The wide banner across the top. */
  feature?: PromoBanner;
  /** The row beneath it. */
  banners: PromoBanner[];
}

function BannerCard({ banner, feature = false }: { banner: PromoBanner; feature?: boolean }) {
  const light = banner.tone === 'light';

  return (
    <Link
      href={banner.href}
      className={cn(
        'group border-hairline relative block overflow-hidden rounded-2xl border',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40',
        'focus-visible:outline-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2',
        feature ? 'aspect-[16/9] sm:aspect-[1024/295]' : 'aspect-[16/9] lg:aspect-[16/10]',
      )}
    >
      <Image
        src={banner.image}
        alt=""
        fill
        sizes={feature ? '(max-width: 1024px) 100vw, 1024px' : '(max-width: 640px) 100vw, 33vw'}
        className="object-cover object-right transition-transform duration-500 group-hover:scale-[1.03]"
      />

      {/* Contrast under the caption only -- a scrim across the whole banner
          would grey out the product photography it exists to show off. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 bg-gradient-to-r',
          light
            ? 'from-white/95 via-white/70 to-transparent'
            : 'from-black/85 via-black/55 to-transparent',
        )}
      />

      <div
        className={cn(
          'absolute inset-y-0 left-0 flex flex-col justify-center gap-1 p-4 sm:gap-2 sm:p-6 lg:p-8',
          feature ? 'w-[68%] sm:w-1/2' : 'w-[72%]',
          light ? 'text-slate-900' : 'text-white',
        )}
      >
        <p
          className={cn(
            'text-[10px] font-bold tracking-[0.18em] uppercase sm:text-xs',
            light ? 'text-slate-600' : 'text-white/75',
          )}
        >
          {banner.eyebrow}
        </p>

        <p
          className={cn(
            'line-clamp-2 leading-tight font-bold tracking-tight',
            feature ? 'text-lg sm:text-2xl lg:text-4xl' : 'text-base sm:text-lg lg:text-xl',
          )}
        >
          {banner.title}
        </p>

        {/* The caption has to fit inside the artwork's empty side, and these
            banners are wide and short. Below `lg` the headline plus the button
            already fill that height, so the supporting line is dropped rather
            than clipped halfway through a word. */}
        <p
          className={cn(
            'hidden text-xs leading-snug lg:line-clamp-2 lg:block lg:text-sm',
            light ? 'text-slate-700' : 'text-white/80',
          )}
        >
          {banner.subtitle}
        </p>

        {/* A span, not a nested link: the whole card is already the anchor. */}
        <span
          className={cn(
            'mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:mt-2 sm:text-sm',
            'transition-transform duration-200 group-hover:translate-x-0.5',
            light ? 'bg-slate-900 text-white' : 'bg-white text-slate-900',
          )}
        >
          {banner.cta}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}

export function PromoBanners({ feature, banners }: PromoBannersProps) {
  if (!feature && banners.length === 0) return null;

  return (
    <div className="space-y-4 sm:space-y-5">
      {feature && <BannerCard banner={feature} feature />}

      {banners.length > 0 && (
        <ul
          className={cn(
            'grid gap-4 sm:gap-5',
            banners.length >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2',
          )}
        >
          {banners.map((banner) => (
            <li key={banner.id}>
              <BannerCard banner={banner} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
