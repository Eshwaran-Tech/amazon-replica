'use client';

import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { raiseTicketAction, resolveTicketAction } from '@/actions/pay';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { MAX_BODY, MAX_SUBJECT, TICKET_TOPICS, TOPIC_LABELS } from '@/models/support-ticket';

/**
 * Raising a ticket, and closing one.
 *
 * Two small forms rather than one, because they do different things to
 * different records. Closing carries the ticket id and nothing else the server
 * would trust -- ownership is checked in the query, not in the form.
 */

export function RaiseTicketForm({ csrfField }: { csrfField: ReactNode }) {
  const [state, formAction] = useActionState(raiseTicketAction, emptyFormState);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Cleared after a ticket is raised, so the next one starts empty rather than
  // inviting an accidental duplicate.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state.ok) {
      setSubject('');
      setBody('');
    }
  }

  return (
    <form action={formAction} className="border-hairline bg-surface rounded-2xl border p-4">
      {csrfField}

      <h2 className="text-sm font-bold">Raise a ticket</h2>
      <p className="text-ink-muted mt-1 text-xs">
        It is stored against your account. Nobody is on the other end of it — what this gives you is
        a written record that survives a reload, and which you can close yourself.
      </p>

      <div className="mt-3 space-y-3">
        <label className="block text-xs font-semibold">
          What is this about
          <select
            name="topic"
            defaultValue="PAYMENT"
            className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          >
            {TICKET_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold">
          One-line summary
          <input
            name="subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value.slice(0, MAX_SUBJECT))}
            className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          />
        </label>

        <label className="block text-xs font-semibold">
          Reference, if you have one
          <input
            name="related"
            maxLength={32}
            placeholder="e.g. GC-4A21C9 or an order number"
            className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none"
          />
        </label>

        <label className="block text-xs font-semibold">
          What happened
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, MAX_BODY))}
            rows={4}
            className="border-hairline focus:border-accent-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none"
          />
          <span className="text-ink-subtle font-normal">
            {body.length}/{MAX_BODY}
          </span>
        </label>
      </div>

      {state.message && (
        <div className="mt-3">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      )}

      <div className="mt-3">
        <SubmitButton
          pendingLabel="Raising..."
          disabled={subject.trim().length === 0 || body.trim().length < 10}
        >
          Raise the ticket
        </SubmitButton>
      </div>
    </form>
  );
}

export function ResolveTicketForm({
  ticketId,
  csrfField,
}: {
  ticketId: string;
  csrfField: ReactNode;
}) {
  const [state, formAction] = useActionState(resolveTicketAction, emptyFormState);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      {csrfField}
      <input type="hidden" name="ticket" value={ticketId} />

      <input
        name="note"
        maxLength={500}
        placeholder="How it was sorted (optional)"
        className="border-hairline focus:border-accent-500 min-w-0 flex-1 rounded-lg border bg-white px-3 py-1.5 text-xs text-neutral-900 focus:outline-none"
      />
      <SubmitButton size="sm" pendingLabel="Closing...">
        Mark resolved
      </SubmitButton>

      {state.message && !state.ok && (
        <p role="alert" className="text-deal w-full text-[11px]">
          {state.message}
        </p>
      )}
    </form>
  );
}
