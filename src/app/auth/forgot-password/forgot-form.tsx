'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { forgotPasswordAction } from '@/actions/auth';
import { emptyFormState } from '@/lib/forms/state';

import { AuthAlert, AuthButton, AuthInput } from '../ui';

export function ForgotPasswordForm({ csrfField }: { csrfField: ReactNode }) {
  const [state, formAction] = useActionState(forgotPasswordAction, emptyFormState);

  // On success the form is replaced by the confirmation. The message is
  // identical whether or not the address is registered -- the UI must not
  // reintroduce the enumeration oracle the service is careful to avoid.
  if (state.ok && state.message) {
    return <AuthAlert tone="success">{state.message}</AuthAlert>;
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {csrfField}

      {state.message && !state.ok && <AuthAlert tone="error">{state.message}</AuthAlert>}

      <AuthInput
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        error={state.fields?.email}
      />

      <AuthButton pendingLabel="Sending...">Continue</AuthButton>
    </form>
  );
}
