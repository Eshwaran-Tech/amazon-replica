'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { adjustInventoryAction } from '@/actions/admin';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';

interface InventoryFormProps {
  productId: string;
  csrfField: ReactNode;
}

export function InventoryForm({ productId, csrfField }: InventoryFormProps) {
  const [state, formAction] = useActionState(adjustInventoryAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {csrfField}
      <input type="hidden" name="productId" value={productId} />

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      <TextField
        id="inv-stock"
        name="stock"
        label="New stock level"
        inputMode="numeric"
        required
        error={state.fields?.stock}
      />
      <TextField
        id="inv-reason"
        name="reason"
        label="Reason"
        required
        placeholder="e.g. Stocktake correction, damaged units"
        error={state.fields?.reason}
      />

      <SubmitButton variant="secondary" pendingLabel="Adjusting...">
        Set stock
      </SubmitButton>
    </form>
  );
}
