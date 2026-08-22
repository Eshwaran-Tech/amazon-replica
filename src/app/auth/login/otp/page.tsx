import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CsrfField } from '@/components/security/csrf-field';
import { DevOtpNotice } from '@/components/security/dev-otp-notice';
import { readAuthFlow } from '@/lib/auth/flow';
import { getSession } from '@/lib/auth/guards';
import { displayIdentifier } from '@/lib/auth/identifier';

import { OtpSignInForm } from './otp-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

/** Step two for an existing account: enter the one-time password. */
export default async function OtpStepPage() {
  if (await getSession()) redirect('/');

  const flow = await readAuthFlow();
  if (!flow || !flow.exists) redirect('/auth/login');

  return (
    <OtpSignInForm
      identifierLabel={displayIdentifier(flow.identifier)}
      channel={flow.identifier.kind}
      otpSent={flow.otpSent === true}
      hasPassword={flow.hasPassword}
      csrfField={<CsrfField />}
      devNotice={<DevOtpNotice recipient={flow.identifier.value} />}
    />
  );
}
