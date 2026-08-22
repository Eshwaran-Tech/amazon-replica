import { emailSchema, phoneSchema } from '@/lib/validations/common';

/**
 * A sign-in identifier: the one field on the "Sign in or create account" page
 * accepts either an email address or an Indian mobile number.
 *
 * Both are normalised here, once, so every lookup, unique index and rate-limit
 * key sees the same string for the same person: emails lowercased, phones as
 * E.164 (`+91XXXXXXXXXX`) whatever spacing, dashes or leading zero were typed.
 */

export type Identifier =
  | { kind: 'email'; value: string }
  | { kind: 'phone'; value: string };

const COUNTRY_CODE = '+91';

export function parseIdentifier(raw: string | null | undefined): Identifier | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return null;

  // Anything with an "@" is treated as an email attempt; everything else as a
  // phone attempt. A string that is neither is simply invalid.
  if (trimmed.includes('@')) {
    const email = emailSchema.safeParse(trimmed);
    return email.success ? { kind: 'email', value: email.data } : null;
  }

  const phone = phoneSchema.safeParse(trimmed);
  return phone.success ? { kind: 'phone', value: `${COUNTRY_CODE}${phone.data}` } : null;
}

/** "+919111111111" -> "IN +91 9111111111" style display, emails unchanged. */
export function displayIdentifier(identifier: Identifier): string {
  if (identifier.kind === 'email') return identifier.value;
  return `${COUNTRY_CODE} ${identifier.value.slice(COUNTRY_CODE.length)}`;
}

/** The ten national digits of a phone identifier, for prefilling an input. */
export function nationalDigits(identifier: Identifier): string {
  return identifier.kind === 'phone' ? identifier.value.slice(COUNTRY_CODE.length) : '';
}
