'use client';

import { useActionState } from 'react';
import type { ReactNode } from 'react';

import { createProductAction, updateProductAction } from '@/actions/admin';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { TextField } from '@/components/ui/text-field';
import { emptyFormState } from '@/lib/forms/state';

export interface ProductFormValues {
  productId: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  subcategory: string;
  /** Rupee strings for the inputs; the schema converts to paise. */
  price: string;
  discountPrice: string;
  stock: number;
  images: string;
  thumbnail: string;
  features: string;
  specifications: string;
  isFeatured: boolean;
  isPrime: boolean;
  isActive: boolean;
}

interface ProductFormProps {
  /** null = create form. */
  initial: ProductFormValues | null;
  categories: Array<{ slug: string; name: string; parentSlug: string | null }>;
  csrfField: ReactNode;
}

/**
 * Create/edit product form.
 *
 * List-shaped fields (images, features, specifications) are one-per-line
 * textareas: pragmatic for an admin tool, and every line still passes the same
 * Zod schemas as any other input -- image paths in particular must be local
 * `/products/...` files, which is the SSRF guard on the image optimiser.
 */
export function ProductForm({ initial, categories, csrfField }: ProductFormProps) {
  const [state, formAction] = useActionState(
    initial ? updateProductAction : createProductAction,
    emptyFormState,
  );

  const topLevel = categories.filter((category) => category.parentSlug === null);
  const subs = categories.filter((category) => category.parentSlug !== null);

  return (
    <form action={formAction} className="max-w-3xl space-y-4" noValidate>
      {csrfField}
      {initial && <input type="hidden" name="productId" value={initial.productId} />}

      {state.message && (
        <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            id="p-name"
            name="name"
            label="Name"
            required
            defaultValue={initial?.name}
            error={state.fields?.name}
          />
        </div>
        <TextField
          id="p-brand"
          name="brand"
          label="Brand"
          required
          defaultValue={initial?.brand}
          error={state.fields?.brand}
        />

        <div className="space-y-1.5">
          <label htmlFor="p-category" className="block text-sm font-semibold">
            Category
          </label>
          <select
            id="p-category"
            name="category"
            defaultValue={initial?.category ?? topLevel[0]?.slug}
            className="border-hairline bg-surface focus:border-link min-h-11 w-full rounded-md border px-3 text-base"
          >
            {topLevel.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
          {state.fields?.category && (
            <p role="alert" className="text-deal text-sm font-medium">
              {state.fields.category}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="p-subcategory" className="block text-sm font-semibold">
            Subcategory <span className="text-ink-subtle font-normal">(optional)</span>
          </label>
          <select
            id="p-subcategory"
            name="subcategory"
            defaultValue={initial?.subcategory ?? ''}
            className="border-hairline bg-surface focus:border-link min-h-11 w-full rounded-md border px-3 text-base"
          >
            <option value="">None</option>
            {subs.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <TextField
          id="p-price"
          name="price"
          label="Price (rupees)"
          inputMode="decimal"
          required
          defaultValue={initial?.price}
          hint="e.g. 1499 or 1499.50"
          error={state.fields?.price}
        />
        <TextField
          id="p-discount"
          name="discountPrice"
          label="Discount price (rupees, optional)"
          inputMode="decimal"
          defaultValue={initial?.discountPrice}
          error={state.fields?.discountPrice}
        />
        <TextField
          id="p-stock"
          name="stock"
          label="Stock"
          inputMode="numeric"
          required
          defaultValue={initial ? String(initial.stock) : '0'}
          error={state.fields?.stock}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="p-description" className="block text-sm font-semibold">
          Description
        </label>
        <textarea
          id="p-description"
          name="description"
          rows={5}
          required
          defaultValue={initial?.description}
          className="border-hairline bg-surface focus:border-link w-full rounded-md border px-3 py-2.5 text-base"
        />
        {state.fields?.description && (
          <p role="alert" className="text-deal text-sm font-medium">
            {state.fields.description}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="p-images" className="block text-sm font-semibold">
            Images <span className="text-ink-subtle font-normal">(one path per line)</span>
          </label>
          <textarea
            id="p-images"
            name="images"
            rows={4}
            required
            defaultValue={initial?.images}
            placeholder={'/products/example-1.svg\n/products/example-2.svg'}
            className="border-hairline bg-surface focus:border-link w-full rounded-md border px-3 py-2.5 font-mono text-sm"
          />
          <p className="text-ink-subtle text-xs">
            Local files under /products/ only -- remote URLs are rejected.
          </p>
          {(state.fields?.images || state.fields?.['images.0']) && (
            <p role="alert" className="text-deal text-sm font-medium">
              {state.fields?.images ?? state.fields?.['images.0']}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <TextField
            id="p-thumbnail"
            name="thumbnail"
            label="Thumbnail (blank = first image)"
            defaultValue={initial?.thumbnail}
            error={state.fields?.thumbnail}
          />
          <div className="space-y-1.5">
            <label htmlFor="p-features" className="block text-sm font-semibold">
              Features <span className="text-ink-subtle font-normal">(one per line)</span>
            </label>
            <textarea
              id="p-features"
              name="features"
              rows={3}
              defaultValue={initial?.features}
              className="border-hairline bg-surface focus:border-link w-full rounded-md border px-3 py-2.5 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="p-specifications" className="block text-sm font-semibold">
          Specifications <span className="text-ink-subtle font-normal">(Label: value, one per line)</span>
        </label>
        <textarea
          id="p-specifications"
          name="specifications"
          rows={4}
          defaultValue={initial?.specifications}
          placeholder={'Weight: 240 g\nWarranty: 1 year'}
          className="border-hairline bg-surface focus:border-link w-full rounded-md border px-3 py-2.5 text-sm"
        />
        {state.fields &&
          Object.entries(state.fields)
            .filter(([key]) => key.startsWith('specifications'))
            .slice(0, 1)
            .map(([key, message]) => (
              <p key={key} role="alert" className="text-deal text-sm font-medium">
                {message}
              </p>
            ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4" />
          Active (visible in the store)
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" name="isFeatured" defaultChecked={initial?.isFeatured ?? false} className="h-4 w-4" />
          Featured on the home page
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" name="isPrime" defaultChecked={initial?.isPrime ?? false} className="h-4 w-4" />
          Prime badge
        </label>
      </div>

      <SubmitButton pendingLabel="Saving...">
        {initial ? 'Save product' : 'Create product'}
      </SubmitButton>
    </form>
  );
}
