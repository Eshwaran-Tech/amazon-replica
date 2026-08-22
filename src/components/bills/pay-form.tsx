'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { payBillAction, rechargeDthAction, renewPolicyAction } from '@/actions/bills';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

/**
 * The button that pays.
 *
 * Everything it carries is an **identifier or a named choice** -- a category, a
 * biller, an account, an option like `MINIMUM` or `FULL_YEAR`. The only numeric
 * field is a part payment somebody typed on purpose, and even that is bounded
 * on the server against what is actually owed. The price itself is recomputed
 * by `quoteBill`, so a tampered hidden field has nothing to change.
 */

type Which = 'BILL' | 'DTH' | 'RENEW';

interface Props {
  which?: Which;
  /** Hidden fields, name to value. */
  fields: Record<string, string>;
  /** Fields sent more than once, like a list of chosen channels. */
  repeated?: Record<string, string[]>;
  label: string;
  /** Rendered above the button: a "save this biller" box, a note, a warning. */
  children?: ReactNode;
  variant?: 'primary' | 'secondary';
  /** Shows a "save for next time" field with this default name. */
  saveAs?: string | null;
}

export function PayForm({
  which = 'BILL',
  fields,
  repeated,
  label,
  children,
  variant = 'primary',
  saveAs = null,
}: Props) {
  const action =
    which === 'DTH' ? rechargeDthAction : which === 'RENEW' ? renewPolicyAction : payBillAction;

  const [state, formAction] = useActionState(action, emptyFormState);
  const [save, setSave] = useState(false);
  const [nickname, setNickname] = useState(saveAs ?? '');

  return (
    <form action={formAction} className="space-y-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {repeated &&
        Object.entries(repeated).flatMap(([name, values]) =>
          values.map((value) => (
            <input key={`${name}:${value}`} type="hidden" name={name} value={value} />
          )),
        )}
      {save && nickname.trim() !== '' && <input type="hidden" name="saveAs" value={nickname} />}

      {children}

      {saveAs !== null && (
        <div className="border-hairline bg-surface-sunken rounded-xl border p-3">
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={save}
              onChange={(event) => setSave(event.target.checked)}
              className="accent-accent-500 h-4 w-4"
            />
            Save this biller for next time
          </label>
          {save && (
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={40}
              placeholder="Call it something you will recognise"
              className="border-hairline bg-surface focus:border-accent-500 mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          )}
        </div>
      )}

      <SubmitButton fullWidth variant={variant} pendingLabel="Paying...">
        {label}
      </SubmitButton>

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}
    </form>
  );
}
