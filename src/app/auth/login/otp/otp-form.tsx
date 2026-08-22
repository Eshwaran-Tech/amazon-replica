'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { otpSignInAction, sendSignInOtpAction } from '@/actions/auth';
import { OtpDigits } from '@/components/ui/otp-digits';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

import {
  AuthAlert,
  AuthButton,
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthLink,
  authLinkClass,
} from '../../ui';

interface OtpSignInFormProps {
  identifierLabel: string;
  channel: 'email' | 'phone';
  otpSent: boolean;
  hasPassword: boolean;
  csrfField: ReactNode;
  /** Development-only code panel; renders nothing in production. */
  devNotice?: ReactNode;
}

export function OtpSignInForm({
  identifierLabel,
  channel,
  otpSent,
  hasPassword,
  csrfField,
  devNotice,
}: OtpSignInFormProps) {
  const t = useT();
  const [state, formAction] = useActionState(otpSignInAction, emptyFormState);
  const [resendState, resendAction] = useActionState(sendSignInOtpAction, emptyFormState);

  const where = channel === 'phone' ? t('auth.mobileNumber') : t('auth.emailAddress');

  return (
    <AuthCard>
      {/* Fixed-position panel; takes no part in this card's layout. */}
      {devNotice}

      <AuthHeading>{otpSent ? t('auth.enterOtp') : t('auth.getOtp')}</AuthHeading>

      <p className="mb-3 text-[13px]">
        {otpSent ? t('auth.sentOtpTo', { where }) : t('auth.willSendOtpTo', { where })}{' '}
        <span className="font-semibold">{identifierLabel}</span>.{' '}
        <AuthLink href="/auth/login">{t('auth.change')}</AuthLink>
      </p>

      {state.message && !state.ok && <AuthAlert tone="error">{state.message}</AuthAlert>}
      {resendState.message && (
        <AuthAlert tone={resendState.ok ? 'success' : 'error'}>{resendState.message}</AuthAlert>
      )}

      {otpSent ? (
        <form action={formAction} className="space-y-3" noValidate>
          {csrfField}
          <OtpDigits
            label={t('auth.enterOtp')}
            {...(state.fields?.code ? { error: state.fields.code } : {})}
          />
          <AuthButton pendingLabel={t('auth.signingIn')}>Verify OTP</AuthButton>
        </form>
      ) : null}

      <form action={resendAction} className={otpSent ? 'mt-3' : ''}>
        {csrfField}
        <input type="hidden" name="stay" value="1" />
        {otpSent ? (
          <button type="submit" className={authLinkClass}>
            {t('auth.resendOtp')}
          </button>
        ) : (
          <AuthButton pendingLabel={t('auth.sendingCode')}>{t('auth.sendOtp')}</AuthButton>
        )}
      </form>

      {hasPassword && (
        <>
          <AuthDivider label={t('auth.or')} />
          <AuthLink href="/auth/login/password">{t('auth.signInWithPassword')}</AuthLink>
        </>
      )}
    </AuthCard>
  );
}
