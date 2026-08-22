import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminNav } from '@/components/admin/admin-nav';
import { Logo } from '@/components/brand/logo';
import { requirePageAdmin } from '@/lib/auth/guards';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: { default: `Admin`, template: `%s | ${BRAND_NAME} admin` },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin chrome: a fixed sidebar on desktop that collapses to a top strip on
 * small screens.
 *
 * The layout guard is defence in depth, not the control: **every** admin page
 * and Server Action re-runs its own admin check against the database, because
 * the Next.js docs are explicit that layouts do not re-render on every nested
 * navigation and must not be the only auth boundary.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageAdmin();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="bg-brand-950 flex shrink-0 flex-col text-white lg:sticky lg:top-0 lg:h-dvh lg:w-56">
        <div className="flex items-center gap-3 px-4 py-3 lg:flex-col lg:items-start lg:gap-2 lg:px-4 lg:pt-5">
          <Link href="/admin" aria-label="Admin dashboard">
            <Logo />
          </Link>
          <span className="text-[11px] font-bold tracking-[0.18em] text-white/50 uppercase">
            Admin
          </span>
        </div>

        <div className="overflow-x-auto px-3 pb-3 lg:flex-1 lg:overflow-visible lg:px-3 lg:pt-2">
          <AdminNav />
        </div>

        <div className="hidden border-t border-white/10 px-4 py-3 pb-14 text-xs lg:block">
          <p className="truncate text-white/60">Signed in as</p>
          <p className="truncate font-medium text-white/90">{session.user.name}</p>
          <Link
            href="/"
            className="mt-2 inline-block text-white/70 hover:text-white hover:underline"
          >
            Back to store
          </Link>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-6">{children}</div>
      </main>
    </div>
  );
}
