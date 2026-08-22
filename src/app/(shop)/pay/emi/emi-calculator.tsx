'use client';

import { useState } from 'react';

import { ISSUER_KIND_LABELS } from '@/data/emi';
import { cn } from '@/lib/utils/cn';
import { formatPaise, rupeesToPaise } from '@/lib/utils/money';
import { offersFor } from '@/services/emi';

/**
 * The instalment calculator.
 *
 * Runs the same `planFor` the rest of the feature does, so what it shows is
 * what the arithmetic says rather than a rounded illustration. Pure functions
 * over numbers -- there is no database behind this and nothing to submit.
 *
 * "No cost EMI" is a toggle rather than a separate product because that is what
 * it is: the same plan, with the interest discounted off the order up front.
 * Switching it on shows both figures side by side, which is the only way the
 * arrangement makes sense.
 */

const PRESETS = [5000, 10_000, 25_000, 50_000, 100_000] as const;

export function EmiCalculator() {
  const [amount, setAmount] = useState('25000');
  const [noCost, setNoCost] = useState(false);

  const principal = rupeesToPaise(Math.max(0, Math.min(1_000_000, Number(amount) || 0)));
  const offers = offersFor(principal, { noCost });
  const eligible = offers.filter((offer) => offer.eligible);

  return (
    <section className="border-hairline bg-surface rounded-2xl border p-4">
      <h2 className="text-sm font-bold">What would it cost per month?</h2>
      <p className="text-ink-muted mt-1 text-xs">
        Illustrative rates from this store&apos;s own issuers. Nothing here lends you money.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-semibold">
          Order value
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, '').slice(0, 7))}
            inputMode="numeric"
            className="border-hairline focus:border-accent-500 mt-1 w-36 rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={noCost}
            onChange={(event) => setNoCost(event.target.checked)}
            className="accent-accent-500 h-4 w-4"
          />
          No cost EMI
        </label>
      </div>

      <ul className="mt-2 flex flex-wrap gap-2">
        {PRESETS.map((value) => (
          <li key={value}>
            <button
              type="button"
              onClick={() => setAmount(String(value))}
              aria-pressed={Number(amount) === value}
              className={cn(
                'rounded-lg border-2 px-2.5 py-1 text-xs font-semibold transition-colors',
                Number(amount) === value
                  ? 'border-accent-500 bg-accent-500/10 text-ink'
                  : 'border-hairline text-ink-muted hover:border-accent-500',
              )}
            >
              ₹{value.toLocaleString('en-IN')}
            </button>
          </li>
        ))}
      </ul>

      {eligible.length === 0 ? (
        <p className="text-ink-muted mt-4 text-sm">
          No issuer converts an order this size. The lowest minimum is ₹1,000.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {eligible.map((offer) => (
            <div key={offer.issuer.id}>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-bold">{offer.issuer.name}</span>
                <span className="text-ink-subtle text-[11px]">
                  {ISSUER_KIND_LABELS[offer.issuer.kind]} · {offer.issuer.annualRate}% a year ·
                  processing {offer.issuer.processingPercent}%
                  {offer.issuer.processingMinRupees > 0
                    ? ` (min ₹${offer.issuer.processingMinRupees})`
                    : ''}
                </span>
              </p>

              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-xs">
                  <thead>
                    <tr className="text-ink-subtle border-hairline border-b text-left">
                      <th scope="col" className="pb-1 font-semibold">
                        Tenure
                      </th>
                      <th scope="col" className="pb-1 text-right font-semibold">
                        Per month
                      </th>
                      <th scope="col" className="pb-1 text-right font-semibold">
                        Interest
                      </th>
                      <th scope="col" className="pb-1 text-right font-semibold">
                        Processing fee
                      </th>
                      <th scope="col" className="pb-1 text-right font-semibold">
                        {noCost ? 'You pay overall' : 'Total payable'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-hairline divide-y">
                    {offer.plans.map((plan) => (
                      <tr key={plan.tenureMonths}>
                        <td className="py-1.5">{plan.tenureMonths} months</td>
                        <td className="py-1.5 text-right font-semibold">
                          {formatPaise(plan.monthly)}
                        </td>
                        <td className="py-1.5 text-right">
                          {noCost ? (
                            <span className="text-instock">
                              {formatPaise(plan.totalInterest)} discounted
                            </span>
                          ) : (
                            formatPaise(plan.totalInterest)
                          )}
                        </td>
                        <td className="py-1.5 text-right">{formatPaise(plan.processingFee)}</td>
                        <td className="py-1.5 text-right font-semibold">
                          {formatPaise(noCost ? principal + plan.processingFee : plan.totalPayable)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {noCost && (
        <p className="text-ink-muted mt-4 rounded-lg border border-[#c45500]/40 bg-[#fff1e0] p-2.5 text-[11px] leading-relaxed text-[#8a3d00]">
          On a no-cost plan the issuer still charges the interest, and the store discounts the order
          by the same amount up front. Your card statement will therefore show interest on each
          instalment — that is the arrangement working, not a mistake. The processing fee is not
          waived by it.
        </p>
      )}
    </section>
  );
}
