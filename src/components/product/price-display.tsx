import { cn } from '@/lib/utils/cn';
import { formatPaise, splitPaise, type Paise } from '@/lib/utils/money';

interface PriceDisplayProps {
  /** What the customer pays, in paise. */
  price: Paise;
  /** Pre-discount price, shown struck through when higher. */
  listPrice?: Paise | null;
  discountPercentage?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: { whole: 'text-base', symbol: 'text-xs', fraction: 'text-xs' },
  md: { whole: 'text-xl sm:text-2xl', symbol: 'text-sm', fraction: 'text-sm' },
  lg: { whole: 'text-2xl sm:text-3xl', symbol: 'text-base', fraction: 'text-base' },
} as const;

/**
 * Price with the rupee grouping Indian customers expect (1,23,456.78) and the
 * paise raised as a superscript.
 *
 * The screen-reader path is separate from the visual one: the split-superscript
 * layout reads as disconnected numbers to a screen reader, so the whole price
 * is announced once from `sr-only` text and the decorative parts are hidden
 * with `aria-hidden`.
 */
export function PriceDisplay({
  price,
  listPrice,
  discountPercentage,
  size = 'md',
  className,
}: PriceDisplayProps) {
  const { whole, fraction } = splitPaise(price);
  const style = sizes[size];
  const hasDiscount = typeof listPrice === 'number' && listPrice > price;

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5', className)}>
      <span className="sr-only">
        {formatPaise(price)}
        {hasDiscount ? `, reduced from ${formatPaise(listPrice)}` : ''}
      </span>

      <span aria-hidden="true" className="text-ink inline-flex items-baseline font-medium">
        <span className={cn('self-start leading-none', style.symbol)}>₹</span>
        <span className={cn('leading-none font-semibold', style.whole)}>{whole}</span>
        <span className={cn('self-start leading-none', style.fraction)}>{fraction}</span>
      </span>

      {hasDiscount && (
        <>
          {discountPercentage !== undefined && discountPercentage > 0 && (
            <span aria-hidden="true" className="text-deal text-sm font-semibold">
              -{discountPercentage}%
            </span>
          )}
          <span aria-hidden="true" className="text-ink-subtle text-sm line-through">
            {formatPaise(listPrice)}
          </span>
        </>
      )}
    </div>
  );
}
