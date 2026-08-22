import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { requirePageUser } from '@/lib/auth/guards';
import { formatPhone } from '@/models/user';

import { PasswordForm } from './password-form';

export const metadata: Metadata = {
  title: 'Login & security',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Login & security.
 *
 * Changing the password revokes every session, including this one -- the
 * service bumps `passwordChangedAt`, which invalidates all outstanding tokens
 * at resolution time. The form says so, because surprise sign-outs read as
 * breakage rather than protection.
 */
export default async function SecurityPage() {
  const session = await requirePageUser('/account/security');
  const { user } = session;

  return (
    <Container size="narrow" className="py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/account" className="hover:text-link hover:underline">
          Your Account
        </Link>{' '}
        / <span className="text-ink">Login &amp; security</span>
      </nav>

      <h1 className="mt-1 text-xl font-bold sm:text-2xl">Login &amp; Security</h1>

      <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 text-sm sm:p-5">
        <h2 className="text-base font-bold">Sign-in details</h2>
        {user.email && (
          <p className="text-ink-muted mt-1">
            Email: {user.email}{' '}
            {user.emailVerified ? (
              <span className="text-instock font-semibold">(verified)</span>
            ) : (
              <>
                <span className="text-deal font-semibold">(not verified)</span>
                {' -- '}
                <Link href="/auth/verify-email" className="text-link hover:underline">
                  verify now
                </Link>
              </>
            )}
          </p>
        )}
        {user.phone && (
          <p className="text-ink-muted mt-1">
            Mobile: {formatPhone(user.phone)}{' '}
            {user.phoneVerified ? (
              <span className="text-instock font-semibold">(verified)</span>
            ) : (
              <span className="text-deal font-semibold">(not verified)</span>
            )}
          </p>
        )}
        <p className="text-ink-subtle mt-2 text-xs">
          You can sign in with a one-time password (OTP) sent to any verified contact
          {user.hasPassword ? ', or with your password.' : '.'}
        </p>
      </div>

      {user.hasPassword ? (
        <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 sm:p-5">
          <h2 className="text-base font-bold">Change password</h2>
          <p className="text-ink-muted mt-1 text-sm">
            After the change, every device -- including this one -- is signed out, and you sign back
            in with the new password.
          </p>
          <div className="mt-4">
            <PasswordForm csrfField={<CsrfField />} />
          </div>
        </div>
      ) : (
        <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 text-sm sm:p-5">
          <h2 className="text-base font-bold">Password</h2>
          <p className="text-ink-muted mt-1">
            This account has no password: you sign in with a one-time password (OTP) sent to your
            mobile number each time.
          </p>
        </div>
      )}
    </Container>
  );
}
