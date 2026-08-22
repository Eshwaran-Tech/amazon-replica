'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import { PayForm } from '@/components/bills/pay-form';
import { cn } from '@/lib/utils/cn';
import { formatPaise, type Paise } from '@/lib/utils/money';

/**
 * Total due, minimum due, or something in between.
 *
 * The choice travels as a **name** -- `FULL`, `MINIMUM`, `CUSTOM` -- so the
 * server recomputes the figure rather than trusting one. Only the custom amount
 * is a number, and it is bounded on the server against what is actually owed.
 *
 * The minimum option carries its consequence next to it rather than in small
 * print, because the whole reason a minimum due exists is that it looks like
 * the easy choice.
 */

interface Props {
  category: string;
  biller: string;
  account: string;
  total: Paise;
  minimum: Paise;
  /** The warning rendered when the minimum is selected. */
  minimumWarning: ReactNode;
}

type Choice = 'FULL' | 'MINIMUM' | 'CUSTOM';

export function PayChoice({ category, biller, account, total, minimum, minimumWarning }: Props) {
  const [choice, setChoice] = useState<Choice>('FULL');
  const [custom, setCustom] = useState(String(Math.round(total / 100 / 2)));

  const customPaise = (Number.parseInt(custom, 10) || 0) * 100;
  const amount = choice === 'FULL' ? total : choice === 'MINIMUM' ? minimum : customPaise;

  const options: Array<{ id: Choice; label: string; value: string; note: string }> = [
    {
      id: 'FULL',
      label: 'Total due',
      value: formatPaise(total),
      note: 'Nothing carries over and no interest is charged.',
    },
    {
      id: 'MINIMUM',
      label: 'Minimum due',
      value: formatPaise(minimum),
      note: 'Keeps the account current. Interest runs on everything else.',
    },
    {
      id: 'CUSTOM',
      label: 'Another amount',
      value: '—',
      note: 'Anything from ₹100 up to the total due.',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              choice === option.id
                ? 'border-accent-500 bg-accent-500/10'
                : 'border-hairline hover:border-accent-500/50',
            )}
          >
            <input
              type="radio"
              name="choice"
              checked={choice === option.id}
              onChange={() => setChoice(option.id)}
              className="accent-accent-500 mt-0.5 h-4 w-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold">{option.label}</span>
                <span className="text-sm font-bold tabular-nums">{option.value}</span>
              </span>
              <span className="text-ink-muted mt-0.5 block text-xs leading-relaxed">
                {option.note}
              </span>
            </span>
          </label>
        ))}
      </div>

      {choice === 'CUSTOM' && (
        <div>
          <label htmlFor="custom-amount" className="mb-1 block text-xs font-bold">
            How much
          </label>
          <input
            id="custom-amount"
            inputMode="numeric"
            value={custom}
            onChange={(event) => setCustom(event.target.value.replace(/[^\d]/g, ''))}
            className="border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          />
        </div>
      )}

      {choice === 'MINIMUM' && minimumWarning}

      <PayForm
        fields={{
          category,
          biller,
          account,
          option: choice,
          ...(choice === 'CUSTOM' ? { amount: custom } : {}),
        }}
        label={amount > 0 ? `Pay ${formatPaise(amount)}` : 'Enter an amount'}
        saveAs={null}
      />
    </div>
  );
}
