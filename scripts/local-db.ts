/**
 * Local MongoDB for development, when Atlas is unavailable.
 *
 * Starts a single-node **replica set** (not a standalone) on a fixed port with
 * a persistent data directory. The replica set matters: MongoDB only supports
 * multi-document transactions on one, and the checkout path depends on a
 * transaction to make the stock decrement and the order insert atomic. A
 * standalone `mongod` would let the app appear to work while silently skipping
 * the concurrency guarantee it is supposed to have.
 *
 * Leave this running in one terminal, point `.env.local` at it, and develop:
 *
 *   MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=nexkart-local&directConnection=true
 *   MONGODB_DB=amazon_next
 *
 * Data persists in `.local-db/` between restarts. This is a development tool
 * only -- it has no authentication and listens on loopback.
 *
 * Run: pnpm db:local
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { MongoMemoryReplSet } from 'mongodb-memory-server';

const PORT = 27018;
const REPL_SET_NAME = 'nexkart-local';
const DATA_DIR = join(process.cwd(), '.local-db');

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log('Starting local MongoDB replica set...');
  console.log('(the first run downloads a mongod binary, which takes a minute)\n');

  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: REPL_SET_NAME, count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: PORT, dbPath: DATA_DIR, storageEngine: 'wiredTiger' }],
  });

  const uri = `mongodb://127.0.0.1:${PORT}/?replicaSet=${REPL_SET_NAME}&directConnection=true`;

  console.log('Local MongoDB is running.\n');
  console.log('  Data directory : .local-db/  (persists between restarts)');
  console.log('  Transactions   : supported (single-node replica set)\n');
  console.log('Put this in .env.local:\n');
  console.log(`  MONGODB_URI=${uri}`);
  console.log('  MONGODB_DB=amazon_next\n');
  console.log('Then, in another terminal:  pnpm seed  &&  pnpm dev');
  console.log('\nPress Ctrl+C to stop.\n');

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, shutting down MongoDB...`);
    await replSet.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Hold the process open.
  await new Promise<never>(() => {});
}

main().catch((error: unknown) => {
  console.error('Failed to start local MongoDB:', error instanceof Error ? error.message : error);
  process.exit(1);
});
