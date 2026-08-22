import { NextResponse } from 'next/server';

import { getDb } from '@/lib/db/client';
import { logError } from '@/lib/security/logger';

/**
 * Liveness / readiness probe.
 *
 * Returns a boolean and nothing else. A health endpoint is unauthenticated by
 * definition, so it must not echo driver error text, hostnames, database names
 * or version strings -- all of which are reconnaissance material. The real
 * reason for the failure goes to the server log, not to the caller.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });

    return NextResponse.json(
      { ok: true, database: 'up' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logError('Health check failed', error, { route: '/api/health' });

    return NextResponse.json(
      { ok: false, database: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
