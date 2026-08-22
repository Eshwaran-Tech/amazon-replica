import { ObjectId } from 'mongodb';

import { cartsCollection } from '@/lib/db/collections';
import { GUEST_CART_COOKIE } from '@/lib/cart/constants';

import '@/lib/server-guard';

/**
 * Item count for the header badge.
 *
 * Split into its own tiny module so the header can render the badge without
 * importing the cart mutation service. Ownership is derived from the session or
 * the guest cookie -- never from a client-supplied id.
 */
export async function getCartItemCount(
  userId: string | null,
  guestId: string | null,
): Promise<number> {
  if (!userId && !guestId) return 0;

  const carts = await cartsCollection();

  const cart = await carts.findOne(
    userId ? { userId: new ObjectId(userId) } : { guestId },
    { projection: { items: 1 } },
  );

  if (!cart) return 0;
  return cart.items.reduce((total, item) => total + item.quantity, 0);
}

export { GUEST_CART_COOKIE };
