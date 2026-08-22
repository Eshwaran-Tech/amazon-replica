/**
 * Shared domain enums.
 *
 * Declared as `as const` tuples rather than TypeScript `enum`s so the same
 * array can drive the Zod schema (`z.enum(ORDER_STATUSES)`), the union type,
 * and any UI that needs to iterate the options. One definition, no drift.
 */

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'COD', 'WALLET'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Methods that settle without an external gateway.
 *
 * COD settles on delivery and WALLET settles inside our own checkout
 * transaction, so neither has a payment intent to create and neither should be
 * routed to the pay screen.
 */
export const OFFLINE_PAYMENT_METHODS: readonly PaymentMethod[] = ['COD', 'WALLET'];

/**
 * Legal order status transitions.
 *
 * Encoded as data so the admin API can reject `DELIVERED -> PENDING` or
 * `CANCELLED -> SHIPPED` by lookup rather than by a chain of ifs someone will
 * eventually get wrong. Terminal states have no outgoing transitions.
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  RETURNED: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/** Statuses in which stock has been committed and must be released on cancel. */
export const STOCK_COMMITTED_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
];

export const ADDRESS_TYPES = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

/** A postal address. Embedded in users and snapshotted onto orders. */
export interface Address {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  type: AddressType;
  isDefault: boolean;
}

/** Audit log action names. Extend here, never inline a string at a call site. */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login.failed',
  'auth.logout',
  'auth.register',
  'auth.password.changed',
  'auth.password.reset',
  'auth.email.verified',
  'auth.otp.sent',
  'auth.otp.failed',
  'admin.product.created',
  'admin.product.updated',
  'admin.product.deleted',
  'admin.category.created',
  'admin.category.updated',
  'admin.category.deleted',
  'admin.order.status.changed',
  'admin.user.role.changed',
  'admin.user.disabled',
  'admin.user.enabled',
  'admin.inventory.adjusted',
  'order.placed',
  'order.cancelled',
  'payment.succeeded',
  'payment.failed',
  'payment.refunded',
  'bus.booked',
  'train.booked',
  'hotel.booked',
  'giftcard.purchased',
  'corporate.enquiry',
  'reward.collected',
  'ticket.raised',
  'ticket.resolved',
  'card.saved',
  'card.removed',
  'recharge.completed',
  'insurance.policy.bought',
  'fastag.issued',
  'fastag.recharged',
  'metro.card.added',
  'metro.recharged',
  'bill.paid',
  'lpg.booked',
  'credit.topped.up',
  'credit.auto.reloaded',
  'video.rented',
  'video.channel.subscribed',
  'prime.joined',
  'prime.cancelled',
  'wallet.giftcard.redeemed',
  'wallet.topup.created',
  'wallet.topup.completed',
  'wallet.topup.failed',
  'review.created',
  'review.deleted',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
