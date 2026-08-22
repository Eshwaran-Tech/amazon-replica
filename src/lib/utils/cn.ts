import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names with Tailwind conflict resolution.
 * `cn('px-2', 'px-4')` yields `px-4` rather than emitting both and letting
 * stylesheet order decide.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
