'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { buyMotorPolicyAction } from '@/actions/insurance';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

/**
 * The button that buys one insurer's quote.
 *
 * Everything it sends is an identifier: a vehicle, an insurer, a plan, a set of
 * add-ons. **No amount travels with it.** The premium is recomputed on the
 * server from the same rate book that produced the figure on the card, so a
 * tampered hidden field has nothing to change.
 */

interface Props {
  insurerId: string;
  modelId: string;
  registration: string;
  ageMonths: number;
  plan: string;
  idv: number;
  claimFreeYears: number;
  addOnIds: string[];
  label: string;
  csrfField: ReactNode;
}

export function BuyPlan({
  insurerId,
  modelId,
  registration,
  ageMonths,
  plan,
  idv,
  claimFreeYears,
  addOnIds,
  label,
  csrfField,
}: Props) {
  const [state, formAction] = useActionState(buyMotorPolicyAction, emptyFormState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      {csrfField}
      <input type="hidden" name="insurerId" value={insurerId} />
      <input type="hidden" name="modelId" value={modelId} />
      <input type="hidden" name="registration" value={registration} />
      <input type="hidden" name="ageMonths" value={ageMonths} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="idv" value={idv} />
      <input type="hidden" name="claimFreeYears" value={claimFreeYears} />
      {addOnIds.map((id) => (
        <input key={id} type="hidden" name="addOnIds" value={id} />
      ))}

      <SubmitButton fullWidth pendingLabel="Paying...">
        {label}
      </SubmitButton>

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}
    </form>
  );
}
