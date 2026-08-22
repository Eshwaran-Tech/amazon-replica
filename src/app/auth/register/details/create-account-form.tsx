'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { startSignUpAction } from '@/actions/auth';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

import {
  AuthAlert,
  AuthButton,
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthInput,
  AuthLink,
  LegalNote,
  authInputClass,
} from '../../ui';

interface CreateAccountFormProps {
  via: 'phone' | 'email';
  initialIdentifier: string;
  initialName: string;
  csrfField: ReactNode;
}

/**
 * The details step. Mobile sign-ups are passwordless (a code proves the
 * number, and codes are how the account signs in from then on); email
 * sign-ups choose a password here, then prove the address with a code.
 */
export function CreateAccountForm({ via, initialIdentifier, initialName, csrfField }: CreateAccountFormProps) {
  const t = useT();
  const [state, formAction] = useActionState(startSignUpAction, emptyFormState);

  return (
    <AuthCard>
      <AuthHeading>{t('auth.createAccount')}</AuthHeading>

      {state.message && !state.ok && <AuthAlert tone="error">{state.message}</AuthAlert>}

      <form action={formAction} className="space-y-3" noValidate>
        {csrfField}
        <input type="hidden" name="via" value={via} />

        {via === 'phone' ? (
          <div className="space-y-1">
            <label htmlFor="identifier" className="block text-[13px] font-bold text-white">
              {t('auth.mobileNumberLabel')}
            </label>
            <div className="flex gap-2">
              <select
                aria-label="Country code"
                defaultValue="IN"
                className="bg-brand-900 h-[31px] shrink-0 rounded-[3px] border border-white/25 px-2 text-[13px] text-white focus:border-[#e77600] focus:ring-[3px] focus:ring-[#e77600]/35 focus:outline-none"
              >
                <option value="IN">IN +91</option>
              </select>
              <input
                id="identifier"
                name="identifier"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                defaultValue={initialIdentifier}
                placeholder={t('auth.tenDigits')}
                required
                aria-invalid={state.fields?.identifier ? true : undefined}
                aria-describedby={state.fields?.identifier ? 'identifier-error' : undefined}
                className={authInputClass(Boolean(state.fields?.identifier))}
              />
            </div>
            {state.fields?.identifier && (
              <p id="identifier-error" role="alert" className="text-[12px] text-[#ff7a7a]">
                {state.fields.identifier}
              </p>
            )}
          </div>
        ) : (
          <AuthInput
            id="identifier"
            name="identifier"
            type="email"
            label={t('auth.email')}
            autoComplete="email"
            inputMode="email"
            defaultValue={initialIdentifier}
            required
            error={state.fields?.identifier}
          />
        )}

        <AuthInput
          id="name"
          name="name"
          label={t('auth.yourName')}
          autoComplete="name"
          placeholder={t('auth.firstLast')}
          defaultValue={initialName}
          required
          error={state.fields?.name}
        />

        {via === 'email' && (
          <>
            <AuthInput
              id="password"
              name="password"
              type="password"
              label={t('auth.password')}
              autoComplete="new-password"
              placeholder={t('auth.atLeast10')}
              required
              error={state.fields?.password}
            />
            <AuthInput
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              label={t('auth.reenterPassword')}
              autoComplete="new-password"
              required
              error={state.fields?.confirmPassword}
            />
          </>
        )}

        <p className="text-[12px] leading-snug text-white/80">
          {via === 'phone' ? t('auth.verifyNumberNote') : t('auth.verifyEmailNote')}
        </p>

        <AuthButton pendingLabel={t('auth.sendingCode')}>
          {via === 'phone' ? t('auth.verifyMobile') : t('auth.verifyEmail')}
        </AuthButton>
      </form>

      <p className="mt-3">
        <AuthLink href={via === 'phone' ? '/auth/register/details?via=email' : '/auth/register/details?via=phone'}>
          {via === 'phone' ? t('auth.useEmailInstead') : t('auth.useMobileInstead')}
        </AuthLink>
      </p>

      <AuthDivider />

      <p className="text-[13px] font-bold">{t('auth.alreadyCustomer')}</p>
      <AuthLink href="/auth/login">{t('auth.signInInstead')}</AuthLink>

      <LegalNote>
        {t('auth.byCreating')}{' '}
        <AuthLink href="/terms" className="text-[12px]">
          {t('auth.conditions')}
        </AuthLink>{' '}
        {t('auth.and')}{' '}
        <AuthLink href="/privacy" className="text-[12px]">
          {t('auth.privacy')}
        </AuthLink>
        .
      </LegalNote>
    </AuthCard>
  );
}
