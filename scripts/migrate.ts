/**
 * Schema migrations for an existing database. Idempotent: safe to run on every
 * deploy, after `db:indexes` would otherwise report a conflict.
 *
 *   2026-08 mobile accounts
 *     - `users.email` became nullable (mobile-only accounts): the unique index
 *       must be partial. The old full-collection index is dropped so the
 *       partial one can be created under the same name.
 *     - New user fields get their defaults on existing documents:
 *       `phone: null`, `phoneVerified: false`, `hasPassword: true`.
 *
 * Run: pnpm db:migrate
 */

import { closeMongoClient, getDb } from '../src/lib/db/client';
import { ensureIndexes } from '../src/lib/db/indexes';

async function main(): Promise<void> {
  const db = await getDb();
  console.log(`Migrating database "${db.databaseName}"...\n`);

  const users = db.collection('users');

  // --- 2026-08: users.email partial unique -----------------------------------
  const indexes = await users.indexes().catch(() => []);
  const emailIndex = indexes.find((index) => index.name === 'users_email_unique');
  if (emailIndex && !emailIndex.partialFilterExpression) {
    await users.dropIndex('users_email_unique');
    console.log('  dropped   users.users_email_unique (pre-partial version)');
  }

  const defaults = await users.updateMany(
    { $or: [{ phone: { $exists: false } }, { phoneVerified: { $exists: false } }, { hasPassword: { $exists: false } }] },
    [
      {
        $set: {
          phone: { $ifNull: ['$phone', null] },
          phoneVerified: { $ifNull: ['$phoneVerified', false] },
          phoneVerifiedAt: { $ifNull: ['$phoneVerifiedAt', null] },
          hasPassword: { $ifNull: ['$hasPassword', true] },
        },
      },
    ],
  );
  console.log(`  users     ${defaults.modifiedCount} document(s) given mobile-account defaults`);

  // --- indexes, including any new ones ---------------------------------------
  const result = await ensureIndexes(db);
  for (const name of result.created) console.log(`  created   ${name}`);
  for (const conflict of result.conflicts) console.error(`  CONFLICT  ${conflict}`);
  console.log(`\n${result.created.length} index(es) created, ${result.existing.length} already present.`);

  if (result.conflicts.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log('Migration complete.');
}

main()
  .catch((error: unknown) => {
    console.error('\nMigration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
