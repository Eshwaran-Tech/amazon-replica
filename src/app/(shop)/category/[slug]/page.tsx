import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CatalogView } from '@/components/catalog/catalog-view';
import { slugSchema } from '@/lib/validations/common';
import { normaliseSearchParams, productSearchSchema } from '@/lib/validations/search';
import { getCategoryBySlug, getCategoryTree, listProducts } from '@/services/catalog';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A route parameter is as untrusted as a query parameter. `[slug]` matches
 * anything, so it is validated before it reaches a database filter.
 */
async function resolveCategory(params: PageProps['params']) {
  const { slug } = await params;
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) notFound();

  const category = await getCategoryBySlug(parsed.data);
  if (!category) notFound();

  return category;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const category = await resolveCategory(params);

  return {
    title: category.name,
    description: category.description ?? `Shop ${category.name} on amazon.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.name} - amazon`,
      description: category.description ?? undefined,
      url: `/category/${category.slug}`,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const category = await resolveCategory(params);
  const raw = await searchParams;

  const tree = await getCategoryTree();
  const isTopLevel = tree.some((node) => node.slug === category.slug);

  // The category comes from the path, so it overrides anything in the query
  // string -- otherwise `/category/books?category=electronics` would show
  // electronics under a "Books" heading.
  const input = productSearchSchema.parse({
    ...normaliseSearchParams(raw),
    ...(isTopLevel
      ? { category: category.slug, subcategory: raw.subcategory }
      : { category: category.parentSlug ?? undefined, subcategory: category.slug }),
  });

  const result = await listProducts(input);

  const parent = category.parentSlug
    ? tree.find((node) => node.slug === category.parentSlug)
    : undefined;

  return (
    <CatalogView
      heading={category.name}
      basePath={`/category/${category.slug}`}
      input={input}
      result={result}
      categories={tree}
      description={category.description ?? undefined}
      crumbs={[
        { label: 'Home', href: '/' },
        ...(parent ? [{ label: parent.name, href: `/category/${parent.slug}` }] : []),
        { label: category.name },
      ]}
    />
  );
}
