'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { resendVerificationAction } from '@/actions/auth';
import { emptyFormState } from '@/lib/forms/state';

import { AuthAlert, AuthButton } from '../ui';

/**
 * "Send me a new link". Rate-limited server-side, and the reply is the same
 * whether or not a mail actually went out -- so it cannot be used to learn
 * anything about the address.
 */
export function ResendVerificationForm({ csrfField }: { csrfField: ReactNode }) {
  const [state, formAction] = useActionState(resendVerificationAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-3">
      {csrfField}
      {state.message && <AuthAlert tone={state.ok ? 'success' : 'error'}>{state.message}</AuthAlert>}
      <AuthButton variant="secondary" pendingLabel="Sending...">
        Resend verification email
      </AuthButton>
    </form>
  );
}
