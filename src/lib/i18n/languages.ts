/**
 * Site language preference.
 *
 * The storefront's *content* is English today; the preference is real in the
 * sense that it is remembered per browser and applied to `<html lang>` (which
 * screen readers, hyphenation and spell-checking honour), and it is the hook
 * a future translated catalogue plugs into. Nothing here pretends a Hindi
 * page exists when it does not -- the picker says so.
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'hi', label: 'हिन्दी', short: 'HI' },
  { code: 'ta', label: 'தமிழ்', short: 'TA' },
  { code: 'te', label: 'తెలుగు', short: 'TE' },
  { code: 'kn', label: 'ಕನ್ನಡ', short: 'KN' },
  { code: 'ml', label: 'മലയാളം', short: 'ML' },
  { code: 'bn', label: 'বাংলা', short: 'BN' },
  { code: 'mr', label: 'मराठी', short: 'MR' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** Cookie name; not HttpOnly-sensitive but set server-side for consistency. */
export const LANGUAGE_COOKIE_NAME = 'nk_lang';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGES.some((language) => language.code === value);
}

export function languageByCode(code: string | undefined | null) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}
