import 'server-only';

import { randomBytes } from 'node:crypto';

import { cookies } from 'next/headers';

import { guestCartIdSchema } from '@/lib/validations/cart';

import { GUEST_CART_COOKIE, GUEST_CART_MAX_AGE_SECONDS } from './constants';

/**
 * Guest cart identity.
 *
 * An anonymous shopper's cart is keyed by an opaque random id in an HttpOnly
 * cookie. Two properties matter:
 *
 *  - The id is 192 bits of CSPRNG output. Guessing another shopper's cart id
 *    is not a viable attack, which is the entire access control for guest
 *    carts -- there is no account to check ownership against.
 *
 *  - The cookie is only *created* inside a Server Action (the first cart
 *    mutation). Next.js only allows cookie writes in Actions and Route
 *    Handlers, and it is the right behaviour anyway: visitors who never touch
 *    the cart never get a tracking-shaped cookie.
 *
 * The cookie value is validated on every read. A cookie is client-controlled
 * storage; a tampered value must never reach a database filter.
 */

const isProduction = process.env.NODE_ENV === 'production';

/** 24 random bytes -> 32 chars of base64url, matching `guestCartIdSchema`. */
export function generateGuestCartId(): string {
  return randomBytes(24).toString('base64url');
}

/** Returns the guest cart id, or null if absent or tampered with. */
export async function readGuestCartId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(GUEST_CART_COOKIE)?.value;
  if (!raw) return null;

  const parsed = guestCartIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Ensures a guest id exists, creating the cookie when needed.
 * Server Actions / Route Handlers only -- cookie writes throw elsewhere.
 */
export async function ensureGuestCartId(): Promise<string> {
  const existing = await readGuestCartId();
  if (existing) return existing;

  const id = generateGuestCartId();
  const store = await cookies();

  store.set(GUEST_CART_COOKIE, id, {
    // Nothing in the browser reads this; keeping it out of script's reach
    // means an XSS bug cannot lift it.
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: GUEST_CART_MAX_AGE_SECONDS,
  });

  return id;
}

/** Removes the guest cookie -- called after merging into a signed-in cart. */
export async function clearGuestCartId(): Promise<void> {
  const store = await cookies();
  store.set(GUEST_CART_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
