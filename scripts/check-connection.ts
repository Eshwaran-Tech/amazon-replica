/**
 * Connection diagnostic.
 *
 * Distinguishes the failure modes that all present as "cannot connect":
 * DNS/SRV, TCP reachability, the TLS handshake, and authentication. Atlas
 * returns a bare TLS alert for a non-allowlisted IP, which is easy to mistake
 * for a driver or certificate problem.
 *
 * Handles both connection-string forms: `mongodb+srv://` (Atlas, needs an SRV
 * lookup) and plain `mongodb://host:port` (local, Docker, self-hosted).
 *
 * Prints no credentials -- only the host, which is not secret.
 *
 * Run: pnpm db:check
 */

import { Resolver } from 'node:dns/promises';
import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

import { MongoClient } from 'mongodb';

import { isLoopbackUri } from '../src/lib/db/client';

interface Endpoint {
  host: string;
  port: number;
}

/** Strips scheme and credentials, returning the `host[:port][,host2...]` part. */
function hostSection(uri: string): string {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, '');
  const afterCredentials = withoutScheme.includes('@')
    ? (withoutScheme.split('@').pop() ?? '')
    : withoutScheme;
  return (afterCredentials.split('/')[0] ?? '').split('?')[0] ?? '';
}

function parseDirectEndpoints(uri: string): Endpoint[] {
  return hostSection(uri)
    .split(',')
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [host = '', port] = entry.split(':');
      return { host, port: Number(port ?? 27017) || 27017 };
    });
}

function checkTcp({ host, port }: Endpoint): Promise<string> {
  return new Promise((resolve) => {
    const socket = netConnect({ host, port, timeout: 8000 }, () => {
      socket.end();
      resolve('ok');
    });
    socket.on('error', (error: Error) => resolve(`FAILED - ${error.message}`));
    socket.on('timeout', () => {
      socket.destroy();
      resolve('TIMEOUT');
    });
  });
}

function checkTls({ host, port }: Endpoint): Promise<string> {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port, servername: host, timeout: 8000 }, () => {
      const protocol = socket.getProtocol();
      socket.end();
      resolve(`ok (${protocol})`);
    });
    socket.on('error', (error: Error) =>
      resolve(`FAILED - ${error.message.split('\n')[0] ?? 'handshake refused'}`),
    );
    socket.on('timeout', () => {
      socket.destroy();
      resolve('TIMEOUT');
    });
  });
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.');
    process.exit(1);
  }

  const isSrv = /^mongodb\+srv:\/\//i.test(uri);
  const loopback = isLoopbackUri(uri);

  console.log(`Host         : ${hostSection(uri)}`);
  console.log(`Database     : ${process.env.MONGODB_DB ?? '(not set)'}`);
  console.log(`Mode         : ${isSrv ? 'SRV (Atlas)' : 'direct'}${loopback ? ', loopback' : ''}`);
  console.log(`Node/OpenSSL : ${process.version} / ${process.versions.openssl}\n`);

  // --- 1. Resolve endpoints -------------------------------------------------
  let endpoints: Endpoint[];

  if (isSrv) {
    try {
      const records = await new Resolver().resolveSrv(`_mongodb._tcp.${hostSection(uri)}`);
      endpoints = records.map((record) => ({ host: record.name, port: record.port }));
      console.log(`[1/4] DNS SRV  : ok - ${endpoints.length} shard host(s)`);
    } catch (error) {
      console.log(`[1/4] DNS SRV  : FAILED - ${(error as Error).message}`);
      console.log('\n  -> The cluster hostname may be wrong, or DNS is blocked.');
      process.exit(1);
    }
  } else {
    endpoints = parseDirectEndpoints(uri);
    console.log(`[1/4] Endpoints: ${endpoints.map((e) => `${e.host}:${e.port}`).join(', ')}`);
  }

  const first = endpoints[0];
  if (!first) {
    console.error('No host could be parsed from MONGODB_URI.');
    process.exit(1);
  }

  // --- 2. TCP ---------------------------------------------------------------
  const tcpResult = await checkTcp(first);
  console.log(`[2/4] TCP      : ${tcpResult}`);
  if (tcpResult !== 'ok') {
    console.log(
      loopback
        ? '\n  -> Nothing is listening. Start the local database with `pnpm db:local`.'
        : '\n  -> The host is unreachable. Check the address, a firewall, or your network.',
    );
    process.exit(1);
  }

  // --- 3. TLS ---------------------------------------------------------------
  // Loopback runs plaintext by design; a TLS probe there would always "fail"
  // and bury the real result.
  if (loopback) {
    console.log('[3/4] TLS      : skipped (loopback runs plaintext)');
  } else {
    const tlsResult = await checkTls(first);
    console.log(`[3/4] TLS      : ${tlsResult}`);

    if (tlsResult !== 'ok' && !tlsResult.startsWith('ok')) {
      console.log(`
  -> TCP reached the server but the TLS handshake was refused.
     This is what MongoDB Atlas does when the connecting IP is not in the
     project's Network Access list -- it is not a certificate or driver fault.

     Fix: Atlas -> Network Access -> Add IP Address -> add this machine's
     public IP. Also confirm the cluster is not paused (free tiers auto-pause).
`);
      process.exit(1);
    }
  }

  // --- 4. Driver connect + authenticated ping -------------------------------
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB ?? 'admin');
    await db.command({ ping: 1 });

    const collections = await db.listCollections().toArray();
    console.log('[4/4] Auth+ping: ok\n');
    console.log(
      collections.length > 0
        ? `Connected. ${collections.length} collection(s): ${collections
            .map((c) => c.name)
            .sort()
            .join(', ')}`
        : 'Connected. Database is empty -- run `pnpm db:indexes && pnpm seed`.',
    );
  } catch (error) {
    const message = (error as Error).message.split('\n')[0] ?? 'unknown error';
    console.log(`[4/4] Auth+ping: FAILED - ${message}`);
    if (/auth/i.test(message)) {
      console.log('\n  -> The transport is fine, so this is a credentials or permissions problem.');
    }
    process.exitCode = 1;
  } finally {
    await client.close().catch(() => undefined);
  }
}

void main();
