import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { hashPassword } from '@/lib/auth/password';
import { closeMongoClient } from '@/lib/db/client';
import {
  auditLogsCollection,
  categoriesCollection,
  ordersCollection,
  productsCollection,
  usersCollection,
} from '@/lib/db/collections';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import type { ProductDoc } from '@/models/product';
import type { AuditAction } from '@/models/types';
import type { UserDoc } from '@/models/user';
import type { AddressInput } from '@/lib/validations/user';
import {
  adjustInventory,
  adminUpdateOrderStatus,
  createCategory,
  createProduct,
  deleteCategory,
  setProductActive,
  setUserDisabled,
  setUserRole,
  updateCategory,
  updateProduct,
} from '@/services/admin';
import { addToCart } from '@/services/cart';
import { placeOrder } from '@/services/checkout';
import { processMockCardPayment } from '@/services/payment';
import { MOCK_TEST_CARDS } from '@/lib/payments/mock';

/**
 * Phase 11 verification: the admin business rules that need current state --
 * legal status transitions, cancellation through the shared core, the
 * last-admin and self-service guards, category integrity, and the audit trail
 * every mutation must leave.
 */

let counter = 0;
const ADMIN_IP = '10.99.0.4';

const ADDRESS: AddressInput = {
  fullName: 'Admin Tester',
  phone: '9800000499',
  line1: '1 Control Room',
  line2: '',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500001',
  country: 'India',
  type: 'HOME',
  isDefault: false,
};

async function makeUser(role: 'USER' | 'ADMIN' = 'USER'): Promise<UserDoc> {
  const users = await usersCollection();
  const now = new Date();
  counter += 1;

  const user: UserDoc = {
    _id: new ObjectId(),
    name: `Admin Suite ${role} ${counter}`,
    email: `admin-${Date.now()}-${counter}@example.com`,
    passwordHash: await hashPassword('ValidPass123'),
    phone: null,
    hasPassword: true,
    role,
    emailVerified: true,
    emailVerifiedAt: now,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await users.insertOne(user);
  return user;
}

async function makeProduct(overrides: Partial<ProductDoc> = {}): Promise<ProductDoc> {
  const products = await productsCollection();
  const now = new Date();
  counter += 1;

  const doc: ProductDoc = {
    _id: new ObjectId(),
    name: `Admin Product ${counter}`,
    slug: `admin-product-${Date.now()}-${counter}`,
    description: 'Created by the admin test suite.',
    brand: 'Testco',
    category: 'electronics',
    subcategory: null,
    price: rupeesToPaise(500),
    discountPrice: null,
    discountPercentage: 0,
    images: ['/products/t-1.svg'],
    thumbnail: '/products/t-1.svg',
    stock: 20,
    rating: 0,
    reviewCount: 0,
    features: [],
    specifications: [],
    isFeatured: false,
    isPrime: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await products.insertOne(doc);
  return doc;
}

async function placeCardOrder(user: UserDoc, product: ProductDoc, pay: boolean): Promise<string> {
  await addToCart({ userId: user._id }, product._id.toHexString(), 2);
  const placed = await placeOrder(
    user._id,
    {
      newAddress: ADDRESS,
      paymentMethod: 'CARD',
      idempotencyKey: `test${new ObjectId().toHexString()}`,
    },
    { ip: '10.99.0.5' },
  );
  expect(placed.ok).toBe(true);
  if (!placed.ok) throw new Error('placement failed');
  if (pay) {
    const paid = await processMockCardPayment(user._id, placed.orderId, MOCK_TEST_CARDS.success, {
      ip: '10.99.0.5',
    });
    expect(paid).toMatchObject({ ok: true, status: 'PAID' });
  }
  return placed.orderId;
}

async function stockOf(productId: ObjectId): Promise<number> {
  const products = await productsCollection();
  const doc = await products.findOne({ _id: productId }, { projection: { stock: 1 } });
  return doc?.stock ?? -1;
}

async function latestAudit(action: AuditAction, targetId: string) {
  const logs = await auditLogsCollection();
  return logs.findOne({ action, targetId }, { sort: { _id: -1 } });
}

beforeAll(async () => {
  await ensureIndexes();
}, 120_000);

afterAll(async () => {
  await closeMongoClient();
});

// ----------------------------------------------------------- order status

describe('admin order status changes', () => {
  it('walks the legal path and refuses illegal jumps', async () => {
    const admin = await makeUser('ADMIN');
    const customer = await makeUser();
    const product = await makeProduct();
    const orderId = await placeCardOrder(customer, product, true);
    const actor = { id: admin._id, ip: ADMIN_IP };

    // Paid CARD order starts CONFIRMED. DELIVERED straight away is illegal.
    const jump = await adminUpdateOrderStatus(orderId, 'DELIVERED', '', actor);
    expect(jump.ok).toBe(false);

    for (const status of ['PROCESSING', 'SHIPPED', 'DELIVERED'] as const) {
      const step = await adminUpdateOrderStatus(orderId, status, `to ${status}`, actor);
      expect(step.ok).toBe(true);
    }

    // DELIVERED cannot go backwards.
    const back = await adminUpdateOrderStatus(orderId, 'PROCESSING', '', actor);
    expect(back.ok).toBe(false);

    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.orderStatus).toBe('DELIVERED');
    expect(order?.statusHistory.map((event) => event.status)).toEqual([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
    ]);
    // Every step is attributed to the admin, not "system".
    const adminSteps = order?.statusHistory.filter((event) => event.byUserId?.equals(admin._id));
    expect(adminSteps).toHaveLength(3);

    const audit = await latestAudit('admin.order.status.changed', orderId);
    expect(audit?.metadata).toMatchObject({ from: 'SHIPPED', to: 'DELIVERED' });
    expect(audit?.actorRole).toBe('ADMIN');
  });

  it('cancelling as admin restocks and refunds through the shared core', async () => {
    const admin = await makeUser('ADMIN');
    const customer = await makeUser();
    const product = await makeProduct({ stock: 10 });
    const orderId = await placeCardOrder(customer, product, true);
    expect(await stockOf(product._id)).toBe(8);

    const result = await adminUpdateOrderStatus(orderId, 'CANCELLED', 'Customer phoned in', {
      id: admin._id,
      ip: ADMIN_IP,
    });
    expect(result.ok).toBe(true);

    expect(await stockOf(product._id)).toBe(10);
    const orders = await ordersCollection();
    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    expect(order?.orderStatus).toBe('CANCELLED');
    expect(order?.paymentStatus).toBe('REFUNDED');
    expect(order?.stockCommitted).toBe(false);
    expect(order?.statusHistory.at(-1)).toMatchObject({
      status: 'CANCELLED',
      note: 'Customer phoned in',
    });
    // The cancellation audit names the admin, not the customer.
    const audit = await latestAudit('order.cancelled', orderId);
    expect(audit?.actorId?.equals(admin._id)).toBe(true);
  });

  it('marking a COD order DELIVERED settles its payment, with an audit entry', async () => {
    const admin = await makeUser('ADMIN');
    const customer = await makeUser();
    const product = await makeProduct();
    await addToCart({ userId: customer._id }, product._id.toHexString(), 1);
    const placed = await placeOrder(
      customer._id,
      { newAddress: ADDRESS, paymentMethod: 'COD', idempotencyKey: `test${new ObjectId().toHexString()}` },
      { ip: '10.99.0.5' },
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const actor = { id: admin._id, ip: ADMIN_IP };

    for (const status of ['PROCESSING', 'SHIPPED'] as const) {
      expect((await adminUpdateOrderStatus(placed.orderId, status, '', actor)).ok).toBe(true);
    }
    const orders = await ordersCollection();
    expect((await orders.findOne({ _id: new ObjectId(placed.orderId) }))?.paymentStatus).toBe('PENDING');

    expect((await adminUpdateOrderStatus(placed.orderId, 'DELIVERED', '', actor)).ok).toBe(true);
    const delivered = await orders.findOne({ _id: new ObjectId(placed.orderId) });
    expect(delivered?.paymentStatus).toBe('PAID');
    expect(delivered?.payment.paidAt).toBeInstanceOf(Date);

    const audit = await latestAudit('payment.succeeded', placed.orderId);
    expect(audit?.metadata).toMatchObject({ via: 'cod-delivery' });
  });
});

// ------------------------------------------------------------------ users

describe('user management guards', () => {
  it('an admin cannot change their own role or disable themselves', async () => {
    const admin = await makeUser('ADMIN');
    const actor = { id: admin._id, ip: ADMIN_IP };

    const demote = await setUserRole(admin._id.toHexString(), 'USER', actor);
    expect(demote.ok).toBe(false);
    const disable = await setUserDisabled(admin._id.toHexString(), true, 'oops', actor);
    expect(disable.ok).toBe(false);

    const users = await usersCollection();
    const doc = await users.findOne({ _id: admin._id });
    expect(doc?.role).toBe('ADMIN');
    expect(doc?.isDisabled).toBe(false);
  });

  it('the last remaining admin cannot be demoted or disabled', async () => {
    // Isolate: temporarily disable every other admin so ours is the last one
    // standing, then restore them whatever happens.
    const users = await usersCollection();
    const others = await users
      .find({ role: 'ADMIN', isDisabled: false })
      .project<{ _id: ObjectId }>({ _id: 1 })
      .toArray();
    const otherIds = others.map((doc) => doc._id);
    await users.updateMany({ _id: { $in: otherIds } }, { $set: { isDisabled: true } });

    try {
      const alpha = await makeUser('ADMIN');
      const beta = await makeUser('ADMIN');
      const asAlpha = { id: alpha._id, ip: ADMIN_IP };
      const asBeta = { id: beta._id, ip: ADMIN_IP };

      // Two admins: alpha may demote beta.
      expect((await setUserRole(beta._id.toHexString(), 'USER', asAlpha)).ok).toBe(true);

      // Alpha is now the last admin. Beta (whose session, in reality, would
      // already have lost admin -- the service enforces the *rule*, guards
      // enforce the *caller*) cannot demote or disable alpha.
      const demoteLast = await setUserRole(alpha._id.toHexString(), 'USER', asBeta);
      expect(demoteLast.ok).toBe(false);
      expect(demoteLast.ok ? '' : demoteLast.message).toMatch(/last admin/);
      const disableLast = await setUserDisabled(alpha._id.toHexString(), true, '', asBeta);
      expect(disableLast.ok).toBe(false);

      const still = await users.findOne({ _id: alpha._id });
      expect(still?.role).toBe('ADMIN');
      expect(still?.isDisabled).toBe(false);

      // Promote beta back; alpha is no longer last and can be demoted.
      expect((await setUserRole(beta._id.toHexString(), 'ADMIN', asAlpha)).ok).toBe(true);
      expect((await setUserRole(alpha._id.toHexString(), 'USER', asBeta)).ok).toBe(true);
    } finally {
      await users.updateMany({ _id: { $in: otherIds } }, { $set: { isDisabled: false } });
    }
  });

  it('role changes and disables are audited with the target email', async () => {
    const admin = await makeUser('ADMIN');
    const target = await makeUser();
    const actor = { id: admin._id, ip: ADMIN_IP };

    expect((await setUserRole(target._id.toHexString(), 'ADMIN', actor)).ok).toBe(true);
    const roleAudit = await latestAudit('admin.user.role.changed', target._id.toHexString());
    expect(roleAudit?.metadata).toMatchObject({ email: target.email, from: 'USER', to: 'ADMIN' });

    expect((await setUserDisabled(target._id.toHexString(), true, 'Test ban', actor)).ok).toBe(true);
    const disableAudit = await latestAudit('admin.user.disabled', target._id.toHexString());
    expect(disableAudit?.metadata).toMatchObject({ email: target.email, reason: 'Test ban' });

    const users = await usersCollection();
    const doc = await users.findOne({ _id: target._id });
    expect(doc?.isDisabled).toBe(true);
  });
});

// --------------------------------------------------------------- catalogue

describe('catalogue management', () => {
  it('creates, edits, and deactivates a product with a full audit trail', async () => {
    const admin = await makeUser('ADMIN');
    const actor = { id: admin._id, ip: ADMIN_IP };

    const created = await createProduct(
      {
        name: `Admin Made Widget ${counter}`,
        description: 'A widget created through the admin service in a test.',
        brand: 'Testco',
        category: 'electronics',
        subcategory: null,
        price: rupeesToPaise(1000),
        discountPrice: rupeesToPaise(800),
        stock: 5,
        images: ['/products/t-1.svg'],
        thumbnail: '/products/t-1.svg',
        features: ['Tested'],
        specifications: [{ label: 'Weight', value: '1 kg' }],
        isFeatured: false,
        isPrime: false,
        isActive: true,
      },
      actor,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const products = await productsCollection();
    const doc = await products.findOne({ _id: new ObjectId(created.value.productId) });
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.discountPercentage).toBe(20);
    expect(doc.slug).toMatch(/^admin-made-widget-\d+$/);
    expect(await latestAudit('admin.product.created', created.value.productId)).not.toBeNull();

    // A second product with the same name gets a distinct slug.
    const twin = await createProduct(
      {
        name: doc.name,
        description: 'Same name, must not collide on the unique slug index.',
        brand: 'Testco',
        category: 'electronics',
        subcategory: null,
        price: rupeesToPaise(1000),
        discountPrice: null,
        stock: 1,
        images: ['/products/t-1.svg'],
        thumbnail: '/products/t-1.svg',
        features: [],
        specifications: [],
        isFeatured: false,
        isPrime: false,
        isActive: true,
      },
      actor,
    );
    expect(twin.ok).toBe(true);
    if (!twin.ok) return;
    const twinDoc = await products.findOne({ _id: new ObjectId(twin.value.productId) });
    expect(twinDoc?.slug).toBe(`${doc.slug}-2`);

    // Edit changes the price; the slug survives.
    const edited = await updateProduct(
      {
        productId: created.value.productId,
        name: doc.name,
        description: doc.description,
        brand: 'Testco',
        category: 'electronics',
        subcategory: null,
        price: rupeesToPaise(1200),
        discountPrice: null,
        stock: 5,
        images: ['/products/t-1.svg'],
        thumbnail: '/products/t-1.svg',
        features: [],
        specifications: [],
        isFeatured: true,
        isPrime: false,
        isActive: true,
      },
      actor,
    );
    expect(edited.ok).toBe(true);
    const after = await products.findOne({ _id: new ObjectId(created.value.productId) });
    expect(after?.price).toBe(rupeesToPaise(1200));
    expect(after?.discountPercentage).toBe(0);
    expect(after?.slug).toBe(doc.slug);
    const editAudit = await latestAudit('admin.product.updated', created.value.productId);
    expect(editAudit?.metadata).toMatchObject({
      priceBefore: rupeesToPaise(1000),
      priceAfter: rupeesToPaise(1200),
    });

    // Deactivate = soft delete, audited as a delete.
    expect((await setProductActive(created.value.productId, false, actor)).ok).toBe(true);
    const inactive = await products.findOne({ _id: new ObjectId(created.value.productId) });
    expect(inactive?.isActive).toBe(false);
    expect(await latestAudit('admin.product.deleted', created.value.productId)).not.toBeNull();
  });

  it('inventory adjustments record before/after and the reason', async () => {
    const admin = await makeUser('ADMIN');
    const product = await makeProduct({ stock: 20 });

    const result = await adjustInventory(
      { productId: product._id.toHexString(), stock: 3, reason: 'Stocktake found damage' },
      { id: admin._id, ip: ADMIN_IP },
    );
    expect(result.ok).toBe(true);
    expect(await stockOf(product._id)).toBe(3);

    const audit = await latestAudit('admin.inventory.adjusted', product._id.toHexString());
    expect(audit?.metadata).toMatchObject({
      stockBefore: 20,
      stockAfter: 3,
      reason: 'Stocktake found damage',
    });
  });

  it('categories: unique slugs, one-level nesting, no cycles, no deleting occupied ones', async () => {
    const admin = await makeUser('ADMIN');
    const actor = { id: admin._id, ip: ADMIN_IP };
    const stamp = `${Date.now()}${counter}`;
    const parentSlug = `test-parent-${stamp}`;
    const childSlug = `test-child-${stamp}`;

    const parent = await createCategory(
      { name: 'Test Parent', slug: parentSlug, description: null, image: null, parentSlug: null, displayOrder: 0, isActive: true },
      actor,
    );
    expect(parent.ok).toBe(true);

    // Duplicate slug refused.
    const dup = await createCategory(
      { name: 'Dup', slug: parentSlug, description: null, image: null, parentSlug: null, displayOrder: 0, isActive: true },
      actor,
    );
    expect(dup.ok).toBe(false);

    const child = await createCategory(
      { name: 'Test Child', slug: childSlug, description: null, image: null, parentSlug, displayOrder: 0, isActive: true },
      actor,
    );
    expect(child.ok).toBe(true);

    // A grandchild is refused: nesting is one level.
    const grandchild = await createCategory(
      { name: 'Grandchild', slug: `test-grandchild-${stamp}`, description: null, image: null, parentSlug: childSlug, displayOrder: 0, isActive: true },
      actor,
    );
    expect(grandchild.ok).toBe(false);

    // The parent cannot be re-parented under its own child (cycle) -- it has children.
    const categories = await categoriesCollection();
    const parentDoc = await categories.findOne({ slug: parentSlug });
    const childDoc = await categories.findOne({ slug: childSlug });
    expect(parentDoc).not.toBeNull();
    expect(childDoc).not.toBeNull();
    if (!parentDoc || !childDoc) return;
    const parentId = parentDoc._id.toHexString();
    const childId = childDoc._id.toHexString();

    const cycle = await updateCategory(
      { categoryId: parentId, name: 'Test Parent', slug: parentSlug, description: null, image: null, parentSlug: childSlug, displayOrder: 0, isActive: true },
      actor,
    );
    expect(cycle.ok).toBe(false);

    // Deleting the parent while it has a child is refused.
    const deleteParent = await deleteCategory(parentId, actor);
    expect(deleteParent.ok).toBe(false);

    // Put a product in the child; deleting the child is now refused too.
    await makeProduct({ category: childSlug });
    const deleteOccupied = await deleteCategory(childId, actor);
    expect(deleteOccupied.ok).toBe(false);
    expect(deleteOccupied.ok ? '' : deleteOccupied.message).toMatch(/products live in this category/);

    // Move the product out; now it deletes, and so does the parent after it.
    const products = await productsCollection();
    await products.updateMany({ category: childSlug }, { $set: { category: 'electronics' } });
    expect((await deleteCategory(childId, actor)).ok).toBe(true);
    expect((await deleteCategory(parentId, actor)).ok).toBe(true);
    expect(await latestAudit('admin.category.deleted', parentId)).not.toBeNull();
  });
});
