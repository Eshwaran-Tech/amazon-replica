'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { addCardAction, logJourneyAction, rechargeCardAction } from '@/actions/transit';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { cn } from '@/lib/utils/cn';
import type { TransitAccountView } from '@/models/transit';

/**
 * Adding a card, topping it up, and recording a journey.
 *
 * The station lists are grouped by line, because a metro map is how people
 * think about a network — and the two pickers are filtered to the card's own
 * network, since a journey on another one cannot be charged to this card.
 */

interface Network {
  id: string;
  city: string;
  name: string;
  cardName: string;
  cardDiscountPercent: number;
}

interface Station {
  id: string;
  name: string;
  networkId: string;
  line: string;
}

interface Props {
  cards: TransitAccountView[];
  networks: Network[];
  stations: Station[];
  topUps: readonly number[];
  limits: { min: number; max: number };
  csrfField: ReactNode;
}

const field =
  'border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none';
const labelClass = 'mb-1 block text-xs font-bold';

export function CardForms({ cards, networks, stations, topUps, limits, csrfField }: Props) {
  const [addState, addAction] = useActionState(addCardAction, emptyFormState);
  const [rechargeState, rechargeAction] = useActionState(rechargeCardAction, emptyFormState);
  const [journeyState, journeyAction] = useActionState(logJourneyAction, emptyFormState);

  const [addAmount, setAddAmount] = useState(String(topUps[1] ?? limits.min));
  const [rechargeAmount, setRechargeAmount] = useState(String(topUps[2] ?? limits.min));
  const [journeyCard, setJourneyCard] = useState(cards[0]?.number ?? '');

  // A card belongs to one network, so the station pickers follow the card
  // rather than offering journeys it could never be charged for.
  const journeyNetwork = cards.find((card) => card.number === journeyCard)?.providerId;
  const journeyStations = stations.filter((station) => station.networkId === journeyNetwork);
  const lines = [...new Set(journeyStations.map((station) => station.line))];

  const heldNetworks = new Set(cards.map((card) => card.providerId));
  const available = networks.filter((network) => !heldNetworks.has(network.id));

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ recharge a card */}
      {cards.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Recharge a card</h2>
          <form action={rechargeAction} className="space-y-3 px-4 py-4">
            {csrfField}

            <div>
              <label htmlFor="recharge-number" className={labelClass}>
                Card
              </label>
              <select id="recharge-number" name="number" className={field}>
                {cards.map((card) => (
                  <option key={card.id} value={card.number}>
                    {card.providerName} — {card.number.replace(/(.{4})/g, '$1 ').trim()}
                  </option>
                ))}
              </select>
            </div>

            <AmountPicker
              id="recharge-amount"
              value={rechargeAmount}
              onChange={setRechargeAmount}
              options={topUps}
              limits={limits}
            />

            <SubmitButton fullWidth pendingLabel="Adding...">
              Add ₹{Number.parseInt(rechargeAmount, 10) || 0} to the card
            </SubmitButton>

            {rechargeState.message && (
              <Alert tone={rechargeState.ok ? 'success' : 'error'}>{rechargeState.message}</Alert>
            )}
          </form>
        </section>
      )}

      {/* ---------------------------------------------------- add a card */}
      {available.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
            {cards.length > 0 ? 'Add a card in another city' : 'Get a metro card'}
          </h2>
          <form action={addAction} className="space-y-3 px-4 py-4">
            {csrfField}

            <div>
              <label htmlFor="add-networkId" className={labelClass}>
                City
              </label>
              <select id="add-networkId" name="networkId" className={field}>
                {available.map((network) => (
                  <option key={network.id} value={network.id}>
                    {network.city} — {network.cardName}, {network.cardDiscountPercent}% off every
                    fare
                  </option>
                ))}
              </select>
            </div>

            <AmountPicker
              id="add-amount"
              title="First load"
              value={addAmount}
              onChange={setAddAmount}
              options={topUps}
              limits={limits}
            />

            <SubmitButton fullWidth pendingLabel="Issuing...">
              Get the card with ₹{Number.parseInt(addAmount, 10) || 0} on it
            </SubmitButton>

            {addState.message && (
              <Alert tone={addState.ok ? 'success' : 'error'}>{addState.message}</Alert>
            )}
          </form>
        </section>
      )}

      {/* ------------------------------------------------ record a journey */}
      {cards.length > 0 && journeyStations.length > 1 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Record a journey</h2>
          <p className="text-ink-muted border-hairline border-b px-4 py-2.5 text-xs leading-relaxed">
            This store has no feed from any gate, so a journey is only charged when you enter one.
            The fare is the card fare, not the token fare — that is what a gate would have taken.
          </p>
          <form action={journeyAction} className="space-y-3 px-4 py-4">
            {csrfField}

            <div>
              <label htmlFor="journey-number" className={labelClass}>
                Card
              </label>
              <select
                id="journey-number"
                name="number"
                value={journeyCard}
                onChange={(event) => setJourneyCard(event.target.value)}
                className={field}
              >
                {cards.map((card) => (
                  <option key={card.id} value={card.number}>
                    {card.providerName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { name: 'fromId', label: 'From', index: 0 },
                  { name: 'toId', label: 'To', index: 1 },
                ] as const
              ).map((picker) => (
                <div key={picker.name}>
                  <label htmlFor={`journey-${picker.name}`} className={labelClass}>
                    {picker.label}
                  </label>
                  <select
                    id={`journey-${picker.name}`}
                    name={picker.name}
                    defaultValue={
                      journeyStations[picker.index === 0 ? 0 : journeyStations.length - 1]?.id
                    }
                    className={field}
                  >
                    {lines.map((line) => (
                      <optgroup key={line} label={`${line} line`}>
                        {journeyStations
                          .filter((station) => station.line === line)
                          .map((station) => (
                            <option key={station.id} value={station.id}>
                              {station.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <SubmitButton fullWidth variant="secondary" pendingLabel="Recording...">
              Record it against the card
            </SubmitButton>

            {journeyState.message && (
              <Alert tone={journeyState.ok ? 'success' : 'error'}>{journeyState.message}</Alert>
            )}
          </form>
        </section>
      )}
    </div>
  );
}

interface AmountProps {
  id: string;
  title?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly number[];
  limits: { min: number; max: number };
}

function AmountPicker({ id, title = 'Amount', value, onChange, options, limits }: AmountProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {title}
      </label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(String(option))}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors',
              String(option) === value
                ? 'border-accent-500 bg-accent-500/15 text-accent-400'
                : 'border-hairline text-ink-muted hover:border-accent-500/60',
            )}
          >
            ₹{option.toLocaleString('en-IN')}
          </button>
        ))}
      </div>
      <input
        id={id}
        name="amount"
        inputMode="numeric"
        required
        min={limits.min}
        max={limits.max}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ''))}
        className={field}
      />
      <p className="text-ink-subtle mt-1 text-xs">
        Between ₹{limits.min} and ₹{limits.max.toLocaleString('en-IN')}.
      </p>
    </div>
  );
}
