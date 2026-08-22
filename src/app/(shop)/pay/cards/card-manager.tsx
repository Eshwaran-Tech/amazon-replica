'use client';

import { CreditCard, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { makeDefaultCardAction, removeCardAction, saveCardAction } from '@/actions/pay';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState, type FormState } from '@/lib/forms/state';
import { cn } from '@/lib/utils/cn';
import { NETWORK_LABELS, type SavedCardView } from '@/models/saved-card';

/**
 * Saved payment methods.
 *
 * The form takes a card number, passes it once to the server, and keeps nothing
 * -- the field is cleared on success and the number is never held in state
 * beyond the keystroke. What comes back is four digits and a network.
 *
 * Only the mock provider's test cards are accepted, and the form says so above
 * the field rather than failing mysteriously. That is not a demo shortcut: there
 * is no path in this codebase that stores anything derived from a real card.
 */

interface Props {
  cards: SavedCardView[];
  maxCards: number;
  csrfField: ReactNode;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function CardManager({ cards, maxCards, csrfField }: Props) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, index) => thisYear + index);

  const [state, formAction] = useActionState(saveCardAction, emptyFormState);
  const [cardNumber, setCardNumber] = useState('');
  const [holderName, setHolderName] = useState('');

  // Cleared on success so the number does not sit in a field after it has been
  // tokenised. There is nothing to go back to.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) {
      setCardNumber('');
      setHolderName('');
    }
  }

  return (
    <div className="space-y-4">
      {/* -------------------------------------------------------- the cards */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
          Your saved cards
          <span className="text-ink-subtle ml-2 font-normal">
            {cards.length} of {maxCards}
          </span>
        </h2>

        {cards.length === 0 ? (
          <p className="text-ink-muted px-4 py-8 text-center text-sm">
            No cards saved. Adding one keeps a provider token and four digits, nothing more.
          </p>
        ) : (
          <ul className="divide-hairline divide-y">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  aria-hidden="true"
                  className="border-hairline flex h-9 w-12 shrink-0 items-center justify-center rounded-md border"
                >
                  <CreditCard className="text-ink-muted h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {NETWORK_LABELS[card.network]} ending {card.last4}
                    {card.isDefault && (
                      <span className="bg-accent-500/15 text-accent-400 ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold">
                        DEFAULT
                      </span>
                    )}
                  </span>
                  <span className="text-ink-muted block text-xs">
                    {card.holderName} · expires {String(card.expiryMonth).padStart(2, '0')}/
                    {String(card.expiryYear).slice(-2)}
                    {card.expired && <span className="text-deal font-semibold"> · expired</span>}
                  </span>
                </span>

                <span className="flex shrink-0 gap-2">
                  {!card.isDefault && !card.expired && (
                    <RowForm
                      action={makeDefaultCardAction}
                      name="card"
                      value={card.id}
                      csrfField={csrfField}
                      label="Make default"
                      icon={<Star className="h-3 w-3" aria-hidden="true" />}
                    />
                  )}
                  <RowForm
                    action={removeCardAction}
                    name="card"
                    value={card.id}
                    csrfField={csrfField}
                    label="Remove"
                    tone="danger"
                    icon={<Trash2 className="h-3 w-3" aria-hidden="true" />}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --------------------------------------------------------- the form */}
      <form action={formAction} className="border-hairline bg-surface rounded-2xl border p-4">
        {csrfField}

        <h2 className="text-sm font-bold">Save a card</h2>
        <p className="text-ink-muted mt-1 flex items-start gap-2 rounded-lg border border-[#c45500]/40 bg-[#fff1e0] p-2.5 text-[11px] leading-relaxed text-[#8a3d00]">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Only this store&apos;s test cards are accepted — use{' '}
            <span className="font-mono">4242 4242 4242 4242</span>. No real card number is accepted
            anywhere in this codebase, and none is stored: the number is used once to derive a token
            and then dropped.
          </span>
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Card number
            <input
              name="cardNumber"
              value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value.replace(/[^\d\s]/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="4242 4242 4242 4242"
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none"
            />
          </label>

          <label className="block text-xs font-semibold">
            Name on the card
            <input
              name="holderName"
              value={holderName}
              onChange={(event) => setHolderName(event.target.value)}
              maxLength={60}
              autoComplete="off"
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            />
          </label>

          <label className="block text-xs font-semibold">
            Expiry month
            <select
              name="expiryMonth"
              defaultValue="12"
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            >
              {MONTHS.map((month) => (
                <option key={month} value={month}>
                  {String(month).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold">
            Expiry year
            <select
              name="expiryYear"
              defaultValue={String(thisYear + 3)}
              className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" name="makeDefault" className="accent-accent-500 h-4 w-4" />
          Charge this one first
        </label>

        {state.message && (
          <div className="mt-3">
            <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
          </div>
        )}

        <div className="mt-3">
          <SubmitButton pendingLabel="Saving..." disabled={cardNumber.trim().length === 0}>
            Save the card
          </SubmitButton>
        </div>

        <p className="text-ink-subtle mt-2 text-[11px] leading-relaxed">
          No CVV field: a merchant may never store one, and this store has nothing to do with it
          between payments. You would be asked for it at the moment of paying, by the provider.
        </p>
      </form>
    </div>
  );
}

function RowForm({
  action,
  name,
  value,
  csrfField,
  label,
  icon,
  tone,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  name: string;
  value: string;
  csrfField: ReactNode;
  label: string;
  icon: ReactNode;
  tone?: 'danger';
}) {
  const [state, formAction] = useActionState(action, emptyFormState);

  return (
    <form action={formAction}>
      {csrfField}
      <input type="hidden" name={name} value={value} />
      <button
        type="submit"
        title={state.message ?? label}
        className={cn(
          'border-hairline inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
          tone === 'danger'
            ? 'text-ink-muted hover:border-deal hover:text-deal'
            : 'text-ink-muted hover:border-accent-500 hover:text-accent-400',
        )}
      >
        {icon}
        {label}
      </button>
    </form>
  );
}
