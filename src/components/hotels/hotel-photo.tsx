import Image from 'next/image';

import { cn } from '@/lib/utils/cn';
import { PHOTO_POOL_SIZE } from '@/services/hotels';

import manifest from '@/data/hotel-photos.json';

/**
 * A listing's picture.
 *
 * The pool is freely licensed photography of real buildings, rooms and resorts
 * from Wikimedia Commons, fetched by the fetch script. Any slot
 * the fetcher could not fill falls back to the drawn scene that
 * `scripts/generate-hotel-art.ts` writes, so a listing always has something and
 * a thin network day never leaves a hole in the page.
 *
 * These are **not** photographs of the properties this store lists -- those are
 * generated and do not exist. They are generic architecture standing in for
 * them, which every page carrying one says in as many words, and which
 * `public/hotels/ATTRIBUTION.md` records along with the credits the licences
 * require.
 *
 * `offset` walks the pool so one property's gallery shows several different
 * pictures rather than the same one four times.
 */

interface ManifestEntry {
  slot: number;
  file: string;
}

/** Slot -> filename, for the slots that have a photograph. */
const PHOTOS = new Map<number, string>(
  (manifest as ManifestEntry[]).map((entry) => [entry.slot, entry.file]),
);

interface Props {
  index: number;
  offset?: number;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}

export function HotelPhoto({ index, offset = 0, alt, className, sizes, priority }: Props) {
  const slot = (((index + offset) % PHOTO_POOL_SIZE) + PHOTO_POOL_SIZE) % PHOTO_POOL_SIZE;
  const file = PHOTOS.get(slot) ?? `hotel-${String(slot).padStart(2, '0')}.svg`;

  return (
    <Image
      src={`/hotels/${file}`}
      alt={alt}
      fill
      sizes={sizes ?? '(max-width: 640px) 100vw, 320px'}
      priority={priority}
      className={cn('object-cover', className)}
    />
  );
}
