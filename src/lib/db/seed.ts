import { ObjectId, type Db } from 'mongodb';

import { hashPassword } from '@/lib/auth/password';
import { ensureIndexes } from '@/lib/db/indexes';
import { rupeesToPaise } from '@/lib/utils/money';
import { slugify } from '@/lib/utils/slug';
import { SEED_CATEGORIES } from '@/data/categories';
import { ALL_SEED_PRODUCTS } from '@/data/catalog';
import { resolveProductImages } from '@/data/product-images';
import { calculateTotals } from '@/services/pricing';
import { computeDiscountPercentage, effectivePrice, type ProductDoc } from '@/models/product';
import type { CategoryDoc } from '@/models/category';
import type { OrderDoc, OrderItemDoc } from '@/models/order';
import type { ReviewDoc } from '@/models/review';
import type { UserDoc } from '@/models/user';
import type { Address, OrderStatus } from '@/models/types';

import '@/lib/server-guard';

/**
 * Seed logic, importable.
 *
 * Lives in `src/` rather than in the script so the integration and security
 * test suites can populate a throwaway database with exactly the same data the
 * developer sees. `scripts/seed.ts` is a thin CLI over this.
 *
 * All data is fictional: no real person's name, address, phone number or email
 * appears anywhere in it.
 */

/**
 * Deterministic PRNG (mulberry32). Seeding twice produces an identical
 * database, so tests can assert on the sample data without being flaky.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_ADDRESSES: Array<Omit<Address, 'id' | 'isDefault'>> = [
  {
    fullName: 'Asha Menon',
    phone: '9800000101',
    line1: '14 Lakeview Residency',
    line2: '2nd Cross, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560038',
    country: 'India',
    type: 'HOME',
  },
  {
    fullName: 'Rohit Desai',
    phone: '9800000102',
    line1: 'Flat 7B, Sunrise Towers',
    line2: 'Powai',
    city: 'Mumbai',
    state: 'Maharashtra',
    postalCode: '400076',
    country: 'India',
    type: 'HOME',
  },
  {
    fullName: 'Priya Nair',
    phone: '9800000103',
    line1: '221 Greenfield Enclave',
    line2: 'Sector 44',
    city: 'Gurugram',
    state: 'Haryana',
    postalCode: '122003',
    country: 'India',
    type: 'WORK',
  },
  {
    fullName: 'Vikram Iyer',
    phone: '9800000104',
    line1: '48 Marina Crest',
    line2: 'Besant Nagar',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600090',
    country: 'India',
    type: 'HOME',
  },
  {
    fullName: 'Sneha Kulkarni',
    phone: '9800000105',
    line1: 'B-302, Amberwood Society',
    line2: 'Baner Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411045',
    country: 'India',
    type: 'HOME',
  },
  {
    fullName: 'Arjun Bose',
    phone: '9800000106',
    line1: '9 Palm Grove Lane',
    line2: 'Salt Lake Sector II',
    city: 'Kolkata',
    state: 'West Bengal',
    postalCode: '700091',
    country: 'India',
    type: 'HOME',
  },
  {
    fullName: 'Meera Raghavan',
    phone: '9800000107',
    line1: '77 Cyber Heights',
    line2: 'Gachibowli',
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500032',
    country: 'India',
    type: 'WORK',
  },
  {
    fullName: 'Karthik Shetty',
    phone: '9800000108',
    line1: '12 Seabreeze Apartments',
    line2: 'Kadri',
    city: 'Mangaluru',
    state: 'Karnataka',
    postalCode: '575002',
    country: 'India',
    type: 'HOME',
  },
];

const REVIEW_TEMPLATES: Array<{ rating: number; title: string; comment: string }> = [
  {
    rating: 5,
    title: 'Exactly what I hoped for',
    comment:
      'Arrived two days early and the build quality is better than I expected at this price. Three weeks in and no complaints at all.',
  },
  {
    rating: 5,
    title: 'Worth every rupee',
    comment:
      'I hesitated because of the cost but it has replaced two other things I owned. Packaging was minimal and recyclable, which I appreciated.',
  },
  {
    rating: 4,
    title: 'Very good, one small niggle',
    comment:
      'Does everything described and does it well. The only thing I would change is the instructions, which skip a step near the end.',
  },
  {
    rating: 4,
    title: 'Solid choice',
    comment:
      'Comparable to items costing considerably more. Took off a star because the finish scratched slightly during setup.',
  },
  {
    rating: 5,
    title: 'Second one I have bought',
    comment:
      'Bought the first for myself and this one as a gift. Consistent quality between the two, which is not always the case.',
  },
  {
    rating: 3,
    title: 'Fine, but not remarkable',
    comment:
      'It works as described. Nothing wrong with it, but I am not sure it stands out from cheaper alternatives.',
  },
  {
    rating: 4,
    title: 'Good value',
    comment:
      'Delivery was quick and it was well protected in transit. Has held up to daily use for a month so far.',
  },
  {
    rating: 5,
    title: 'Better than the photos suggest',
    comment:
      'The listing images do not really do it justice. Feels substantial and the details are neatly finished.',
  },
  {
    rating: 2,
    title: 'Not for me',
    comment:
      'Quality is fine but it is smaller than I pictured from the dimensions. Read the specifications carefully before ordering.',
  },
  {
    rating: 4,
    title: 'Does the job well',
    comment:
      'No surprises, which is what I wanted. Setup took about ten minutes and it has been reliable since.',
  },
];

/** Password for the seeded sample customers. Development only. */
export const SEED_CUSTOMER_PASSWORD = 'Customer!Demo2026';

export interface SeedOptions {
  adminEmail: string;
  adminPassword: string;
  /**
   * Also create sample customers, orders, payments and reviews.
   *
   * Off by default: a store should start with a catalogue and an admin, and
   * every figure on the dashboard should come from real activity. Turn it on
   * (`pnpm seed --demo`) for a populated development fixture.
   */
  demo?: boolean;
  /** With `demo`, skip orders and reviews for a faster fixture in unit tests. */
  includeOrders?: boolean;
  /** Reuse an already-created index set. */
  skipIndexes?: boolean;
  /**
   * Delete **every** account and everything attached to it, not just the ones
   * this seed created.
   *
   * Off by default, and deliberately so. Re-seeding is how a developer
   * refreshes the catalogue, and it used to take the whole `users` collection
   * with it -- so any account registered through the app, by anyone, vanished
   * the next time somebody typed `pnpm seed`. The default now removes only the
   * seed's own admin and `customerN@example.com` accounts and the rows that
   * belong to them; real accounts, their orders, their wallets and the audit
   * trail survive. Pass `--reset` when a genuinely empty database is what you
   * want.
   */
  resetAccounts?: boolean;
}

export interface SeedSummary {
  categories: number;
  products: number;
  users: number;
  orders: number;
  reviews: number;
  ratedProducts: number;
  adminEmail: string;
  customerEmails: string[];
  customerPassword: string;
}

/** Wholly owned by the seed: always replaced, never merged. */
const CATALOGUE_COLLECTIONS = ['categories', 'products'] as const;

/**
 * Keyed by `userId`, so they can be cleared for exactly the accounts being
 * removed. Every one of these must have a `userId` field; a collection that
 * belongs to a user by some other name goes in the special cases below.
 */
const PER_USER_COLLECTIONS = [
  'carts',
  'orders',
  'reviews',
  'sessions',
  'passwordResetTokens',
  'emailVerificationTokens',
  'walletEntries',
  'primeMemberships',
  'videoEntitlements',
] as const;

/** Short-lived and not worth preserving across a seed either way. */
const EPHEMERAL_COLLECTIONS = ['rateLimits', 'otpCodes'] as const;

export async function seedDatabase(db: Db, options: SeedOptions): Promise<SeedSummary> {
  const {
    adminEmail,
    adminPassword,
    demo = false,
    includeOrders = true,
    skipIndexes = false,
    resetAccounts = false,
  } = options;

  const random = makeRandom(20260817);
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error('pick: empty array');
    return item;
  };
  const randomInt = (min: number, max: number): number =>
    Math.floor(random() * (max - min + 1)) + min;
  const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);
  const orderNumber = (): string =>
    `NK-${Array.from({ length: 8 }, () => '0123456789ABCDEF'.charAt(Math.floor(random() * 16))).join('')}`;

  if (!skipIndexes) {
    await ensureIndexes(db);
  }

  // The emails this seed is about to create. Written down before anything is
  // deleted, because they are also the definition of "an account the seed
  // owns" -- everything else in `users` belongs to a person, not to us.
  const seedEmails = [
    adminEmail.toLowerCase(),
    ...SAMPLE_ADDRESSES.map((_, index) => `customer${index + 1}@example.com`),
  ];

  for (const name of CATALOGUE_COLLECTIONS) {
    await db.collection(name).deleteMany({});
  }
  for (const name of EPHEMERAL_COLLECTIONS) {
    await db.collection(name).deleteMany({});
  }

  if (resetAccounts) {
    for (const name of [...PER_USER_COLLECTIONS, 'users', 'auditLogs', 'giftCards']) {
      await db.collection(name).deleteMany({});
    }
  } else {
    // Take out the seed's own accounts and the rows hanging off them, and
    // nothing else. Carts are the one collection that also holds guest rows
    // (`userId: null`), which are not attached to any account and stay.
    const usersC = db.collection<UserDoc>('users');
    const doomed = await usersC
      .find({ email: { $in: seedEmails } }, { projection: { _id: 1 } })
      .toArray();
    const ids = doomed.map((user) => user._id);

    if (ids.length > 0) {
      for (const name of PER_USER_COLLECTIONS) {
        await db.collection(name).deleteMany({ userId: { $in: ids } });
      }
      await db.collection('auditLogs').deleteMany({ actorId: { $in: ids } });
      await db.collection('giftCards').deleteMany({ redeemedByUserId: { $in: ids } });
      await usersC.deleteMany({ _id: { $in: ids } });
    }
  }

  const now = new Date();

  // --- categories ----------------------------------------------------------
  const categoryDocs: CategoryDoc[] = [];
  let displayOrder = 0;

  for (const category of SEED_CATEGORIES) {
    categoryDocs.push({
      _id: new ObjectId(),
      name: category.name,
      slug: category.slug,
      description: category.description,
      image: `/categories/${category.slug}.svg`,
      parentSlug: null,
      displayOrder: (displayOrder += 1),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    let childOrder = 0;
    for (const child of category.children) {
      categoryDocs.push({
        _id: new ObjectId(),
        name: child.name,
        slug: child.slug,
        description: null,
        image: null,
        parentSlug: category.slug,
        displayOrder: (childOrder += 1),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await db.collection<CategoryDoc>('categories').insertMany(categoryDocs);

  // --- products ------------------------------------------------------------
  const productDocs: ProductDoc[] = ALL_SEED_PRODUCTS.map((product, index) => {
    const slug = slugify(product.name);
    const images = resolveProductImages(product.name, slug, product.category, product.subcategory);
    const price = rupeesToPaise(product.price);
    const discountPrice =
      product.discountPrice === undefined ? null : rupeesToPaise(product.discountPrice);

    return {
      _id: new ObjectId(),
      name: product.name,
      slug,
      description: product.description,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      price,
      discountPrice,
      discountPercentage: computeDiscountPercentage(price, discountPrice),
      images,
      thumbnail: images[0] ?? `/products/${slug}-1.svg`,
      stock: product.stock,
      rating: 0,
      reviewCount: 0,
      features: product.features,
      specifications: product.specifications.map(([label, value]) => ({ label, value })),
      isFeatured: product.featured ?? false,
      isPrime: product.prime ?? false,
      isActive: true,
      // Spread over the past year so "New Arrivals" and the dashboard's date
      // buckets have something to work with. Never negative: with a catalogue
      // larger than the window, `120 - index` would date products in the future.
      createdAt: daysAgo(1 + ((index * 7) % 365)),
      updatedAt: now,
    } satisfies ProductDoc;
  });

  await db.collection<ProductDoc>('products').insertMany(productDocs);

  // --- users ---------------------------------------------------------------
  const [adminHash, customerHash] = await Promise.all([
    hashPassword(adminPassword),
    hashPassword(SEED_CUSTOMER_PASSWORD),
  ]);

  const adminDoc: UserDoc = {
    _id: new ObjectId(),
    name: 'Site Administrator',
    email: adminEmail.toLowerCase(),
    phone: null,
    passwordHash: adminHash,
    hasPassword: true,
    role: 'ADMIN',
    emailVerified: true,
    emailVerifiedAt: now,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: daysAgo(200),
    updatedAt: now,
  };

  // Sample customers exist only for the demo fixture. A real store's customer
  // count starts at zero and grows as people register.
  const customerDocs: UserDoc[] = (demo ? SAMPLE_ADDRESSES : []).map((address, index) => ({
    _id: new ObjectId(),
    name: address.fullName,
    email: `customer${index + 1}@example.com`,
    phone: null,
    passwordHash: customerHash,
    hasPassword: true,
    role: 'USER' as const,
    emailVerified: true,
    emailVerifiedAt: now,
    phoneVerified: false,
    phoneVerifiedAt: null,
    addresses: [{ ...address, id: new ObjectId().toHexString(), isDefault: true }],
    isDisabled: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: now,
    createdAt: daysAgo(90 - index * 10),
    updatedAt: now,
  }));

  await db.collection<UserDoc>('users').insertMany([adminDoc, ...customerDocs]);

  const summary: SeedSummary = {
    categories: categoryDocs.length,
    products: productDocs.length,
    users: 1 + customerDocs.length,
    orders: 0,
    reviews: 0,
    ratedProducts: 0,
    adminEmail: adminEmail.toLowerCase(),
    customerEmails: customerDocs.flatMap((c) => (c.email ? [c.email] : [])),
    customerPassword: SEED_CUSTOMER_PASSWORD,
  };

  if (!demo || !includeOrders) return summary;

  // --- orders (demo fixture only) --------------------------------------------
  const orderDocs: OrderDoc[] = [];
  const deliveredLines: Array<{ userId: ObjectId; product: ProductDoc; orderId: ObjectId }> = [];

  // Weighted toward DELIVERED: only delivered lines are eligible for a review,
  // and a storefront where most products show no reviews is not a useful
  // fixture for building or testing the review UI.
  const statusPlan: OrderStatus[] = [
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'SHIPPED',
    'PROCESSING',
    'PENDING',
    'CANCELLED',
  ];

  for (const customer of customerDocs) {
    const orderCount = randomInt(5, 9);

    for (let n = 0; n < orderCount; n += 1) {
      const orderId = new ObjectId();
      const status = pick(statusPlan);
      const placedAt = daysAgo(randomInt(3, 75));

      const lineCount = randomInt(1, 3);
      const chosen: ProductDoc[] = [];
      while (chosen.length < lineCount) {
        const candidate = pick(productDocs);
        if (!chosen.some((p) => p._id.equals(candidate._id))) chosen.push(candidate);
      }

      const items: OrderItemDoc[] = chosen.map((product) => {
        const quantity = randomInt(1, 2);
        const unitPrice = effectivePrice(product);
        return {
          productId: product._id,
          name: product.name,
          slug: product.slug,
          brand: product.brand,
          thumbnail: product.thumbnail,
          unitPrice,
          listPrice: product.price,
          quantity,
          lineTotal: unitPrice * quantity,
        };
      });

      // The same pricing authority the checkout uses, so the seed cannot
      // produce a total the application would never compute.
      const totals = calculateTotals(
        items.map((item) => ({
          listPrice: item.listPrice,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
        })),
      );

      const isPaid = status !== 'PENDING' && status !== 'CANCELLED';
      const address = customer.addresses[0];
      if (!address) throw new Error('seed: customer has no address');

      orderDocs.push({
        _id: orderId,
        orderNumber: orderNumber(),
        userId: customer._id,
        items,
        shippingAddress: address,
        // WALLET is deliberately absent: a wallet-paid order is only true if a
        // matching debit exists in the ledger, and a seeded one would have no
        // debit behind it -- a demo balance that disagreed with the orders
        // beside it would be worse than no seeded wallet orders at all.
        paymentMethod: pick(['CARD', 'UPI', 'NETBANKING', 'COD'] as const),
        paymentStatus: isPaid ? 'PAID' : status === 'CANCELLED' ? 'FAILED' : 'PENDING',
        orderStatus: status,
        payment: {
          provider: 'mock',
          intentId: isPaid ? `mock_pi_${orderId.toHexString()}` : null,
          reference: null,
          paidAt: isPaid ? placedAt : null,
          failureReason: null,
        },
        currency: 'INR',
        subtotal: totals.subtotal,
        discount: totals.discount,
        shipping: totals.shipping,
        tax: totals.tax,
        total: totals.total,
        statusHistory: [{ status, at: placedAt, byUserId: null, note: 'Seeded order' }],
        stockCommitted: status !== 'CANCELLED',
        createdAt: placedAt,
        updatedAt: placedAt,
      });

      if (status === 'DELIVERED') {
        for (const product of chosen) {
          deliveredLines.push({ userId: customer._id, product, orderId });
        }
      }
    }
  }

  await db.collection<OrderDoc>('orders').insertMany(orderDocs);
  summary.orders = orderDocs.length;

  // --- reviews -------------------------------------------------------------
  // Every review points at a delivered order the user actually placed, so the
  // seed does not quietly violate the verified-purchase rule it is meant to
  // demonstrate. At most one per (user, product) -- the unique index enforces it.
  const reviewDocs: ReviewDoc[] = [];
  const seen = new Set<string>();

  for (const line of deliveredLines) {
    const key = `${line.userId.toHexString()}:${line.product._id.toHexString()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Not everyone reviews what they buy.
    if (random() < 0.2) continue;

    const template = pick(REVIEW_TEMPLATES);
    const author = customerDocs.find((c) => c._id.equals(line.userId));

    reviewDocs.push({
      _id: new ObjectId(),
      productId: line.product._id,
      userId: line.userId,
      orderId: line.orderId,
      userName: author?.name ?? 'Verified buyer',
      rating: template.rating,
      title: template.title,
      comment: template.comment,
      isVerifiedPurchase: true,
      createdAt: daysAgo(randomInt(1, 40)),
      updatedAt: now,
    });
  }

  if (reviewDocs.length > 0) {
    await db.collection<ReviewDoc>('reviews').insertMany(reviewDocs);
  }
  summary.reviews = reviewDocs.length;

  // --- rating aggregates ---------------------------------------------------
  // Derived from the reviews just written, never hand-set, so the number on a
  // product card always matches the reviews a customer can actually read.
  const aggregates = await db
    .collection<ReviewDoc>('reviews')
    .aggregate<{ _id: ObjectId; average: number; count: number }>([
      { $group: { _id: '$productId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ])
    .toArray();

  for (const aggregate of aggregates) {
    await db
      .collection<ProductDoc>('products')
      .updateOne(
        { _id: aggregate._id },
        { $set: { rating: Math.round(aggregate.average * 10) / 10, reviewCount: aggregate.count } },
      );
  }
  summary.ratedProducts = aggregates.length;

  return summary;
}
