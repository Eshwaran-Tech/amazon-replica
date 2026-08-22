import 'server-only';

import { cookies } from 'next/headers';

import { LANGUAGE_COOKIE_NAME, languageByCode, type LanguageCode } from './languages';
import { MESSAGES, makeTranslate, type Messages, type Translate } from './messages';

/**
 * Server-side translation: reads the language cookie once per request and
 * returns a `t()` bound to that language's dictionary.
 */
export async function getLanguage(): Promise<LanguageCode> {
  const store = await cookies();
  return languageByCode(store.get(LANGUAGE_COOKIE_NAME)?.value).code;
}

export async function getMessages(): Promise<{ lang: LanguageCode; messages: Messages }> {
  const lang = await getLanguage();
  return { lang, messages: MESSAGES[lang] };
}

export async function getT(): Promise<{ lang: LanguageCode; t: Translate }> {
  const { lang, messages } = await getMessages();
  return { lang, t: makeTranslate(messages) };
}
