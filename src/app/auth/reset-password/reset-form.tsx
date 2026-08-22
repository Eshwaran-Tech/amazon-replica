'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { resetPasswordAction } from '@/actions/auth';
import { emptyFormState } from '@/lib/forms/state';

import { AuthAlert, AuthButton, AuthInput } from '../ui';

interface ResetPasswordFormProps {
  token: string;
  csrfField: ReactNode;
}

export function ResetPasswordForm({ token, csrfField }: ResetPasswordFormProps) {
  const [state, formAction] = useActionState(resetPasswordAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {csrfField}
      {/* The token round-trips through a hidden field rather than staying in
          the URL of the POST, so it does not end up in a referrer header or a
          proxy access log when the form is submitted. */}
      <input type="hidden" name="token" value={token} />

      {state.message && <AuthAlert tone="error">{state.message}</AuthAlert>}

      <AuthInput
        id="password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        placeholder="At least 10 characters"
        required
        error={state.fields?.password}
      />
      <p className="-mt-2 text-[12px] text-white/60">Upper and lower case letters and a number.</p>

      <AuthInput
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Re-enter new password"
        autoComplete="new-password"
        required
        error={state.fields?.confirmPassword}
      />

      <AuthButton pendingLabel="Saving...">Save changes and sign in</AuthButton>

      <p className="text-[12px] text-white/60">
        Saving a new password signs you out on every device.
      </p>
    </form>
  );
}
