import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { BRAND_NAME, SUPPORT_EMAIL } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Help & customer service',
  description: `How ordering, payment, delivery, returns and your account work on ${BRAND_NAME}.`,
};

const TOPICS: Array<{ title: string; body: string; href?: string; linkLabel?: string }> = [
  {
    title: 'Your orders',
    body: 'Track every order, pay for one that is still awaiting payment, or cancel one that has not shipped yet.',
    href: '/orders',
    linkLabel: 'Go to Your Orders',
  },
  {
    title: 'Returns and refunds',
    body: 'Orders can be cancelled until they are shipped. A paid order that is cancelled is refunded in full to the original payment method; refunds typically reach you within 5-7 business days. An order paid from your Eshwaran Pay balance is refunded to that balance immediately.',
    href: '/orders',
    linkLabel: 'Cancel an order',
  },
  {
    title: 'Payments',
    body: 'Your Eshwaran Pay balance, cards, UPI, net banking and cash on delivery are accepted. Paying from your balance settles the order as it is placed. Online payments are confirmed by the payment provider before an order is confirmed -- never by the browser.',
  },
  {
    title: 'Delivery',
    body: 'Delivery is free on orders over ₹499. Prices shown include GST where applicable.',
  },
  {
    title: 'Sign-in and security',
    body: 'Sign in with your mobile number or email address, using a one-time password or your password. Changing your password signs out every other device.',
    href: '/account/security',
    linkLabel: 'Login & security',
  },
  {
    title: 'Product safety and recalls',
    body: 'If a product you bought is recalled, we contact the email or mobile number on your account. Keep them up to date on your account page.',
    href: '/account',
    linkLabel: 'Your account',
  },
];

export default function HelpPage() {
  return (
    <Container size="default" className="py-6 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">Help &amp; Customer Service</h1>
      <p className="text-ink-muted mt-1 text-sm">
        The essentials of how this store works. For anything else, write to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-link hover:underline">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <section
            key={topic.title}
            className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5"
          >
            <h2 className="text-base font-bold">{topic.title}</h2>
            <p className="text-ink-muted mt-1 text-sm">{topic.body}</p>
            {topic.href && (
              <Link
                href={topic.href}
                className="text-link mt-2 inline-block text-sm hover:underline"
              >
                {topic.linkLabel}
              </Link>
            )}
          </section>
        ))}
      </div>
    </Container>
  );
}
