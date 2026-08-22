import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { Footer } from '@/components/layout/footer';
import { Header } from '@/components/layout/header';
import { getSession } from '@/lib/auth/guards';
import { GUEST_CART_COOKIE } from '@/lib/cart/constants';
import { getCartItemCount } from '@/services/cart-count';

/**
 * Storefront shell.
 *
 * The cart count is resolved here rather than inside `Header` so the header
 * stays a pure presentational Server Component, and so the identity used to
 * look it up is unmistakably server-derived: the session, or the HttpOnly guest
 * cookie. Nothing a client sends influences whose cart is counted.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const [session, cookieStore] = await Promise.all([getSession(), cookies()]);
  const guestId = cookieStore.get(GUEST_CART_COOKIE)?.value ?? null;

  const cartCount = await getCartItemCount(session?.user.id ?? null, guestId);

  return (
    <>
      <Header cartCount={cartCount} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
