'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useRef, type ReactNode } from 'react';

import { setThemeAction } from '@/actions/preferences';
import { THEMES, THEME_LABELS, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils/cn';

interface ThemeToggleProps {
  current: Theme;
  csrfField: ReactNode;
}

const ICONS: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * Light / dark / system, as a three-way segmented control.
 *
 * A real `<form>` posting a Server Action, like the language picker: the
 * choice survives without any client-side theme state, and the server renders
 * the next page already in the chosen theme.
 *
 * A radio group rather than a single toggle button, because there are three
 * states and "system" is a meaningful one -- a two-way switch would have no
 * way to say "follow my device", which is the setting most people actually
 * want.
 */
export function ThemeToggle({ current, csrfField }: ThemeToggleProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={setThemeAction}>
      {csrfField}

      <fieldset className="flex items-center gap-0.5">
        <legend className="sr-only">Colour theme</legend>

        {THEMES.map((theme) => {
          const Icon = ICONS[theme];
          const active = current === theme;

          return (
            <label
              key={theme}
              title={THEME_LABELS[theme]}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded p-1.5 transition-colors',
                active
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <input
                type="radio"
                name="theme"
                value={theme}
                defaultChecked={active}
                onChange={() => formRef.current?.requestSubmit()}
                className="sr-only"
              />
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{THEME_LABELS[theme]}</span>
            </label>
          );
        })}
      </fieldset>
    </form>
  );
}
