import { CheckCircle2, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { requirePageUser } from '@/lib/auth/guards';
import { ordersCollection } from '@/lib/db/collections';
import { formatPaise } from '@/lib/utils/money';
import { toOrderDetailView } from '@/models/order';

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ orderId: string }>;
}

/** Ownership in the query, 404 otherwise -- same rule as everywhere else. */
export default async function ConfirmationPage({ params }: PageProps) {
  const session = await requirePageUser('/');
  const { orderId } = await params;

  if (!ObjectId.isValid(orderId)) notFound();

  const orders = await ordersCollection();
  const doc = await orders.findOne({
    _id: new ObjectId(orderId),
    userId: new ObjectId(session.user.id),
  });
  if (!doc) notFound();

  // The safe DTO: no payment intent ids, no provider internals.
  const order = toOrderDetailView(doc);
  const paid = order.paymentStatus === 'PAID';
  const cod = order.paymentMethod === 'COD';

  return (
    <Container size="narrow" className="py-8 sm:py-10">
      <div className="text-center">
        {paid || cod ? (
          <CheckCircle2 className="text-instock mx-auto h-14 w-14" aria-hidden="true" />
        ) : (
          <Clock className="text-accent-400 mx-auto h-14 w-14" aria-hidden="true" />
        )}
        <h1 className="mt-3 text-2xl font-bold">
          {paid ? 'Payment received -- order confirmed' : cod ? 'Order confirmed' : 'Order placed'}
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          Order number <span className="text-ink font-mono font-semibold">{order.orderNumber}</span>
        </p>
        {!paid && !cod && (
          <p className="text-deal mt-2 text-sm">
            Payment is still pending --{' '}
            <Link href={`/checkout/pay/${order.id}`} className="text-link hover:underline">
              complete it now
            </Link>{' '}
            to confirm your order.
          </p>
        )}
        {cod && (
          <p className="text-ink-muted mt-2 text-sm">
            Pay {formatPaise(order.total)} in cash when your order arrives.
          </p>
        )}
        {order.paymentMethod === 'WALLET' && (
          <p className="text-ink-muted mt-2 text-sm">
            {formatPaise(order.total)} was taken from your{' '}
            <Link href="/pay/balance" className="text-link hover:underline">
              Eshwaran Pay balance
            </Link>
            .
          </p>
        )}
      </div>

      <div className="border-hairline bg-surface mt-6 rounded-2xl border p-4 sm:p-5">
        <h2 className="text-base font-bold">Items</h2>
        <ul className="divide-hairline mt-2 divide-y text-sm">
          {order.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <Link href={`/products/${item.slug}`} className="hover:text-link line-clamp-1">
                  {item.name}
                </Link>
                <span className="text-ink-subtle text-xs">
                  Qty {item.quantity} x {formatPaise(item.unitPrice)}
                </span>
              </span>
              <span className="shrink-0 font-medium">{formatPaise(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="border-hairline mt-2 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd>{formatPaise(order.subtotal)}</dd>
          </div>
          {order.discount > 0 && (
            <div className="text-instock flex justify-between">
              <dt>Savings</dt>
              <dd>-{formatPaise(order.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-muted">Delivery</dt>
            <dd>{order.shipping === 0 ? 'FREE' : formatPaise(order.shipping)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">GST</dt>
            <dd>{formatPaise(order.tax)}</dd>
          </div>
          <div className="border-hairline flex justify-between border-t pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPaise(order.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 text-sm sm:p-5">
        <h2 className="text-base font-bold">Delivering to</h2>
        <p className="text-ink-muted mt-1">
          {order.shippingAddress.fullName}
          <br />
          {order.shippingAddress.line1}
          {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
          <br />
          {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
          {order.shippingAddress.postalCode}
        </p>
      </div>

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          href="/products"
          className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold"
        >
          Continue shopping
        </Link>
      </div>
    </Container>
  );
}
