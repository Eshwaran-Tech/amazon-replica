import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { requirePageUser } from '@/lib/auth/guards';
import { usersCollection } from '@/lib/db/collections';
import { formatPaise } from '@/lib/utils/money';
import { getCartView } from '@/services/cart';
import { getWalletSummary } from '@/services/wallet';

import { CheckoutForm } from './checkout-form';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/**
 * Checkout: address, payment method, and the server-priced summary.
 *
 * The proxy already bounces anonymous visitors, but that is a convenience --
 * `requirePageUser` here is the control. Unverified accounts see a prompt
 * instead of the form: placing an order is the "real-world consequence" line
 * where verification is enforced.
 */
export default async function CheckoutPage() {
  const session = await requirePageUser('/checkout');

  if (!session.user.verified) {
    return (
      <Container size="narrow" className="py-12">
        <h1 className="text-2xl font-bold">Almost there</h1>
        <div className="mt-4">
          <Alert tone="info">
            Please verify your email address before placing an order.{' '}
            <Link href="/auth/verify-email" className="text-link font-semibold hover:underline">
              Get a verification link
            </Link>{' '}
            -- or sign out and sign back in with a one-time password (OTP), which verifies your
            address on the spot.
          </Alert>
        </div>
        <Link href="/cart" className="text-link mt-4 inline-block text-sm hover:underline">
          Back to cart
        </Link>
      </Container>
    );
  }

  const userId = new ObjectId(session.user.id);
  const [cart, user, wallet] = await Promise.all([
    getCartView({ userId }),
    usersCollection().then((users) => users.findOne({ _id: userId })),
    getWalletSummary(session.user.id),
  ]);

  const purchasable = cart.lines.filter((line) => line.isActive);
  if (purchasable.length === 0) {
    redirect('/cart');
  }

  return (
    <Container size="wide" className="py-5 sm:py-6">
      <h1 className="text-xl font-bold sm:text-2xl">Checkout</h1>

      <div className="mt-4 gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <CheckoutForm
          addresses={user?.addresses ?? []}
          csrfField={<CsrfField />}
          walletBalance={wallet.balance}
          orderTotal={cart.totals.total}
        />

        {/* ----------------------------------------------------- summary */}
        <aside
          aria-label="Order summary"
          className="border-hairline bg-surface mt-6 rounded-2xl border p-4 lg:sticky lg:top-4 lg:mt-0"
        >
          <h2 className="text-base font-bold">Order summary</h2>

          <ul className="divide-hairline mt-3 divide-y text-sm">
            {purchasable.map((line) => (
              <li key={line.productId} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="line-clamp-1">{line.name}</span>
                  <span className="text-ink-subtle text-xs">Qty {line.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">{formatPaise(line.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="border-hairline mt-2 space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd>{formatPaise(cart.totals.subtotal)}</dd>
            </div>
            {cart.totals.discount > 0 && (
              <div className="text-instock flex justify-between">
                <dt>Savings</dt>
                <dd>-{formatPaise(cart.totals.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-muted">Delivery</dt>
              <dd>{cart.totals.shipping === 0 ? 'FREE' : formatPaise(cart.totals.shipping)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">GST</dt>
              <dd>{formatPaise(cart.totals.tax)}</dd>
            </div>
            <div className="border-hairline flex justify-between border-t pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatPaise(cart.totals.total)}</dd>
            </div>
          </dl>

          <p className="text-ink-subtle mt-3 text-[11px]">
            This summary is advisory. The amount charged is computed again from live catalogue
            prices at the moment your order is placed.
          </p>
        </aside>
      </div>
    </Container>
  );
}
