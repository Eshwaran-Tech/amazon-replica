import type { Metadata } from 'next';
import Link from 'next/link';

import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { requirePageAdmin } from '@/lib/auth/guards';
import { adminListCategories } from '@/services/admin';

import { CategoryForm, DeleteCategoryForm } from './category-form';

export const metadata: Metadata = { title: 'Categories' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminCategoriesPage({ searchParams }: PageProps) {
  await requirePageAdmin();
  const params = await searchParams;

  const categories = await adminListCategories();
  const editId = typeof params.edit === 'string' ? params.edit : null;
  const editing = editId ? (categories.find((category) => category.id === editId) ?? null) : null;
  const adding = params.add === '1';
  const topLevel = categories.filter((category) => category.parentSlug === null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Categories</h1>
        {!adding && !editing && (
          <Link
            href="/admin/categories?add=1"
            className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold"
          >
            Add category
          </Link>
        )}
      </div>

      {params.saved === '1' && (
        <div className="mt-3">
          <Alert tone="success">Category saved.</Alert>
        </div>
      )}

      {(adding || editing) && (
        <div className="border-hairline bg-surface mt-4 max-w-2xl rounded-2xl border p-4 sm:p-5">
          <h2 className="text-base font-bold">{editing ? `Edit "${editing.name}"` : 'Add a category'}</h2>
          <div className="mt-3">
            <CategoryForm
              key={editing?.id ?? 'new'}
              initial={
                editing
                  ? {
                      categoryId: editing.id,
                      name: editing.name,
                      slug: editing.slug,
                      description: editing.description ?? '',
                      image: editing.image ?? '',
                      parentSlug: editing.parentSlug ?? '',
                      displayOrder: editing.displayOrder,
                      isActive: editing.isActive,
                    }
                  : null
              }
              parents={topLevel
                .filter((category) => category.id !== editing?.id)
                .map(({ slug, name }) => ({ slug, name }))}
              csrfField={<CsrfField />}
            />
          </div>
        </div>
      )}

      <div className="border-hairline bg-surface mt-4 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-hairline border-b text-left text-xs uppercase">
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-4 py-2.5 font-semibold">Slug</th>
              <th className="px-4 py-2.5 font-semibold">Parent</th>
              <th className="px-4 py-2.5 text-right font-semibold">Products</th>
              <th className="px-4 py-2.5 text-right font-semibold">Order</th>
              <th className="px-4 py-2.5 font-semibold">State</th>
              <th className="px-4 py-2.5 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-surface-muted">
                <td className="px-4 py-2 font-medium">
                  {category.parentSlug && <span className="text-ink-subtle mr-1">--</span>}
                  {category.name}
                </td>
                <td className="text-ink-muted px-4 py-2 font-mono text-xs">{category.slug}</td>
                <td className="text-ink-muted px-4 py-2">{category.parentSlug ?? '-'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{category.productCount}</td>
                <td className="px-4 py-2 text-right tabular-nums">{category.displayOrder}</td>
                <td className="px-4 py-2">
                  {category.isActive ? (
                    <span className="text-instock text-xs font-semibold">Active</span>
                  ) : (
                    <span className="text-deal text-xs font-semibold">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center justify-end gap-3">
                    <Link
                      href={`/admin/categories?edit=${category.id}`}
                      className="text-link text-sm hover:underline"
                    >
                      Edit
                    </Link>
                    {category.productCount === 0 && (
                      <DeleteCategoryForm categoryId={category.id} csrfField={<CsrfField />} />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-ink-subtle mt-3 text-xs">
        A category holding products cannot be deleted -- move the products first or deactivate the
        category. This keeps every product reachable and every URL honest.
      </p>
    </>
  );
}
