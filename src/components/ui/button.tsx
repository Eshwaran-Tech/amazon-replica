import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent-500 hover:bg-accent-600 active:bg-accent-700 text-brand-950 shadow-sm',
  secondary:
    'bg-surface border border-hairline text-ink hover:bg-surface-muted active:bg-surface-sunken',
  ghost: 'bg-transparent text-ink hover:bg-surface-muted',
  danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white',
};

/**
 * Minimum heights are 44px at `md` and above.
 *
 * That is the WCAG 2.5.5 target size, and on a phone it is the difference
 * between tapping "Add to cart" and tapping the product title next to it.
 */
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm sm:text-base',
  lg: 'min-h-12 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // Explicit default: a bare <button> inside a form submits it, which is a
      // common source of accidental submissions.
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold',
        'transition-colors duration-150',
        // Never remove the focus ring -- it is how a keyboard user knows where
        // they are. globals.css sets the colour; this keeps the offset sane.
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
