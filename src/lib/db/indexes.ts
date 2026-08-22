import type { CreateIndexesOptions, Db, IndexSpecification } from 'mongodb';

import { getDb } from './client';
import { COLLECTIONS } from './collections';

import '@/lib/server-guard';

/**
 * Index definitions.
 *
 * Indexes are a security control here, not only a performance one. An
 * unindexed filter on a large collection is a denial-of-service primitive: a
 * search endpoint that triggers a collection scan lets one cheap request cost
 * the database a great deal of work. Every field this app filters, sorts or
 * paginates on is covered below.
 *
 * The unique indexes are correctness controls that the database enforces even
 * if application logic is bypassed:
 *   - `users.email`             one account per address
 *   - `products.slug`           unambiguous product URLs
 *   - `orders.orderNumber`      no duplicate invoice ids
 *   - `reviews.productId+userId` one review per user per product
 *   - `sessions.tokenHash`      no two sessions share a token
 *   - `rateLimits.key`          the atomic counter's identity
 */

interface IndexDefinition {
  collection: string;
  spec: IndexSpecification;
  options: CreateIndexesOptions;
}

const SECONDS_PER_DAY = 60 * 60 * 24;

export const INDEX_DEFINITIONS: IndexDefinition[] = [
  // --- users ---------------------------------------------------------------
  {
    collection: COLLECTIONS.users,
    spec: { email: 1 },
    // Emails are normalised to lowercase on write; the collation makes the
    // uniqueness guarantee hold even if a write path ever forgets. Partial, so
    // the many mobile-only accounts with `email: null` do not collide.
    options: {
      name: 'users_email_unique',
      unique: true,
      collation: { locale: 'en', strength: 2 },
      partialFilterExpression: { email: { $type: 'string' } },
    },
  },
  {
    collection: COLLECTIONS.users,
    spec: { phone: 1 },
    options: {
      name: 'users_phone_unique',
      unique: true,
      partialFilterExpression: { phone: { $type: 'string' } },
    },
  },
  { collection: COLLECTIONS.users, spec: { role: 1 }, options: { name: 'users_role' } },
  { collection: COLLECTIONS.users, spec: { createdAt: -1 }, options: { name: 'users_createdAt' } },

  // --- products ------------------------------------------------------------
  {
    collection: COLLECTIONS.products,
    spec: { slug: 1 },
    options: { name: 'products_slug_unique', unique: true },
  },
  {
    // The workhorse for /products and every category page: filter on active +
    // category, then sort by price, all served from one index.
    collection: COLLECTIONS.products,
    spec: { isActive: 1, category: 1, price: 1 },
    options: { name: 'products_active_category_price' },
  },
  {
    collection: COLLECTIONS.products,
    spec: { isActive: 1, brand: 1 },
    options: { name: 'products_active_brand' },
  },
  {
    collection: COLLECTIONS.products,
    spec: { isActive: 1, rating: -1 },
    options: { name: 'products_active_rating' },
  },
  {
    collection: COLLECTIONS.products,
    spec: { isActive: 1, createdAt: -1 },
    options: { name: 'products_active_createdAt' },
  },
  {
    collection: COLLECTIONS.products,
    spec: { isActive: 1, isFeatured: 1 },
    options: { name: 'products_active_featured' },
  },
  {
    collection: COLLECTIONS.products,
    spec: { isActive: 1, discountPercentage: -1 },
    options: { name: 'products_active_discount' },
  },
  {
    // Low-stock reporting for the admin dashboard.
    collection: COLLECTIONS.products,
    spec: { stock: 1 },
    options: { name: 'products_stock' },
  },
  {
    // MongoDB permits exactly one text index per collection, so all searchable
    // fields live in this one. Weights make a name match outrank a description
    // match without a second query or a client-side re-sort.
    collection: COLLECTIONS.products,
    spec: { name: 'text', brand: 'text', description: 'text', category: 'text' },
    options: {
      name: 'products_text_search',
      weights: { name: 10, brand: 5, category: 3, description: 1 },
      default_language: 'english',
    },
  },

  // --- categories ----------------------------------------------------------
  {
    collection: COLLECTIONS.categories,
    spec: { slug: 1 },
    options: { name: 'categories_slug_unique', unique: true },
  },
  {
    collection: COLLECTIONS.categories,
    spec: { parentSlug: 1, displayOrder: 1 },
    options: { name: 'categories_parent_order' },
  },

  // --- carts ---------------------------------------------------------------
  {
    // `partialFilterExpression`, not `sparse`: we store `userId: null` on guest
    // carts, and a field explicitly set to null is *present*, so a sparse
    // unique index would treat every guest cart as a duplicate null.
    collection: COLLECTIONS.carts,
    spec: { userId: 1 },
    options: {
      name: 'carts_userId_unique',
      unique: true,
      partialFilterExpression: { userId: { $type: 'objectId' } },
    },
  },
  {
    collection: COLLECTIONS.carts,
    spec: { guestId: 1 },
    options: {
      name: 'carts_guestId_unique',
      unique: true,
      partialFilterExpression: { guestId: { $type: 'string' } },
    },
  },
  {
    // Abandoned guest carts are garbage-collected after 30 days. Signed-in
    // carts are excluded -- a customer's saved cart should not evaporate.
    collection: COLLECTIONS.carts,
    spec: { updatedAt: 1 },
    options: {
      name: 'carts_guest_ttl',
      expireAfterSeconds: 30 * SECONDS_PER_DAY,
      partialFilterExpression: { guestId: { $type: 'string' } },
    },
  },

  // --- orders --------------------------------------------------------------
  {
    collection: COLLECTIONS.orders,
    spec: { orderNumber: 1 },
    options: { name: 'orders_orderNumber_unique', unique: true },
  },
  {
    collection: COLLECTIONS.orders,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'orders_user_createdAt' },
  },
  {
    collection: COLLECTIONS.orders,
    spec: { orderStatus: 1, createdAt: -1 },
    options: { name: 'orders_status_createdAt' },
  },
  {
    collection: COLLECTIONS.orders,
    spec: { paymentStatus: 1 },
    options: { name: 'orders_paymentStatus' },
  },
  {
    collection: COLLECTIONS.orders,
    spec: { createdAt: -1 },
    options: { name: 'orders_createdAt' },
  },
  {
    // Webhook lookup by provider intent id, and the guard against double-crediting
    // a payment when a provider retries a webhook.
    collection: COLLECTIONS.orders,
    spec: { 'payment.intentId': 1 },
    options: {
      name: 'orders_payment_intentId',
      partialFilterExpression: { 'payment.intentId': { $type: 'string' } },
    },
  },
  {
    // "Has this user bought this product?" -- the verified-purchase check for
    // reviews, answered by index rather than by scanning a user's order history.
    collection: COLLECTIONS.orders,
    spec: { userId: 1, 'items.productId': 1 },
    options: { name: 'orders_user_productId' },
  },

  // --- reviews -------------------------------------------------------------
  {
    collection: COLLECTIONS.reviews,
    spec: { productId: 1, userId: 1 },
    options: { name: 'reviews_product_user_unique', unique: true },
  },
  {
    collection: COLLECTIONS.reviews,
    spec: { productId: 1, createdAt: -1 },
    options: { name: 'reviews_product_createdAt' },
  },
  {
    collection: COLLECTIONS.reviews,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'reviews_user_createdAt' },
  },

  // --- wallet --------------------------------------------------------------
  // The balance is summed from this collection on every render, so the
  // user+status filter must never be a collection scan.
  {
    collection: COLLECTIONS.walletEntries,
    spec: { userId: 1, status: 1 },
    options: { name: 'walletEntries_user_status' },
  },
  {
    collection: COLLECTIONS.walletEntries,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'walletEntries_user_createdAt' },
  },
  {
    collection: COLLECTIONS.walletEntries,
    spec: { reference: 1 },
    options: { name: 'walletEntries_reference_unique', unique: true },
  },

  // --- gift cards ----------------------------------------------------------
  // Unique on the hash: minting can never produce two cards redeemable by the
  // same code, and redemption looks a card up by exactly this field.
  {
    collection: COLLECTIONS.giftCards,
    spec: { codeHash: 1 },
    options: { name: 'giftCards_codeHash_unique', unique: true },
  },
  {
    collection: COLLECTIONS.giftCards,
    spec: { redeemedByUserId: 1, redeemedAt: -1 },
    options: { name: 'giftCards_redeemedBy_redeemedAt' },
  },

  // --- prime ---------------------------------------------------------------
  // One membership row per customer: rejoining replaces it rather than
  // stacking a second one the expiry logic would have to reconcile.
  {
    collection: COLLECTIONS.primeMemberships,
    spec: { userId: 1 },
    options: { name: 'primeMemberships_userId_unique', unique: true },
  },
  {
    collection: COLLECTIONS.primeMemberships,
    spec: { expiresAt: 1 },
    options: { name: 'primeMemberships_expiresAt' },
  },

  // --- video ---------------------------------------------------------------
  // One live entitlement per customer per title or channel; renting again
  // extends the same row rather than stacking duplicates.
  {
    collection: COLLECTIONS.videoEntitlements,
    spec: { userId: 1, kind: 1, refId: 1 },
    options: { name: 'videoEntitlements_user_kind_ref_unique', unique: true },
  },
  {
    collection: COLLECTIONS.videoEntitlements,
    spec: { userId: 1, expiresAt: -1 },
    options: { name: 'videoEntitlements_user_expiresAt' },
  },

  // --- recharges -----------------------------------------------------------
  // The history list is the only read: this customer's recharges, newest first.
  {
    collection: COLLECTIONS.recharges,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'recharges_user_createdAt' },
  },
  {
    collection: COLLECTIONS.recharges,
    spec: { reference: 1 },
    options: { name: 'recharges_reference_unique', unique: true },
  },

  // --- bus bookings --------------------------------------------------------
  {
    collection: COLLECTIONS.busBookings,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'busBookings_user_createdAt' },
  },
  {
    collection: COLLECTIONS.busBookings,
    spec: { reference: 1 },
    options: { name: 'busBookings_reference_unique', unique: true },
  },

  // --- train bookings ------------------------------------------------------
  {
    collection: COLLECTIONS.trainBookings,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'trainBookings_user_createdAt' },
  },
  {
    collection: COLLECTIONS.trainBookings,
    spec: { reference: 1 },
    options: { name: 'trainBookings_reference_unique', unique: true },
  },
  {
    collection: COLLECTIONS.trainBookings,
    spec: { pnr: 1 },
    options: { name: 'trainBookings_pnr_unique', unique: true },
  },

  // --- hotel bookings ------------------------------------------------------
  {
    collection: COLLECTIONS.hotelBookings,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'hotelBookings_user_createdAt' },
  },
  {
    collection: COLLECTIONS.hotelBookings,
    spec: { reference: 1 },
    options: { name: 'hotelBookings_reference_unique', unique: true },
  },

  // --- gift card orders ----------------------------------------------------
  {
    collection: COLLECTIONS.giftOrders,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'giftOrders_user_createdAt' },
  },
  {
    collection: COLLECTIONS.giftOrders,
    spec: { reference: 1 },
    options: { name: 'giftOrders_reference_unique', unique: true },
  },

  // --- corporate enquiries -------------------------------------------------
  {
    collection: COLLECTIONS.corporateEnquiries,
    spec: { createdAt: -1 },
    options: { name: 'corporateEnquiries_createdAt' },
  },
  {
    collection: COLLECTIONS.corporateEnquiries,
    spec: { reference: 1 },
    options: { name: 'corporateEnquiries_reference_unique', unique: true },
  },

  // --- reward claims -------------------------------------------------------
  // One claim per offer per customer: this index *is* the rule, not a check
  // somewhere that a second click could race past.
  {
    collection: COLLECTIONS.rewardClaims,
    spec: { userId: 1, offerId: 1 },
    options: { name: 'rewardClaims_user_offer_unique', unique: true },
  },
  {
    collection: COLLECTIONS.rewardClaims,
    spec: { userId: 1, status: 1, expiresAt: 1 },
    options: { name: 'rewardClaims_user_live' },
  },

  // --- support tickets -----------------------------------------------------
  {
    collection: COLLECTIONS.supportTickets,
    spec: { userId: 1, status: 1, createdAt: -1 },
    options: { name: 'supportTickets_user_status_createdAt' },
  },
  {
    collection: COLLECTIONS.supportTickets,
    spec: { reference: 1 },
    options: { name: 'supportTickets_reference_unique', unique: true },
  },

  // --- saved cards ---------------------------------------------------------
  // The token is derived from the card, so this is what stops the same card
  // being saved twice on one account.
  {
    collection: COLLECTIONS.savedCards,
    spec: { userId: 1, token: 1 },
    options: { name: 'savedCards_user_token_unique', unique: true },
  },
  {
    collection: COLLECTIONS.savedCards,
    spec: { userId: 1, isDefault: -1, createdAt: 1 },
    options: { name: 'savedCards_user_default' },
  },

  // --- insurance policies --------------------------------------------------
  {
    collection: COLLECTIONS.insurancePolicies,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'insurancePolicies_user_createdAt' },
  },
  {
    collection: COLLECTIONS.insurancePolicies,
    spec: { policyNumber: 1 },
    options: { name: 'insurancePolicies_policyNumber_unique', unique: true },
  },

  // --- FASTags and metro cards ---------------------------------------------
  // One tag per vehicle per customer, and one card per number: this index *is*
  // the rule. A check in the service could be raced past by a second click.
  {
    collection: COLLECTIONS.transitAccounts,
    spec: { userId: 1, kind: 1, number: 1 },
    options: { name: 'transitAccounts_user_kind_number_unique', unique: true },
  },
  {
    collection: COLLECTIONS.transitAccounts,
    spec: { userId: 1, kind: 1, status: 1, createdAt: -1 },
    options: { name: 'transitAccounts_user_kind_status' },
  },
  {
    collection: COLLECTIONS.transitEntries,
    spec: { accountId: 1, createdAt: -1 },
    options: { name: 'transitEntries_account_createdAt' },
  },
  // A recharge writes one wallet debit and one tag credit under a shared
  // reference. This is what makes the second one exactly-once: a retry that
  // gets as far as the credit hits the index rather than topping up twice.
  {
    collection: COLLECTIONS.transitEntries,
    spec: { reference: 1 },
    options: { name: 'transitEntries_reference_unique', unique: true },
  },

  // --- bill payments -------------------------------------------------------
  {
    collection: COLLECTIONS.billPayments,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'billPayments_user_createdAt' },
  },
  {
    collection: COLLECTIONS.billPayments,
    spec: { userId: 1, category: 1, account: 1, createdAt: -1 },
    options: { name: 'billPayments_user_account' },
  },
  // A bill is paid once per reference. The index is the rule, not a check the
  // second click could race past.
  {
    collection: COLLECTIONS.billPayments,
    spec: { reference: 1 },
    options: { name: 'billPayments_reference_unique', unique: true },
  },

  // --- saved billers -------------------------------------------------------
  // One saved entry per account per biller per customer.
  {
    collection: COLLECTIONS.savedBillers,
    spec: { userId: 1, category: 1, billerId: 1, account: 1 },
    options: { name: 'savedBillers_user_account_unique', unique: true },
  },
  {
    collection: COLLECTIONS.savedBillers,
    spec: { userId: 1, createdAt: -1 },
    options: { name: 'savedBillers_user_createdAt' },
  },

  // --- content credit ------------------------------------------------------
  {
    collection: COLLECTIONS.contentCredits,
    spec: { userId: 1, store: 1, createdAt: -1 },
    options: { name: 'contentCredits_user_store_createdAt' },
  },
  // A top-up writes one wallet debit and one credit entry under a shared
  // reference; this is what makes the second one exactly-once.
  {
    collection: COLLECTIONS.contentCredits,
    spec: { reference: 1 },
    options: { name: 'contentCredits_reference_unique', unique: true },
  },
  {
    collection: COLLECTIONS.autoReloads,
    spec: { userId: 1, store: 1 },
    options: { name: 'autoReloads_user_store_unique', unique: true },
  },

  // --- sessions ------------------------------------------------------------
  {
    collection: COLLECTIONS.sessions,
    spec: { tokenHash: 1 },
    options: { name: 'sessions_tokenHash_unique', unique: true },
  },
  {
    collection: COLLECTIONS.sessions,
    spec: { userId: 1 },
    options: { name: 'sessions_userId' },
  },
  {
    // The database expires sessions itself. No cron job to forget to deploy,
    // and no window where a stale session stays valid because a cleanup failed.
    collection: COLLECTIONS.sessions,
    spec: { expiresAt: 1 },
    options: { name: 'sessions_ttl', expireAfterSeconds: 0 },
  },

  // --- one-time tokens -----------------------------------------------------
  ...[COLLECTIONS.passwordResetTokens, COLLECTIONS.emailVerificationTokens].flatMap(
    (collection): IndexDefinition[] => [
      {
        collection,
        spec: { tokenHash: 1 },
        options: { name: `${collection}_tokenHash_unique`, unique: true },
      },
      { collection, spec: { userId: 1 }, options: { name: `${collection}_userId` } },
      {
        collection,
        spec: { expiresAt: 1 },
        options: { name: `${collection}_ttl`, expireAfterSeconds: 0 },
      },
    ],
  ),

  // --- audit logs ----------------------------------------------------------
  {
    collection: COLLECTIONS.auditLogs,
    spec: { createdAt: -1 },
    options: { name: 'auditLogs_createdAt' },
  },
  {
    collection: COLLECTIONS.auditLogs,
    spec: { action: 1, createdAt: -1 },
    options: { name: 'auditLogs_action_createdAt' },
  },
  {
    collection: COLLECTIONS.auditLogs,
    spec: { actorId: 1, createdAt: -1 },
    options: { name: 'auditLogs_actor_createdAt' },
  },
  {
    // Two years. Long enough to investigate an incident found late; bounded so
    // the collection does not grow without limit. Adjust to your retention policy.
    collection: COLLECTIONS.auditLogs,
    spec: { createdAt: 1 },
    options: { name: 'auditLogs_retention_ttl', expireAfterSeconds: 730 * SECONDS_PER_DAY },
  },

  // --- one-time passwords --------------------------------------------------
  {
    collection: COLLECTIONS.otpCodes,
    spec: { identifier: 1, purpose: 1 },
    options: { name: 'otpCodes_identifier_purpose' },
  },
  {
    collection: COLLECTIONS.otpCodes,
    spec: { expiresAt: 1 },
    options: { name: 'otpCodes_ttl', expireAfterSeconds: 0 },
  },

  // --- rate limits ---------------------------------------------------------
  {
    collection: COLLECTIONS.rateLimits,
    spec: { key: 1 },
    options: { name: 'rateLimits_key_unique', unique: true },
  },
  {
    collection: COLLECTIONS.rateLimits,
    spec: { expiresAt: 1 },
    options: { name: 'rateLimits_ttl', expireAfterSeconds: 0 },
  },
];

export interface EnsureIndexesResult {
  created: string[];
  existing: string[];
  conflicts: string[];
}

/**
 * Creates every index, idempotently.
 *
 * `createIndex` is a no-op when an identical index already exists. When one
 * exists with the *same name but different options*, MongoDB raises code 85/86
 * -- that is reported rather than swallowed, because silently running on the
 * wrong index is how a "unique" constraint turns out not to be unique.
 */
export async function ensureIndexes(db?: Db): Promise<EnsureIndexesResult> {
  const database = db ?? (await getDb());

  const result: EnsureIndexesResult = { created: [], existing: [], conflicts: [] };

  for (const definition of INDEX_DEFINITIONS) {
    const label = `${definition.collection}.${definition.options.name ?? '(unnamed)'}`;

    try {
      const existingNames = await database
        .collection(definition.collection)
        .indexes()
        .then((indexes) => indexes.map((index) => index.name))
        .catch(() => [] as (string | undefined)[]);

      const alreadyPresent = existingNames.includes(definition.options.name);

      await database
        .collection(definition.collection)
        .createIndex(definition.spec, definition.options);

      if (alreadyPresent) {
        result.existing.push(label);
      } else {
        result.created.push(label);
      }
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 85 || code === 86) {
        result.conflicts.push(
          `${label}: an index with this name or key pattern already exists with different options`,
        );
      } else {
        throw error;
      }
    }
  }

  return result;
}
