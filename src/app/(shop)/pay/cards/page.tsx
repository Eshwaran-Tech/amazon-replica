import { ChevronRight, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { listCards, MAX_CARDS } from '@/services/saved-cards';

import { CardManager } from './card-manager';

export const metadata: Metadata = {
  title: 'Your payment options',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Your payment options.
 *
 * The reference's page opens with a notice that saved cards may have been
 * removed under the tokenisation rules, and asks you to re-enter them. This
 * store has nothing to re-enter: it never held a card number in the first
 * place, so the notice says that instead.
 */
export default async function PaymentOptionsPage() {
  const session = await getSession();
  const cards = session ? await listCards(session.user.id) : [];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/account" className="hover:text-link hover:underline">
          Your Account
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Manage payment methods</span>
      </nav>

      <header>
        <h1 className="text-lg font-bold sm:text-xl">Your payment options</h1>
        <p className="text-ink-muted mt-1 text-sm">
          An overview of the payment methods and settings on your account.
        </p>
      </header>

      <div className="border-link/40 bg-link/5 flex items-start gap-2 rounded-2xl border p-3 text-xs leading-relaxed">
        <Info className="text-link mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-ink-muted">
          Card networks now require merchants to keep a token rather than a card number. This store
          has never stored one, so there is nothing here that needed removing and nothing to
          re-enter — a saved card is a token, four digits, a network and an expiry.
        </p>
      </div>

      {session ? (
        <CardManager cards={cards} maxCards={MAX_CARDS} csrfField={<CsrfField />} />
      ) : (
        <div className="border-hairline bg-surface rounded-2xl border p-8 text-center">
          <p className="text-sm font-bold">Sign in to manage your payment methods.</p>
          <Link
            href="/auth/login?next=/pay/cards"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
          >
            Sign in
          </Link>
        </div>
      )}

      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Related settings</h2>
        <ul className="divide-hairline divide-y">
          {[
            { label: 'Instalments and what they cost', href: '/pay/emi' },
            { label: 'Amazon Pay balance and statement', href: '/pay/balance' },
            { label: 'Your rewards', href: '/pay/rewards' },
            { label: 'Raise or review a ticket', href: '/pay/tickets' },
          ].map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                className="hover:bg-surface-sunken flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors"
              >
                <span className="text-link">{row.label}</span>
                <ChevronRight className="text-ink-muted h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-ink-subtle text-xs leading-relaxed">
        A saved card here is a token from the mock provider, the last four digits, the network and
        the expiry. The number is used once, to derive the token, and is not written anywhere — and
        no CVV is ever stored, because no merchant may keep one.
      </p>
    </Container>
  );
}
