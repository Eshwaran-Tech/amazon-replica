'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { corporateEnquiryAction } from '@/actions/gift';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import {
  DISCOUNT_SLABS,
  MAX_BULK_FACE_VALUE,
  MAX_BULK_QUANTITY,
  quoteBulk,
} from '@/data/bulk-gifting';

/**
 * The bulk calculator and the enquiry form.
 *
 * The calculator runs the same `quoteBulk` the server would, so the figure it
 * shows is the figure a bulk order would actually carry -- it is arithmetic on
 * published slabs, not a teaser.
 *
 * The form really stores what it collects and says so. The reference promises a
 * reply within one business day; this store has no sales desk and will not
 * pretend otherwise, because a form that summons nobody wastes a real person's
 * afternoon.
 */

function rupees(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}

export function BulkTools({ csrfField }: { csrfField: ReactNode }) {
  const [state, formAction] = useActionState(corporateEnquiryAction, emptyFormState);

  const [quantity, setQuantity] = useState('500');
  const [faceValue, setFaceValue] = useState('1000');

  const quote = quoteBulk(Number(quantity) || 0, Number(faceValue) || 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* ------------------------------------------------- the calculator */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <h2 className="text-sm font-bold">What a bulk order costs</h2>
        <p className="text-ink-muted mt-1 text-xs">
          The slabs below are published, and this works them out. No quotation required.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            How many cards
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            />
            <span className="text-ink-subtle font-normal">
              up to {MAX_BULK_QUANTITY.toLocaleString('en-IN')}
            </span>
          </label>

          <label className="block text-xs font-semibold">
            Value of each
            <input
              value={faceValue}
              onChange={(event) => setFaceValue(event.target.value.replace(/\D/g, '').slice(0, 5))}
              inputMode="numeric"
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            />
            <span className="text-ink-subtle font-normal">up to {rupees(MAX_BULK_FACE_VALUE)}</span>
          </label>
        </div>

        <dl className="border-hairline mt-4 space-y-1.5 border-t pt-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">Face value of the order</dt>
            <dd className="font-medium">{rupees(quote.orderRupees)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-ink-muted">
              Discount{quote.percent > 0 ? ` (${quote.percent}%)` : ''}
            </dt>
            <dd className={quote.percent > 0 ? 'text-instock font-medium' : 'font-medium'}>
              {quote.percent > 0 ? `− ${rupees(quote.savingRupees)}` : 'None at this size'}
            </dd>
          </div>
          <div className="border-hairline flex items-baseline justify-between border-t pt-2">
            <dt className="text-sm font-bold">You would pay</dt>
            <dd className="text-accent-400 text-lg font-bold">{rupees(quote.payableRupees)}</dd>
          </div>
        </dl>

        {quote.nextSlab && quote.orderRupees > 0 && (
          <p className="text-ink-subtle mt-2 text-[11px]">
            {rupees(quote.toNextRupees)} more of face value would reach {quote.nextSlab.percent}%.
          </p>
        )}

        <table className="mt-4 w-full text-xs">
          <caption className="text-ink-muted mb-1.5 text-left text-[11px]">
            The published slabs
          </caption>
          <thead>
            <tr className="text-ink-subtle text-left">
              <th scope="col" className="border-hairline border-b pb-1 font-semibold">
                Order value
              </th>
              <th scope="col" className="border-hairline border-b pb-1 text-right font-semibold">
                Discount
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {DISCOUNT_SLABS.map((slab) => (
              <tr
                key={slab.fromRupees}
                className={
                  quote.percent === slab.percent && quote.orderRupees >= slab.fromRupees
                    ? 'text-instock font-semibold'
                    : 'text-ink-muted'
                }
              >
                <td className="py-1">{rupees(slab.fromRupees)} and above</td>
                <td className="py-1 text-right">{slab.percent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ---------------------------------------------------- the enquiry */}
      <form action={formAction} className="border-hairline bg-surface rounded-2xl border p-4">
        {csrfField}
        <input type="hidden" name="quantity" value={quantity} />
        <input type="hidden" name="faceValue" value={faceValue} />

        <h2 className="text-sm font-bold">Tell us about the order</h2>
        <p className="text-ink-muted mt-1 text-xs">
          The enquiry is stored so an administrator can read it. Nobody will call — this store has
          no sales desk, and it will not pretend to have one.
        </p>

        <div className="mt-3 space-y-3">
          <Field name="fullName" label="Full name" autoComplete="name" />
          <Field name="organisation" label="Organisation" autoComplete="organization" />
          <Field name="email" label="Email" type="email" autoComplete="email" />
          <Field name="phone" label="Phone number" type="tel" autoComplete="tel" />

          <label className="block text-xs font-semibold">
            Anything else
            <textarea
              name="notes"
              rows={3}
              maxLength={1000}
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            />
          </label>
        </div>

        {state.message && (
          <div className="mt-3">
            <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
          </div>
        )}

        <div className="mt-3">
          <SubmitButton fullWidth pendingLabel="Sending...">
            Send the enquiry
          </SubmitButton>
        </div>

        <p className="text-ink-subtle mt-2 text-[11px] leading-relaxed">
          Your name, organisation, email and phone number are kept, because an enquiry is made of
          them. Nothing else is: no tracking id, no referrer, no marketing flag.
        </p>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
      />
    </label>
  );
}
