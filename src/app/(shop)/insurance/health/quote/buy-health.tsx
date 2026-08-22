'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { buyHealthPolicyAction } from '@/actions/insurance';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';

/**
 * The button that buys one insurer's health quote.
 *
 * It carries a sum insured, a set of ages and a term — **never a premium**. The
 * figure is recomputed on the server from the same age bands that produced the
 * one on the card.
 */

interface Props {
  insurerId: string;
  sumInsuredLakhs: number;
  termYears: number;
  adultAges: number[];
  childAges: number[];
  label: string;
  csrfField: ReactNode;
}

export function BuyHealth({
  insurerId,
  sumInsuredLakhs,
  termYears,
  adultAges,
  childAges,
  label,
  csrfField,
}: Props) {
  const [state, formAction] = useActionState(buyHealthPolicyAction, emptyFormState);

  return (
    <form action={formAction} className="mt-3 space-y-2">
      {csrfField}
      <input type="hidden" name="insurerId" value={insurerId} />
      <input type="hidden" name="sumInsuredLakhs" value={sumInsuredLakhs} />
      <input type="hidden" name="termYears" value={termYears} />
      {adultAges.map((age, index) => (
        <input key={`adult-${index}`} type="hidden" name="adultAge" value={age} />
      ))}
      {childAges.map((age, index) => (
        <input key={`child-${index}`} type="hidden" name="childAge" value={age} />
      ))}

      <SubmitButton fullWidth pendingLabel="Paying...">
        {label}
      </SubmitButton>

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}
    </form>
  );
}
