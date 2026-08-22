'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { identifyAction } from '@/actions/auth';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

import { AuthAlert, AuthButton, AuthCard, AuthDivider, AuthHeading, AuthInput, AuthLink, LegalNote } from '../ui';

interface IdentifierFormProps {
  initialIdentifier: string;
  next?: string;
  notices: string[];
  csrfField: ReactNode;
}

export function IdentifierForm({ initialIdentifier, next, notices, csrfField }: IdentifierFormProps) {
  const t = useT();
  const [state, formAction] = useActionState(identifyAction, emptyFormState);

  return (
    <AuthCard>
      <AuthHeading>{t('auth.signInOrCreate')}</AuthHeading>

      {notices.map((notice) => (
        <AuthAlert key={notice} tone="success">
          {notice}
        </AuthAlert>
      ))}
      {state.message && !state.ok && <AuthAlert tone="error">{state.message}</AuthAlert>}

      <form action={formAction} className="space-y-3" noValidate>
        {csrfField}
        {next && <input type="hidden" name="next" value={next} />}

        <AuthInput
          id="identifier"
          name="identifier"
          label={t('auth.enterMobileOrEmail')}
          autoComplete="username"
          inputMode="email"
          defaultValue={initialIdentifier}
          autoFocus
          required
          error={state.fields?.identifier}
        />

        <AuthButton pendingLabel={t('auth.checking')}>{t('auth.continue')}</AuthButton>
      </form>

      <LegalNote>
        {t('auth.byContinuing')}{' '}
        <AuthLink href="/terms" className="text-[12px]">
          {t('auth.conditions')}
        </AuthLink>{' '}
        {t('auth.and')}{' '}
        <AuthLink href="/privacy" className="text-[12px]">
          {t('auth.privacy')}
        </AuthLink>
        .
      </LegalNote>

      <AuthDivider />

      <p className="text-[13px] font-bold">{t('auth.buyingForWork')}</p>
      <AuthLink href="/auth/register/details?via=email">{t('auth.createBusiness')}</AuthLink>
    </AuthCard>
  );
}
