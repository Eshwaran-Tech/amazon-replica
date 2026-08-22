'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { setUserDisabledAction, setUserRoleAction } from '@/actions/admin';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import type { UserRole } from '@/models/types';

interface UserControlsProps {
  userId: string;
  role: UserRole;
  isDisabled: boolean;
  csrfField: ReactNode;
}

/**
 * Role and disable controls for one user row. Both are two-step: these are the
 * two most consequential clicks in the admin area.
 */
export function UserControls({ userId, role, isDisabled, csrfField }: UserControlsProps) {
  const [roleState, roleAction] = useActionState(setUserRoleAction, emptyFormState);
  const [disableState, disableAction] = useActionState(setUserDisabledAction, emptyFormState);
  const [confirming, setConfirming] = useState<'role' | 'disabled' | null>(null);

  const activeState = roleState.message ? roleState : disableState;

  return (
    <div className="flex flex-col items-end gap-1">
      {activeState.message && (
        <Alert tone={activeState.ok ? 'success' : 'error'}>{activeState.message}</Alert>
      )}

      <div className="flex items-center justify-end gap-3 text-sm whitespace-nowrap">
        {confirming === 'role' ? (
          <form action={roleAction} className="flex items-center gap-2">
            {csrfField}
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="role" value={role === 'ADMIN' ? 'USER' : 'ADMIN'} />
            <SubmitButton variant="danger" size="sm" pendingLabel="...">
              Confirm {role === 'ADMIN' ? 'demotion' : 'promotion'}
            </SubmitButton>
            <button type="button" onClick={() => setConfirming(null)} className="text-link hover:underline">
              Cancel
            </button>
          </form>
        ) : confirming === 'disabled' ? (
          <form action={disableAction} className="flex items-center gap-2">
            {csrfField}
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="isDisabled" value={isDisabled ? 'false' : 'true'} />
            {!isDisabled && (
              <input
                name="reason"
                placeholder="Reason (audited)"
                maxLength={200}
                className="border-hairline bg-surface min-h-9 w-40 rounded-md border px-2 text-xs"
              />
            )}
            <SubmitButton variant="danger" size="sm" pendingLabel="...">
              Confirm {isDisabled ? 'enable' : 'disable'}
            </SubmitButton>
            <button type="button" onClick={() => setConfirming(null)} className="text-link hover:underline">
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming('role')}
              className="text-link hover:underline"
            >
              {role === 'ADMIN' ? 'Demote to user' : 'Promote to admin'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming('disabled')}
              className={isDisabled ? 'text-link hover:underline' : 'text-deal hover:underline'}
            >
              {isDisabled ? 'Enable' : 'Disable'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
