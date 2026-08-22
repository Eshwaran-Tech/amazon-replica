import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

interface ContainerProps {
  children: ReactNode;
  className?: string;
  /** `wide` lets the catalog grid use the full monitor on large displays. */
  size?: 'default' | 'wide' | 'narrow';
  as?: 'div' | 'section' | 'header' | 'footer' | 'main' | 'nav';
}

const sizes = {
  narrow: 'max-w-3xl',
  default: 'max-w-[90rem]',
  wide: 'max-w-[110rem]',
} as const;

/**
 * Single source of truth for page gutters.
 *
 * The padding ramp (12px -> 16px -> 24px -> 32px) is what keeps content off the
 * screen edge on a 320px phone without wasting space on a 2560px monitor.
 */
export function Container({
  children,
  className,
  size = 'default',
  as: Tag = 'div',
}: ContainerProps) {
  return (
    <Tag className={cn('mx-auto w-full px-3 sm:px-4 lg:px-6 2xl:px-8', sizes[size], className)}>
      {children}
    </Tag>
  );
}
