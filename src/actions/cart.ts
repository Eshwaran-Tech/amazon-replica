'use server';

import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { CSRF_FIELD_NAME, SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { readCsrfCookie } from '@/lib/auth/cookies';
import { getSession } from '@/lib/auth/guards';
import { ensureGuestCartId, readGuestCartId } from '@/lib/cart/guest';
import type { FormState } from '@/lib/forms/state';
import { csrfSubject, verifyCsrf } from '@/lib/security/csrf';
import { logSecurityEvent } from '@/lib/security/logger';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { clientIp } from '@/lib/security/request';
import { headers } from 'next/headers';
import { addToCartSchema, removeCartItemSchema, updateCartItemSchema } from '@/lib/validations/cart';
import { fieldErrors } from '@/lib/validations/common';
import {
  addToCart,
  removeLine,
  setLineQuantity,
  type CartIdentity,
} from '@/services/cart';

/**
 * Cart Server Actions.
 *
 * Same discipline as the auth actions: a Server Action is a public POST
 * endpoint, so each one independently verifies the double-submit CSRF token,
 * validates with Zod, rate-limits, and derives *whose cart* from the session
 * or the HttpOnly guest cookie -- never from the form data. The schemas are
 * strict objects with no price field, so a tampered form has nothing to say
 * about money.
 */

async function verifyActionCsrf(formData: FormData): Promise<boolean> {
  const submitted = formData.get(CSRF_FIELD_NAME);
  const cookieToken = await readCsrfCookie();
  const store = await cookies();
  const subject = csrfSubject(store.get(SESSION_COOKIE_NAME)?.value ?? null);

  const result = verifyCsrf(cookieToken, typeof submitted === 'string' ? submitted : null, subject);

  if (!result.ok) {
    logSecurityEvent({
      type: 'csrf.rejected',
      severity: 'warn',
      detail: { surface: 'cart-action', reason: result.reason },
    });
  }

  return result.ok;
}

const CSRF_FAILURE: FormState = {
  ok: false,
  message: 'Your session expired. Please refresh the page and try again.',
};

/**
 * Resolves the acting identity. `createGuest` controls whether an anonymous
 * visitor without a cart cookie gets one minted -- true for "add" (their first
 * cart interaction), false for update/remove, where having no cookie simply
 * means having no cart to mutate.
 */
async function resolveIdentity(createGuest: boolean): Promise<CartIdentity | null> {
  const session = await getSession();
  if (session) return { userId: new ObjectId(session.user.id) };

  const guestId = createGuest ? await ensureGuestCartId() : await readGuestCartId();
  return guestId ? { guestId } : null;
}

async function rateLimitKey(): Promise<string> {
  const session = await getSession();
  if (session) return session.user.id;
  return clientIp(await headers());
}

/** Refreshes every cart-dependent surface: badge, cart page, buy box. */
function revalidateCartSurfaces(): void {
  revalidatePath('/', 'layout');
}

// ------------------------------------------------------------- add to cart

export async function addToCartAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await verifyActionCsrf(formData))) return CSRF_FAILURE;

  const parsed = addToCartSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity') ?? 1,
  });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const limit = await checkRateLimit('cart:user', await rateLimitKey());
  if (!limit.allowed) {
    return { ok: false, message: 'Too many cart updates. Please slow down a moment.' };
  }

  const identity = await resolveIdentity(true);
  if (!identity) return CSRF_FAILURE; // unreachable: createGuest guarantees one

  const result = await addToCart(identity, parsed.data.productId, parsed.data.quantity);

  if (!result.ok) {
    const messages = {
      NOT_FOUND: 'This product is no longer available.',
      OUT_OF_STOCK: 'This product is currently out of stock.',
      CART_FULL: 'Your cart is full. Remove something before adding more.',
    } as const;
    return { ok: false, message: messages[result.code] };
  }

  revalidateCartSurfaces();

  return {
    ok: true,
    message: result.clamped
      ? `Added -- quantity capped at ${result.quantityInCart} (stock limit).`
      : 'Added to cart.',
  };
}

/** "Buy Now": add, then straight to the cart. */
export async function buyNowAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const state = await addToCartAction(_previous, formData);
  if (!state.ok) return state;
  redirect('/cart');
}

// ------------------------------------------------- cart page line controls

export async function updateCartLineAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) return;

  const parsed = updateCartItemSchema.safeParse({
    productId: formData.get('productId'),
    quantity: formData.get('quantity'),
  });
  if (!parsed.success) return;

  const limit = await checkRateLimit('cart:user', await rateLimitKey());
  if (!limit.allowed) return;

  const identity = await resolveIdentity(false);
  if (!identity) return;

  await setLineQuantity(identity, parsed.data.productId, parsed.data.quantity);
  revalidateCartSurfaces();
}

export async function removeCartLineAction(formData: FormData): Promise<void> {
  if (!(await verifyActionCsrf(formData))) return;

  const parsed = removeCartItemSchema.safeParse({ productId: formData.get('productId') });
  if (!parsed.success) return;

  const limit = await checkRateLimit('cart:user', await rateLimitKey());
  if (!limit.allowed) return;

  const identity = await resolveIdentity(false);
  if (!identity) return;

  await removeLine(identity, parsed.data.productId);
  revalidateCartSurfaces();
}
