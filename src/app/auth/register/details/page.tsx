import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CsrfField } from '@/components/security/csrf-field';
import { readAuthFlow } from '@/lib/auth/flow';
import { getSession } from '@/lib/auth/guards';
import { nationalDigits } from '@/lib/auth/identifier';

import { CreateAccountForm } from './create-account-form';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** "Create Account": the details step, prefilled from the identifier step. */
export default async function CreateAccountPage({ searchParams }: PageProps) {
  if (await getSession()) redirect('/');

  const params = await searchParams;
  const flow = await readAuthFlow();
  const flowKind = flow && !flow.exists ? flow.identifier.kind : null;
  const via =
    params.via === 'email' ? 'email' : params.via === 'phone' ? 'phone' : (flowKind ?? 'phone');

  const initial =
    flow && !flow.exists && flow.identifier.kind === via
      ? via === 'phone'
        ? nationalDigits(flow.identifier)
        : flow.identifier.value
      : '';

  return (
    <CreateAccountForm
      via={via}
      initialIdentifier={initial}
      initialName={flow?.name ?? ''}
      csrfField={<CsrfField />}
    />
  );
}
