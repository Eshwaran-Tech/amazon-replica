'use client';

import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button, type ButtonSize, type ButtonVariant } from './button';

interface SubmitButtonProps {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  /** External disable (e.g. quantity at stock cap), OR-ed with pending. */
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Submit button wired to the enclosing form's pending state.
 *
 * Disabling while in flight is a correctness control as much as a UX one: a
 * double-clicked "Place order" is the classic way to create two orders and two
 * charges. (The server-side idempotency key in the checkout schema is the
 * authoritative guard -- this just stops the common case reaching it.)
 *
 * `aria-live` announces the state change, so a screen-reader user knows the
 * submission is in progress rather than being met with silence.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Working...',
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  disabled = false,
  'aria-label': ariaLabel,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
      disabled={pending || disabled}
      aria-busy={pending}
      aria-label={ariaLabel}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span aria-live="polite">{pendingLabel}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}
