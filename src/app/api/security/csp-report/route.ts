import { NextResponse } from 'next/server';

import { logSecurityEvent } from '@/lib/security/logger';

/**
 * CSP violation sink (`report-uri` target).
 *
 * Browsers POST here when the policy blocks something. In practice this is
 * mostly noise from browser extensions injecting scripts into the page, but a
 * sudden cluster of `script-src` violations on one route is a strong signal
 * that someone found an injection point.
 *
 * Unauthenticated by necessity -- the browser sends these without credentials.
 * Therefore: no database writes, a hard body-size cap, and structured logging
 * only. Treat every field as hostile input.
 */

export const dynamic = 'force-dynamic';

/** Reports are small; anything larger is someone probing for a log-flood. */
const MAX_BODY_BYTES = 8 * 1024;

/** Cap each logged field so a crafted report cannot bloat the log pipeline. */
function truncate(value: unknown, max = 300): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export async function POST(request: Request): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  // Shape varies by browser and by report format (`csp-report` vs Reporting
  // API). Pull the few fields we care about defensively instead of trusting a
  // schema the browser controls.
  const report =
    typeof parsed === 'object' && parsed !== null && 'csp-report' in parsed
      ? (parsed as Record<string, unknown>)['csp-report']
      : parsed;

  const fields = (typeof report === 'object' && report !== null ? report : {}) as Record<
    string,
    unknown
  >;

  logSecurityEvent({
    type: 'csp.violation',
    severity: 'warn',
    detail: {
      documentUri: truncate(fields['document-uri'] ?? fields['documentURL']),
      violatedDirective: truncate(fields['violated-directive'] ?? fields['effectiveDirective'], 80),
      blockedUri: truncate(fields['blocked-uri'] ?? fields['blockedURL']),
      sourceFile: truncate(fields['source-file'] ?? fields['sourceFile']),
      lineNumber:
        typeof fields['line-number'] === 'number' ? fields['line-number'] : undefined,
    },
  });

  // 204: the browser does not read the body and we have nothing to say.
  return new NextResponse(null, { status: 204 });
}
