'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/lib/utils/cn';

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}

/**
 * Password input with a show/hide toggle.
 *
 * The toggle is a genuine accessibility feature, not a gimmick: strong
 * passwords are long and easy to mistype, and being unable to check what you
 * typed pushes people toward shorter, weaker ones. It is a `<button>` with an
 * `aria-label` that reflects the current state, so it is reachable and
 * meaningful by keyboard.
 *
 * `autoComplete` is set correctly (`current-password` / `new-password`) so
 * password managers offer the right thing -- a manager that works is worth more
 * to real-world security than most client-side policy enforcement.
 */
export function PasswordField({
  id,
  name,
  label,
  error,
  hint,
  required,
  autoComplete = 'current-password',
  placeholder,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const errorId = `${id}-error-${generatedId}`;
  const hintId = `${id}-hint-${generatedId}`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
        {required && (
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

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            'bg-surface min-h-11 w-full rounded-md border py-2.5 pr-12 pl-3 text-base',
            error ? 'border-deal focus:border-deal' : 'border-hairline focus:border-link',
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="text-ink-muted hover:text-ink absolute top-1/2 right-1 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-deal text-sm font-medium">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}
