import type { Metadata } from 'next';
import Link from 'next/link';

import { CsrfField } from '@/components/security/csrf-field';
import { requirePageAdmin } from '@/lib/auth/guards';
import { adminListUsers } from '@/services/admin';

import { UserControls } from './user-controls';

export const metadata: Metadata = { title: 'Users' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function pageHref(q: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/admin/users${query ? `?${query}` : ''}`;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const session = await requirePageAdmin();
  const params = await searchParams;

  const q = typeof params.q === 'string' ? params.q : undefined;
  const page = Number.parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1;

  const listing = await adminListUsers({ q, page });

  return (
    <>
      <h1 className="text-xl font-bold sm:text-2xl">Users</h1>

      <form action="/admin/users" className="mt-3 flex max-w-md gap-2">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <input
          id="user-search"
          name="q"
          defaultValue={q}
          placeholder="Search name or email"
          className="border-hairline bg-surface focus:border-link min-h-10 w-full rounded-md border px-3 text-sm"
        />
        <button
          type="submit"
          className="border-hairline bg-surface hover:bg-surface-muted min-h-10 rounded-md border px-4 text-sm font-semibold"
        >
          Search
        </button>
      </form>

      <div className="border-hairline bg-surface mt-3 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-hairline border-b text-left text-xs uppercase">
              <th className="px-4 py-2.5 font-semibold">User</th>
              <th className="px-4 py-2.5 font-semibold">Joined</th>
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">State</th>
              <th className="px-4 py-2.5 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {listing.users.map((user) => {
              const isSelf = user.id === session.user.id;
              return (
                <tr key={user.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-2.5">
                    <span className="block font-medium">
                      {user.name}
                      {isSelf && <span className="text-link text-xs font-semibold"> (you)</span>}
                    </span>
                    <span className="text-ink-subtle text-xs">{user.email}</span>
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 whitespace-nowrap">
                    {dateFormat.format(new Date(user.createdAt))}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        user.role === 'ADMIN'
                          ? 'bg-accent-500/15 text-accent-400 border-accent-500/40 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold'
                          : 'text-ink-muted text-xs'
                      }
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {user.isDisabled ? (
                      <span className="text-deal font-semibold">Disabled</span>
                    ) : user.emailVerified ? (
                      <span className="text-instock font-semibold">Verified</span>
                    ) : (
                      <span className="text-ink-muted">Unverified</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {/* Self-service controls are not rendered -- and the service
                        refuses them anyway if a crafted POST tries. */}
                    {!isSelf && (
                      <UserControls
                        userId={user.id}
                        role={user.role}
                        isDisabled={user.isDisabled}
                        csrfField={<CsrfField />}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {listing.users.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-muted px-4 py-8 text-center">
                  No users match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(listing.page > 1 || listing.hasMore) && (
        <nav aria-label="User pages" className="mt-4 flex items-center justify-center gap-3 text-sm">
          {listing.page > 1 && (
            <Link
              href={pageHref(q, listing.page - 1)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Previous
            </Link>
          )}
          <span className="text-ink-muted">Page {listing.page}</span>
          {listing.hasMore && (
            <Link
              href={pageHref(q, listing.page + 1)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
