import { NextResponse } from 'next/server';

import { getSession } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { buildStatement, monthPeriod, statementCsv } from '@/services/statement';
import { WALLET_ENTRY_TYPES, type WalletEntryType } from '@/models/wallet';
import { BRAND_NAME } from '@/lib/brand';

/**
 * The statement, as a CSV download.
 *
 * A GET rather than an action because it returns a file rather than a page.
 * The session is what decides whose statement this is -- there is no user id in
 * the query string, so a guessed URL returns the guesser's own statement rather
 * than somebody else's.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in to download a statement.' }, { status: 401 });
  }

  const limit = await checkRateLimit('account:user', session.user.id);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many downloads. Try again shortly.' }, { status: 429 });
  }

  const url = new URL(request.url);
  const now = new Date();

  const year = Number(url.searchParams.get('year')) || now.getFullYear();
  const month = Number(url.searchParams.get('month'));
  const safeMonth = Number.isInteger(month) && month >= 0 && month <= 11 ? month : now.getMonth();

  const types = (url.searchParams.get('type') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is WalletEntryType =>
      (WALLET_ENTRY_TYPES as readonly string[]).includes(entry),
    );

  const statement = await buildStatement(session.user.id, monthPeriod(year, safeMonth), {
    types,
    limit: 5000,
  });

  const name = `${BRAND_NAME.toLowerCase()}-pay-statement-${year}-${String(safeMonth + 1).padStart(2, '0')}.csv`;

  return new NextResponse(statementCsv(statement), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // The statement is per-account and must never be cached by a proxy.
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
