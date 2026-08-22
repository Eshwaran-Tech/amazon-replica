import Link from 'next/link';

import type { OrderStatus, PaymentStatus } from '@/models/types';

/**
 * Status presentation shared by the order list and the order detail page.
 *
 * Server Components: pure markup, no state. Colour is never the only carrier
 * of meaning -- every badge spells its status out in text (WCAG 1.4.1).
 */

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being prepared',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

const STATUS_CLASSES: Record<OrderStatus, string> = {
  PENDING: 'bg-accent-500/15 text-accent-400 border-accent-500/40',
  CONFIRMED: 'bg-instock/10 text-instock border-instock/40',
  PROCESSING: 'bg-instock/10 text-instock border-instock/40',
  SHIPPED: 'bg-link/10 text-link border-link/40',
  DELIVERED: 'bg-instock/10 text-instock border-instock/40',
  CANCELLED: 'bg-deal/10 text-deal border-deal/40',
  RETURNED: 'bg-surface-sunken text-ink-muted border-hairline',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

interface PaymentStatusNoteProps {
  orderId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
}

/** The one-line payment situation under a badge, with a pay link when useful. */
export function PaymentStatusNote({ orderId, orderStatus, paymentStatus }: PaymentStatusNoteProps) {
  if (paymentStatus === 'PENDING' && orderStatus === 'PENDING') {
    return (
      <p className="text-deal mt-1 text-xs">
        Payment not completed --{' '}
        <Link href={`/checkout/pay/${orderId}`} className="text-link font-semibold hover:underline">
          pay now
        </Link>{' '}
        to confirm this order.
      </p>
    );
  }
  if (paymentStatus === 'REFUNDED') {
    return <p className="text-ink-muted mt-1 text-xs">Refund issued to your payment method.</p>;
  }
  if (paymentStatus === 'PAID' && orderStatus === 'CANCELLED') {
    return <p className="text-ink-muted mt-1 text-xs">Refund is being processed.</p>;
  }
  return null;
}
