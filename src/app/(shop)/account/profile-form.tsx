'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { updateProfileAction } from '@/actions/account';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

interface ProfileFormProps {
  currentName: string;
  csrfField: ReactNode;
}

export function ProfileForm({ currentName, csrfField }: ProfileFormProps) {
  const t = useT();
  const [state, formAction] = useActionState(updateProfileAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {csrfField}

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <TextField
        id="profile-name"
        name="name"
        label={t('acct.displayName')}
        autoComplete="name"
        defaultValue={currentName}
        required
        error={state.fields?.name}
      />

      <SubmitButton pendingLabel={t('acct.saving')}>{t('acct.save')}</SubmitButton>
    </form>
  );
}
