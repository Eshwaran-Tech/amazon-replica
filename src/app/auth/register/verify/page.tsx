import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CsrfField } from '@/components/security/csrf-field';
import { DevOtpNotice } from '@/components/security/dev-otp-notice';
import { readAuthFlow } from '@/lib/auth/flow';
import { getSession } from '@/lib/auth/guards';
import { displayIdentifier } from '@/lib/auth/identifier';

import { VerifySignUpForm } from './verify-form';

export const metadata: Metadata = {
  title: 'Verify and create account',
  robots: { index: false, follow: false },
};

/** Sign-up, final step: the code that proves the number or address. */
export default async function VerifySignUpPage() {
  if (await getSession()) redirect('/');

  const flow = await readAuthFlow();
  if (!flow || flow.exists || !flow.otpSent) redirect('/auth/register/details');

  return (
    <VerifySignUpForm
      identifierLabel={displayIdentifier(flow.identifier)}
      channel={flow.identifier.kind}
      csrfField={<CsrfField />}
      devNotice={<DevOtpNotice code={flow.demoOtp} />}
    />
  );
}
