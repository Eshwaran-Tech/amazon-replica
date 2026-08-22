import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';

export const metadata: Metadata = {
  title: 'Conditions of use',
  description: 'The terms on which this store is offered.',
};

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'Your account',
    body: 'You are responsible for keeping your sign-in details and one-time passwords to yourself. Tell us immediately if you think someone else has used your account.',
  },
  {
    title: 'Orders and pricing',
    body: 'All prices are in Indian Rupees and are computed on our servers at the moment you place an order; the amount shown at checkout is the amount charged. Placing an order reserves stock; an order that is not paid may be cancelled.',
  },
  {
    title: 'Cancellations and refunds',
    body: 'You may cancel an order until it ships. Refunds for paid orders are issued in full to the original payment method.',
  },
  {
    title: 'Reviews',
    body: 'Reviews can be written only for products you have received. Reviews must be your own honest opinion, must not contain personal information about others, and may be removed if they break these rules.',
  },
  {
    title: 'Acceptable use',
    body: 'Do not attempt to access other customers’ data, interfere with the service, or use automated tools to place orders or probe accounts. Such activity is logged and may result in the account being disabled.',
  },
  {
    title: 'About this store',
    body: 'amazon is an original demonstration storefront. It is not affiliated with, endorsed by, or derived from any real retailer; brands and products shown are fictional.',
  },
];

export default function TermsPage() {
  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">Conditions of Use</h1>
      <p className="text-ink-muted mt-1 text-sm">Last updated 18 August 2026.</p>
      <div className="mt-5 space-y-5">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-base font-bold">{section.title}</h2>
            <p className="text-ink-muted mt-1 text-sm leading-relaxed">{section.body}</p>
          </section>
        ))}
      </div>
    </Container>
  );
}
