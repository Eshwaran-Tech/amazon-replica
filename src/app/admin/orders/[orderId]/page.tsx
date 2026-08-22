import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CsrfField } from '@/components/security/csrf-field';
import { requirePageAdmin } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { adminGetOrder } from '@/services/admin';

import { OrderStatusBadge } from '../../../(shop)/orders/status';
import { StatusForm } from './status-form';

export const metadata: Metadata = { title: 'Order detail' };

interface PageProps {
  params: Promise<{ orderId: string }>;
}

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

export default async function AdminOrderDetailPage({ params }: PageProps) {
  await requirePageAdmin();
  const { orderId } = await params;

  const detail = await adminGetOrder(orderId);
  if (!detail) notFound();

  const { order, customer, nextStatuses } = detail;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/admin/orders" className="hover:text-link hover:underline">
          Orders
        </Link>{' '}
        / <span className="text-ink font-mono">{order.orderNumber}</span>
      </nav>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          Order <span className="font-mono">{order.orderNumber}</span>
        </h1>
        <OrderStatusBadge status={order.orderStatus} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {/* ---------------------------------------------------------- items */}
          <section className="border-hairline bg-surface rounded-2xl border p-4">
            <h2 className="text-base font-bold">Items</h2>
            <ul className="divide-hairline mt-1 divide-y text-sm">
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
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Discount</dt>
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
          </section>

          {/* -------------------------------------------------------- history */}
          <section className="border-hairline bg-surface rounded-2xl border p-4">
            <h2 className="text-base font-bold">History</h2>
            <ol className="mt-2 space-y-2 text-sm">
              {[...order.statusHistory].reverse().map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex items-baseline gap-3">
                  <span className="text-ink-subtle w-28 shrink-0 text-xs tabular-nums">
                    {timeFormat.format(new Date(event.at))}
                  </span>
                  <span>
                    <span className="font-medium">{event.status}</span>
                    {event.note && <span className="text-ink-muted"> -- {event.note}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          {/* ------------------------------------------------- status change */}
          <section className="border-hairline bg-surface rounded-2xl border p-4">
            <h2 className="text-base font-bold">Change status</h2>
            {nextStatuses.length === 0 ? (
              <p className="text-ink-muted mt-1 text-sm">
                {order.orderStatus} is a terminal state.
              </p>
            ) : (
              <div className="mt-2">
                <StatusForm
                  orderId={order.id}
                  currentStatus={order.orderStatus}
                  nextStatuses={nextStatuses}
                  isPaid={order.paymentStatus === 'PAID'}
                  csrfField={<CsrfField />}
                />
              </div>
            )}
          </section>

          {/* ------------------------------------------------------ customer */}
          <section className="border-hairline bg-surface rounded-2xl border p-4 text-sm">
            <h2 className="text-base font-bold">Customer</h2>
            {customer ? (
              <p className="text-ink-muted mt-1">
                {customer.name}
                <br />
                {customer.contact}
              </p>
            ) : (
              <p className="text-ink-muted mt-1">Account no longer exists.</p>
            )}
            <h3 className="mt-3 text-sm font-bold">Delivery address</h3>
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
          </section>

          {/* ------------------------------------------------------- payment */}
          <section className="border-hairline bg-surface rounded-2xl border p-4 text-sm">
            <h2 className="text-base font-bold">Payment</h2>
            <dl className="mt-1 space-y-1">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Method</dt>
                <dd>{order.paymentMethod}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Status</dt>
                <dd>{order.paymentStatus.replaceAll('_', ' ')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Provider</dt>
                <dd>{order.paymentProvider}</dd>
              </div>
              {order.paymentIntentId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted shrink-0">Intent</dt>
                  <dd className="truncate font-mono text-xs">{order.paymentIntentId}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink-muted">Stock committed</dt>
                <dd>{order.stockCommitted ? 'yes' : 'no'}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
