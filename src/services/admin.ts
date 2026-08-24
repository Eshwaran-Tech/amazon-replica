import { ObjectId, type Filter } from 'mongodb';
import { BRAND_NAME } from '@/lib/brand';

import {
  auditLogsCollection,
  categoriesCollection,
  ordersCollection,
  productsCollection,
  usersCollection,
} from '@/lib/db/collections';
import { slugify } from '@/lib/utils/slug';
import { recordAudit, recordAuditAndAlert } from '@/lib/security/audit';
import {
  LOW_STOCK_THRESHOLD,
  computeDiscountPercentage,
  toAdminProductView,
  type AdminProductView,
  type ProductDoc,
} from '@/models/product';
import { toCategoryView, type CategoryDoc, type CategoryView } from '@/models/category';
import {
  toAdminOrderView,
  toOrderSummaryView,
  type AdminOrderView,
  type OrderDoc,
  type OrderSummaryView,
} from '@/models/order';
import { primaryContact, toAdminUserView, type AdminUserView, type UserDoc } from '@/models/user';
import {
  canTransitionOrderStatus,
  ORDER_STATUS_TRANSITIONS,
  type AuditAction,
  type OrderStatus,
  type UserRole,
} from '@/models/types';
import { executeCancellation } from '@/services/orders';
import type { AdjustInventoryInput } from '@/lib/validations/admin';
import type { CategoryCreateInput, CategoryUpdateInput } from '@/lib/validations/category';
import type { ProductCreateInput, ProductUpdateInput } from '@/lib/validations/product';

import '@/lib/server-guard';

/**
 * Admin operations.
 *
 * Every function here assumes the caller has already been through
 * `requireApiAdmin`/`requirePageAdmin` -- the *service* re-checks nothing about
 * the session, but it does enforce the business rules that need current state:
 * legal order-status transitions, "you cannot demote yourself", "the last
 * admin stays", and "a category with products in it does not disappear".
 *
 * Every mutation lands in the audit log with the acting admin's id.
 */

export interface AdminActor {
  id: ObjectId;
  ip: string;
}

export type AdminResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string };

const PAGE_SIZE = 20;

// Dashboard metrics live in `@/services/dashboard` -- they are read-heavy
// aggregation, kept apart from the mutation surface in this file.

// ----------------------------------------------------------------- products

export interface AdminProductList {
  products: AdminProductView[];
  page: number;
  hasMore: boolean;
}

/** Escapes user text before it becomes part of a regular expression. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function adminListProducts(options: {
  q?: string;
  page?: number;
  /** Only products at or below the low-stock threshold, lowest first. */
  lowStock?: boolean;
}): Promise<AdminProductList> {
  const page = options.page && options.page >= 1 && options.page <= 1000 ? options.page : 1;
  const products = await productsCollection();

  const filter: Filter<ProductDoc> = {};
  const q = options.q?.trim().slice(0, 60);
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { brand: pattern }, { slug: pattern }];
  }
  if (options.lowStock) {
    filter.isActive = true;
    filter.stock = { $lte: LOW_STOCK_THRESHOLD };
  }

  const docs = await products
    .find(filter)
    .sort(options.lowStock ? { stock: 1, updatedAt: -1 } : { updatedAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .toArray();

  return {
    products: docs.slice(0, PAGE_SIZE).map(toAdminProductView),
    page,
    hasMore: docs.length > PAGE_SIZE,
  };
}

export async function adminGetProduct(productId: string): Promise<ProductDoc | null> {
  if (!ObjectId.isValid(productId)) return null;
  const products = await productsCollection();
  return products.findOne({ _id: new ObjectId(productId) });
}

async function uniqueProductSlug(name: string): Promise<string> {
  const products = await productsCollection();
  const base = slugify(name);
  let candidate = base;
  for (let attempt = 2; attempt < 20; attempt += 1) {
    const existing = await products.findOne({ slug: candidate }, { projection: { _id: 1 } });
    if (!existing) return candidate;
    candidate = `${base}-${attempt}`;
  }
  // Astronomically unlikely with real product names; fall back to entropy.
  return `${base}-${new ObjectId().toHexString().slice(-6)}`;
}

export async function createProduct(
  input: ProductCreateInput,
  actor: AdminActor,
): Promise<AdminResult<{ productId: string }>> {
  const products = await productsCollection();
  const now = new Date();

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: input.name,
    slug: await uniqueProductSlug(input.name),
    description: input.description,
    brand: input.brand,
    category: input.category,
    subcategory: input.subcategory ?? null,
    price: input.price,
    discountPrice: input.discountPrice ?? null,
    discountPercentage: computeDiscountPercentage(input.price, input.discountPrice ?? null),
    images: input.images,
    thumbnail: input.thumbnail,
    stock: input.stock,
    rating: 0,
    reviewCount: 0,
    features: input.features,
    specifications: input.specifications,
    isFeatured: input.isFeatured,
    isPrime: input.isPrime,
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  };

  await products.insertOne(doc);

  await recordAudit({
    action: 'admin.product.created',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'product',
    targetId: doc._id.toHexString(),
    ip: actor.ip,
    metadata: { name: doc.name, slug: doc.slug, price: doc.price, stock: doc.stock },
  });

  return { ok: true, value: { productId: doc._id.toHexString() } };
}

export async function updateProduct(
  input: ProductUpdateInput,
  actor: AdminActor,
): Promise<AdminResult> {
  const products = await productsCollection();

  // The slug survives edits: it is the product's public URL, already indexed
  // and printed on order snapshots.
  const updated = await products.findOneAndUpdate(
    { _id: new ObjectId(input.productId) },
    {
      $set: {
        name: input.name,
        description: input.description,
        brand: input.brand,
        category: input.category,
        subcategory: input.subcategory ?? null,
        price: input.price,
        discountPrice: input.discountPrice ?? null,
        discountPercentage: computeDiscountPercentage(input.price, input.discountPrice ?? null),
        images: input.images,
        thumbnail: input.thumbnail,
        stock: input.stock,
        features: input.features,
        specifications: input.specifications,
        isFeatured: input.isFeatured,
        isPrime: input.isPrime,
        isActive: input.isActive,
        updatedAt: new Date(),
      },
    },
  );

  if (!updated) return { ok: false, message: 'We could not find that product.' };

  await recordAudit({
    action: 'admin.product.updated',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'product',
    targetId: input.productId,
    ip: actor.ip,
    metadata: {
      name: input.name,
      priceBefore: updated.price,
      priceAfter: input.price,
      stockBefore: updated.stock,
      stockAfter: input.stock,
    },
  });

  return { ok: true, value: undefined };
}

export async function setProductActive(
  productId: string,
  isActive: boolean,
  actor: AdminActor,
): Promise<AdminResult> {
  const products = await productsCollection();
  const updated = await products.findOneAndUpdate(
    { _id: new ObjectId(productId) },
    { $set: { isActive, updatedAt: new Date() } },
  );
  if (!updated) return { ok: false, message: 'We could not find that product.' };

  await recordAudit({
    // Deactivation is this storefront's delete: past orders keep their
    // snapshots and the document stays queryable.
    action: isActive ? 'admin.product.updated' : 'admin.product.deleted',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'product',
    targetId: productId,
    ip: actor.ip,
    metadata: { name: updated.name, isActive },
  });

  return { ok: true, value: undefined };
}

export async function adjustInventory(
  input: AdjustInventoryInput,
  actor: AdminActor,
): Promise<AdminResult> {
  const products = await productsCollection();
  const updated = await products.findOneAndUpdate(
    { _id: new ObjectId(input.productId) },
    { $set: { stock: input.stock, updatedAt: new Date() } },
  );
  if (!updated) return { ok: false, message: 'We could not find that product.' };

  // Inventory is money: the mandatory reason and both numbers go on record.
  await recordAuditAndAlert(
    {
      action: 'admin.inventory.adjusted',
      actorId: actor.id,
      actorRole: 'ADMIN',
      targetType: 'product',
      targetId: input.productId,
      ip: actor.ip,
      metadata: {
        name: updated.name,
        stockBefore: updated.stock,
        stockAfter: input.stock,
        reason: input.reason,
      },
    },
    'info',
  );

  return { ok: true, value: undefined };
}

// --------------------------------------------------------------- categories

export interface AdminCategoryRow extends CategoryView {
  displayOrder: number;
  isActive: boolean;
  productCount: number;
}

export async function adminListCategories(): Promise<AdminCategoryRow[]> {
  const categories = await categoriesCollection();
  const products = await productsCollection();

  const docs = await categories.find({}).sort({ parentSlug: 1, displayOrder: 1 }).toArray();

  const counts = await products
    .aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ])
    .toArray();
  const countBySlug = new Map(counts.map((row) => [row._id, row.count]));

  return docs.map((doc) => ({
    ...toCategoryView(doc),
    displayOrder: doc.displayOrder,
    isActive: doc.isActive,
    productCount: countBySlug.get(doc.slug) ?? 0,
  }));
}

async function assertValidParent(
  parentSlug: string | null,
  ownSlug: string,
): Promise<string | null> {
  if (!parentSlug) return null;
  const categories = await categoriesCollection();
  const parent = await categories.findOne({ slug: parentSlug });
  if (!parent) return 'The parent category does not exist.';
  if (parent.parentSlug !== null) {
    return 'Categories nest one level deep: the parent must be a top-level category.';
  }
  // A parent that is (or would become) a child of this category is a cycle.
  if (parent.slug === ownSlug) return 'A category cannot be its own parent.';
  return null;
}

export async function createCategory(
  input: CategoryCreateInput,
  actor: AdminActor,
): Promise<AdminResult> {
  const categories = await categoriesCollection();

  const parentProblem = await assertValidParent(input.parentSlug, input.slug);
  if (parentProblem) return { ok: false, message: parentProblem };

  const existing = await categories.findOne({ slug: input.slug }, { projection: { _id: 1 } });
  if (existing) return { ok: false, message: 'A category with that slug already exists.' };

  const now = new Date();
  const doc: CategoryDoc = {
    _id: new ObjectId(),
    name: input.name,
    slug: input.slug,
    description: input.description || null,
    image: input.image ?? null,
    parentSlug: input.parentSlug,
    displayOrder: input.displayOrder,
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  };
  await categories.insertOne(doc);

  await recordAudit({
    action: 'admin.category.created',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'category',
    targetId: doc._id.toHexString(),
    ip: actor.ip,
    metadata: { name: doc.name, slug: doc.slug, parentSlug: doc.parentSlug },
  });

  return { ok: true, value: undefined };
}

export async function updateCategory(
  input: CategoryUpdateInput,
  actor: AdminActor,
): Promise<AdminResult> {
  const categories = await categoriesCollection();

  const current = await categories.findOne({ _id: new ObjectId(input.categoryId) });
  if (!current) return { ok: false, message: 'We could not find that category.' };

  const parentProblem = await assertValidParent(input.parentSlug, current.slug);
  if (parentProblem) return { ok: false, message: parentProblem };

  if (input.parentSlug) {
    // Becoming a subcategory is only possible with no children of its own --
    // the taxonomy is two levels, and orphaning grandchildren silently is worse
    // than refusing.
    const child = await categories.findOne(
      { parentSlug: current.slug },
      { projection: { _id: 1 } },
    );
    if (child) {
      return { ok: false, message: 'This category has subcategories, so it must stay top-level.' };
    }
  }

  // The slug is the category's public URL and the value products reference --
  // it survives edits, same rule as product slugs.
  await categories.updateOne(
    { _id: current._id },
    {
      $set: {
        name: input.name,
        description: input.description || null,
        image: input.image ?? null,
        parentSlug: input.parentSlug,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
        updatedAt: new Date(),
      },
    },
  );

  await recordAudit({
    action: 'admin.category.updated',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'category',
    targetId: input.categoryId,
    ip: actor.ip,
    metadata: { name: input.name, slug: current.slug, isActive: input.isActive },
  });

  return { ok: true, value: undefined };
}

export async function deleteCategory(categoryId: string, actor: AdminActor): Promise<AdminResult> {
  const categories = await categoriesCollection();
  const products = await productsCollection();

  const current = await categories.findOne({ _id: new ObjectId(categoryId) });
  if (!current) return { ok: false, message: 'We could not find that category.' };

  const [childCount, productCount] = await Promise.all([
    categories.countDocuments({ parentSlug: current.slug }),
    products.countDocuments({ category: current.slug }),
  ]);
  if (childCount > 0) {
    return { ok: false, message: `Move or delete its ${childCount} subcategories first.` };
  }
  if (productCount > 0) {
    return {
      ok: false,
      message: `${productCount} products live in this category. Move them first, or deactivate the category instead.`,
    };
  }

  await categories.deleteOne({ _id: current._id });

  await recordAudit({
    action: 'admin.category.deleted',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'category',
    targetId: categoryId,
    ip: actor.ip,
    metadata: { name: current.name, slug: current.slug },
  });

  return { ok: true, value: undefined };
}

// ------------------------------------------------------------------- orders

export interface AdminOrderList {
  orders: OrderSummaryView[];
  page: number;
  hasMore: boolean;
}

export async function adminListOrders(options: {
  status?: OrderStatus;
  q?: string;
  page?: number;
}): Promise<AdminOrderList> {
  const page = options.page && options.page >= 1 && options.page <= 1000 ? options.page : 1;
  const orders = await ordersCollection();

  const filter: Filter<OrderDoc> = {};
  if (options.status) filter.orderStatus = options.status;
  const q = options.q?.trim().toUpperCase().slice(0, 20);
  if (q) filter.orderNumber = q.startsWith('NK-') ? q : `NK-${q}`;

  const docs = await orders
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .toArray();

  return {
    orders: docs.slice(0, PAGE_SIZE).map(toOrderSummaryView),
    page,
    hasMore: docs.length > PAGE_SIZE,
  };
}

export interface AdminOrderDetail {
  order: AdminOrderView;
  /** `contact` is the email or, for mobile-only accounts, the phone number. */
  customer: { name: string; contact: string } | null;
  /** The transitions the state machine allows from here. */
  nextStatuses: readonly OrderStatus[];
}

export async function adminGetOrder(orderId: string): Promise<AdminOrderDetail | null> {
  if (!ObjectId.isValid(orderId)) return null;
  const orders = await ordersCollection();
  const doc = await orders.findOne({ _id: new ObjectId(orderId) });
  if (!doc) return null;

  const users = await usersCollection();
  const owner = await users.findOne(
    { _id: doc.userId },
    { projection: { name: 1, email: 1, phone: 1 } },
  );

  return {
    order: toAdminOrderView(doc),
    customer: owner
      ? {
          name: owner.name,
          contact: primaryContact({ email: owner.email ?? null, phone: owner.phone ?? null }),
        }
      : null,
    nextStatuses: ORDER_STATUS_TRANSITIONS[doc.orderStatus],
  };
}

export async function adminUpdateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  note: string,
  actor: AdminActor,
): Promise<AdminResult> {
  if (!ObjectId.isValid(orderId)) return { ok: false, message: 'We could not find that order.' };
  const orders = await ordersCollection();
  const order = await orders.findOne({ _id: new ObjectId(orderId) });
  if (!order) return { ok: false, message: 'We could not find that order.' };

  if (!canTransitionOrderStatus(order.orderStatus, nextStatus)) {
    return {
      ok: false,
      message: `An order cannot move from ${order.orderStatus} to ${nextStatus}.`,
    };
  }

  // Cancellation is not a plain status write: stock must come back and a paid
  // order must be refunded. It goes through the same core the customer uses.
  if (nextStatus === 'CANCELLED') {
    const result = await executeCancellation(
      { _id: order._id },
      { actorId: actor.id, note: note || `Cancelled by ${BRAND_NAME}`, ip: actor.ip },
    );
    if (!result.ok) return { ok: false, message: result.message };
  } else {
    const now = new Date();
    // COD settles in cash at the doorstep: DELIVERED is the moment the money
    // actually arrives. Online payments still have exactly one PAID writer
    // (`recordPaymentResult`); this branch exists only where no provider is
    // involved, and it is audited below like any payment event.
    const codSettles =
      nextStatus === 'DELIVERED' &&
      order.paymentMethod === 'COD' &&
      order.paymentStatus === 'PENDING';

    const updated = await orders.updateOne(
      { _id: order._id, orderStatus: order.orderStatus },
      {
        $set: {
          orderStatus: nextStatus,
          updatedAt: now,
          ...(codSettles ? { paymentStatus: 'PAID' as const, 'payment.paidAt': now } : {}),
        },
        $push: {
          statusHistory: {
            status: nextStatus,
            at: now,
            byUserId: actor.id,
            note: note || (codSettles ? 'Delivered; cash collected' : null),
          },
        },
      },
    );
    if (updated.modifiedCount === 0) {
      return { ok: false, message: 'The order changed underneath you. Reload and try again.' };
    }

    if (codSettles) {
      await recordAudit({
        action: 'payment.succeeded',
        actorId: actor.id,
        actorRole: 'ADMIN',
        targetType: 'order',
        targetId: orderId,
        ip: actor.ip,
        metadata: { orderNumber: order.orderNumber, amount: order.total, via: 'cod-delivery' },
      });
    }
  }

  await recordAudit({
    action: 'admin.order.status.changed',
    actorId: actor.id,
    actorRole: 'ADMIN',
    targetType: 'order',
    targetId: orderId,
    ip: actor.ip,
    metadata: {
      orderNumber: order.orderNumber,
      from: order.orderStatus,
      to: nextStatus,
      note: note || null,
    },
  });

  return { ok: true, value: undefined };
}

// -------------------------------------------------------------------- users

export interface AdminUserList {
  users: AdminUserView[];
  page: number;
  hasMore: boolean;
}

export async function adminListUsers(options: {
  q?: string;
  page?: number;
}): Promise<AdminUserList> {
  const page = options.page && options.page >= 1 && options.page <= 1000 ? options.page : 1;
  const users = await usersCollection();

  const filter: Filter<UserDoc> = {};
  const q = options.q?.trim().toLowerCase().slice(0, 60);
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ email: pattern }, { name: pattern }];
  }

  const docs = await users
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .toArray();

  return {
    users: docs.slice(0, PAGE_SIZE).map(toAdminUserView),
    page,
    hasMore: docs.length > PAGE_SIZE,
  };
}

/** True when `userId` is the only enabled admin left. */
async function isLastAdmin(userId: ObjectId): Promise<boolean> {
  const users = await usersCollection();
  const anotherAdmin = await users.findOne(
    { _id: { $ne: userId }, role: 'ADMIN', isDisabled: false },
    { projection: { _id: 1 } },
  );
  return anotherAdmin === null;
}

export async function setUserRole(
  targetUserId: string,
  role: UserRole,
  actor: AdminActor,
): Promise<AdminResult> {
  const targetId = new ObjectId(targetUserId);

  // Self-service role changes are how a compromised admin session escalates
  // quietly, and how an admin locks themselves out. Both are refused.
  if (targetId.equals(actor.id)) {
    return { ok: false, message: 'You cannot change your own role.' };
  }

  const users = await usersCollection();
  const target = await users.findOne({ _id: targetId });
  if (!target) return { ok: false, message: 'We could not find that user.' };
  if (target.role === role) return { ok: true, value: undefined };

  if (role === 'USER' && target.role === 'ADMIN' && (await isLastAdmin(targetId))) {
    return { ok: false, message: 'This is the last admin account. Promote someone else first.' };
  }

  await users.updateOne({ _id: targetId }, { $set: { role, updatedAt: new Date() } });

  await recordAuditAndAlert(
    {
      action: 'admin.user.role.changed',
      actorId: actor.id,
      actorRole: 'ADMIN',
      targetType: 'user',
      targetId: targetUserId,
      ip: actor.ip,
      metadata: { email: target.email, from: target.role, to: role },
    },
    'warn',
  );

  return { ok: true, value: undefined };
}

export async function setUserDisabled(
  targetUserId: string,
  isDisabled: boolean,
  reason: string,
  actor: AdminActor,
): Promise<AdminResult> {
  const targetId = new ObjectId(targetUserId);

  if (targetId.equals(actor.id)) {
    return { ok: false, message: 'You cannot disable your own account.' };
  }

  const users = await usersCollection();
  const target = await users.findOne({ _id: targetId });
  if (!target) return { ok: false, message: 'We could not find that user.' };

  if (isDisabled && target.role === 'ADMIN' && (await isLastAdmin(targetId))) {
    return { ok: false, message: 'This is the last admin account. Promote someone else first.' };
  }

  // `isDisabled` is checked at session resolution, so every existing session
  // dies on its next request -- no separate revocation sweep needed.
  await users.updateOne({ _id: targetId }, { $set: { isDisabled, updatedAt: new Date() } });

  await recordAuditAndAlert(
    {
      action: isDisabled ? 'admin.user.disabled' : 'admin.user.enabled',
      actorId: actor.id,
      actorRole: 'ADMIN',
      targetType: 'user',
      targetId: targetUserId,
      ip: actor.ip,
      metadata: { email: target.email, reason: reason || null },
    },
    'warn',
  );

  return { ok: true, value: undefined };
}

// --------------------------------------------------------------- audit logs

export interface AuditLogRow {
  id: string;
  action: string;
  actorId: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogList {
  entries: AuditLogRow[];
  page: number;
  hasMore: boolean;
}

export async function listAuditLogs(options: {
  action?: AuditAction;
  page?: number;
}): Promise<AuditLogList> {
  const page = options.page && options.page >= 1 && options.page <= 1000 ? options.page : 1;
  const auditLogs = await auditLogsCollection();

  const filter = options.action ? { action: options.action } : {};
  const docs = await auditLogs
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1)
    .toArray();

  return {
    entries: docs.slice(0, PAGE_SIZE).map((doc) => ({
      id: doc._id.toHexString(),
      action: doc.action,
      actorId: doc.actorId ? doc.actorId.toHexString() : null,
      actorRole: doc.actorRole ?? null,
      targetType: doc.targetType ?? null,
      targetId: doc.targetId ?? null,
      ip: doc.ip ?? null,
      metadata: doc.metadata ?? null,
      createdAt: doc.createdAt.toISOString(),
    })),
    page,
    hasMore: docs.length > PAGE_SIZE,
  };
}
