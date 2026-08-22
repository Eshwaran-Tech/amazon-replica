/**
 * Shared form-action result shape.
 *
 * Lives outside `src/actions/` because a `'use server'` module may only export
 * async functions -- every export becomes a callable server endpoint, so a
 * plain object or constant is rejected at runtime (and, notably, *not* by
 * `tsc`). Keeping the constant here also means Client Components can import it
 * without pulling a server module into the client graph.
 */
export interface FormState {
  ok: boolean;
  /** Form-level message. Always a string we authored, never echoed input. */
  message?: string;
  /** Field name -> message, from the Zod schemas. */
  fields?: Record<string, string>;
}

export const emptyFormState: FormState = { ok: false };
