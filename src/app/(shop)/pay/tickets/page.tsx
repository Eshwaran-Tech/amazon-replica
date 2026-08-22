import { LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { getSession } from '@/lib/auth/guards';
import { cn } from '@/lib/utils/cn';
import { TOPIC_LABELS, type SupportTicketView } from '@/models/support-ticket';
import { listTickets } from '@/services/support';

import { RaiseTicketForm, ResolveTicketForm } from './ticket-forms';

export const metadata: Metadata = {
  title: 'Your tickets',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function when(value: Date): string {
  return value.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Complaint history.
 *
 * The reference shows an Ongoing / Resolved split over an empty list. An empty
 * list is only honest if something could have filled it, so this store lets a
 * customer raise a ticket for real, lists it, and lets them close it.
 *
 * The tabs are links rather than client state, so a filtered view is a URL.
 */
export default async function TicketsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = one(params.tab) === 'resolved' ? 'RESOLVED' : 'OPEN';

  const session = await getSession();
  const tickets = session ? await listTickets(session.user.id, tab) : [];

  return (
    <Container size="default" className="space-y-4 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Amazon Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Your tickets</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <LifeBuoy className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Your tickets
        </h1>
      </header>

      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <nav aria-label="Ticket status" className="border-hairline flex border-b">
          {[
            { key: 'OPEN', label: 'Ongoing', href: '/pay/tickets' },
            { key: 'RESOLVED', label: 'Resolved', href: '/pay/tickets?tab=resolved' },
          ].map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              aria-current={tab === entry.key ? 'page' : undefined}
              className={cn(
                'flex-1 border-b-2 px-4 py-3 text-center text-sm font-semibold transition-colors',
                tab === entry.key
                  ? 'border-accent-500 text-ink'
                  : 'text-link border-transparent hover:border-neutral-300',
              )}
            >
              {entry.label}
            </Link>
          ))}
        </nav>

        {!session ? (
          <div className="px-4 py-12 text-center">
            <p className="text-ink-muted text-sm">Sign in to see your tickets.</p>
            <Link
              href="/auth/login?next=/pay/tickets"
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-block rounded-lg px-4 py-2 text-sm font-bold"
            >
              Sign in
            </Link>
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-ink-muted px-4 py-12 text-center text-sm">No tickets found</p>
        ) : (
          <ul className="divide-hairline divide-y">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="px-4 py-3">
                <TicketRow ticket={ticket} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {session && <RaiseTicketForm csrfField={<CsrfField />} />}

      <p className="text-ink-subtle text-xs leading-relaxed">
        A ticket is stored against your account and nothing else happens to it — there is no support
        desk behind this page, and it will not pretend there is. For what the store can actually
        answer, the{' '}
        <Link href="/help/amazon-pay" className="text-link hover:underline">
          Amazon Pay help topics
        </Link>{' '}
        cover most of it.
      </p>
    </Container>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicketView }) {
  return (
    <article>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{ticket.subject}</h2>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-bold',
            ticket.status === 'OPEN'
              ? 'bg-accent-500/15 text-accent-400'
              : 'bg-instock/15 text-instock',
          )}
        >
          {ticket.status === 'OPEN' ? 'ONGOING' : 'RESOLVED'}
        </span>
      </div>

      <p className="text-ink-subtle mt-0.5 text-[11px]">
        <span className="font-mono">{ticket.reference}</span> · {TOPIC_LABELS[ticket.topic]} ·
        raised {when(ticket.createdAt)}
        {ticket.relatedReference && (
          <>
            {' '}
            · about <span className="font-mono">{ticket.relatedReference}</span>
          </>
        )}
      </p>

      <p className="text-ink-muted mt-1.5 text-xs leading-relaxed whitespace-pre-line">
        {ticket.body}
      </p>

      {ticket.status === 'RESOLVED' ? (
        <p className="text-instock mt-1.5 text-[11px]">
          Closed {ticket.resolvedAt ? when(ticket.resolvedAt) : ''}
          {ticket.resolvedNote && <span className="text-ink-muted"> — {ticket.resolvedNote}</span>}
        </p>
      ) : (
        <ResolveTicketForm ticketId={ticket.id} csrfField={<CsrfField />} />
      )}
    </article>
  );
}
