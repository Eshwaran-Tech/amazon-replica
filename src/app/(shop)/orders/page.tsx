import { PackageOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { ProductImage } from '@/components/product/product-image';
import { requirePageUser } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { listOrdersForUser } from '@/services/orders';

import { OrderStatusBadge, PaymentStatusNote } from './status';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Order history.
 *
 * The query inside `listOrdersForUser` is filtered by the session's user id --
 * there is no order id or user id in this URL for anyone to tamper with, and
 * pagination is the only client-controlled input (clamped server-side).
 */
export default async function OrdersPage({ searchParams }: PageProps) {
  const session = await requirePageUser('/orders');
  const params = await searchParams;

  const page = Number.parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1;
  const history = await listOrdersForUser(new ObjectId(session.user.id), page);

  if (history.orders.length === 0 && history.page === 1) {
    return (
      <Container size="narrow" className="py-16 text-center">
        <PackageOpen className="text-ink-subtle mx-auto h-14 w-14" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">No orders yet</h1>
        <p className="text-ink-muted mt-2 text-sm">
          When you place an order, it will appear here with its status and history.
        </p>
        <Link
          href="/products"
          className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-6 inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold"
        >
          Start shopping
        </Link>
      </Container>
    );
  }

  return (
    <Container size="default" className="py-5 sm:py-6">
      <h1 className="text-xl font-bold sm:text-2xl">Your Orders</h1>

      <ul className="mt-4 space-y-3">
        {history.orders.map((order) => (
          <li key={order.id} className="border-hairline bg-surface rounded-2xl border">
            <div className="border-hairline bg-surface-sunken/60 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-t-2xl border-b px-4 py-2.5 text-xs">
              <span>
                <span className="text-ink-muted block uppercase">Order placed</span>
                <span className="font-medium">{dateFormat.format(new Date(order.createdAt))}</span>
              </span>
              <span>
                <span className="text-ink-muted block uppercase">Total</span>
                <span className="font-medium">{formatPaise(order.total)}</span>
              </span>
              <span>
                <span className="text-ink-muted block uppercase">
                  {order.itemCount === 1 ? 'Item' : 'Items'}
                </span>
                <span className="font-medium">{order.itemCount}</span>
              </span>
              <span className="ml-auto text-right">
                <span className="text-ink-muted block uppercase">Order number</span>
                <span className="font-mono font-medium">{order.orderNumber}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex shrink-0 -space-x-3">
                {order.previewImages.map((image, index) => (
                  <span
                    key={`${order.id}-${index}`}
                    className="border-hairline bg-surface-sunken relative block h-14 w-14 overflow-hidden rounded-lg border"
                  >
                    <ProductImage src={image} alt="" sizes="56px" />
                  </span>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <OrderStatusBadge status={order.orderStatus} />
                <PaymentStatusNote
                  orderId={order.id}
                  orderStatus={order.orderStatus}
                  paymentStatus={order.paymentStatus}
                />
              </div>

              <Link
                href={`/orders/${order.id}`}
                className="border-hairline bg-surface hover:bg-surface-muted inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border px-4 text-sm font-semibold"
              >
                Order details
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {(history.page > 1 || history.hasMore) && (
        <nav aria-label="Order pages" className="mt-5 flex items-center justify-center gap-3">
          {history.page > 1 && (
            <Link
              href={`/orders?page=${history.page - 1}`}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold"
            >
              Newer
            </Link>
          )}
          <span className="text-ink-muted text-sm">Page {history.page}</span>
          {history.hasMore && (
            <Link
              href={`/orders?page=${history.page + 1}`}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-semibold"
            >
              Older
            </Link>
          )}
        </nav>
      )}
    </Container>
  );
}
