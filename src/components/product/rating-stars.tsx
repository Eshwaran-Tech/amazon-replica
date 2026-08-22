import { cn } from '@/lib/utils/cn';

interface RatingStarsProps {
  /** 0-5, may be fractional. */
  rating: number;
  reviewCount?: number;
  size?: 'sm' | 'md';
  className?: string;
}

const sizes = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
} as const;

/**
 * Star rating.
 *
 * Rendered as a clipped overlay rather than five discrete icons, so 4.3 stars
 * genuinely shows 4.3 rather than rounding to 4 -- the rounding is where a
 * rating display quietly starts lying.
 *
 * The stars are `aria-hidden` and the value is announced as text: "Rated 4.3
 * out of 5" is useful, while five separate star glyphs are noise.
 */
export function RatingStars({ rating, reviewCount, size = 'sm', className }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, rating));
  const percentage = (clamped / 5) * 100;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="sr-only">
        Rated {clamped.toFixed(1)} out of 5
        {typeof reviewCount === 'number' ? ` from ${reviewCount} reviews` : ''}
      </span>

      <span aria-hidden="true" className="relative inline-flex">
        {/* Empty track */}
        <span className="inline-flex">
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(sizes[size], 'text-hairline')} />
          ))}
        </span>
        {/* Filled overlay, clipped to the exact fraction */}
        <span
          className="absolute inset-0 inline-flex overflow-hidden"
          style={{ width: `${percentage}%` }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(sizes[size], 'text-accent-500 shrink-0')} />
          ))}
        </span>
      </span>

      {typeof reviewCount === 'number' && (
        <span aria-hidden="true" className="text-link text-xs">
          {reviewCount.toLocaleString('en-IN')}
        </span>
      )}
    </span>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 1.6l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.88l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L10 1.6z" />
    </svg>
  );
}
