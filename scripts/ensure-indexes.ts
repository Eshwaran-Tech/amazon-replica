/**
 * Creates every index defined in `src/lib/db/indexes.ts`.
 *
 * Idempotent, so it is safe to run on every deploy. Run it *before* the app
 * takes traffic: the unique indexes on `users.email`, `orders.orderNumber`,
 * `reviews.productId+userId` and `sessions.tokenHash` are correctness controls
 * the database enforces even when application logic is bypassed, and an
 * un-indexed filter on a large collection is a denial-of-service lever.
 *
 * Run: pnpm db:indexes
 */

import { closeMongoClient } from '../src/lib/db/client';
import { ensureIndexes } from '../src/lib/db/indexes';

async function main(): Promise<void> {
  console.log(`Creating indexes in database "${process.env.MONGODB_DB}"...\n`);

  const result = await ensureIndexes();

  for (const name of result.created) console.log(`  created   ${name}`);
  for (const name of result.existing) console.log(`  exists    ${name}`);
  for (const conflict of result.conflicts) console.error(`  CONFLICT  ${conflict}`);

  console.log(
    `\n${result.created.length} created, ${result.existing.length} already present, ` +
      `${result.conflicts.length} conflicts.`,
  );

  if (result.conflicts.length > 0) {
    console.error(
      '\nAn index exists with the same name but different options. Drop it and re-run:\n' +
        '  db.<collection>.dropIndex("<name>")\n' +
        'Do not ignore this -- a "unique" index that was created without the unique\n' +
        'flag enforces nothing.',
    );
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error('Index creation failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeMongoClient());
