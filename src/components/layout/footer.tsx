import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { Container } from '@/components/layout/container';
import type { MessageKey } from '@/lib/i18n/messages';
import { getT } from '@/lib/i18n/server';

const columns: Array<{ heading: MessageKey; links: Array<{ href: string; label: MessageKey }> }> = [
  {
    heading: 'footer.getToKnow',
    links: [
      { href: '/help', label: 'footer.about' },
      { href: '/help', label: 'footer.careers' },
      { href: '/help', label: 'footer.press' },
    ],
  },
  {
    heading: 'footer.makeMoney',
    links: [
      { href: '/products?sort=newest', label: 'footer.sell' },
      { href: '/help', label: 'footer.affiliate' },
      { href: '/help', label: 'footer.advertise' },
    ],
  },
  {
    heading: 'footer.letUsHelp',
    links: [
      { href: '/account', label: 'footer.yourAccount' },
      { href: '/orders', label: 'footer.yourOrders' },
      { href: '/help', label: 'footer.shipping' },
      { href: '/help', label: 'footer.help' },
    ],
  },
  {
    heading: 'footer.policies',
    links: [
      { href: '/privacy', label: 'footer.privacy' },
      { href: '/terms', label: 'footer.terms' },
      { href: '/help', label: 'footer.returns' },
      { href: '/privacy', label: 'footer.security' },
      // Reachable credit is what the CC BY licences on the product photography
      // actually require; a file in the repo would not satisfy them.
      { href: '/image-credits', label: 'footer.imageCredits' },
    ],
  },
];

export async function Footer() {
  const { t } = await getT();

  return (
    <footer className="bg-brand-900 mt-10 text-white">
      <Container size="wide" className="py-8 sm:py-10">
        {/* 2 columns on a phone rather than 1: four stacked lists make for a
            very long scroll to reach the legal links. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {columns.map((column) => (
            <nav key={column.heading} aria-labelledby={`footer-${column.heading}`}>
              <h2 id={`footer-${column.heading}`} className="mb-2.5 text-sm font-bold">
                {t(column.heading)}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-block py-0.5 text-sm text-white/75 hover:text-white hover:underline"
                    >
                      {t(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Container>

      <div className="bg-brand-950 py-6">
        <Container size="wide" className="flex flex-col items-center gap-3 text-center">
          <Link href="/" aria-label="amazon home">
            <Logo />
          </Link>
          <p className="text-xs text-white/60">{t('footer.disclaimer')}</p>
          <p className="text-xs text-white/50">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </Container>
      </div>
    </footer>
  );
}
