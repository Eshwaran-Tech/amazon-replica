import type { LanguageCode } from '../languages';

import { bn } from './bn';
import { en, type MessageKey, type Messages } from './en';
import { hi } from './hi';
import { kn } from './kn';
import { ml } from './ml';
import { mr } from './mr';
import { ta } from './ta';
import { te } from './te';

export type { MessageKey, Messages };

/** Every language the picker offers, fully translated (enforced by the type). */
export const MESSAGES: Record<LanguageCode, Messages> = { en, hi, ta, te, kn, ml, bn, mr };

/**
 * Fills `{name}` placeholders. Values are stringified and inserted verbatim
 * into text (never markup), so no escaping concerns arise here.
 */
export function formatMessage(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function makeTranslate(messages: Messages): Translate {
  // An empty or missing translation falls back to English rather than rendering
  // nothing -- a blank button is worse than an English one.
  return (key, values) => formatMessage(messages[key] || en[key] || key, values);
}
