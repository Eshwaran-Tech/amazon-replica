import type { Metadata } from 'next';

import { CsrfField } from '@/components/security/csrf-field';

import { AuthCard, AuthDivider, AuthHeading, AuthLink } from '../ui';
import { ForgotPasswordForm } from './forgot-form';
import { BRAND_NAME } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <AuthHeading>Password assistance</AuthHeading>
      <p className="mb-3 text-[13px]">
        Enter the email address associated with your {BRAND_NAME} account. If an account exists, we
        will send a link to reset your password.
      </p>

      <ForgotPasswordForm csrfField={<CsrfField />} />

      <AuthDivider />
      <AuthLink href="/auth/login">Back to sign in</AuthLink>
    </AuthCard>
  );
}
