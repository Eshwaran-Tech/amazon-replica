import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Starts one in-process MongoDB for the whole test run.
 *
 * A **replica set**, not a standalone: MongoDB only supports multi-document
 * transactions on a replica set, and the checkout path relies on one to make
 * the stock decrement and the order insert atomic. Testing against a standalone
 * would let the concurrency tests pass for the wrong reason.
 *
 * Vitest runs `globalSetup` in the main process before any worker is forked, so
 * assigning `process.env.MONGODB_URI` here propagates to the workers that
 * import the application's database layer.
 */

let replSet: MongoMemoryReplSet | undefined;

export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { name: 'nexkart-test', count: 1 },
  });

  process.env.MONGODB_URI = replSet.getUri();
  process.env.MONGODB_DB = 'amazon_next_test';
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
}
