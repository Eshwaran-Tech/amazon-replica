import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CsrfField } from '@/components/security/csrf-field';
import { readAuthFlow } from '@/lib/auth/flow';
import { getSession } from '@/lib/auth/guards';
import { displayIdentifier } from '@/lib/auth/identifier';

import { PasswordStepForm } from './password-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/** Step two for an existing account that has a password. */
export default async function PasswordStepPage() {
  if (await getSession()) redirect('/');

  const flow = await readAuthFlow();
  if (!flow || !flow.exists) redirect('/auth/login');
  if (!flow.hasPassword) redirect('/auth/login/otp');

  return (
    <PasswordStepForm
      identifierLabel={displayIdentifier(flow.identifier)}
      channel={flow.identifier.kind}
      csrfField={<CsrfField />}
    />
  );
}
