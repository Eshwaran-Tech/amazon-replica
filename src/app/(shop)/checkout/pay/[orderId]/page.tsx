import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { requirePageUser } from '@/lib/auth/guards';
import { ordersCollection } from '@/lib/db/collections';
import { formatPaise } from '@/lib/utils/money';

import { GatewayForm } from './gateway-form';

export const metadata: Metadata = {
  title: 'Complete payment',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  params: Promise<{ orderId: string }>;
}

/**
 * Payment step for an order awaiting payment.
 *
 * Ownership is enforced in the query itself: the order is looked up by id
 * *and* the session's user id together. Someone else's order id -- or a
 * malformed one -- lands on the same 404, which confirms nothing.
 */
export default async function PayPage({ params }: PageProps) {
  const session = await requirePageUser('/cart');
  const { orderId } = await params;

  if (!ObjectId.isValid(orderId)) notFound();

  const orders = await ordersCollection();
  const order = await orders.findOne({
    _id: new ObjectId(orderId),
    userId: new ObjectId(session.user.id),
  });

  if (!order) notFound();
  if (order.paymentStatus === 'PAID') redirect(`/checkout/confirmation/${orderId}`);
  if (order.paymentMethod === 'COD') redirect(`/checkout/confirmation/${orderId}`);

  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">Complete your payment</h1>
      <p className="text-ink-muted mt-1 text-sm">
        Order <span className="text-ink font-mono font-semibold">{order.orderNumber}</span> --
        amount due <span className="text-ink font-semibold">{formatPaise(order.total)}</span>.
      </p>

      {order.payment.failureReason && (
        <p className="text-deal mt-2 text-sm">
          Previous attempt failed ({order.payment.failureReason.replace(/_/g, ' ')}). You can try
          again.
        </p>
      )}

      <div className="border-hairline bg-surface mt-5 rounded-2xl border p-4 sm:p-5">
        <GatewayForm
          orderId={orderId}
          method={order.paymentMethod}
          totalFormatted={formatPaise(order.total)}
          csrfField={<CsrfField />}
        />
      </div>

      <p className="text-ink-subtle mt-4 text-xs">
        Your items are reserved. If you leave now, you can finish paying from{' '}
        <Link href="/orders" className="text-link hover:underline">
          Your Orders
        </Link>
        .
      </p>
    </Container>
  );
}
