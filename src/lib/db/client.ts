import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';

import { env } from '@/lib/env';

import '@/lib/server-guard';

/**
 * MongoDB Atlas connection pool.
 *
 * Two things this file exists to get right:
 *
 * 1. One pool per process. The Next.js dev server hot-reloads modules on every
 *    edit; without a global cache each reload would open a fresh pool and Atlas
 *    would start refusing connections after a few dozen saves.
 *
 * 2. The connection string never leaves this module. Callers get a `Db` handle.
 *    Nothing returns, logs, or re-exports `MONGODB_URI`.
 */

/**
 * True when every host in the connection string is loopback.
 *
 * Used to decide whether TLS is required. A local `mongod` (the `pnpm db:local`
 * replica set, a Docker container, CI) speaks plaintext on the loopback
 * interface, where there is no network path for an attacker to sit on. Forcing
 * TLS there does not add security -- it just fails to connect.
 */
export function isLoopbackUri(uri: string): boolean {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const afterCredentials = withoutScheme.includes('@')
    ? (withoutScheme.split('@').pop() ?? '')
    : withoutScheme;

  const hostSection = (afterCredentials.split('/')[0] ?? '').split('?')[0] ?? '';
  const hosts = hostSection.split(',').filter((host) => host.length > 0);

  if (hosts.length === 0) return false;

  return hosts.every((host) =>
    /^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/i.test(host.trim()),
  );
}

function buildOptions(uri: string, nodeEnv: string, appUrl: string): MongoClientOptions {
  // `mongodb+srv://` (Atlas) turns TLS on by default; setting it again is
  // harmless but redundant. For a plain `mongodb://` host that is *not*
  // loopback, we turn it on explicitly so a hand-edited URI cannot silently
  // downgrade a production connection to plaintext.
  const loopback = isLoopbackUri(uri);
  const requireTls = !loopback;

  // A *deployed* production server talking to a loopback database is almost
  // always a misconfiguration (a placeholder URI that survived into the
  // deploy), and it would mean the plaintext exemption above is live in
  // production. But `next build` and `next start` also run with
  // NODE_ENV=production on a developer machine, where a loopback database is
  // legitimate -- so "deployed" is judged the same way the env layer judges the
  // app URL: a loopback NEXT_PUBLIC_APP_URL means a local smoke test, a real
  // domain means a deployment. Real domain + loopback database stays fatal.
  const appIsLoopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(appUrl);

  if (nodeEnv === 'production' && loopback && !appIsLoopback) {
    throw new Error(
      'MONGODB_URI points at localhost in production. Set it to your managed cluster.',
    );
  }

  return {
    ...(requireTls ? { tls: true } : {}),

    // Bounded pool: a serverless deployment can otherwise fan out to hundreds
    // of idle connections and exhaust the cluster's connection limit.
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,

    // Fail fast instead of hanging a request thread for 30s on a network split.
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,

    // Reads and writes must be durable before we tell a customer their order
    // succeeded. `majority` is what makes the checkout transaction meaningful.
    retryWrites: true,
    writeConcern: { w: 'majority' },

    appName: 'amazon-next',
  };
}

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

let productionClient: Promise<MongoClient> | undefined;

/**
 * Connects, and -- crucially -- evicts itself from the cache on failure.
 *
 * Without the eviction, a database that is unreachable for the *first*
 * request would poison the process forever: the rejected promise stays cached
 * and every later request rethrows it, long after the database is back. A
 * failed connect must be retried by the next caller, not remembered.
 */
function createClientPromise(evict: () => void): Promise<MongoClient> {
  const { MONGODB_URI, NODE_ENV, NEXT_PUBLIC_APP_URL } = env();
  const client = new MongoClient(
    MONGODB_URI,
    buildOptions(MONGODB_URI, NODE_ENV, NEXT_PUBLIC_APP_URL),
  );
  return client.connect().catch((error: unknown) => {
    evict();
    // Release whatever the failed attempt allocated; the next call builds fresh.
    void client.close().catch(() => undefined);
    throw error;
  });
}

function clientPromise(): Promise<MongoClient> {
  if (env().NODE_ENV === 'production') {
    // In production the module graph is evaluated once, so a module-local
    // singleton is enough -- and keeping it off `globalThis` avoids leaking a
    // live database handle into any code that enumerates globals.
    productionClient ??= createClientPromise(() => {
      productionClient = undefined;
    });
    return productionClient;
  }

  // Development / test: survive hot reload.
  globalThis.__mongoClientPromise ??= createClientPromise(() => {
    globalThis.__mongoClientPromise = undefined;
  });
  return globalThis.__mongoClientPromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  return clientPromise();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(env().MONGODB_DB);
}

/**
 * Closes the pool. Only for scripts and tests -- never call this from a request
 * handler, it would tear the pool out from under concurrent requests.
 */
export async function closeMongoClient(): Promise<void> {
  const promise = productionClient ?? globalThis.__mongoClientPromise;
  if (!promise) return;

  productionClient = undefined;
  globalThis.__mongoClientPromise = undefined;

  const client = await promise;
  await client.close();
}
