import { CreditCard, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { EMI_EXCLUSIONS, EMI_ISSUERS, ISSUER_KIND_LABELS } from '@/data/emi';

import { EmiCalculator } from './emi-calculator';

export const metadata: Metadata = {
  title: 'Easy Monthly Instalments (EMI)',
  description: 'How instalments work on this store, what they cost, and when they are not offered.',
};

/**
 * EMI.
 *
 * **This store lends nothing** and says so at the top rather than in the small
 * print. The reference's page lists real banks against real processing fees;
 * reproducing those would be quoting one bank's commercial terms on another
 * company's storefront, and a reader acting on a stale figure would have been
 * misled by this page rather than by the bank. The issuers here are invented
 * and the rates are illustrative.
 *
 * The arithmetic is real, and so are the answers: the reducing-balance formula,
 * the fee floor, why a no-cost plan still shows interest on a statement, and
 * what happens to instalments when an order is cancelled. Those are the
 * questions the reference's FAQ is actually for.
 */

interface Faq {
  question: string;
  answer: React.ReactNode;
}

const FAQS: Array<{ heading: string; items: Faq[] }> = [
  {
    heading: 'About instalments',
    items: [
      {
        question: 'How do I check whether I can pay in instalments?',
        answer: (
          <>
            The checkout offers it when the order clears the issuer&apos;s minimum and every item is
            convertible. The calculator above shows which issuers convert an order of a given size
            and which do not, with the reason.
          </>
        ),
      },
      {
        question: 'How do I make a purchase using instalments?',
        answer: (
          <>
            Choose the card at checkout, then the tenure. The full amount is charged to the card
            once; the issuer then splits it into the instalments you chose. The store is paid in
            full on day one either way — which is why the interest is the issuer&apos;s, not the
            store&apos;s.
          </>
        ),
      },
      {
        question: 'How do I repay?',
        answer: (
          <>
            To the issuer, on the card statement, at the same time as everything else on it. The
            store has no repayment schedule of its own and cannot take an instalment from your
            Eshwaran Pay balance.
          </>
        ),
      },
    ],
  },
  {
    heading: 'Charges',
    items: [
      {
        question: 'Will I pay anything extra?',
        answer: (
          <>
            Two things: interest at the issuer&apos;s rate, and a one-off processing fee. Both are
            in the table above for every issuer, and both are the issuer&apos;s charge rather than
            the store&apos;s. Tax on the fee is charged by the issuer at the prevailing rate.
          </>
        ),
      },
      {
        question: 'Why does my no-cost plan show interest on the statement?',
        answer: (
          <>
            Because the interest is genuinely charged. On a no-cost plan the store discounts the
            order up front by the whole interest amount, so what you pay overall is the sticker
            price — but the issuer still bills each instalment with interest on it. The processing
            fee is not covered by the discount.
          </>
        ),
      },
      {
        question: 'How is the processing fee worked out?',
        answer: (
          <>
            A percentage of the order with a floor: whichever is larger. That is why a small
            convertible order can carry a fee worth several per cent of it, and a large one carries
            close to the headline percentage.
          </>
        ),
      },
    ],
  },
  {
    heading: 'Cancellations and problems',
    items: [
      {
        question: 'What happens to my instalments if I cancel the order?',
        answer: (
          <>
            The store refunds the full amount to the card. The issuer then closes the plan — but
            instalments already billed stay on the statement until that catches up, and the interest
            and processing fee already charged are usually not reversed. That is the part worth
            knowing before you convert a purchase you are unsure about.
          </>
        ),
      },
      {
        question: 'Why were my instalments not set up?',
        answer: (
          <>
            Most often the order fell below the issuer&apos;s minimum, the card had insufficient
            limit for the full amount, or one item in the order was not convertible. The checkout
            names which of the three it was rather than saying &ldquo;not available&rdquo;.
          </>
        ),
      },
      {
        question: 'Why is EMI not offered on some products?',
        answer: (
          <>
            <p>Instalments are not offered on:</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {EMI_EXCLUSIONS.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </>
        ),
      },
    ],
  },
];

export default function EmiPage() {
  return (
    <Container size="default" className="space-y-5 py-5">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/pay" className="hover:text-link hover:underline">
          Eshwaran Pay
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ›
        </span>
        <span className="text-ink">Instalments</span>
      </nav>

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl">
          <CreditCard className="text-accent-400 h-5 w-5" aria-hidden="true" />
          Easy Monthly Instalments
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          What a plan costs, and what it costs you if things change.
        </p>
      </header>

      {/* The one thing that has to be said before anything else. */}
      <div className="flex items-start gap-2 rounded-2xl border border-[#c45500]/40 bg-[#fff1e0] p-3 text-xs leading-relaxed text-[#8a3d00]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>This store lends nothing.</strong> It has no credit licence and no lending
          partner. The issuers below are its own inventions and the rates are illustrative, so you
          can see how a plan is built rather than take a number from here to a bank. Nothing on this
          page is a quote, an offer of credit, or financial advice.
        </p>
      </div>

      <EmiCalculator />

      {/* ------------------------------------------------------- the issuers */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <h2 className="text-sm font-bold">Who converts what</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-xs">
            <thead>
              <tr className="text-ink-subtle border-hairline border-b text-left">
                <th scope="col" className="pb-1 font-semibold">
                  Issuer
                </th>
                <th scope="col" className="pb-1 font-semibold">
                  Type
                </th>
                <th scope="col" className="pb-1 text-right font-semibold">
                  Rate
                </th>
                <th scope="col" className="pb-1 text-right font-semibold">
                  Processing
                </th>
                <th scope="col" className="pb-1 text-right font-semibold">
                  From
                </th>
                <th scope="col" className="pb-1 text-right font-semibold">
                  Tenures
                </th>
              </tr>
            </thead>
            <tbody className="divide-hairline divide-y">
              {EMI_ISSUERS.map((issuer) => (
                <tr key={issuer.id} className="text-ink-muted">
                  <td className="text-ink py-1.5 font-semibold">{issuer.name}</td>
                  <td className="py-1.5">{ISSUER_KIND_LABELS[issuer.kind]}</td>
                  <td className="py-1.5 text-right">{issuer.annualRate}%</td>
                  <td className="py-1.5 text-right">
                    {issuer.processingPercent}%
                    {issuer.processingMinRupees > 0 && (
                      <span className="text-ink-subtle"> min ₹{issuer.processingMinRupees}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    ₹{issuer.minAmountRupees.toLocaleString('en-IN')}
                  </td>
                  <td className="py-1.5 text-right">{issuer.tenures.join(', ')} mo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ----------------------------------------------------------- the FAQ */}
      {FAQS.map((group) => (
        <section
          key={group.heading}
          aria-labelledby={group.heading}
          className="border-hairline bg-surface rounded-2xl border p-4"
        >
          <h2 id={group.heading} className="text-sm font-bold text-[#c45500]">
            {group.heading}
          </h2>
          <div className="divide-hairline mt-2 divide-y">
            {group.items.map((faq) => (
              <details key={faq.question} className="group py-2">
                <summary className="text-link cursor-pointer list-none text-sm font-semibold marker:content-none">
                  <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">
                    ›
                  </span>
                  {faq.question}
                </summary>
                <div className="text-ink-muted mt-2 pl-4 text-xs leading-relaxed">{faq.answer}</div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <p className="text-ink-subtle text-xs leading-relaxed">
        The formula behind every figure above is the standard reducing-balance instalment, computed
        in whole paise and rounded once. Saving a card for a future instalment plan is on{' '}
        <Link href="/pay/cards" className="text-link hover:underline">
          your payment options
        </Link>
        , where the card number is never stored.
      </p>
    </Container>
  );
}
