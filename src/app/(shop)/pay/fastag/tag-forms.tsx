'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { issueTagAction, logCrossingAction, rechargeTagAction } from '@/actions/transit';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { cn } from '@/lib/utils/cn';
import type { TransitAccountView } from '@/models/transit';

/**
 * The three things a tag holder does.
 *
 * Buying one, topping it up, and recording a crossing. Each is its own form and
 * its own action, so a failure in one does not clear the others — and none of
 * them sends an amount the server has not computed for itself.
 */

interface Issuer {
  id: string;
  name: string;
  securityDepositRupees: number;
  issuanceRupees: number;
  minBalanceRupees: number;
}

interface Model {
  id: string;
  label: string;
}

interface Corridor {
  id: string;
  name: string;
  highway: string;
}

interface Props {
  tags: TransitAccountView[];
  issuers: Issuer[];
  tollClasses: ReadonlyArray<{ id: string; label: string }>;
  models: Model[];
  corridors: Corridor[];
  topUps: readonly number[];
  limits: { min: number; max: number };
  csrfField: ReactNode;
}

const field =
  'border-hairline bg-surface-sunken focus:border-accent-500 w-full rounded-lg border px-3 py-2 text-sm outline-none';
const label = 'mb-1 block text-xs font-bold';

export function TagForms({
  tags,
  issuers,
  tollClasses,
  models,
  corridors,
  topUps,
  limits,
  csrfField,
}: Props) {
  const [issueState, issueAction] = useActionState(issueTagAction, emptyFormState);
  const [rechargeState, rechargeAction] = useActionState(rechargeTagAction, emptyFormState);
  const [crossingState, crossingAction] = useActionState(logCrossingAction, emptyFormState);

  const [issueAmount, setIssueAmount] = useState(String(topUps[0] ?? limits.min));
  const [rechargeAmount, setRechargeAmount] = useState(String(topUps[1] ?? limits.min));
  const [issuerId, setIssuerId] = useState(issuers[0]?.id ?? '');

  const issuer = issuers.find((entry) => entry.id === issuerId) ?? issuers[0];
  const upfront =
    (issuer?.securityDepositRupees ?? 0) +
    (issuer?.issuanceRupees ?? 0) +
    (Number.parseInt(issueAmount, 10) || 0);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------- recharge a tag */}
      {tags.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">Recharge a tag</h2>
          <form action={rechargeAction} className="space-y-3 px-4 py-4">
            {csrfField}

            <div>
              <label htmlFor="recharge-registration" className={label}>
                Vehicle
              </label>
              <select id="recharge-registration" name="registration" className={field}>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.number}>
                    {tag.number} — {tag.providerName}
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
              Add ₹{Number.parseInt(rechargeAmount, 10) || 0} to the tag
            </SubmitButton>

            {rechargeState.message && (
              <Alert tone={rechargeState.ok ? 'success' : 'error'}>{rechargeState.message}</Alert>
            )}
          </form>
        </section>
      )}

      {/* ------------------------------------------------------ buy a tag */}
      <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
        <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
          {tags.length > 0 ? 'Buy a tag for another vehicle' : 'Buy a FASTag'}
        </h2>
        <form action={issueAction} className="space-y-3 px-4 py-4">
          {csrfField}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="issue-registration" className={label}>
                Registration number
              </label>
              <input
                id="issue-registration"
                name="registration"
                required
                placeholder="TN 02 BQ 6666"
                autoComplete="off"
                spellCheck={false}
                className={cn(field, 'tracking-wider uppercase')}
              />
            </div>

            <div>
              <label htmlFor="issue-tollClass" className={label}>
                Vehicle class
              </label>
              <select id="issue-tollClass" name="tollClass" defaultValue="CAR" className={field}>
                {tollClasses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <p className="text-ink-subtle mt-1 text-xs">
                A plaza charges by axles, not by what the vehicle cost.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="issue-issuerId" className={label}>
                Issuer
              </label>
              <select
                id="issue-issuerId"
                name="issuerId"
                value={issuerId}
                onChange={(event) => setIssuerId(event.target.value)}
                className={field}
              >
                {issuers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="issue-modelId" className={label}>
                Model <span className="text-ink-subtle font-normal">optional</span>
              </label>
              <select id="issue-modelId" name="modelId" defaultValue="" className={field}>
                <option value="">Not saying</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <AmountPicker
            id="issue-amount"
            title="First recharge"
            value={issueAmount}
            onChange={setIssueAmount}
            options={topUps}
            limits={limits}
          />

          {issuer && (
            <dl className="border-hairline bg-surface-sunken space-y-1 rounded-xl border p-3 text-xs">
              <Row label="Security deposit, refundable" value={issuer.securityDepositRupees} />
              <Row label="Tag and issuance, non-refundable" value={issuer.issuanceRupees} />
              <Row label="On the tag to spend" value={Number.parseInt(issueAmount, 10) || 0} />
              <div className="border-hairline flex justify-between border-t pt-1 font-bold">
                <dt>Taken from your balance</dt>
                <dd className="tabular-nums">₹{upfront.toLocaleString('en-IN')}</dd>
              </div>
              <p className="text-ink-subtle pt-1 leading-relaxed">
                Only the recharge is spendable at a barrier, so only that part is credited to the
                tag. The tag is refused below ₹{issuer.minBalanceRupees}.
              </p>
            </dl>
          )}

          <SubmitButton fullWidth pendingLabel="Issuing...">
            Buy the tag for ₹{upfront.toLocaleString('en-IN')}
          </SubmitButton>

          {issueState.message && (
            <Alert tone={issueState.ok ? 'success' : 'error'}>{issueState.message}</Alert>
          )}
        </form>
      </section>

      {/* --------------------------------------------- record a crossing */}
      {tags.length > 0 && (
        <section className="border-hairline bg-surface overflow-hidden rounded-2xl border">
          <h2 className="border-hairline border-b px-4 py-3 text-sm font-bold">
            Record a crossing
          </h2>
          <p className="text-ink-muted border-hairline border-b px-4 py-2.5 text-xs leading-relaxed">
            This store has no feed from any toll plaza, so a crossing is only recorded when you say
            you made one. The amount comes from the corridor and your vehicle class — it is a real
            calculation of a real toll, entered by you rather than read off a gantry.
          </p>
          <form action={crossingAction} className="space-y-3 px-4 py-4">
            {csrfField}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="crossing-registration" className={label}>
                  Vehicle
                </label>
                <select id="crossing-registration" name="registration" className={field}>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.number}>
                      {tag.number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="crossing-corridorId" className={label}>
                  Route
                </label>
                <select id="crossing-corridorId" name="corridorId" className={field}>
                  {corridors.map((corridor) => (
                    <option key={corridor.id} value={corridor.id}>
                      {corridor.name} — {corridor.highway}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="returnTrip" className="accent-accent-500 h-4 w-4" />
              Returning within 24 hours — charged at one and a half single trips
            </label>

            <SubmitButton fullWidth variant="secondary" pendingLabel="Recording...">
              Record it against the tag
            </SubmitButton>

            {crossingState.message && (
              <Alert tone={crossingState.ok ? 'success' : 'error'}>{crossingState.message}</Alert>
            )}
          </form>
        </section>
      )}
    </div>
  );
}

function Row({ label: text, value }: { label: string; value: number }) {
  return (
    <div className="text-ink-muted flex justify-between">
      <dt>{text}</dt>
      <dd className="tabular-nums">₹{value.toLocaleString('en-IN')}</dd>
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

/**
 * Chips plus a free field.
 *
 * The chips set the field rather than being a separate input, so there is only
 * ever one amount in the form and no way for a chip and a typed figure to
 * disagree about what is being paid.
 */
function AmountPicker({ id, title = 'Amount', value, onChange, options, limits }: AmountProps) {
  return (
    <div>
      <label htmlFor={id} className={label}>
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
