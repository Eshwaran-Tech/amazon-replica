import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePageAdmin } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { ORDER_STATUSES } from '@/models/types';
import { adminListOrders } from '@/services/admin';

import { OrderStatusBadge } from '../../(shop)/orders/status';

export const metadata: Metadata = { title: 'Orders' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
});

function pageHref(status: string | undefined, q: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/admin/orders${query ? `?${query}` : ''}`;
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  await requirePageAdmin();
  const params = await searchParams;

  const status = ORDER_STATUSES.find((option) => option === params.status);
  const q = typeof params.q === 'string' ? params.q : undefined;
  const page = Number.parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1;

  const listing = await adminListOrders({ status, q, page });

  return (
    <>
      <h1 className="text-xl font-bold sm:text-2xl">Orders</h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5 text-sm">
          <Link
            href={pageHref(undefined, q, 1)}
            className={
              !status
                ? 'bg-surface border-hairline rounded-full border px-3 py-1 font-semibold'
                : 'text-link px-3 py-1 hover:underline'
            }
          >
            All
          </Link>
          {ORDER_STATUSES.map((option) => (
            <Link
              key={option}
              href={pageHref(option, q, 1)}
              className={
                status === option
                  ? 'bg-surface border-hairline rounded-full border px-3 py-1 font-semibold'
                  : 'text-link px-3 py-1 hover:underline'
              }
            >
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </Link>
          ))}
        </nav>

        {/* GET form: the search lands in the URL, shareable and bookmarkable. */}
        <form action="/admin/orders" className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="order-search" className="sr-only">
            Search by order number
          </label>
          <input
            id="order-search"
            name="q"
            defaultValue={q}
            placeholder="NK-XXXXXXXX"
            className="border-hairline bg-surface focus:border-link min-h-10 rounded-md border px-3 font-mono text-sm"
          />
          <button
            type="submit"
            className="border-hairline bg-surface hover:bg-surface-muted min-h-10 rounded-md border px-4 text-sm font-semibold"
          >
            Search
          </button>
        </form>
      </div>

      <div className="border-hairline bg-surface mt-3 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-hairline border-b text-left text-xs uppercase">
              <th className="px-4 py-2.5 font-semibold">Order</th>
              <th className="px-4 py-2.5 font-semibold">Placed</th>
              <th className="px-4 py-2.5 font-semibold">Items</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Payment</th>
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {listing.orders.map((order) => (
              <tr key={order.id} className="hover:bg-surface-muted">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-link font-mono hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="text-ink-muted px-4 py-2.5 whitespace-nowrap">
                  {dateFormat.format(new Date(order.createdAt))}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{order.itemCount}</td>
                <td className="px-4 py-2.5">
                  <OrderStatusBadge status={order.orderStatus} />
                </td>
                <td className="text-ink-muted px-4 py-2.5 text-xs">
                  {order.paymentStatus.replaceAll('_', ' ')}
                </td>
                <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                  {formatPaise(order.total)}
                </td>
              </tr>
            ))}
            {listing.orders.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-muted px-4 py-8 text-center">
                  No orders match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(listing.page > 1 || listing.hasMore) && (
        <nav
          aria-label="Order pages"
          className="mt-4 flex items-center justify-center gap-3 text-sm"
        >
          {listing.page > 1 && (
            <Link
              href={pageHref(status, q, listing.page - 1)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Newer
            </Link>
          )}
          <span className="text-ink-muted">Page {listing.page}</span>
          {listing.hasMore && (
            <Link
              href={pageHref(status, q, listing.page + 1)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Older
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
