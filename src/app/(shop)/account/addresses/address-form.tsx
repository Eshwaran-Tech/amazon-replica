'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { addAddressAction, updateAddressAction } from '@/actions/account';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';
import { ADDRESS_TYPES, type Address } from '@/models/types';

interface AddressFormProps {
  /** Existing address when editing; null when adding. */
  address: Address | null;
  csrfField: ReactNode;
}

/**
 * One form for both add and edit; which Server Action it posts to is decided
 * here by whether an existing address was passed in. Remounted via `key` when
 * the edit target changes, so `defaultValue`s reset.
 */
export function AddressForm({ address, csrfField }: AddressFormProps) {
  const [state, formAction] = useActionState(
    address ? updateAddressAction : addAddressAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrfField}
      {address && <input type="hidden" name="addressId" value={address.id} />}

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="addr-fullName"
          name="fullName"
          label="Full name"
          autoComplete="name"
          required
          defaultValue={address?.fullName}
          error={state.fields?.fullName}
        />
        <TextField
          id="addr-phone"
          name="phone"
          label="Mobile number"
          autoComplete="tel"
          inputMode="tel"
          required
          defaultValue={address?.phone}
          error={state.fields?.phone}
        />
        <div className="sm:col-span-2">
          <TextField
            id="addr-line1"
            name="line1"
            label="Address line 1"
            autoComplete="address-line1"
            required
            defaultValue={address?.line1}
            error={state.fields?.line1}
          />
        </div>
        <div className="sm:col-span-2">
          <TextField
            id="addr-line2"
            name="line2"
            label="Address line 2 (optional)"
            autoComplete="address-line2"
            defaultValue={address?.line2}
            error={state.fields?.line2}
          />
        </div>
        <TextField
          id="addr-city"
          name="city"
          label="City"
          autoComplete="address-level2"
          required
          defaultValue={address?.city}
          error={state.fields?.city}
        />
        <TextField
          id="addr-state"
          name="state"
          label="State"
          autoComplete="address-level1"
          required
          defaultValue={address?.state}
          error={state.fields?.state}
        />
        <TextField
          id="addr-postalCode"
          name="postalCode"
          label="PIN code"
          autoComplete="postal-code"
          inputMode="numeric"
          required
          defaultValue={address?.postalCode}
          error={state.fields?.postalCode}
        />

        <div className="space-y-1.5">
          <label htmlFor="addr-type" className="block text-sm font-semibold">
            Address type
          </label>
          <select
            id="addr-type"
            name="type"
            defaultValue={address?.type ?? 'HOME'}
            className="border-hairline bg-surface focus:border-link min-h-11 w-full rounded-md border px-3 py-2.5 text-base"
          >
            {ADDRESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.charAt(0) + type.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          disabled={address?.isDefault ?? false}
          className="h-4 w-4"
        />
        Make this my default address
        {address?.isDefault && (
          <span className="text-ink-subtle text-xs">(already your default)</span>
        )}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving...">
          {address ? 'Save changes' : 'Add address'}
        </SubmitButton>
        <Link href="/account/addresses" className="text-link min-h-10 content-center px-2 text-sm font-semibold hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
