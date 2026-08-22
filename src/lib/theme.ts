/**
 * Colour theme.
 *
 * Stored in a cookie rather than `localStorage`, so the server knows which
 * theme to render before the first byte reaches the browser. A theme read on
 * the client always arrives one paint too late -- the page renders dark, then
 * flips to light, and the flash is worst on exactly the slow connections that
 * can least afford it.
 *
 * `system` is not a third palette: it is the absence of a choice, which lets
 * the CSS `prefers-color-scheme` media query decide. That is why the cookie is
 * cleared rather than set to "system" -- the stylesheet's default *is* system.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE_NAME = 'nk_theme';

export const DEFAULT_THEME: Theme = 'system';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function themeFromCookie(value: string | undefined | null): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * What to put on `<html data-theme>`.
 *
 * `system` returns undefined: with no attribute the media query in
 * `globals.css` takes over, which is the whole point of it.
 */
export function themeAttribute(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}

export const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};
