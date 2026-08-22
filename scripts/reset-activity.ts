/**
 * Resets store *activity* to zero, keeping the catalogue and admin accounts.
 *
 * Removes every order, payment record, review, cart, rate-limit counter and
 * audit entry, plus the seed script's sample customers (customerN@example.com)
 * and their sessions. Product ratings are recomputed to zero (there are no
 * reviews left to aggregate). Categories, products and admin users are
 * untouched.
 *
 * After this, the admin dashboard reads Rs 0 / 0 orders / 0 customers, and every
 * figure from then on comes from real orders and payments.
 *
 * Run: pnpm db:reset-activity
 */

import { closeMongoClient, getDb } from '../src/lib/db/client';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to reset: NODE_ENV is "production". This script deletes data.');
    process.exit(1);
  }

  const db = await getDb();
  console.log(`Resetting activity in database "${db.databaseName}"...\n`);

  const users = db.collection('users');

  // The seed's sample customers, by their fixed address pattern -- real
  // customers who registered through the site are not touched.
  const demoCustomers = await users
    .find({ role: 'USER', email: /^customer\d+@example\.com$/ })
    .project<{ _id: unknown }>({ _id: 1 })
    .toArray();
  const demoIds = demoCustomers.map((doc) => doc._id);

  const results: Array<[string, number]> = [];
  const wipe = async (name: string, filter: Record<string, unknown> = {}) => {
    const { deletedCount } = await db.collection(name).deleteMany(filter);
    results.push([name, deletedCount]);
  };

  await wipe('orders');
  await wipe('reviews');
  await wipe('carts');
  await wipe('auditLogs');
  await wipe('rateLimits');
  await wipe('emailVerificationTokens');
  await wipe('passwordResetTokens');
  await wipe('otpCodes');
  // Sessions of the demo customers only; admin stays signed in.
  await wipe('sessions', { userId: { $in: demoIds } });
  await wipe('users', { _id: { $in: demoIds } });

  const ratings = await db
    .collection('products')
    .updateMany({}, { $set: { rating: 0, reviewCount: 0, updatedAt: new Date() } });
  results.push(['products (ratings reset)', ratings.modifiedCount]);

  for (const [name, count] of results) {
    console.log(`  ${name.padEnd(28)} ${count}`);
  }

  console.log(
    '\nDone. Catalogue and admin accounts kept; every dashboard figure now starts at zero.',
  );
}

main()
  .catch((error: unknown) => {
    console.error('\nReset failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
