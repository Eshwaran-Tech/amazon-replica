import {
  AlertTriangle,
  Clock,
  IndianRupee,
  Package,
  PackagePlus,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Users,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';

import {
  AreaChart,
  ColumnChart,
  HorizontalBarChart,
  TrackBars,
  compactPaise,
} from '@/components/admin/charts';
import { AutoRefresh } from '@/components/admin/auto-refresh';
import { RangeSelect } from '@/components/admin/range-select';
import { ProductImage } from '@/components/product/product-image';
import { requirePageAdmin } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { relativeTime } from '@/lib/utils/time';
import { dashboardRangeSchema } from '@/lib/validations/admin';
import type { PaymentMethod } from '@/models/types';
import type { Delta } from '@/services/dashboard';
import { getDashboardMetrics } from '@/services/dashboard';

import { OrderStatusBadge } from '../(shop)/orders/status';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CARD: 'Card',
  UPI: 'UPI',
  NETBANKING: 'Net banking',
  COD: 'Cash on delivery',
  WALLET: 'Amazon Pay balance',
};

const cardClass = 'border-hairline bg-surface rounded-2xl border p-4 sm:p-5';

function DeltaBadge({ delta, days }: { delta: Delta; days: number }) {
  const { percent } = delta;
  const tone =
    percent === null
      ? 'bg-surface-sunken text-ink-muted'
      : percent > 0
        ? 'bg-instock/15 text-instock'
        : percent < 0
          ? 'bg-deal/15 text-deal'
          : 'bg-surface-sunken text-ink-muted';
  const text = percent === null ? 'new' : `${percent > 0 ? '+' : ''}${percent}%`;

  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${tone}`}>
        {text}
      </span>
      <span className="text-ink-subtle text-[10px]">vs prev {days}d</span>
    </span>
  );
}

function PanelHeading({
  title,
  caption,
  action,
}: {
  title: string;
  caption?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-bold">{title}</h2>
      {action ?? (caption && <span className="text-ink-subtle text-[11px]">{caption}</span>)}
    </div>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  await requirePageAdmin();
  const params = await searchParams;
  const { days } = dashboardRangeSchema.parse({ days: params.days });

  const m = await getDashboardMetrics(days);

  const kpis = [
    {
      icon: IndianRupee,
      tone: 'bg-emerald-500/15 text-emerald-400',
      value: formatPaise(m.revenue),
      label: 'Revenue (paid)',
      hint: `${m.paidOrders} paid ${m.paidOrders === 1 ? 'order' : 'orders'}`,
      delta: m.revenueDelta,
    },
    {
      icon: ShoppingCart,
      tone: 'bg-sky-500/15 text-sky-400',
      value: m.totalOrders.toLocaleString('en-IN'),
      label: 'Total orders',
      hint: `${m.openOrders} open now`,
      delta: m.ordersDelta,
    },
    {
      icon: Receipt,
      tone: 'bg-accent-500/15 text-accent-400',
      value: formatPaise(m.averageOrderValue),
      label: 'Avg order value',
      hint: 'per paid order',
      delta: m.averageOrderValueDelta,
    },
    {
      icon: Users,
      tone: 'bg-pink-500/15 text-pink-400',
      value: m.customers.toLocaleString('en-IN'),
      label: 'Unique customers',
      hint: `of ${m.registeredCustomers.toLocaleString('en-IN')} registered`,
      delta: m.customersDelta,
    },
  ] as const;

  const revenueSeries = m.daily.map((point) => ({ date: point.date, value: point.revenue }));
  const orderSeries = m.daily.map((point) => ({ date: point.date, value: point.orders }));

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />

      {/* --------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-ink-muted mt-0.5 text-sm">
            Live figures from real store activity -- computed from orders, payments and stock on
            every load, and refreshed every minute while open.
          </p>
        </div>
        <RangeSelect days={days} />
      </div>

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${kpi.tone}`}
              >
                <kpi.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <DeltaBadge delta={kpi.delta} days={days} />
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums">{kpi.value}</p>
            <p className="text-ink-muted mt-0.5 text-sm">{kpi.label}</p>
            <p className="text-ink-subtle text-xs">{kpi.hint}</p>
          </div>
        ))}
      </div>

      {/* --------------------------------------- revenue + orders by status */}
      <div className="grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="revenue-chart" className={`${cardClass} xl:col-span-2`}>
          <PanelHeading title="Revenue" caption="daily, paid orders" />
          <div className="text-ink mt-3">
            <AreaChart
              points={revenueSeries}
              label={`Daily paid revenue over the last ${days} days`}
            />
          </div>
        </section>

        <section aria-labelledby="orders-by-status" className={cardClass}>
          <PanelHeading title="Orders by status" caption={`last ${days} days`} />
          <div className="mt-4">
            {m.ordersByStatus.length === 0 ? (
              <p className="text-ink-muted text-sm">No orders in this window.</p>
            ) : (
              <TrackBars
                rows={m.ordersByStatus.map((row) => ({
                  label: STATUS_LABELS[row.status] ?? row.status,
                  value: row.count,
                }))}
              />
            )}
          </div>
        </section>
      </div>

      {/* --------------------------------- orders per day + sales by category */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-labelledby="orders-per-day" className={cardClass}>
          <PanelHeading title="Orders per day" caption="all orders" />
          <div className="text-ink mt-3">
            <ColumnChart
              points={orderSeries}
              label={`Orders placed per day over the last ${days} days`}
            />
          </div>
        </section>

        <section aria-labelledby="sales-by-category" className={cardClass}>
          <PanelHeading title="Sales by category" caption="paid orders" />
          <div className="text-ink mt-3">
            {m.salesByCategory.length === 0 ? (
              <p className="text-ink-muted text-sm">No paid sales in this window.</p>
            ) : (
              <HorizontalBarChart
                rows={m.salesByCategory.map((row) => ({ label: row.name, value: row.revenue }))}
                label="Paid revenue by product category"
              />
            )}
          </div>
        </section>
      </div>

      {/* ------------------------------------ recent orders + top products */}
      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-labelledby="recent-orders" className={cardClass}>
          <PanelHeading
            title="Recent orders"
            action={
              <Link href="/admin/orders" className="text-link text-xs hover:underline">
                View all
              </Link>
            }
          />
          <ul className="divide-hairline mt-2 divide-y">
            {m.recentOrders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-link block font-mono text-sm hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="text-ink-subtle block truncate text-xs">
                    {order.customerName}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatPaise(order.total)}
                </span>
                <OrderStatusBadge status={order.orderStatus} />
              </li>
            ))}
            {m.recentOrders.length === 0 && (
              <li className="text-ink-muted py-4 text-sm">No orders yet.</li>
            )}
          </ul>
        </section>

        <section aria-labelledby="top-products" className={cardClass}>
          <PanelHeading title="Top selling products" caption="by units sold" />
          <ul className="divide-hairline mt-2 divide-y">
            {m.topProducts.map((product) => (
              <li key={product.productId} className="flex items-center gap-3 py-2.5">
                <span className="bg-surface-sunken relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                  <ProductImage src={product.thumbnail} alt="" sizes="40px" />
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${product.productId}`}
                    className="hover:text-link line-clamp-1 text-sm font-medium"
                  >
                    {product.name}
                  </Link>
                  <span className="text-ink-subtle block text-xs">{product.units} sold</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatPaise(product.revenue)}
                </span>
              </li>
            ))}
            {m.topProducts.length === 0 && (
              <li className="text-ink-muted py-4 text-sm">No paid sales in this window.</li>
            )}
          </ul>
        </section>
      </div>

      {/* --------------------------------------------------- payments row */}
      <div className="grid gap-4 xl:grid-cols-3">
        <section aria-labelledby="payments-overview" className={cardClass}>
          <PanelHeading title="Payments overview" caption="all time" />
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Collected (paid)</dt>
              <dd className="font-semibold tabular-nums">{formatPaise(m.payments.collected)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Awaiting online payment</dt>
              <dd className="font-semibold tabular-nums">{formatPaise(m.payments.awaiting)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Cash on delivery due</dt>
              <dd className="font-semibold tabular-nums">{formatPaise(m.payments.codDue)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-muted">Refunded</dt>
              <dd className="font-semibold tabular-nums">{formatPaise(m.payments.refunded)}</dd>
            </div>
            <div className="border-hairline flex items-center justify-between gap-3 border-t pt-2.5">
              <dt className="flex items-center gap-1.5 font-semibold">
                <Receipt className="text-ink-subtle h-3.5 w-3.5" aria-hidden="true" />
                Transactions
              </dt>
              <dd className="font-bold tabular-nums">{m.payments.transactions}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="payment-methods" className={cardClass}>
          <PanelHeading title="Payment methods" caption="paid orders" />
          <div className="mt-4">
            {m.paymentMethods.length === 0 ? (
              <p className="text-ink-muted text-sm">No paid orders in this window.</p>
            ) : (
              <TrackBars
                color="amber"
                rows={m.paymentMethods.map((row) => ({
                  label: METHOD_LABELS[row.method] ?? row.method,
                  value: row.revenue,
                  display: compactPaise(row.revenue),
                }))}
              />
            )}
          </div>
        </section>

        <section aria-labelledby="payment-activity" className={cardClass}>
          <PanelHeading title="Recent payment activity" caption="by customer" />
          <div className="mt-3 space-y-3">
            {m.recentPaymentActivity.map((group) => (
              <div key={group.userId} className="bg-surface-sunken/60 rounded-xl p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="bg-accent-500/20 text-accent-400 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                      {group.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-semibold">{group.name}</span>
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      group.total > 0
                        ? 'text-instock'
                        : group.total < 0
                          ? 'text-deal'
                          : 'text-ink-muted'
                    }`}
                  >
                    {group.total !== 0 ? formatPaise(group.total) : '--'}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {group.events.map((event, index) => (
                    <li
                      key={`${event.at}-${index}`}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            event.kind === 'paid'
                              ? 'bg-instock'
                              : event.kind === 'failed' || event.kind === 'cancelled'
                                ? 'bg-deal'
                                : event.kind === 'refunded'
                                  ? 'bg-accent-400'
                                  : 'bg-link'
                          }`}
                        />
                        <span className="text-ink-muted truncate">
                          {event.label}
                          {event.orderNumber && (
                            <span className="text-ink-subtle font-mono"> {event.orderNumber}</span>
                          )}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 tabular-nums">
                        {event.amount !== null && (
                          <span
                            className={
                              event.kind === 'paid'
                                ? 'text-instock font-semibold'
                                : event.kind === 'refunded'
                                  ? 'text-accent-400 font-semibold'
                                  : 'text-ink-muted'
                            }
                          >
                            {event.kind === 'paid' ? '+' : event.kind === 'refunded' ? '-' : ''}
                            {formatPaise(event.amount)}
                          </span>
                        )}
                        <span className="text-ink-subtle">{relativeTime(event.at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {m.recentPaymentActivity.length === 0 && (
              <p className="text-ink-muted text-sm">No payment activity recorded yet.</p>
            )}
          </div>
        </section>
      </div>

      {/* --------------------------------------------------- inventory row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            href: '/admin/products',
            icon: Package,
            value: m.activeProducts,
            label: 'Products',
          },
          {
            href: '/admin/orders?status=PENDING',
            icon: Clock,
            value: m.pendingOrders,
            label: 'Pending orders',
          },
          {
            href: '/admin/products?low=1',
            icon: AlertTriangle,
            value: m.lowStock,
            label: 'Low-stock items',
          },
        ].map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`${cardClass} hover:bg-surface-muted flex items-center gap-3`}
          >
            <span className="bg-accent-500/15 text-accent-400 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <tile.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-2xl font-bold tabular-nums">
                {tile.value.toLocaleString('en-IN')}
              </span>
              <span className="text-ink-muted block text-sm">{tile.label}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* --------------------------------------------------- quick actions */}
      <section aria-labelledby="quick-actions" className={cardClass}>
        <h2 id="quick-actions" className="text-sm font-bold">
          Quick actions
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: '/admin/products/new', icon: PackagePlus, label: 'Add product' },
            { href: '/admin/categories?add=1', icon: Tags, label: 'Add category' },
            { href: '/admin/products?low=1', icon: Warehouse, label: 'Manage inventory' },
            { href: '/admin/orders', icon: ShoppingBag, label: 'View orders' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="border-hairline bg-surface-sunken/60 hover:bg-surface-muted flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold"
            >
              <action.icon className="text-accent-400 h-5 w-5" aria-hidden="true" />
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
