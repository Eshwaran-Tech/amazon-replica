import type { Metadata } from 'next';
import Link from 'next/link';

import { CsrfField } from '@/components/security/csrf-field';
import { requirePageAdmin } from '@/lib/auth/guards';
import { adminListCategories } from '@/services/admin';

import { ProductForm } from '../product-form';

export const metadata: Metadata = { title: 'New product' };

export default async function AdminNewProductPage() {
  await requirePageAdmin();
  const categories = await adminListCategories();

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/admin/products" className="hover:text-link hover:underline">
          Products
        </Link>{' '}
        / <span className="text-ink">New</span>
      </nav>
      <h1 className="mt-1 text-xl font-bold sm:text-2xl">Add a product</h1>

      <div className="border-hairline bg-surface mt-4 rounded-2xl border p-4 sm:p-5">
        <ProductForm
          initial={null}
          categories={categories.map(({ slug, name, parentSlug }) => ({ slug, name, parentSlug }))}
          csrfField={<CsrfField />}
        />
      </div>
    </>
  );
}
