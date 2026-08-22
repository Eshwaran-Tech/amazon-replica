import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils/cn';
import type { GiftDesign } from '@/services/gift-store';

/**
 * One card face on a grid.
 *
 * The whole tile is the link, and it carries the delivery type through to the
 * buy page, because "Video based" and "Physical" on the reference's rows are
 * choices about the *same* design rather than different products.
 */

interface Props {
  design: GiftDesign;
  /** Pre-selects a delivery type on the buy page. */
  delivery?: string;
  /** A caption under the tile, as the occasion rows carry. */
  caption?: string;
  priority?: boolean;
  className?: string;
}

export function DesignCard({ design, delivery, caption, priority, className }: Props) {
  const href = `/gift-cards/buy?design=${design.id}${delivery ? `&delivery=${delivery}` : ''}`;

  return (
    <Link
      href={href}
      className={cn(
        'group border-hairline bg-surface block overflow-hidden rounded-xl border transition-colors',
        'hover:border-accent-500',
        className,
      )}
    >
      <span className="relative block aspect-[8/5]">
        <Image
          src={design.artwork}
          alt={`${design.occasion.name} gift card design: ${design.greeting}`}
          fill
          sizes="(max-width: 640px) 45vw, 200px"
          priority={priority}
          className="object-cover"
        />
      </span>

      <span className="block px-2 py-1.5">
        <span className="text-ink-muted group-hover:text-link block truncate text-[11px]">
          {caption ?? design.occasion.name}
        </span>
      </span>
    </Link>
  );
}
