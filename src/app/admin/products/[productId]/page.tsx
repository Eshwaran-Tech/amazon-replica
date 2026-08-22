import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { setProductActiveAction } from '@/actions/admin';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { requirePageAdmin } from '@/lib/auth/guards';
import { paiseToRupees } from '@/lib/utils/money';
import { adminGetProduct, adminListCategories } from '@/services/admin';

import { InventoryForm } from './inventory-form';
import { ProductForm } from '../product-form';

export const metadata: Metadata = { title: 'Edit product' };

interface PageProps {
  params: Promise<{ productId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminEditProductPage({ params, searchParams }: PageProps) {
  await requirePageAdmin();
  const { productId } = await params;
  const query = await searchParams;

  const [product, categories] = await Promise.all([
    adminGetProduct(productId),
    adminListCategories(),
  ]);
  if (!product) notFound();

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-ink-muted text-sm">
        <Link href="/admin/products" className="hover:text-link hover:underline">
          Products
        </Link>{' '}
        / <span className="text-ink line-clamp-1 inline">{product.name}</span>
      </nav>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Edit product</h1>
        <div className="flex items-center gap-3">
          <Link href={`/products/${product.slug}`} className="text-link text-sm hover:underline">
            View in store
          </Link>
          <form action={setProductActiveAction}>
            <CsrfField />
            <input type="hidden" name="productId" value={product._id.toHexString()} />
            <input type="hidden" name="isActive" value={product.isActive ? 'false' : 'true'} />
            <SubmitButton
              variant={product.isActive ? 'danger' : 'secondary'}
              size="sm"
              pendingLabel="Saving..."
            >
              {product.isActive ? 'Deactivate' : 'Reactivate'}
            </SubmitButton>
          </form>
        </div>
      </div>

      {query.created === '1' && (
        <div className="mt-3">
          <Alert tone="success">Product created.</Alert>
        </div>
      )}
      {!product.isActive && (
        <div className="mt-3">
          <Alert tone="info">
            This product is inactive: hidden from the store, kept for order history.
          </Alert>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="border-hairline bg-surface rounded-2xl border p-4 sm:p-5">
          <ProductForm
            initial={{
              productId: product._id.toHexString(),
              name: product.name,
              description: product.description,
              brand: product.brand,
              category: product.category,
              subcategory: product.subcategory ?? '',
              price: String(paiseToRupees(product.price)),
              discountPrice: product.discountPrice ? String(paiseToRupees(product.discountPrice)) : '',
              stock: product.stock,
              images: product.images.join('\n'),
              thumbnail: product.thumbnail,
              features: product.features.join('\n'),
              specifications: product.specifications
                .map((spec) => `${spec.label}: ${spec.value}`)
                .join('\n'),
              isFeatured: product.isFeatured,
              isPrime: product.isPrime,
              isActive: product.isActive,
            }}
            categories={categories.map(({ slug, name, parentSlug }) => ({ slug, name, parentSlug }))}
            csrfField={<CsrfField />}
          />
        </div>

        <div className="border-hairline bg-surface h-fit rounded-2xl border p-4 sm:p-5">
          <h2 className="text-base font-bold">Adjust stock</h2>
          <p className="text-ink-muted mt-1 text-xs">
            Current stock: <span className="text-ink font-bold">{product.stock}</span>. Adjustments
            are audited with your reason -- inventory is money.
          </p>
          <div className="mt-3">
            <InventoryForm productId={product._id.toHexString()} csrfField={<CsrfField />} />
          </div>
        </div>
      </div>
    </>
  );
}
