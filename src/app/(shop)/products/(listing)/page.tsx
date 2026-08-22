import type { Metadata } from 'next';

import { CatalogView } from '@/components/catalog/catalog-view';
import { normaliseSearchParams, productSearchSchema } from '@/lib/validations/search';
import { getCategoryTree, listProducts } from '@/services/catalog';

export const metadata: Metadata = {
  title: 'All products',
  description: 'Browse the full amazon catalogue with filters for brand, price and rating.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const raw = await searchParams;

  // Everything downstream sees the parsed value, never the raw params:
  // `normaliseSearchParams` strips prototype-pollution keys, and the schema
  // clamps, allow-lists and drops the rest.
  const input = productSearchSchema.parse(normaliseSearchParams(raw));

  const [result, categories] = await Promise.all([listProducts(input), getCategoryTree()]);

  return (
    <CatalogView
      heading="All products"
      basePath="/products"
      input={input}
      result={result}
      categories={categories}
      crumbs={[{ label: 'Home', href: '/' }, { label: 'All products' }]}
    />
  );
}
