'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { placeOrderAction } from '@/actions/checkout';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import type { Address, PaymentMethod } from '@/models/types';

interface CheckoutFormProps {
  addresses: Address[];
  csrfField: ReactNode;
  /** Spendable Amazon Pay balance, for the wallet option. */
  walletBalance: number;
  /** The summary's total, used only to grey out a wallet that cannot cover it. */
  orderTotal: number;
}

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; hint: string }> = [
  { value: 'CARD', label: 'Credit / debit card', hint: 'Pay now with the test gateway' },
  { value: 'UPI', label: 'UPI', hint: 'Simulated UPI flow' },
  { value: 'NETBANKING', label: 'Net banking', hint: 'Simulated bank redirect' },
  { value: 'COD', label: 'Cash on delivery', hint: 'Pay when your order arrives' },
];

/**
 * Address + payment-method selection.
 *
 * The idempotency key is generated once per mount: a double-clicked "Place
 * order", or a retry after a network hiccup, re-submits the same key and the
 * server returns the original order instead of creating a second one.
 */
export function CheckoutForm({
  addresses,
  csrfField,
  walletBalance,
  orderTotal,
}: CheckoutFormProps) {
  const walletCovers = walletBalance >= orderTotal;
  const [state, formAction] = useActionState(placeOrderAction, emptyFormState);
  const [choice, setChoice] = useState(
    addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id ?? 'new',
  );
  const [idempotencyKey] = useState(() => crypto.randomUUID().replace(/-/g, ''));

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {csrfField}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      {/* ------------------------------------------------------- address */}
      <fieldset className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
        <legend className="px-1 text-base font-bold">Delivery address</legend>

        <div className="space-y-2">
          {addresses.map((address) => (
            <label
              key={address.id}
              className="border-hairline has-checked:border-accent-500 hover:bg-surface-sunken flex cursor-pointer items-start gap-3 rounded-xl border p-3"
            >
              <input
                type="radio"
                name="addressChoice"
                value={address.id}
                checked={choice === address.id}
                onChange={() => setChoice(address.id)}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-semibold">{address.fullName}</span>{' '}
                <span className="text-ink-subtle">({address.type.toLowerCase()})</span>
                <br />
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state}{' '}
                {address.postalCode}
                <br />
                <span className="text-ink-muted">Phone: {address.phone}</span>
              </span>
            </label>
          ))}

          <label className="border-hairline has-checked:border-accent-500 hover:bg-surface-sunken flex cursor-pointer items-center gap-3 rounded-xl border p-3">
            <input
              type="radio"
              name="addressChoice"
              value="new"
              checked={choice === 'new'}
              onChange={() => setChoice('new')}
            />
            <span className="text-sm font-semibold">
              {addresses.length > 0 ? 'Deliver somewhere else' : 'Add a delivery address'}
            </span>
          </label>
        </div>

        {choice === 'new' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextField
              id="new_fullName"
              name="new_fullName"
              label="Full name"
              autoComplete="name"
              required
              error={state.fields?.['newAddress.fullName']}
            />
            <TextField
              id="new_phone"
              name="new_phone"
              label="Mobile number"
              autoComplete="tel"
              inputMode="tel"
              required
              error={state.fields?.['newAddress.phone']}
            />
            <div className="sm:col-span-2">
              <TextField
                id="new_line1"
                name="new_line1"
                label="Address line 1"
                autoComplete="address-line1"
                required
                error={state.fields?.['newAddress.line1']}
              />
            </div>
            <div className="sm:col-span-2">
              <TextField
                id="new_line2"
                name="new_line2"
                label="Address line 2 (optional)"
                autoComplete="address-line2"
                error={state.fields?.['newAddress.line2']}
              />
            </div>
            <TextField
              id="new_city"
              name="new_city"
              label="City"
              autoComplete="address-level2"
              required
              error={state.fields?.['newAddress.city']}
            />
            <TextField
              id="new_state"
              name="new_state"
              label="State"
              autoComplete="address-level1"
              required
              error={state.fields?.['newAddress.state']}
            />
            <TextField
              id="new_postalCode"
              name="new_postalCode"
              label="PIN code"
              autoComplete="postal-code"
              inputMode="numeric"
              required
              error={state.fields?.['newAddress.postalCode']}
            />
          </div>
        )}
      </fieldset>

      {/* -------------------------------------------------------- payment */}
      <fieldset className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
        <legend className="px-1 text-base font-bold">Payment method</legend>
        <div className="space-y-2">
          {/* The balance goes first: it is the one method that needs no
              details typed, and it is preselected when it can pay. */}
          <label
            className={
              walletCovers
                ? 'border-hairline has-checked:border-accent-500 hover:bg-surface-sunken flex cursor-pointer items-start gap-3 rounded-xl border p-3'
                : 'border-hairline flex items-start gap-3 rounded-xl border p-3 opacity-60'
            }
          >
            <input
              type="radio"
              name="paymentMethod"
              value="WALLET"
              defaultChecked={walletCovers}
              disabled={!walletCovers}
              className="mt-1"
            />
            <span className="text-sm">
              <span className="font-semibold">Amazon Pay balance</span>
              <br />
              <span className="text-ink-muted text-xs">
                {walletCovers ? (
                  <>Paid instantly from your {formatPaise(walletBalance)} balance</>
                ) : (
                  <>
                    Balance {formatPaise(walletBalance)} — {formatPaise(orderTotal - walletBalance)}{' '}
                    short.{' '}
                    <Link href="/pay/balance" className="text-link hover:underline">
                      Add money
                    </Link>
                  </>
                )}
              </span>
            </span>
          </label>

          {PAYMENT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="border-hairline has-checked:border-accent-500 hover:bg-surface-sunken flex cursor-pointer items-start gap-3 rounded-xl border p-3"
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option.value}
                defaultChecked={!walletCovers && option.value === 'CARD'}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-semibold">{option.label}</span>
                <br />
                <span className="text-ink-muted text-xs">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {state.fields?.paymentMethod && (
          <p role="alert" className="text-deal mt-2 text-sm">
            {state.fields.paymentMethod}
          </p>
        )}
      </fieldset>

      <SubmitButton fullWidth size="lg" pendingLabel="Placing your order...">
        Place order
      </SubmitButton>

      <p className="text-ink-subtle text-center text-xs">
        Prices, stock and totals are re-verified on our servers when you place the order.
      </p>
    </form>
  );
}
