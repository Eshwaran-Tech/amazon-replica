import { ObjectId } from 'mongodb';

import { defineHandler } from '@/lib/api/handler';
import { apiSuccess } from '@/lib/api/response';
import { readGuestCartId } from '@/lib/cart/guest';
import { getCartView, type CartIdentity } from '@/services/cart';

/**
 * GET /api/cart -- the caller's own cart, as the safe view DTO.
 *
 * "Whose cart" is decided entirely server-side: the session when signed in,
 * the HttpOnly guest cookie otherwise. The endpoint takes no parameters at
 * all, so there is no id to enumerate and nothing to point at another
 * shopper's cart.
 *
 * Every price in the response was read from the catalogue moments ago -- the
 * cart itself stores none (see `src/services/cart.ts`).
 *
 * Mutations intentionally have no JSON endpoint: the Server Actions are the
 * single mutation path, so the CSRF/validation/rate-limit story exists exactly
 * once. `no-store` comes from the wrapper -- a cart is personal data and must
 * never land in a shared cache.
 */
export const GET = defineHandler(
  {
    auth: 'none',
    csrf: false, // read-only
    rateLimit: [{ name: 'api:general:ip', by: 'ip' }],
  },
  async ({ session }) => {
    const identity: CartIdentity | null = session
      ? { userId: new ObjectId(session.user.id) }
      : await readGuestCartId().then((guestId) => (guestId ? { guestId } : null));

    return apiSuccess(await getCartView(identity));
  },
);
