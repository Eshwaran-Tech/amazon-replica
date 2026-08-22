'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { completeSignUpAction, resendSignUpOtpAction } from '@/actions/auth';
import { OtpDigits } from '@/components/ui/otp-digits';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

import { AuthAlert, AuthButton, AuthCard, AuthHeading, AuthLink, LegalNote, authLinkClass } from '../../ui';

interface VerifySignUpFormProps {
  identifierLabel: string;
  channel: 'email' | 'phone';
  csrfField: ReactNode;
  /** Development-only code panel; renders nothing in production. */
  devNotice?: ReactNode;
}

export function VerifySignUpForm({
  identifierLabel,
  channel,
  csrfField,
  devNotice,
}: VerifySignUpFormProps) {
  const t = useT();
  const [state, formAction] = useActionState(completeSignUpAction, emptyFormState);
  const [resendState, resendAction] = useActionState(resendSignUpOtpAction, emptyFormState);

  const where = channel === 'phone' ? t('auth.mobileNumber') : t('auth.emailAddress');

  return (
    <AuthCard>
      {/* Fixed-position panel; takes no part in this card's layout. */}
      {devNotice}

      <AuthHeading>{t('auth.verifyHeading', { where })}</AuthHeading>

      <p className="mb-3 text-[13px]">
        {t('auth.sentOtpToVerify', { where })} <span className="font-semibold">{identifierLabel}</span>{' '}
        <AuthLink href={`/auth/register/details?via=${channel}`}>{t('auth.change')}</AuthLink>
      </p>

      {state.message && !state.ok && <AuthAlert tone="error">{state.message}</AuthAlert>}
      {resendState.message && (
        <AuthAlert tone={resendState.ok ? 'success' : 'error'}>{resendState.message}</AuthAlert>
      )}

      <form action={formAction} className="space-y-3" noValidate>
        {csrfField}
        <OtpDigits
          label={t('auth.enterOtp')}
          {...(state.fields?.code ? { error: state.fields.code } : {})}
        />
        <AuthButton pendingLabel={t('auth.creating')}>Verify OTP</AuthButton>
      </form>

      <LegalNote>
        {t('auth.byCreatingShort')}{' '}
        <AuthLink href="/terms" className="text-[12px]">
          {t('auth.conditions')}
        </AuthLink>{' '}
        {t('auth.and')}{' '}
        <AuthLink href="/privacy" className="text-[12px]">
          {t('auth.privacy')}
        </AuthLink>
        .
      </LegalNote>

      <form action={resendAction} className="mt-3">
        {csrfField}
        <button type="submit" className={authLinkClass}>
          {t('auth.resendOtp')}
        </button>
      </form>
    </AuthCard>
  );
}
