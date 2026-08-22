import Image from 'next/image';

import { cn } from '@/lib/utils/cn';

interface ProductImageProps {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

/**
 * Product image.
 *
 * Uses `next/image` with `unoptimized` for SVG. That combination is deliberate:
 *
 * The image optimiser refuses SVG unless `dangerouslyAllowSVG` is enabled,
 * because an optimised-and-cached SVG served from our own origin could carry a
 * script. We leave that flag off. `unoptimized` bypasses `/_next/image`
 * entirely and emits a plain `<img>` -- and browsers script-sandbox SVG loaded
 * through `<img>`, so a hostile SVG could not execute even if one reached us.
 *
 * Raster sources still go through the optimiser normally.
 *
 * `alt` is required by the prop type. An empty string is a valid, meaningful
 * value for decoration, but it has to be chosen rather than forgotten.
 */
export function ProductImage({ src, alt, className, sizes, priority }: ProductImageProps) {
  const isVector = src.endsWith('.svg');

  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized={isVector}
      priority={priority}
      sizes={sizes ?? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw'}
      className={cn('object-contain', className)}
    />
  );
}
