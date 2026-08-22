'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { isLanguageCode, LANGUAGE_COOKIE_NAME } from '@/lib/i18n/languages';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { isTheme, THEME_COOKIE_NAME } from '@/lib/theme';

/**
 * Site preferences that live in cookies, not on the account: they apply to a
 * browser, signed in or not.
 */

async function verifyActionCsrf(formData: FormData): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);
  return verifyCsrf(cookieToken, typeof submitted === 'string' ? submitted : null, subject).ok;
}

export async function setLanguageAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) return;

  const code = formData.get('language');
  if (!isLanguageCode(code)) return;

  const store = await cookies();
  store.set(LANGUAGE_COOKIE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  // The header label and <html lang> come from this cookie.
  revalidatePath('/', 'layout');
}

export async function setThemeAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) return;

  const theme = formData.get('theme');
  if (!isTheme(theme)) return;

  const store = await cookies();

  if (theme === 'system') {
    // Cleared rather than stored: with no cookie there is no `data-theme`
    // attribute, and `prefers-color-scheme` in the stylesheet decides. Storing
    // the string "system" would mean the same thing but leave a cookie behind
    // for a preference the visitor just switched off.
    store.delete(THEME_COOKIE_NAME);
  } else {
    store.set(THEME_COOKIE_NAME, theme, {
      // Not httpOnly: this is a display preference with no security value, and
      // leaving it readable lets a future client-side control read it without
      // a round trip. It is still SameSite=Lax and path-scoped.
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // `<html data-theme>` is rendered by the root layout, so the whole tree
  // has to be revalidated for the change to take effect.
  revalidatePath('/', 'layout');
}
