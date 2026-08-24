'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { setAutoReloadAction, topUpCreditAction } from '@/actions/content';
import { bonusFor } from '@/data/content-stores';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { cn } from '@/lib/utils/cn';

/**
 * Buying credit, and setting it to buy itself.
 *
 * The bonus shown beside each amount is the same function the server applies,
 * imported from the data module rather than restated here -- a bonus ladder
 * written out twice is a bonus ladder that will disagree with itself.
 */

interface Denomination {
  rupees: number;
  bonusRupees: number;
}

interface Props {
  store: string;
  storeName: string;
  denominations: readonly Denomination[];
  limits: { min: number; max: number };
  reload: {
    enabled: boolean;
    thresholdRupees: number;
    amountRupees: number;
    reloadsThisMonth: number;
    maxPerMonth: number;
  } | null;
  thresholds: readonly number[];
  amounts: readonly number[];
  csrfField: ReactNode;
}

export function CreditForms({
  store,
  storeName,
  denominations,
  limits,
  reload,
  thresholds,
  amounts,
  csrfField,
}: Props) {
  const [topUpState, topUpAction] = useActionState(topUpCreditAction, emptyFormState);
  const [reloadState, reloadAction] = useActionState(setAutoReloadAction, emptyFormState);

  const [amount, setAmount] = useState(String(denominations[3]?.rupees ?? limits.min));
  const [enabled, setEnabled] = useState(reload?.enabled ?? false);

  const rupees = Number.parseInt(amount, 10) || 0;
  const bonus = bonusFor(rupees);

  return (
    <div className="min-w-0 space-y-4">
      {/* ------------------------------------------------------ top up */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
          Add {storeName.toLowerCase()}
        </h2>

        <form action={topUpAction} className="space-y-3 px-4 py-4">
          {csrfField}
          <input type="hidden" name="store" value={store} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {denominations.map((entry) => {
              const on = String(entry.rupees) === amount;
              return (
                <button
                  key={entry.rupees}
                  type="button"
                  onClick={() => setAmount(String(entry.rupees))}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition-colors',
                    on
                      ? 'border-accent-500 bg-accent-500/15'
                      : 'border-hairline hover:border-accent-500/60',
                  )}
                >
                  <span className={cn('block text-sm font-bold', on && 'text-accent-400')}>
                    ₹{entry.rupees.toLocaleString('en-IN')}
                  </span>
                  <span
                    className={cn(
                      'block text-[0.65rem]',
                      entry.bonusRupees > 0 ? 'text-instock font-bold' : 'text-ink-subtle',
                    )}
                  >
                    {entry.bonusRupees > 0
                      ? `+₹${entry.bonusRupees} free · ${Math.round((entry.bonusRupees / entry.rupees) * 100)}%`
                      : 'no bonus'}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <label htmlFor="credit-amount" className="mb-1 block text-xs font-bold">
              Or another amount
            </label>
            <input
              id="credit-amount"
              name="amount"
              inputMode="numeric"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
              className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
            <p className="text-ink-subtle mt-1 text-xs">
              Between ₹{limits.min} and ₹{limits.max.toLocaleString('en-IN')}. A custom amount earns
              the bonus rate of the largest step it clears, so ₹999 is not treated as ₹500.
            </p>
          </div>

          {bonus > 0 && (
            <div className="border-instock/40 bg-instock/10 rounded-xl border p-3 text-xs">
              <p className="text-instock font-bold">
                ₹{rupees.toLocaleString('en-IN')} charged, ₹
                {(rupees + bonus).toLocaleString('en-IN')} credited
              </p>
              <p className="text-ink-muted mt-1">
                A ₹{bonus.toLocaleString('en-IN')} bonus, worked out on the server from the amount —
                not carried by this form.
              </p>
            </div>
          )}

          <SubmitButton fullWidth pendingLabel="Adding...">
            {rupees > 0
              ? `Pay ₹${rupees.toLocaleString('en-IN')} from Eshwaran Pay`
              : 'Enter an amount'}
          </SubmitButton>

          {topUpState.message && (
            <Alert tone={topUpState.ok ? 'success' : 'error'}>{topUpState.message}</Alert>
          )}
        </form>
      </section>

      {/* ------------------------------------------------ auto-reload */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
          Automatic reload
          {reload?.enabled && <span className="text-instock ml-2 text-xs">on</span>}
        </h2>

        <form action={reloadAction} className="space-y-3 px-4 py-4">
          {csrfField}
          <input type="hidden" name="store" value={store} />

          <p className="text-ink-muted text-xs leading-relaxed">
            When the balance runs low, top it up without asking. This is the{' '}
            <span className="text-ink font-bold">
              only setting in this store that can charge you without you pressing anything
            </span>
            , so it is capped at {reload?.maxPerMonth ?? 3} reloads a month and every one of them is
            written to your ledger with its own reference.
          </p>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              name="enabled"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="accent-accent-500 h-4 w-4"
            />
            Reload automatically
          </label>

          <div className={cn('grid gap-3 sm:grid-cols-2', !enabled && 'opacity-50')}>
            <div>
              <label htmlFor="threshold" className="mb-1 block text-xs font-bold">
                When it falls below
              </label>
              <select
                id="threshold"
                name="threshold"
                defaultValue={String(reload?.thresholdRupees ?? thresholds[1])}
                disabled={!enabled}
                className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              >
                {thresholds.map((value) => (
                  <option key={value} value={value}>
                    ₹{value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="reloadAmount" className="mb-1 block text-xs font-bold">
                Add
              </label>
              <select
                id="reloadAmount"
                name="reloadAmount"
                defaultValue={String(reload?.amountRupees ?? amounts[1])}
                disabled={!enabled}
                className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              >
                {amounts.map((value) => (
                  <option key={value} value={value}>
                    ₹{value.toLocaleString('en-IN')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {reload?.enabled && (
            <p className="text-ink-subtle text-xs">
              {reload.reloadsThisMonth} of {reload.maxPerMonth} automatic reloads used this month.
            </p>
          )}

          <SubmitButton fullWidth variant="secondary" pendingLabel="Saving...">
            {enabled ? 'Save the rule' : 'Turn it off'}
          </SubmitButton>

          {reloadState.message && (
            <Alert tone={reloadState.ok ? 'success' : 'error'}>{reloadState.message}</Alert>
          )}
        </form>
      </section>
    </div>
  );
}
