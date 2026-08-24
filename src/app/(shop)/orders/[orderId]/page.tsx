import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { ProductImage } from '@/components/product/product-image';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { requirePageUser } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import type { PaymentMethod } from '@/models/types';
import { getOrderForUser, isCancellableStatus } from '@/services/orders';

import { CancelOrderForm } from './cancel-form';
import { OrderStatusBadge, PaymentStatusNote } from '../status';

export const metadata: Metadata = {
  title: 'Order details',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Keyed on the union, so adding a method without naming it fails to compile. */
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Card',
  UPI: 'UPI',
  NETBANKING: 'Net banking',
  COD: 'Cash on delivery',
  WALLET: 'Eshwaran Pay balance',
};

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Order detail.
 *
 * `getOrderForUser` carries the ownership filter; a foreign or malformed order
 * id is `notFound()` -- byte-identical to an id that never existed, so the URL
 * confirms nothing to whoever is probing it.
 */
export default async function OrderDetailPage({ params, searchParams }: PageProps) {
  const session = await requirePageUser('/orders');
  const { orderId } = await params;
  const query = await searchParams;

  const order = await getOrderForUser(new ObjectId(session.user.id), orderId);
  if (!order) notFound();

  const justCancelled = query.cancelled === '1';
  const cancellable = isCancellableStatus(order.orderStatus);
  const payable = order.paymentStatus === 'PENDING' && order.orderStatus === 'PENDING';

  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/orders" className="hover:text-link hover:underline">
          Your Orders
        </Link>{' '}
        / <span className="text-ink font-mono">{order.orderNumber}</span>
      </nav>

      {justCancelled && (
        <div className="mt-3">
          <Alert tone="success">
            Your order has been cancelled.
            {order.paymentStatus === 'REFUNDED'
              ? ' Your refund has been issued.'
              : order.paymentStatus === 'PAID'
                ? ' Your refund is being processed.'
                : ''}
          </Alert>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">
            Order <span className="font-mono">{order.orderNumber}</span>
          </h1>
          <p className="text-ink-muted mt-0.5 text-sm">
            Placed on {dateFormat.format(new Date(order.createdAt))}
          </p>
        </div>
        <div className="text-right">
          <OrderStatusBadge status={order.orderStatus} />
          <PaymentStatusNote
            orderId={order.id}
            orderStatus={order.orderStatus}
            paymentStatus={order.paymentStatus}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------ items */}
      <div className="border-hairline bg-surface mt-5 rounded-2xl border p-4 sm:p-5">
        <h2 className="text-base font-bold">Items</h2>
        <ul className="divide-hairline mt-2 divide-y">
          {order.items.map((item) => (
            <li key={item.productId} className="flex gap-3 py-3">
              <Link
                href={`/products/${item.slug}`}
                className="bg-surface-sunken relative block h-16 w-16 shrink-0 overflow-hidden rounded-lg"
              >
                <ProductImage src={item.thumbnail} alt={item.name} sizes="64px" />
              </Link>
              <div className="min-w-0 flex-1 text-sm">
                <Link
                  href={`/products/${item.slug}`}
                  className="hover:text-link line-clamp-2 font-medium"
                >
                  {item.name}
                </Link>
                <p className="text-ink-subtle mt-0.5 text-xs">
                  {item.brand} -- Qty {item.quantity} x {formatPaise(item.unitPrice)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{formatPaise(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <dl className="border-hairline mt-1 space-y-1 border-t pt-3 text-sm">
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

      {/* -------------------------------------------- address and payment */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="border-hairline bg-surface rounded-2xl border p-4 text-sm sm:p-5">
          <h2 className="text-base font-bold">Delivering to</h2>
          <p className="text-ink-muted mt-1">
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
            {order.shippingAddress.postalCode}
            <br />
            Phone: {order.shippingAddress.phone}
          </p>
        </div>

        <div className="border-hairline bg-surface rounded-2xl border p-4 text-sm sm:p-5">
          <h2 className="text-base font-bold">Payment</h2>
          <p className="text-ink-muted mt-1">
            {PAYMENT_METHOD_LABELS[order.paymentMethod]}
            <br />
            Status: {order.paymentStatus.replaceAll('_', ' ').toLowerCase()}
          </p>
          {order.paymentMethod === 'WALLET' && order.paymentStatus === 'REFUNDED' && (
            <p className="text-instock mt-1 text-xs">
              {formatPaise(order.total)} was returned to your{' '}
              <Link href="/pay/balance" className="text-link hover:underline">
                Eshwaran Pay balance
              </Link>
              .
            </p>
          )}
          {payable && (
            <Link
              href={`/checkout/pay/${order.id}`}
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold"
            >
              Complete payment
            </Link>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- history */}
      <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 sm:p-5">
        <h2 className="text-base font-bold">Order history</h2>
        <ol className="mt-2 space-y-2 text-sm">
          {[...order.statusHistory].reverse().map((event, index) => (
            <li key={`${event.at}-${index}`} className="flex items-baseline gap-3">
              <span className="text-ink-subtle w-32 shrink-0 text-xs tabular-nums">
                {timeFormat.format(new Date(event.at))}
              </span>
              <span>
                <span className="font-medium">{event.status}</span>
                {event.note && <span className="text-ink-muted"> -- {event.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* ----------------------------------------------------------- cancel */}
      {cancellable && (
        <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 sm:p-5">
          <h2 className="text-base font-bold">Cancel this order</h2>
          <p className="text-ink-muted mt-1 text-sm">
            {order.paymentStatus === 'PAID'
              ? 'Your items will be released and your payment refunded in full.'
              : 'Your items will be released. No payment has been taken.'}
          </p>
          <div className="mt-3">
            <CancelOrderForm orderId={order.id} csrfField={<CsrfField />} />
          </div>
        </div>
      )}
    </Container>
  );
}
