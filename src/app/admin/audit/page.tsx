import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePageAdmin } from '@/lib/auth/guards';
import { AUDIT_ACTIONS } from '@/models/types';
import { listAuditLogs } from '@/services/admin';

export const metadata: Metadata = { title: 'Audit log' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

function pageHref(action: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (action) params.set('action', action);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/admin/audit${query ? `?${query}` : ''}`;
}

/**
 * The audit trail, read-only by design. There is no edit or delete surface for
 * audit entries anywhere in the app -- an audit log an admin can prune is
 * evidence an attacker with an admin session can destroy.
 */
export default async function AdminAuditPage({ searchParams }: PageProps) {
  await requirePageAdmin();
  const params = await searchParams;

  const action = AUDIT_ACTIONS.find((option) => option === params.action);
  const page = Number.parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1;

  const listing = await listAuditLogs({ action, page });

  return (
    <>
      <h1 className="text-xl font-bold sm:text-2xl">Audit log</h1>

      <form action="/admin/audit" className="mt-3 flex max-w-md gap-2">
        <label htmlFor="audit-action" className="sr-only">
          Filter by action
        </label>
        <select
          id="audit-action"
          name="action"
          defaultValue={action ?? ''}
          className="border-hairline bg-surface focus:border-link min-h-10 w-full rounded-md border px-3 text-sm"
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border-hairline bg-surface hover:bg-surface-muted min-h-10 rounded-md border px-4 text-sm font-semibold"
        >
          Filter
        </button>
      </form>

      <div className="border-hairline bg-surface mt-3 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-hairline border-b text-left text-xs uppercase">
              <th className="px-4 py-2.5 font-semibold">When</th>
              <th className="px-4 py-2.5 font-semibold">Action</th>
              <th className="px-4 py-2.5 font-semibold">Target</th>
              <th className="px-4 py-2.5 font-semibold">Actor</th>
              <th className="px-4 py-2.5 font-semibold">IP</th>
              <th className="px-4 py-2.5 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y align-top">
            {listing.entries.map((entry) => (
              <tr key={entry.id}>
                <td className="text-ink-muted px-4 py-2 text-xs whitespace-nowrap tabular-nums">
                  {timeFormat.format(new Date(entry.createdAt))}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{entry.action}</td>
                <td className="text-ink-muted px-4 py-2 text-xs">
                  {entry.targetType ?? '-'}
                  {entry.targetId && (
                    <span className="text-ink-subtle block max-w-32 truncate font-mono">
                      {entry.targetId}
                    </span>
                  )}
                </td>
                <td className="text-ink-muted px-4 py-2 font-mono text-xs">
                  <span className="block max-w-32 truncate">
                    {entry.actorId ?? 'system'}
                  </span>
                  {entry.actorRole && <span className="text-ink-subtle">{entry.actorRole}</span>}
                </td>
                <td className="text-ink-muted px-4 py-2 font-mono text-xs">{entry.ip ?? '-'}</td>
                <td className="text-ink-muted px-4 py-2 text-xs">
                  {entry.metadata ? (
                    <code className="block max-w-md break-all whitespace-pre-wrap">
                      {JSON.stringify(entry.metadata)}
                    </code>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
            {listing.entries.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-muted px-4 py-8 text-center">
                  No audit entries match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(listing.page > 1 || listing.hasMore) && (
        <nav aria-label="Audit pages" className="mt-4 flex items-center justify-center gap-3 text-sm">
          {listing.page > 1 && (
            <Link
              href={pageHref(action, listing.page - 1)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Newer
            </Link>
          )}
          <span className="text-ink-muted">Page {listing.page}</span>
          {listing.hasMore && (
            <Link
              href={pageHref(action, listing.page + 1)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Older
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
