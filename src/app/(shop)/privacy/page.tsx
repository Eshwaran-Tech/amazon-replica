import type { Metadata } from 'next';

import { Container } from '@/components/layout/container';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: 'What this store collects, why, and how it is protected.',
};

const SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'What we collect',
    body: 'Your name, the mobile number and/or email address you sign in with, delivery addresses, and your orders. Payment card details are handled by the payment provider and never stored here.',
  },
  {
    title: 'Why',
    body: 'To take and deliver your orders, to send order updates and one-time passwords, to prevent fraud and abuse (for example, sign-in attempts are rate-limited and logged), and to show you your own order history and reviews.',
  },
  {
    title: 'How it is protected',
    body: 'Passwords are stored as salted bcrypt hashes; sessions and one-time codes are stored hashed; traffic is served over HTTPS in production. Security-relevant actions are recorded in an audit log that cannot be edited from the application.',
  },
  {
    title: 'What we do not do',
    body: 'We do not sell your data, do not load third-party trackers, and do not use your details for anything beyond running the store.',
  },
  {
    title: 'Your choices',
    body: 'You can update your name and addresses from your account page, and change your password from Login & security. To close your account, contact support.',
  },
];

export default function PrivacyPage() {
  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">Privacy Notice</h1>
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
