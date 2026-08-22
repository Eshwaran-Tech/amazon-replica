import { z } from 'zod';

import { MAX_PAISE, rupeesToPaise, type Paise } from '@/lib/utils/money';
import { SLUG_PATTERN } from '@/lib/utils/slug';

/**
 * Shared validation primitives.
 *
 * Deliberately free of any `mongodb` import so these schemas can be used in
 * Client Components for inline form validation as well as on the server. Ids
 * are validated as 24-character hex *strings*; conversion to `ObjectId` happens
 * in the data layer, on the server, after validation has already passed.
 *
 * The server always re-validates. Client-side use of these schemas is a
 * usability feature, never a control.
 */

// ---------------------------------------------------------------- text safety

/**
 * C0 controls, DEL and C1 controls. Written as a codepoint scan rather than a
 * regex class so the source stays plain ASCII and reviewable.
 *
 * Rejecting these matters beyond tidiness: CR/LF in a value that later reaches
 * a header or a log line is response-splitting / log-injection, and zero-width
 * and bidirectional-override characters let an attacker make a review or a
 * product name render as something other than what is stored.
 */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0x09 || code === 0x0a) continue; // tab and newline are allowed in long text
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
    // Bidi overrides and zero-width joiners used for display spoofing.
    if (code >= 0x200b && code <= 0x200f) return true;
    if (code >= 0x202a && code <= 0x202e) return true;
    if (code >= 0x2066 && code <= 0x2069) return true;
  }
  return false;
}

function hasNewlines(value: string): boolean {
  return value.includes('\n') || value.includes('\r');
}

/** Single-line plain text: names, titles, cities. No newlines, no controls. */
export function singleLineText(min: number, max: number, label = 'This field') {
  return z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} character${min === 1 ? '' : 's'}`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine((value) => !hasNewlines(value), `${label} must not contain line breaks`)
    .refine((value) => !hasControlCharacters(value), `${label} contains invalid characters`);
}

/** Multi-line plain text: descriptions, review comments. Newlines permitted. */
export function multiLineText(min: number, max: number, label = 'This field') {
  return z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine((value) => !hasControlCharacters(value), `${label} contains invalid characters`);
}

// ------------------------------------------------------------------ identity

/**
 * A MongoDB ObjectId in its 24-character hex form.
 *
 * This is also the first line of defence against operator injection: if a JSON
 * body sends `{"productId": {"$ne": null}}`, this schema sees an object where a
 * string is required and rejects the whole request. No `$`-prefixed value can
 * reach a query through a validated field.
 */
export const objectIdString = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(96)
  .regex(SLUG_PATTERN, 'Invalid slug');

/**
 * Email address.
 *
 * Trimmed and lowercased *before* validation, and stored lowercase, so
 * `Ramesh@Example.com` and `ramesh@example.com` cannot become two accounts.
 * 254 is the RFC 5321 maximum length for a forward path.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address')
  .max(254, 'Email address is too long')
  .pipe(z.email('Enter a valid email address'));

/**
 * Password policy, applied when a password is being *set*.
 *
 * The 128 cap is not a bcrypt limitation -- `hashPassword` pre-hashes with
 * SHA-256 so any length is honoured -- it exists so a 10MB "password" cannot
 * be used to make the server burn CPU on a cost-12 hash.
 */
export const newPasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine(
    (value) => /[a-z]/.test(value) && /[A-Z]/.test(value),
    'Password must contain both uppercase and lowercase letters',
  )
  .refine((value) => /\d/.test(value), 'Password must contain at least one number')
  .refine(
    (value) => !/^\s|\s$/.test(value),
    'Password must not start or end with a space',
  );

/**
 * Password as supplied at *login*.
 *
 * Deliberately looser than `newPasswordSchema`: login must not enforce the
 * current policy. Rejecting a legacy password at the schema layer would tell an
 * attacker which stored passwords fail today's rules, and would lock out users
 * whose password predates a policy change. Login checks the hash; policy is
 * enforced where a password is chosen.
 */
export const loginPasswordSchema = z.string().min(1, 'Enter your password').max(128);

/** Indian mobile number, 10 digits starting 6-9, tolerant of +91 and spacing. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, '').replace(/^(\+91|0)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

// ------------------------------------------------------------------- numbers

/**
 * A rupee amount from an admin form, converted to integer paise here at the
 * boundary. This is the only place a decimal rupee value is accepted, and it
 * never survives past parsing.
 */
export const rupeeAmountSchema = z
  .coerce.number()
  .refine(Number.isFinite, 'Enter a valid amount')
  .min(0, 'Amount cannot be negative')
  .max(MAX_PAISE / 100, 'Amount is too large')
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    'Amount cannot have more than two decimal places',
  )
  .transform((value): Paise => rupeesToPaise(value));

export const quantitySchema = z.coerce
  .number()
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1')
  .max(10, 'Quantity cannot exceed 10 per item');

export const stockSchema = z.coerce
  .number()
  .int('Stock must be a whole number')
  .min(0, 'Stock cannot be negative')
  .max(1_000_000, 'Stock value is too large');

export const ratingSchema = z.coerce
  .number()
  .int('Rating must be a whole number')
  .min(1, 'Select a rating from 1 to 5')
  .max(5, 'Select a rating from 1 to 5');

// ---------------------------------------------------------------- pagination

/**
 * Pagination bounds.
 *
 * `limit` is hard-capped at 60. Without a ceiling, `?limit=999999999` is a
 * one-request denial of service: the database materialises the whole
 * collection and the server serialises it.
 *
 * `page` is capped too. A large `skip` makes MongoDB walk every skipped
 * document, so `?page=100000` is expensive even when it returns nothing.
 */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;
export const MAX_PAGE = 500;

/**
 * An integer clamped into range, with a fallback for anything unparseable.
 *
 * Clamping rather than rejecting is deliberate. `?limit=999999999` should
 * return 60 results, not a 400 and not the default -- the user asked for as
 * many as possible, and the ceiling is ours to enforce. Rejecting outright
 * would also mean a stale bookmark or an over-eager crawler produces an error
 * page instead of a listing.
 *
 * The bound itself is the control: without it the database materialises the
 * whole collection and the server serialises it, from one request.
 */
export function clampedInt(min: number, max: number, fallback: number) {
  return z.coerce
    .number()
    .catch(fallback)
    .transform((value) => {
      if (!Number.isFinite(value)) return fallback;
      return Math.min(Math.max(Math.trunc(value), min), max);
    });
}

export const pageSchema = clampedInt(1, MAX_PAGE, 1);
export const limitSchema = clampedInt(1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

export const paginationSchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export type Pagination = z.infer<typeof paginationSchema>;

/** Skip/limit for the driver, derived only from validated values. */
export function toSkipLimit(pagination: Pagination): { skip: number; limit: number } {
  return { skip: (pagination.page - 1) * pagination.limit, limit: pagination.limit };
}

// ------------------------------------------------------------------ redirect

/**
 * A post-login redirect target.
 *
 * Structural rules only -- must be a single-slash absolute path. The
 * authoritative check is `safeRedirectPath`, which is applied again at the
 * point of use; this schema exists so an obviously hostile value is rejected
 * with a validation error rather than silently replaced by the fallback.
 */
export const redirectPathSchema = z
  .string()
  .max(512)
  .refine((value) => value.startsWith('/'), 'Redirect target must be a relative path')
  .refine((value) => !value.startsWith('//'), 'Redirect target must be a relative path')
  .refine((value) => !value.includes('\\'), 'Redirect target must be a relative path')
  .refine((value) => !hasControlCharacters(value), 'Redirect target is invalid');

// -------------------------------------------------------------------- result

/**
 * Formats Zod issues as `{ fieldName: message }` for form rendering.
 *
 * Only the *first* issue per field is kept, and messages come from the schemas
 * above -- never from the raw input. Echoing a submitted value back into an
 * error string is how a validation message becomes a reflected XSS sink.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    errors[key] ??= issue.message;
  }

  return errors;
}
