/**
 * Cart constants, dependency-free so both the proxy-adjacent layers and Client
 * Components can import them.
 */

const isProd = process.env.NODE_ENV === 'production';

/**
 * Identifies an anonymous shopper's cart.
 *
 * HttpOnly: nothing in the browser needs to read it, and a value script cannot
 * touch cannot be exfiltrated by an XSS bug. It is not a credential -- it grants
 * access only to a cart with no personal data in it -- but it is still an
 * identifier worth keeping out of reach.
 */
export const GUEST_CART_COOKIE = isProd ? '__Host-nk_cart' : 'nk_cart';

/** 30 days, matching the TTL on abandoned guest carts in the database. */
export const GUEST_CART_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
