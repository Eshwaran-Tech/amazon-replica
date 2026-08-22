import type { Metadata } from 'next';

import { CatalogView } from '@/components/catalog/catalog-view';
import { normaliseSearchParams, productSearchSchema } from '@/lib/validations/search';
import { getCategoryTree, listProducts } from '@/services/catalog';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Search results metadata.
 *
 * `noindex` on purpose. Search-result pages are infinite (every query is a new
 * URL), they duplicate the catalogue, and letting a crawler index them is how a
 * site ends up with thousands of thin pages -- and how an attacker gets their
 * chosen text onto a page that appears to be ours.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const input = productSearchSchema.parse(normaliseSearchParams(await searchParams));

  return {
    // The query is placed in a title, which Next.js escapes. It is also already
    // length-capped and control-character-free by the schema.
    title: input.q ? `${input.q} - Search results` : 'Search',
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const input = productSearchSchema.parse(normaliseSearchParams(await searchParams));

  const [result, categories] = await Promise.all([listProducts(input), getCategoryTree()]);

  return (
    <CatalogView
      heading={input.q ? `Results for "${input.q}"` : 'Search'}
      basePath="/search"
      input={input}
      result={result}
      categories={categories}
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Search results' }]}
    />
  );
}
