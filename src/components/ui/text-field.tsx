import type { InputHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/**
 * A labelled text input with accessible error reporting.
 *
 * The accessibility details here are not decoration:
 *
 * - A real `<label htmlFor>`, so a screen reader announces the field and a tap
 *   on the label focuses it (a bigger touch target on a phone).
 * - `aria-invalid` marks the field as errored for assistive technology, which
 *   a red border alone does not communicate.
 * - `aria-describedby` ties the message to the field, so it is read out on
 *   focus rather than being an orphaned line of red text.
 * - `role="alert"` announces the error when it appears after submission.
 * - The error is also prefixed with an icon-free "Error:" for screen readers
 *   via `sr-only`, so meaning does not depend on colour (WCAG 1.4.1).
 */
export function TextField({ id, label, error, hint, className, ...props }: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {props.required && (
          <span className="text-deal ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-ink-muted text-xs">
          {hint}
        </p>
      )}

      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'bg-surface w-full rounded-md border px-3 py-2.5 text-base',
          // 16px minimum font size: anything smaller makes iOS Safari zoom the
          // whole page on focus, which reads as a layout bug.
          'min-h-11',
          error ? 'border-deal focus:border-deal' : 'border-hairline focus:border-link',
          'placeholder:text-ink-subtle',
          className,
        )}
        {...props}
      />

      {error && (
        <p id={errorId} role="alert" className="text-deal text-sm font-medium">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}
