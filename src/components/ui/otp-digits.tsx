'use client';

import { useId, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * Six single-digit boxes that submit as one field.
 *
 * The boxes are presentation. The value the form actually posts is the hidden
 * `code` input, so the Server Action's contract is unchanged -- it still
 * receives one six-character string under the same name, and its validation,
 * expiry and single-use rules are untouched.
 *
 * The behaviours people expect from this control, which it is not really a
 * text field without:
 *
 *  - typing advances, backspace on an empty box steps back;
 *  - a pasted code fills every box, because everyone pastes the code from the
 *    message rather than typing it;
 *  - arrow keys move between boxes;
 *  - non-digits are dropped rather than silently accepted and rejected later.
 *
 * A screen reader gets one labelled group and per-box position labels, so it
 * is announced as "digit 3 of 6" rather than six anonymous text fields.
 */

const LENGTH = 6;

interface OtpDigitsProps {
  /** Kept for assistive tech even though it is not drawn. */
  label: string;
  error?: string;
  name?: string;
}

export function OtpDigits({ label, error, name = 'code' }: OtpDigitsProps) {
  const groupId = useId();
  const errorId = `${groupId}-error`;
  const [digits, setDigits] = useState<string[]>(Array<string>(LENGTH).fill(''));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const value = digits.join('');
  function focusBox(index: number) {
    inputs.current[Math.min(Math.max(index, 0), LENGTH - 1)]?.focus();
  }

  function setDigit(index: number, digit: string) {
    setDigits((previous) => {
      const next = [...previous];
      next[index] = digit;
      return next;
    });
  }

  function onChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setDigit(index, digit);
    if (digit) focusBox(index + 1);
  }

  function onKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index]) {
      event.preventDefault();
      setDigit(index - 1, '');
      focusBox(index - 1);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusBox(index + 1);
    }
  }

  function onPaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;

    event.preventDefault();
    setDigits((previous) => {
      const next = [...previous];
      for (let offset = 0; offset < pasted.length && index + offset < LENGTH; offset += 1) {
        next[index + offset] = pasted[offset] ?? '';
      }
      return next;
    });
    focusBox(index + pasted.length);
  }

  return (
    <div>
      <span id={groupId} className="block text-xs font-semibold">
        {label}
      </span>

      {/* The value the action receives; the boxes above only compose it. */}
      <input type="hidden" name={name} value={value} />

      <div
        role="group"
        aria-labelledby={groupId}
        aria-describedby={error ? errorId : undefined}
        className="mt-1.5 flex gap-1.5"
      >
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            aria-label={`Digit ${index + 1} of ${LENGTH}`}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            onPaste={(event) => onPaste(index, event)}
            onFocus={(event) => event.target.select()}
            className={cn(
              'h-11 w-full min-w-0 rounded-full text-center font-mono text-base font-bold',
              'bg-surface-sunken text-ink outline-none transition-colors',
              // White by default so the six boxes read clearly against the
              // dark card, orange once one is focused so the active box is
              // obvious at a glance. Two pixels: a hairline white ring
              // disappears at this size.
              'border-2',
              error
                ? 'border-deal focus:ring-deal/30 focus:ring-2'
                : 'border-white focus:border-accent-500 focus:ring-accent-500/40 focus:ring-2',
            )}
          />
        ))}
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-deal mt-1.5 text-xs">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </div>
  );
}
