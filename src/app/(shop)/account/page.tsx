import { MapPin, Package, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { requirePageUser } from '@/lib/auth/guards';
import type { MessageKey } from '@/lib/i18n/messages';
import { getT } from '@/lib/i18n/server';
import { primaryContact } from '@/models/user';

import { ProfileForm } from './profile-form';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false, nocache: true },
};

const TILES: Array<{ href: string; icon: typeof Package; title: MessageKey; text: MessageKey }> = [
  { href: '/orders', icon: Package, title: 'acct.orders', text: 'acct.ordersText' },
  { href: '/account/addresses', icon: MapPin, title: 'acct.addresses', text: 'acct.addressesText' },
  {
    href: '/account/security',
    icon: ShieldCheck,
    title: 'acct.security',
    text: 'acct.securityText',
  },
];

/**
 * Account overview: identity read straight from the session (which is itself
 * re-resolved from the database on every request), never from anything cached
 * client-side.
 */
export default async function AccountPage() {
  const [session, { t }] = await Promise.all([requirePageUser('/account'), getT()]);
  const { user } = session;

  return (
    <Container size="default" className="py-6 sm:py-8">
      <h1 className="text-xl font-bold sm:text-2xl">{t('acct.title')}</h1>
      <p className="text-ink-muted mt-0.5 text-sm">
        {user.name} -- {primaryContact(user)}
      </p>

      {!user.verified && (
        <div className="mt-3">
          <Alert tone="info">
            {t('acct.notVerified')}{' '}
            <Link href="/auth/verify-email" className="text-link font-semibold hover:underline">
              {t('acct.verifyNow')}
            </Link>
            .
          </Alert>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="border-hairline bg-surface hover:bg-surface-muted flex gap-3 rounded-2xl border p-4"
          >
            <tile.icon className="text-accent-400 h-8 w-8 shrink-0" aria-hidden="true" />
            <span>
              <span className="block text-sm font-bold">{t(tile.title)}</span>
              <span className="text-ink-muted mt-0.5 block text-xs">{t(tile.text)}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="border-hairline bg-surface mt-6 max-w-md rounded-2xl border p-4 sm:p-5">
        <h2 className="text-base font-bold">{t('acct.profile')}</h2>
        <p className="text-ink-muted mt-1 text-xs">{t('acct.profileNote')}</p>
        <div className="mt-3">
          <ProfileForm currentName={user.name} csrfField={<CsrfField />} />
        </div>
      </div>
    </Container>
  );
}
