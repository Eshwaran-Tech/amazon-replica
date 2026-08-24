import { ChevronRight, LifeBuoy, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';

export const metadata: Metadata = {
  title: 'Eshwaran Pay help',
  description: 'Help topics for balance, gift cards, recharges, travel and payments.',
};

/**
 * Eshwaran Pay help.
 *
 * Laid out to the reference: a sidebar of topics, grouped link lists, and a
 * recommended shortlist.
 *
 * Every link goes to a page that exists. The reference's help hub is mostly
 * links into articles; a help page whose links 404 is worse than no help page,
 * so this one only lists what the store can actually show you -- and the couple
 * of answers that have no page of their own are written out here instead.
 */

interface Topic {
  label: string;
  href: string;
}

const GROUPS: Array<{ heading: string; topics: Topic[] }> = [
  {
    heading: 'Your balance',
    topics: [
      { label: 'See your Eshwaran Pay balance', href: '/pay/balance' },
      { label: 'Read your statement', href: '/pay/statement' },
      { label: 'Add money to your balance', href: '/pay/balance' },
      { label: 'Download a statement as CSV', href: '/pay/statement' },
    ],
  },
  {
    heading: 'Gift cards and vouchers',
    topics: [
      { label: 'Add a gift card or voucher code', href: '/gift-cards/vouchers' },
      { label: 'Send someone a gift card', href: '/gift-cards' },
      { label: 'Brand gift cards', href: '/gift-cards/brands' },
      { label: 'Bulk gifting for a team', href: '/gift-cards/corporate' },
    ],
  },
  {
    heading: 'Payments and instalments',
    topics: [
      { label: 'Your payment options', href: '/pay/cards' },
      { label: 'How instalments work and what they cost', href: '/pay/emi' },
      { label: 'Why a saved card cannot be a card number', href: '/pay/cards' },
    ],
  },
  {
    heading: 'Rewards',
    topics: [
      { label: 'Collect a cashback offer', href: '/pay/rewards' },
      { label: 'See what you have earned', href: '/pay/rewards' },
    ],
  },
  {
    heading: 'Recharges and travel',
    topics: [
      { label: 'Mobile recharge', href: '/pay/recharge' },
      { label: 'Bus tickets', href: '/buses' },
      { label: 'Train tickets', href: '/trains' },
      { label: 'Hotels', href: '/hotels' },
      { label: 'Flights', href: '/flights' },
    ],
  },
  {
    heading: 'Report a problem',
    topics: [
      { label: 'Raise a ticket', href: '/pay/tickets' },
      { label: 'Your ticket history', href: '/pay/tickets?tab=resolved' },
      { label: 'Cancel an order and get a refund', href: '/orders' },
    ],
  },
];

const RECOMMENDED: Topic[] = [
  { label: 'Eshwaran Pay balance', href: '/pay/balance' },
  { label: 'Statement and downloads', href: '/pay/statement' },
  { label: 'Gift cards', href: '/gift-cards' },
  { label: 'Instalments', href: '/pay/emi' },
  { label: 'Your rewards', href: '/pay/rewards' },
];

/** The handful of answers that have no page of their own. */
const ANSWERS: Array<{ question: string; answer: string }> = [
  {
    question: 'Why does my balance not match what I expected?',
    answer:
      'Only settled entries move it. A top-up that is still pending, or one that failed, is listed on the statement but changes nothing — the balance column shows a dash against those rows for that reason.',
  },
  {
    question: 'Can I get money out of my Eshwaran Pay balance?',
    answer:
      'No. The balance is spendable in this store and nowhere else, and there is no withdrawal path. Anything credited to it — a refund, cashback, a redeemed gift card — stays there until it is spent.',
  },
  {
    question: 'I lost a gift card code before I copied it.',
    answer:
      'It cannot be recovered. Only a one-way hash of each code is stored, so the store genuinely does not know what it was; the last four characters appear on your order so you can tell one card from another, and that is all there is.',
  },
  {
    question: 'Why was my cashback smaller than the offer said?',
    answer:
      '“Up to” means capped: a percentage offer pays the percentage or the cap, whichever is smaller. And one offer applies per order — a collected offer and a standing tier do not stack, so the better of the two is used.',
  },
];

export default function PayHelpPage() {
  return (
    <Container size="wide" className="py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted mb-3 text-sm">
        <Link href="/help" className="hover:text-link hover:underline">
          Help
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Eshwaran Pay</span>
      </nav>

      <div className="gap-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        {/* --------------------------------------------------- the sidebar */}
        <aside className="border-hairline bg-surface mb-4 rounded-2xl border p-4 lg:mb-0">
          <h2 className="text-sm font-bold">All help topics</h2>
          <ul className="mt-2 space-y-1">
            {GROUPS.map((group) => (
              <li key={group.heading}>
                <a
                  href={`#${group.heading.replace(/\s+/g, '-').toLowerCase()}`}
                  className="text-link block rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
                >
                  {group.heading}
                </a>
              </li>
            ))}
          </ul>

          <h2 className="border-hairline mt-4 border-t pt-4 text-sm font-bold">Quick solutions</h2>
          <ul className="mt-2 space-y-1">
            {RECOMMENDED.map((topic) => (
              <li key={topic.label}>
                <Link
                  href={topic.href}
                  className="text-link block rounded-md px-2 py-1.5 text-xs hover:bg-white/5"
                >
                  {topic.label}
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 space-y-5">
          <header>
            <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
              <LifeBuoy className="text-accent-400 h-5 w-5" aria-hidden="true" />
              Eshwaran Pay
            </h1>
            <p className="text-ink-muted mt-1 text-sm">
              Balance, gift cards, recharges, travel and payments — and what to do when one of them
              goes wrong.
            </p>
          </header>

          {/* The reference has a search box here. This one goes to the store's
              own search, which is a real search, rather than a box that filters
              a list of links nobody reads. */}
          <form action="/search" className="border-hairline bg-surface rounded-2xl border p-3">
            <label htmlFor="help-q" className="sr-only">
              Search the store
            </label>
            <div className="border-hairline flex items-center gap-2 rounded-lg border px-3 py-2">
              <Search className="text-ink-muted h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                id="help-q"
                name="q"
                type="search"
                placeholder="Search the store"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
          </form>

          {GROUPS.map((group) => (
            <section
              key={group.heading}
              id={group.heading.replace(/\s+/g, '-').toLowerCase()}
              className="border-hairline bg-surface overflow-hidden rounded-2xl border"
            >
              <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
                {group.heading}
              </h2>
              <ul className="divide-hairline divide-y">
                {group.topics.map((topic) => (
                  <li key={topic.label}>
                    <Link
                      href={topic.href}
                      className="hover:bg-surface-sunken flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors"
                    >
                      <span className="text-link">{topic.label}</span>
                      <ChevronRight
                        className="text-ink-muted h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* -------------------------------------------------- the answers */}
          <section
            aria-labelledby="answers"
            className="border-hairline bg-surface rounded-2xl border p-4"
          >
            <h2 id="answers" className="text-sm font-bold text-[#c45500]">
              Asked most often
            </h2>
            <div className="divide-hairline mt-2 divide-y">
              {ANSWERS.map((entry) => (
                <details key={entry.question} className="group py-2">
                  <summary className="text-link cursor-pointer list-none text-sm font-semibold marker:content-none">
                    <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">
                      ›
                    </span>
                    {entry.question}
                  </summary>
                  <p className="text-ink-muted mt-2 pl-4 text-xs leading-relaxed">{entry.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="border-hairline bg-surface rounded-2xl border p-4">
            <p className="text-sm font-semibold">Still stuck?</p>
            <p className="text-ink-muted mt-1 text-xs">
              Raise a ticket and it is stored against your account. There is no support desk behind
              it — this store will not pretend somebody is reading — but it gives you a written
              record you can come back to.
            </p>
            <Link
              href="/pay/tickets"
              className="border-accent-500 text-accent-400 hover:bg-accent-500 hover:text-brand-950 mt-3 inline-block rounded-lg border px-4 py-2 text-xs font-bold transition-colors"
            >
              Raise a ticket
            </Link>
          </div>
        </div>
      </div>
    </Container>
  );
}
