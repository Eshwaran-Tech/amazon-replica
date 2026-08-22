import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductImage } from '@/components/product/product-image';
import { requirePageAdmin } from '@/lib/auth/guards';
import { formatPaise } from '@/lib/utils/money';
import { adminListProducts } from '@/services/admin';

export const metadata: Metadata = { title: 'Products' };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pageHref(q: string | undefined, page: number, low: boolean): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (low) params.set('low', '1');
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/admin/products${query ? `?${query}` : ''}`;
}

export default async function AdminProductsPage({ searchParams }: PageProps) {
  await requirePageAdmin();
  const params = await searchParams;

  const q = typeof params.q === 'string' ? params.q : undefined;
  const low = params.low === '1';
  const page = Number.parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1;

  const listing = await adminListProducts({ q, page, lowStock: low });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">{low ? 'Low-stock products' : 'Products'}</h1>
        <Link
          href="/admin/products/new"
          className="bg-accent-500 hover:bg-accent-400 text-brand-950 inline-flex min-h-10 items-center rounded-md px-4 text-sm font-semibold"
        >
          Add product
        </Link>
      </div>

      <form action="/admin/products" className="mt-3 flex max-w-md gap-2">
        {low && <input type="hidden" name="low" value="1" />}
        <label htmlFor="product-search" className="sr-only">
          Search products
        </label>
        <input
          id="product-search"
          name="q"
          defaultValue={q}
          placeholder="Search name, brand, or slug"
          className="border-hairline bg-surface focus:border-link min-h-10 w-full rounded-md border px-3 text-sm"
        />
        <button
          type="submit"
          className="border-hairline bg-surface hover:bg-surface-muted min-h-10 rounded-md border px-4 text-sm font-semibold"
        >
          Search
        </button>
      </form>

      <p className="mt-2 text-sm">
        {low ? (
          <Link href={pageHref(q, 1, false)} className="text-link hover:underline">
            Show all products
          </Link>
        ) : (
          <Link href={pageHref(q, 1, true)} className="text-link hover:underline">
            Show only low-stock products
          </Link>
        )}
      </p>

      <div className="border-hairline bg-surface mt-3 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-hairline border-b text-left text-xs uppercase">
              <th className="px-4 py-2.5 font-semibold">Product</th>
              <th className="px-4 py-2.5 font-semibold">Category</th>
              <th className="px-4 py-2.5 text-right font-semibold">Price</th>
              <th className="px-4 py-2.5 text-right font-semibold">Stock</th>
              <th className="px-4 py-2.5 font-semibold">State</th>
            </tr>
          </thead>
          <tbody className="divide-hairline divide-y">
            {listing.products.map((product) => (
              <tr key={product.id} className="hover:bg-surface-muted">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-3">
                    <span className="bg-surface-sunken relative block h-10 w-10 shrink-0 overflow-hidden rounded">
                      <ProductImage src={product.thumbnail} alt="" sizes="40px" />
                    </span>
                    <span className="min-w-0">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="text-link line-clamp-1 font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="text-ink-subtle block text-xs">{product.brand}</span>
                    </span>
                  </span>
                </td>
                <td className="text-ink-muted px-4 py-2">{product.category}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {formatPaise(product.effectivePrice)}
                  {product.discountPrice && (
                    <span className="text-ink-subtle block text-xs line-through">
                      {formatPaise(product.price)}
                    </span>
                  )}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold tabular-nums ${
                    product.stock === 0 ? 'text-deal' : product.stock <= 5 ? 'text-accent-400' : ''
                  }`}
                >
                  {product.stock}
                </td>
                <td className="px-4 py-2">
                  {product.isActive ? (
                    <span className="text-instock text-xs font-semibold">Active</span>
                  ) : (
                    <span className="text-deal text-xs font-semibold">Inactive</span>
                  )}
                  {product.isFeatured && (
                    <span className="text-ink-subtle block text-xs">Featured</span>
                  )}
                </td>
              </tr>
            ))}
            {listing.products.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-muted px-4 py-8 text-center">
                  No products match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(listing.page > 1 || listing.hasMore) && (
        <nav
          aria-label="Product pages"
          className="mt-4 flex items-center justify-center gap-3 text-sm"
        >
          {listing.page > 1 && (
            <Link
              href={pageHref(q, listing.page - 1, low)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Previous
            </Link>
          )}
          <span className="text-ink-muted">Page {listing.page}</span>
          {listing.hasMore && (
            <Link
              href={pageHref(q, listing.page + 1, low)}
              className="border-hairline hover:bg-surface-muted inline-flex min-h-10 items-center rounded-md border px-4 font-semibold"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
