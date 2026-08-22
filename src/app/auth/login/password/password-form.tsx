'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { passwordSignInAction, sendSignInOtpAction } from '@/actions/auth';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

import { AuthAlert, AuthButton, AuthCard, AuthDivider, AuthHeading, AuthInput, AuthLink } from '../../ui';

interface PasswordStepFormProps {
  identifierLabel: string;
  channel: 'email' | 'phone';
  csrfField: ReactNode;
}

export function PasswordStepForm({ identifierLabel, channel, csrfField }: PasswordStepFormProps) {
  const t = useT();
  const [state, formAction] = useActionState(passwordSignInAction, emptyFormState);
  const [otpState, otpAction] = useActionState(sendSignInOtpAction, emptyFormState);

  return (
    <AuthCard>
      <AuthHeading>{t('auth.signIn')}</AuthHeading>

      <p className="mb-3 text-[13px]">
        <span className="font-semibold">{identifierLabel}</span>{' '}
        <AuthLink href="/auth/login">{t('auth.change')}</AuthLink>
      </p>

      {state.message && !state.ok && <AuthAlert tone="error">{state.message}</AuthAlert>}
      {otpState.message && !otpState.ok && <AuthAlert tone="error">{otpState.message}</AuthAlert>}

      <form action={formAction} className="space-y-3" noValidate>
        {csrfField}
        <AuthInput
          id="password"
          name="password"
          type="password"
          label={t('auth.password')}
          labelAside={<AuthLink href="/auth/forgot-password">{t('auth.forgotPassword')}</AuthLink>}
          autoComplete="current-password"
          autoFocus
          required
        />
        <AuthButton pendingLabel={t('auth.signingIn')}>{t('auth.signIn')}</AuthButton>
      </form>

      <AuthDivider label={t('auth.or')} />

      <form action={otpAction}>
        {csrfField}
        <AuthButton variant="secondary" pendingLabel={t('auth.sendingCode')}>
          {t('auth.getOtpOn', { where: channel === 'phone' ? t('auth.phone') : t('auth.emailWord') })}
        </AuthButton>
      </form>
    </AuthCard>
  );
}
