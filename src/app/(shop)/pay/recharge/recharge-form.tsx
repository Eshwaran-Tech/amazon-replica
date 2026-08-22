'use client';

import { Check, ChevronRight, Search, Smartphone, X } from 'lucide-react';
import { useActionState, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { rechargeAction } from '@/actions/recharge';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { formatPaise } from '@/lib/utils/money';
import { OperatorMark } from '@/components/pay/operator-mark';
import { cn } from '@/lib/utils/cn';
import { PLAN_TABS, type PlanTab } from '@/data/recharge-plans';
import { detectOperator, isValidMobile } from '@/lib/recharge/detect';

/**
 * The recharge flow, in the reference's three steps: enter a number, confirm
 * the operator, pick a plan and pay.
 *
 * Everything the picker needs is sent with the page -- a couple of dozen plans
 * and four operators -- so choosing a plan and switching tabs costs no round
 * trip. The only network call is the recharge itself.
 */

export interface PlanOption {
  id: string;
  operatorId: string;
  rupees: number;
  paise: number;
  data: string;
  validity: string;
  calls: string;
  sms: string;
  benefits: string[];
  tabs: string[];
}

export interface OperatorOption {
  id: string;
  name: string;
  short: string;
  tone: string;
  colour: string;
  tagline: string;
}

interface Props {
  operators: OperatorOption[];
  circles: string[];
  plans: PlanOption[];
  balance: number;
  signedIn: boolean;
  csrfField: ReactNode;
}

export function RechargeForm({ operators, circles, plans, balance, signedIn, csrfField }: Props) {
  const [state, formAction] = useActionState(rechargeAction, emptyFormState);
  const [mobile, setMobile] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [operatorId, setOperatorId] = useState('');
  const [circle, setCircle] = useState('');
  const [planId, setPlanId] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [tab, setTab] = useState<PlanTab>('Popular');
  const [query, setQuery] = useState('');
  const numberId = useId();

  // Cleared after a successful recharge so the form is ready for the next one
  // rather than showing a paid plan as if it were still selected.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) {
      setConfirmed(false);
      setPlanId('');
      setMobile('');
    }
  }

  const valid = isValidMobile(mobile);

  // Detected the moment the tenth digit lands, with the same function the
  // server uses when it charges -- so the operator shown is the one recorded.
  const detected = detectOperator(mobile);
  const plan = plans.find((entry) => entry.id === planId);
  const operator = operators.find((entry) => entry.id === operatorId);

  // Only this operator's book: an Airtel sheet showing Jio prices would be
  // the one thing a plan picker must never do.
  const mine = useMemo(
    () => plans.filter((entry) => entry.operatorId === operatorId),
    [plans, operatorId],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const byTab = mine.filter((entry) => entry.tabs.includes(tab));
    const pool = term
      ? mine.filter(
          (entry) =>
            String(entry.rupees).startsWith(term) ||
            entry.data.toLowerCase().includes(term) ||
            entry.benefits.some((benefit) => benefit.toLowerCase().includes(term)),
        )
      : byTab;

    // Cheapest first. A column of amounts is read by scanning down it, and
    // generation order is not an order anyone is looking for.
    return [...pool].sort((a, b) => a.rupees - b.rupees);
  }, [mine, tab, query]);

  return (
    <form action={formAction} className="space-y-4">
      {csrfField}
      <input type="hidden" name="mobile" value={mobile} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="circle" value={circle} />

      {state.message && <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>}

      {/* ------------------------------------------------- step 1: number */}
      {!confirmed ? (
        <section className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
          <h2 className="text-base font-bold">Add new number</h2>
          <label htmlFor={numberId} className="sr-only">
            Enter 10 digit mobile number
          </label>
          <input
            id={numberId}
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            value={mobile}
            onChange={(event) => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Enter 10 digit mobile number"
            className="border-hairline focus:border-accent-500 mt-3 w-full rounded-xl border bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
          />
          {mobile.length === 10 && !valid && (
            <p role="alert" className="text-deal mt-2 text-xs">
              An Indian mobile number starts with 6, 7, 8 or 9.
            </p>
          )}
          <button
            type="button"
            disabled={!valid}
            onClick={() => {
              if (!detected) return;
              setOperatorId(detected.operator.id);
              setCircle(detected.circle);
              setConfirmed(true);
            }}
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
        </section>
      ) : (
        <>
          {/* --------------------------------------- step 2: the operator */}
          <section className="border-hairline bg-surface flex items-center gap-3 rounded-2xl border p-4">
            {operator ? (
              <OperatorMark
                operatorId={operator.id}
                colour={operator.colour}
                size={40}
                className="shrink-0"
              />
            ) : (
              <span
                aria-hidden="true"
                className="bg-surface-sunken text-ink-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <Smartphone className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{mobile}</span>
              <span className="text-ink-muted block text-xs">
                {operator?.name}
                {circle ? `, ${circle}` : ''}
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setConfirmed(false);
                setPlanId('');
              }}
              className="text-link shrink-0 text-sm font-semibold hover:underline"
            >
              Edit
            </button>
          </section>

          {/* Overriding the guess. A ported number is the normal case here. */}
          <details className="border-hairline bg-surface rounded-2xl border px-4 py-3">
            <summary className="cursor-pointer text-xs font-semibold">
              Wrong operator or circle?
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">
                Operator
                <select
                  value={operatorId}
                  onChange={(event) => {
                    setOperatorId(event.target.value);
                    // Plan ids are operator-scoped, so a plan chosen from the
                    // old book cannot survive the switch.
                    setPlanId('');
                  }}
                  className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
                >
                  {operators.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Circle
                <select
                  value={circle}
                  onChange={(event) => setCircle(event.target.value)}
                  className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
                >
                  {circles.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          {/* ------------------------------------------ step 3: the plan */}
          <section className="border-hairline bg-surface rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="text-ink-muted block text-xs">Plan amount</span>
                <span className="block text-lg font-bold">
                  {plan ? formatPaise(plan.paise) : '—'}
                </span>
                {plan && (
                  <span className="text-ink-muted block text-xs">
                    {plan.data} · {plan.validity} · {plan.calls}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setBrowsing(true)}
                className="text-link shrink-0 text-sm font-semibold hover:underline"
              >
                View plans
              </button>
            </div>
          </section>

          <div className="space-y-1">
            {signedIn ? (
              <SubmitButton fullWidth size="lg" pendingLabel="Recharging..." disabled={!plan}>
                {plan ? `Pay ${formatPaise(plan.paise)} now` : 'Pay now'}
              </SubmitButton>
            ) : (
              <a
                href="/auth/login?next=/pay/recharge"
                className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-12 w-full items-center justify-center rounded-lg text-sm font-bold"
              >
                Sign in to recharge
              </a>
            )}
            <p className="text-ink-subtle text-center text-xs">
              Paid from your Amazon Pay balance ({formatPaise(balance)}).
              {plan && balance < plan.paise && (
                <span className="text-deal"> {formatPaise(plan.paise - balance)} short.</span>
              )}
            </p>
          </div>
        </>
      )}

      {/* ------------------------------------------------- the plan sheet */}
      {browsing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a plan"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
        >
          <div className="bg-surface flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl sm:rounded-2xl">
            <div className="border-hairline flex items-center gap-3 border-b p-4">
              {operator && (
                <OperatorMark
                  operatorId={operator.id}
                  colour={operator.colour}
                  name={operator.name}
                  size={28}
                  className="shrink-0"
                />
              )}
              <h2 className="min-w-0 flex-1 text-base font-bold">
                Prepaid plans
                <span className="text-ink-muted block text-xs font-normal">
                  Showing {visible.length} of {mine.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setBrowsing(false)}
                aria-label="Close plans"
                className="hover:bg-surface-sunken rounded-lg p-1.5"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="border-hairline space-y-3 border-b p-4">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-500"
                  aria-hidden="true"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search for a plan or enter amount"
                  aria-label="Search plans"
                  className="border-hairline focus:border-accent-500 w-full rounded-full border bg-white py-2.5 pr-3 pl-9 text-sm text-neutral-900 placeholder:text-neutral-500 focus:outline-none"
                />
              </div>

              <div
                role="tablist"
                aria-label="Plan categories"
                className="flex gap-2 overflow-x-auto pb-1"
              >
                {PLAN_TABS.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    role="tab"
                    aria-selected={entry === tab}
                    onClick={() => setTab(entry)}
                    className={cn(
                      'shrink-0 rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors',
                      entry === tab
                        ? 'border-accent-500 bg-accent-500 text-brand-950'
                        : 'border-hairline text-ink-muted hover:border-accent-500',
                    )}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>

            <ul className="divide-hairline min-h-0 flex-1 divide-y overflow-y-auto">
              {visible.length === 0 && (
                <li className="text-ink-muted p-6 text-center text-sm">
                  No plan matches “{query}”.
                </li>
              )}
              {visible.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlanId(entry.id);
                      setBrowsing(false);
                    }}
                    className="hover:bg-surface-sunken flex w-full items-center gap-4 p-4 text-left transition-colors"
                  >
                    <span className="w-20 shrink-0 text-lg font-bold">
                      ₹{entry.rupees.toLocaleString('en-IN')}
                    </span>
                    <span className="min-w-0 flex-1 text-xs">
                      <Row label="Data" value={entry.data} />
                      <Row label="Validity" value={entry.validity} />
                      <Row label="Calls" value={entry.calls} />
                      {entry.benefits.length > 0 && (
                        <span className="text-ink-subtle mt-1 block">
                          {entry.benefits.join(' · ')}
                        </span>
                      )}
                    </span>
                    {entry.id === planId ? (
                      <Check className="text-instock h-5 w-5 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronRight
                        className="text-ink-muted h-5 w-5 shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex gap-2">
      <span className="text-ink-muted w-14 shrink-0">{label}</span>
      <span className="min-w-0">{value}</span>
    </span>
  );
}
