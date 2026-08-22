import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { readAuthFlow } from '@/lib/auth/flow';
import { getSession } from '@/lib/auth/guards';
import { displayIdentifier } from '@/lib/auth/identifier';
import { getT } from '@/lib/i18n/server';

import { AuthCard, AuthDivider, AuthHeading, AuthLink } from '../ui';

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
};

/**
 * "It looks like you are new to <brand>" -- shown after the identifier step
 * finds no account. Without a flow (e.g. a direct visit from "Start here"),
 * it goes straight to the details form.
 */
export default async function NewToAmazonPage() {
  if (await getSession()) redirect('/');

  const flow = await readAuthFlow();
  if (!flow || flow.exists) redirect('/auth/register/details');

  const { t } = await getT();
  const isPhone = flow.identifier.kind === 'phone';
  const label = displayIdentifier(flow.identifier);

  return (
    <AuthCard>
      <AuthHeading>{t('auth.newToAmazon')}</AuthHeading>

      <p className="mb-3 text-[13px]">
        {isPhone && <span className="mr-1 font-semibold">IN</span>}
        <span className="font-semibold">{label}</span>{' '}
        <AuthLink href="/auth/login" className="ml-1">
          {t('auth.change')}
        </AuthLink>
      </p>

      <p className="mb-3 text-[13px]">
        {t('auth.createUsing', {
          where: isPhone ? t('auth.mobileNumber') : t('auth.emailAddress'),
        })}
      </p>

      <Link
        href={`/auth/register/details?via=${flow.identifier.kind}`}
        className="flex h-[31px] w-full items-center justify-center rounded-full border border-[#FCD200] bg-[#FFD814] text-[13px] text-neutral-900 shadow-[0_2px_5px_rgba(15,17,17,.15)] hover:bg-[#F7CA00]"
      >
        {t('auth.proceedCreate')}
      </Link>

      <AuthDivider />

      <p className="text-[13px] font-bold">{t('auth.alreadyCustomer')}</p>
      <AuthLink href="/auth/login">{t('auth.signInAnother')}</AuthLink>
    </AuthCard>
  );
}
