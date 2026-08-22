import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/logo';
import { getT } from '@/lib/i18n/server';
import { BRAND_NAME } from '@/lib/brand';

/**
 * Auth shell: a black page with the wordmark centred at the top, one narrow
 * dark-navy card, and a legal footer.
 *
 * Deliberately minimal: no search, no nav, no cart. A sign-in page with fewer
 * ways to wander off converts better, and a smaller surface here means fewer
 * components rendering on a page that anonymous traffic hits hardest.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = await getT();
  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <header className="flex justify-center pt-4 pb-3">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="rounded px-2 py-1">
          <Logo />
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-10">
        <div className="w-full max-w-[350px]">{children}</div>
      </main>

      <footer className="border-t border-white/10 py-6">
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs">
          <Link href="/terms" className="text-[#6cb6ff] hover:text-[#ffb52b] hover:underline">
            {t('auth.conditions')}
          </Link>
          <Link href="/privacy" className="text-[#6cb6ff] hover:text-[#ffb52b] hover:underline">
            {t('auth.privacy')}
          </Link>
          <Link href="/help" className="text-[#6cb6ff] hover:text-[#ffb52b] hover:underline">
            {t('footer.help')}
          </Link>
        </nav>
        <p className="mt-3 text-center text-xs text-white/60">
          &copy; 2026 {BRAND_NAME}. An original demonstration storefront.
        </p>
      </footer>
    </div>
  );
}
