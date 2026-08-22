'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { ReactNode } from 'react';

import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from '@/actions/admin';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';

interface CategoryFormValues {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  parentSlug: string;
  displayOrder: number;
  isActive: boolean;
}

interface CategoryFormProps {
  initial: CategoryFormValues | null;
  parents: Array<{ slug: string; name: string }>;
  csrfField: ReactNode;
}

export function CategoryForm({ initial, parents, csrfField }: CategoryFormProps) {
  const [state, formAction] = useActionState(
    initial ? updateCategoryAction : createCategoryAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {csrfField}
      {initial && <input type="hidden" name="categoryId" value={initial.categoryId} />}

      {state.message && !state.ok && <Alert tone="error">{state.message}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="c-name"
          name="name"
          label="Name"
          required
          defaultValue={initial?.name}
          error={state.fields?.name}
        />
        {initial ? (
          // The slug is the category's public URL and what products reference;
          // it does not change on edit.
          <TextField
            id="c-slug"
            name="slug"
            label="Slug (fixed)"
            defaultValue={initial.slug}
            readOnly
            className="opacity-70"
          />
        ) : (
          <TextField
            id="c-slug"
            name="slug"
            label="Slug"
            required
            placeholder="e.g. wearables"
            hint="Lowercase letters, numbers, and hyphens"
            error={state.fields?.slug}
          />
        )}

        <div className="space-y-1.5">
          <label htmlFor="c-parent" className="block text-sm font-semibold">
            Parent <span className="text-ink-subtle font-normal">(blank = top level)</span>
          </label>
          <select
            id="c-parent"
            name="parentSlug"
            defaultValue={initial?.parentSlug ?? ''}
            className="border-hairline bg-surface focus:border-link min-h-11 w-full rounded-md border px-3 text-base"
          >
            <option value="">Top level</option>
            {parents.map((parent) => (
              <option key={parent.slug} value={parent.slug}>
                {parent.name}
              </option>
            ))}
          </select>
          {state.fields?.parentSlug && (
            <p role="alert" className="text-deal text-sm font-medium">
              {state.fields.parentSlug}
            </p>
          )}
        </div>

        <TextField
          id="c-order"
          name="displayOrder"
          label="Display order"
          inputMode="numeric"
          defaultValue={String(initial?.displayOrder ?? 0)}
          error={state.fields?.displayOrder}
        />

        <div className="sm:col-span-2">
          <TextField
            id="c-image"
            name="image"
            label="Image path (optional)"
            placeholder="/categories/example.png"
            defaultValue={initial?.image}
            hint="Local files under /categories/ only"
            error={state.fields?.image}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="c-description" className="block text-sm font-semibold">
          Description <span className="text-ink-subtle font-normal">(optional)</span>
        </label>
        <textarea
          id="c-description"
          name="description"
          rows={2}
          defaultValue={initial?.description}
          className="border-hairline bg-surface focus:border-link w-full rounded-md border px-3 py-2.5 text-base"
        />
      </div>

      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4"
        />
        Active (shown in navigation and listings)
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Saving...">
          {initial ? 'Save category' : 'Create category'}
        </SubmitButton>
        <Link
          href="/admin/categories"
          className="text-link min-h-10 content-center px-2 text-sm font-semibold hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Two-step delete for empty categories (the service re-checks emptiness). */
export function DeleteCategoryForm({
  categoryId,
  csrfField,
}: {
  categoryId: string;
  csrfField: ReactNode;
}) {
  const [state, formAction] = useActionState(deleteCategoryAction, emptyFormState);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="text-deal text-sm font-semibold hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      {csrfField}
      <input type="hidden" name="categoryId" value={categoryId} />
      {state.message && !state.ok && (
        <span role="alert" className="text-deal text-xs">
          {state.message}
        </span>
      )}
      <SubmitButton variant="danger" size="sm" pendingLabel="...">
        Confirm
      </SubmitButton>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-link text-sm hover:underline"
      >
        Keep
      </button>
    </form>
  );
}
