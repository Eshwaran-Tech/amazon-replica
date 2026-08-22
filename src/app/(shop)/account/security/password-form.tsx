'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { changePasswordAction } from '@/actions/auth';
import { Alert } from '@/components/ui/alert';
import { PasswordField } from '@/components/ui/password-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

interface PasswordFormProps {
  csrfField: ReactNode;
}

export function PasswordForm({ csrfField }: PasswordFormProps) {
  const [state, formAction] = useActionState(changePasswordAction, emptyFormState);

  return (
    <form action={formAction} className="max-w-sm space-y-4" noValidate>
      {csrfField}

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <PasswordField
        id="current-password"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        required
        error={state.fields?.currentPassword}
      />
      <PasswordField
        id="new-password"
        name="newPassword"
        label="New password"
        autoComplete="new-password"
        hint="At least 10 characters, with upper and lower case letters and a number."
        required
        error={state.fields?.newPassword}
      />
      <PasswordField
        id="confirm-password"
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        required
        error={state.fields?.confirmPassword}
      />

      <SubmitButton pendingLabel="Changing password...">Change password</SubmitButton>
    </form>
  );
}
