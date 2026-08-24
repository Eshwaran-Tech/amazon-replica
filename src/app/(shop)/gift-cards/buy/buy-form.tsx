'use client';

import { AlertTriangle } from 'lucide-react';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { buyGiftCardAction } from '@/actions/gift';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import {
  MAX_AMOUNT_RUPEES,
  MAX_MESSAGE,
  MAX_QUANTITY,
  MIN_AMOUNT_RUPEES,
} from '@/services/gift-store';

/**
 * The buy form.
 *
 * The browser sends a design, an amount, a quantity and a recipient. It does
 * not send a total: the figure below is a preview of the same `quoteGift` the
 * server runs again before it charges anything.
 *
 * The codes come back in the success message and are shown once. That is not a
 * shortcut -- `mintGiftCards` stores an HMAC and the order stores four
 * characters, so there is genuinely nowhere to fetch them from afterwards. The
 * warning above the button says so before the money moves.
 */

interface DeliveryChoice {
  id: string;
  name: string;
  blurb: string;
  feeRupees: number;
  speed: string;
}

interface Props {
  /** Exactly one of these three identifies what is being bought. */
  designId?: string;
  brandId?: string;
  voucherKind?: string;
  /** Denominations offered; a brand fixes them, a design allows any amount. */
  denominations: readonly number[];
  allowCustomAmount: boolean;
  deliveries: DeliveryChoice[];
  initialDelivery: string;
  initialAmount: number;
  discountPercent: number;
  balance: number;
  signedIn: boolean;
  csrfField: ReactNode;
}

export function BuyGiftForm({
  designId,
  brandId,
  voucherKind,
  denominations,
  allowCustomAmount,
  deliveries,
  initialDelivery,
  initialAmount,
  discountPercent,
  balance,
  signedIn,
  csrfField,
}: Props) {
  const [state, formAction] = useActionState(buyGiftCardAction, emptyFormState);

  const [delivery, setDelivery] = useState(initialDelivery);
  const [amount, setAmount] = useState(String(initialAmount));
  const [quantity, setQuantity] = useState('1');
  const [recipient, setRecipient] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  // Cleared after a purchase, so a confirmed order does not leave a filled form
  // sitting there inviting a second charge for the same gift.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) {
      setRecipient('');
      setEmail('');
      setMessage('');
      setQuantity('1');
    }
  }

  const chosen = deliveries.find((option) => option.id === delivery) ?? deliveries[0];
  const faceRupees = Number(amount) || 0;
  const count = Math.max(1, Math.min(MAX_QUANTITY, Number(quantity) || 1));

  const subtotal = faceRupees * count * 100;
  const discount = Math.round((subtotal * discountPercent) / 100);
  const deliveryFee = (chosen?.feeRupees ?? 0) * count * 100;
  const total = subtotal - discount + deliveryFee;

  const needsEmail = chosen?.id !== 'PHYSICAL';
  const short = balance < total;
  const ready = faceRupees >= MIN_AMOUNT_RUPEES && recipient.trim().length > 0;

  return (
    <form action={formAction} className="space-y-4">
      {csrfField}
      <input type="hidden" name="design" value={designId ?? ''} />
      <input type="hidden" name="brand" value={brandId ?? ''} />
      <input type="hidden" name="voucher" value={voucherKind ?? ''} />
      <input type="hidden" name="delivery" value={delivery} />
      <input type="hidden" name="amount" value={amount} />

      {/* -------------------------------------------------------- delivery */}
      {deliveries.length > 1 && (
        <section className="border-hairline bg-surface rounded-2xl border p-4">
          <h2 className="text-sm font-bold">How should it arrive?</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {deliveries.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => setDelivery(option.id)}
                  aria-pressed={delivery === option.id}
                  className={cn(
                    'w-full rounded-xl border-2 p-3 text-left transition-colors',
                    delivery === option.id
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-hairline hover:border-accent-500',
                  )}
                >
                  <span className="block text-sm font-bold">{option.name}</span>
                  <span className="text-ink-muted mt-0.5 block text-xs">{option.blurb}</span>
                  <span className="text-ink-subtle mt-1 block text-[11px]">
                    {option.speed}
                    {option.feeRupees > 0 ? ` · ₹${option.feeRupees} per card` : ' · no fee'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------------- amount */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <h2 className="text-sm font-bold">Amount</h2>

        <ul className="mt-3 flex flex-wrap gap-2">
          {denominations.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => setAmount(String(value))}
                aria-pressed={Number(amount) === value}
                className={cn(
                  'rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-colors',
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

        {allowCustomAmount && (
          <label className="mt-3 block text-xs font-semibold">
            Or any amount from ₹{MIN_AMOUNT_RUPEES} to ₹{MAX_AMOUNT_RUPEES.toLocaleString('en-IN')}
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, '').slice(0, 5))}
              inputMode="numeric"
              className="border-hairline focus:border-accent-500 mt-1 w-32 rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            />
          </label>
        )}

        <label className="mt-3 block text-xs font-semibold">
          How many cards
          <input
            name="quantity"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            className="border-hairline focus:border-accent-500 mt-1 w-24 rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          />
          <span className="text-ink-subtle ml-2 font-normal">up to {MAX_QUANTITY}</span>
        </label>
      </section>

      {/* ------------------------------------------------------- recipient */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <h2 className="text-sm font-bold">Who is it for?</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Their name
            <input
              name="recipient"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              maxLength={60}
              autoComplete="off"
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            />
          </label>

          {needsEmail && (
            <label className="block text-xs font-semibold">
              Their email
              <input
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={160}
                autoComplete="off"
                className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
              />
            </label>
          )}
        </div>

        <label className="mt-3 block text-xs font-semibold">
          A message on the card
          <textarea
            name="message"
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, MAX_MESSAGE))}
            rows={3}
            className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          />
          <span className="text-ink-subtle font-normal">
            {message.length}/{MAX_MESSAGE}
          </span>
        </label>

        <p className="text-ink-subtle mt-2 text-[11px] leading-relaxed">
          A name and a note is what a card prints, and all this store keeps.
          {needsEmail
            ? ' The email is kept because it is how the card is delivered.'
            : ' A printed card needs no email, so none is asked for or stored.'}
        </p>
      </section>

      {/* ----------------------------------------------------------- total */}
      <section className="border-hairline bg-surface rounded-2xl border p-4">
        <dl className="space-y-1.5 text-sm">
          <Line
            label={`₹${faceRupees.toLocaleString('en-IN')} × ${count} card${count === 1 ? '' : 's'}`}
            value={formatPaise(subtotal)}
          />
          {discountPercent > 0 && (
            <Line
              label={`Brand discount (${discountPercent}%)`}
              value={`− ${formatPaise(discount)}`}
              tone="good"
            />
          )}
          <Line
            label={`Delivery${chosen?.feeRupees ? ` (₹${chosen.feeRupees} × ${count})` : ''}`}
            value={deliveryFee > 0 ? formatPaise(deliveryFee) : 'Free'}
            tone={deliveryFee > 0 ? undefined : 'good'}
          />
          <div className="border-hairline flex items-baseline justify-between border-t pt-2">
            <dt className="text-sm font-bold">You pay</dt>
            <dd className="text-accent-400 text-lg font-bold">{formatPaise(total)}</dd>
          </div>
        </dl>

        {discountPercent > 0 && (
          <p className="text-instock mt-2 text-[11px]">
            The card is still worth {formatPaise(subtotal)} to whoever spends it — the discount
            comes off what you pay, not off what they get.
          </p>
        )}

        <p className="text-ink-muted mt-3 flex items-start gap-2 rounded-lg border border-[#c45500]/40 bg-[#fff1e0] p-2.5 text-[11px] leading-relaxed text-[#8a3d00]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            The code appears once, here, after you pay. This store keeps only a one-way hash of it,
            so it genuinely cannot be shown again — copy it before you leave the page.
          </span>
        </p>

        {state.message && (
          <div className="mt-3">
            <Alert tone={state.ok ? 'success' : 'error'}>
              <span className={state.ok ? 'font-mono break-all' : undefined}>{state.message}</span>
            </Alert>
          </div>
        )}

        <div className="mt-3">
          {signedIn ? (
            <SubmitButton fullWidth size="lg" pendingLabel="Paying..." disabled={!ready}>
              {ready ? `Pay ${formatPaise(total)}` : 'Add an amount and a name'}
            </SubmitButton>
          ) : (
            <a
              href="/auth/login?next=/gift-cards"
              className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-12 w-full items-center justify-center rounded-lg text-sm font-bold"
            >
              Sign in to buy
            </a>
          )}
        </div>

        <p className="text-ink-subtle mt-2 text-center text-xs">
          Paid from your Eshwaran Pay balance ({formatPaise(balance)}).
          {signedIn && short && ready && (
            <span className="text-deal"> {formatPaise(total - balance)} short.</span>
          )}
        </p>
      </section>
    </form>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn('font-medium', tone === 'good' && 'text-instock')}>{value}</dd>
    </div>
  );
}
