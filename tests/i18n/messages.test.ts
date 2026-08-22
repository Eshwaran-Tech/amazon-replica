import { describe, expect, it } from 'vitest';

import { LANGUAGES } from '@/lib/i18n/languages';
import { MESSAGES, formatMessage, makeTranslate } from '@/lib/i18n/messages';
import { en } from '@/lib/i18n/messages/en';

/**
 * The dictionaries are typed to be complete, but a few properties only a test
 * can check: every language the picker offers really has a dictionary, no
 * value is empty or still English by accident, and placeholders survive
 * translation (a translated "{name}" that became "{नाम}" would print the
 * literal braces to the customer).
 */

const KEYS = Object.keys(en) as Array<keyof typeof en>;
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe('translation dictionaries', () => {
  it('cover every language the picker offers', () => {
    for (const language of LANGUAGES) {
      expect(MESSAGES[language.code]).toBeDefined();
    }
  });

  it.each(LANGUAGES.filter((language) => language.code !== 'en').map((language) => language.code))(
    '%s: every key is present, non-empty, and keeps its placeholders',
    (code) => {
      const dictionary = MESSAGES[code];
      for (const key of KEYS) {
        const value = dictionary[key];
        expect(value, key).toBeTypeOf('string');
        expect(value.trim().length, key).toBeGreaterThan(0);
        expect(placeholders(value), `${key} placeholders`).toEqual(placeholders(en[key]));
      }
    },
  );

  it('translates the visible chrome (not just brand names) in every language', () => {
    // A handful of high-visibility strings that must differ from English.
    const mustDiffer = ['header.cart', 'menu.shopByCategory', 'auth.signInOrCreate', 'cart.total'] as const;
    for (const language of LANGUAGES) {
      if (language.code === 'en') continue;
      for (const key of mustDiffer) {
        expect(MESSAGES[language.code][key], `${language.code} ${key}`).not.toBe(en[key]);
      }
    }
  });

  it('formats placeholders and falls back to English for a missing key', () => {
    expect(formatMessage('Hello, {name}', { name: 'Asha' })).toBe('Hello, Asha');
    expect(formatMessage('{percent}% off', { percent: 30 })).toBe('30% off');
    expect(formatMessage('Keep {this}', {})).toBe('Keep {this}');

    const t = makeTranslate({ ...MESSAGES.hi, 'header.cart': '' } as typeof MESSAGES.hi);
    // An empty translation falls back to English rather than rendering nothing.
    expect(t('header.cart')).toBe(en['header.cart']);
    expect(makeTranslate(MESSAGES.hi)('header.hello', { name: 'रमेश' })).toBe('नमस्ते, रमेश');
  });
});
