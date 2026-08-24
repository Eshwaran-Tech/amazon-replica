import type { ObjectId } from 'mongodb';

import type { Paise } from '@/lib/utils/money';

import type { Address, OrderStatus, PaymentMethod, PaymentStatus } from './types';

/**
 * An order line.
 *
 * Product details are **snapshotted** at purchase time. An order is a financial
 * record of what was actually sold at what price; if it joined live to the
 * catalogue, renaming a product or running a sale would retroactively rewrite
 * every past invoice. `productId` is kept for linking, not for reading price.
 */
export interface OrderItemDoc {
  productId: ObjectId;
  name: string;
  slug: string;
  brand: string;
  thumbnail: string;
  /** Price per unit actually charged, server-computed. */
  unitPrice: Paise;
  /** List price at the time, so the invoice can show the saving. */
  listPrice: Paise;
  quantity: number;
  lineTotal: Paise;
}

export interface OrderPaymentDoc {
  /** `wallet` means it was settled from the Eshwaran Pay ledger, not a gateway. */
  provider: 'mock' | 'stripe' | 'wallet';
  /** Provider-side intent/charge id. Not secret, but not shown to the customer. */
  intentId?: string | null;
  /** Idempotency key we generated for this attempt. */
  reference?: string | null;
  paidAt?: Date | null;
  /** Coarse reason only; never the provider's raw error payload. */
  failureReason?: string | null;
}

export interface OrderStatusEvent {
  status: OrderStatus;
  at: Date;
  /** Admin id when a human changed it; null for system transitions. */
  byUserId?: ObjectId | null;
  note?: string | null;
}

export interface OrderDoc {
  _id: ObjectId;
  /** Human-facing id (e.g. NK-2A7F3C91). Never the ObjectId. */
  orderNumber: string;
  userId: ObjectId;

  items: OrderItemDoc[];
  /** Snapshot, not a reference: editing an address must not alter past orders. */
  shippingAddress: Address;

  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  payment: OrderPaymentDoc;

  currency: 'INR';
  /** All server-computed. No client-supplied amount is ever stored. */
  subtotal: Paise;
  discount: Paise;
  shipping: Paise;
  tax: Paise;
  total: Paise;

  statusHistory: OrderStatusEvent[];

  /** True once stock has been decremented, so cancellation knows to restore it. */
  stockCommitted: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemView {
  productId: string;
  name: string;
  slug: string;
  brand: string;
  thumbnail: string;
  unitPrice: Paise;
  listPrice: Paise;
  quantity: number;
  lineTotal: Paise;
}

export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  total: Paise;
  itemCount: number;
  /** First few thumbnails, for the order-history row. */
  previewImages: string[];
  createdAt: string;
}

export interface OrderDetailView extends OrderSummaryView {
  items: OrderItemView[];
  shippingAddress: Address;
  paymentMethod: PaymentMethod;
  subtotal: Paise;
  discount: Paise;
  shipping: Paise;
  tax: Paise;
  statusHistory: Array<{ status: OrderStatus; at: string; note: string | null }>;
}

/**
 * Customer-facing detail.
 *
 * `payment.intentId` and the raw failure reason are deliberately dropped: they
 * are provider-side identifiers with no customer value, and echoing them widens
 * what an attacker learns from an order they should not have seen in the first
 * place.
 */
export function toOrderDetailView(doc: OrderDoc): OrderDetailView {
  return {
    ...toOrderSummaryView(doc),
    items: doc.items.map(toOrderItemView),
    shippingAddress: doc.shippingAddress,
    paymentMethod: doc.paymentMethod,
    subtotal: doc.subtotal,
    discount: doc.discount,
    shipping: doc.shipping,
    tax: doc.tax,
    statusHistory: doc.statusHistory.map((event) => ({
      status: event.status,
      at: event.at.toISOString(),
      note: event.note ?? null,
    })),
  };
}

export function toOrderItemView(item: OrderItemDoc): OrderItemView {
  return {
    productId: item.productId.toHexString(),
    name: item.name,
    slug: item.slug,
    brand: item.brand,
    thumbnail: item.thumbnail,
    unitPrice: item.unitPrice,
    listPrice: item.listPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  };
}

export function toOrderSummaryView(doc: OrderDoc): OrderSummaryView {
  return {
    id: doc._id.toHexString(),
    orderNumber: doc.orderNumber,
    orderStatus: doc.orderStatus,
    paymentStatus: doc.paymentStatus,
    total: doc.total,
    itemCount: doc.items.reduce((sum, item) => sum + item.quantity, 0),
    previewImages: doc.items.slice(0, 4).map((item) => item.thumbnail),
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Admin view adds the operational fields a customer has no need for. */
export interface AdminOrderView extends OrderDetailView {
  userId: string;
  paymentProvider: string;
  paymentIntentId: string | null;
  stockCommitted: boolean;
  updatedAt: string;
}

export function toAdminOrderView(doc: OrderDoc): AdminOrderView {
  return {
    ...toOrderDetailView(doc),
    userId: doc.userId.toHexString(),
    paymentProvider: doc.payment.provider,
    paymentIntentId: doc.payment.intentId ?? null,
    stockCommitted: doc.stockCommitted,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
