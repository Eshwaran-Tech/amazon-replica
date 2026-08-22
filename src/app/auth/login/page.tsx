import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CsrfField } from '@/components/security/csrf-field';
import { readAuthFlow } from '@/lib/auth/flow';
import { getSession } from '@/lib/auth/guards';
import { displayIdentifier } from '@/lib/auth/identifier';
import { safeRedirectPath } from '@/lib/security/redirect';

import { IdentifierForm } from './identifier-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your amazon account.',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Step one: "Sign in or create account". */
export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawNext = typeof params.next === 'string' ? params.next : undefined;
  const next = safeRedirectPath(rawNext, '/');

  const session = await getSession();
  if (session) redirect(next);

  // Coming back via "Change": prefill what they typed before.
  const flow = await readAuthFlow();
  const initial = flow ? displayIdentifier(flow.identifier).replace(/^\+91\s/, '') : '';

  const notices: string[] = [];
  if (params.reset === '1') notices.push('Your password has been reset. Sign in with your new password.');
  if (params.passwordChanged === '1') {
    notices.push('Your password was changed and all devices were signed out. Sign in again to continue.');
  }

  return (
    <IdentifierForm
      initialIdentifier={initial}
      next={next === '/' ? undefined : next}
      notices={notices}
      csrfField={<CsrfField />}
    />
  );
}
