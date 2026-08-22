import type { Metadata } from 'next';

import { CsrfField } from '@/components/security/csrf-field';
import { tokenSchema } from '@/lib/validations/auth';

import { AuthAlert, AuthCard, AuthDivider, AuthHeading, AuthLink } from '../ui';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false, nocache: true },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = typeof params.token === 'string' ? params.token : '';

  // Shape-check before rendering. A malformed token never reaches the database,
  // and it is never echoed back into the page -- rendering an attacker-supplied
  // value into HTML is how a reflected XSS starts.
  const parsed = tokenSchema.safeParse(raw);

  if (!parsed.success) {
    return (
      <AuthCard>
        <AuthHeading>Reset link problem</AuthHeading>
        <AuthAlert tone="error">
          This password reset link is not valid. It may have been mistyped, or it may have expired.
        </AuthAlert>
        <AuthDivider />
        <AuthLink href="/auth/forgot-password">Request a new reset link</AuthLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthHeading>Choose a new password</AuthHeading>
      <p className="mb-3 text-[13px]">
        This link can be used once and expires 30 minutes after it was sent.
      </p>
      <ResetPasswordForm token={parsed.data} csrfField={<CsrfField />} />
    </AuthCard>
  );
}
