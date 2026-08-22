/**
 * Development database seed (CLI wrapper).
 *
 * The logic lives in `src/lib/db/seed.ts` so the test suite can build the same
 * fixture. This file only reads configuration, guards against running in
 * production, and prints the result.
 *
 * Run: pnpm seed           catalogue + admin account only (activity starts at zero)
 *      pnpm seed --demo    also sample customers, orders, payments and reviews
 *      pnpm seed --reset   additionally delete every other account and its data
 *
 * Without `--reset` this leaves accounts registered through the app alone. It
 * did not always: the seed used to empty the whole `users` collection, so a
 * routine catalogue refresh silently deleted everyone who had signed up.
 */

import { closeMongoClient, getDb } from '../src/lib/db/client';
import { seedDatabase } from '../src/lib/db/seed';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed: NODE_ENV is "production". This script deletes data.');
    process.exit(1);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    console.error(
      'SEED_ADMIN_PASSWORD must be set in .env.local and be at least 12 characters.\n' +
        'Generate one with:\n' +
        "  node -e \"console.log(require('crypto').randomBytes(12).toString('base64url'))\"",
    );
    process.exit(1);
  }

  const demo = process.argv.includes('--demo');
  const resetAccounts = process.argv.includes('--reset');

  const db = await getDb();
  const existingAccounts = await db.collection('users').countDocuments();

  console.log(
    `Seeding database "${db.databaseName}" (${demo ? 'catalogue + demo activity' : 'catalogue only'})...\n`,
  );

  if (resetAccounts) {
    console.log(
      `  --reset: deleting all ${existingAccounts} existing account(s) and everything attached\n` +
        '  to them. This cannot be undone.\n',
    );
  }

  const summary = await seedDatabase(db, { adminEmail, adminPassword, demo, resetAccounts });

  console.log(`  categories        ${summary.categories}`);
  console.log(`  products          ${summary.products}`);
  console.log(`  users             ${summary.users}`);
  console.log(`  orders            ${summary.orders}`);
  console.log(`  reviews           ${summary.reviews}`);
  console.log(`  products rated    ${summary.ratedProducts}`);

  console.log('\nSeed complete.\n');

  const kept = await db.collection('users').countDocuments({
    email: { $nin: [summary.adminEmail, ...summary.customerEmails] },
  });
  if (resetAccounts) {
    console.log('All previously existing accounts were deleted (--reset).\n');
  } else {
    console.log(
      `${kept} account(s) registered through the app were left untouched. Pass --reset to\n` +
        'delete those too.\n',
    );
  }
  console.log(
    'The catalogue was replaced, so products have new ids: links from older orders to a\n' +
      'product page will not resolve, though each order keeps its own price snapshot.\n',
  );

  console.log('Development credentials (this database only):');
  console.log(`  ADMIN     ${summary.adminEmail}  /  value of SEED_ADMIN_PASSWORD in .env.local`);
  for (const email of summary.customerEmails) {
    console.log(`  CUSTOMER  ${email}  /  ${summary.customerPassword}`);
  }
  if (!demo) {
    console.log(
      '\nNo sample customers, orders or reviews were created: the dashboard starts at zero and\n' +
        'grows with real activity. Re-run with --demo for a populated development fixture.',
    );
  }
  console.log(
    '\nThese accounts are created by this script and exist only in your development\n' +
      'database. Never run this against production, and never reuse these passwords.',
  );
}

main()
  .catch((error: unknown) => {
    console.error('\nSeed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
