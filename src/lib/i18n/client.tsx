'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { LanguageCode } from './languages';
import { makeTranslate, type Messages, type Translate } from './messages';

interface I18nContextValue {
  lang: LanguageCode;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Hands the current language's dictionary to Client Components. Mounted once
 * in the root layout with the dictionary the server chose from the cookie,
 * so server- and client-rendered text always agree.
 */
export function I18nProvider({
  lang,
  messages,
  children,
}: {
  lang: LanguageCode;
  messages: Messages;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ lang, t: makeTranslate(messages) }), [lang, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): Translate {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useT must be used inside <I18nProvider>');
  return context.t;
}

export function useLanguage(): LanguageCode {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useLanguage must be used inside <I18nProvider>');
  return context.lang;
}
