import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/brand';
import { getAllProductSlugs, getCategoryTree } from '@/services/catalog';

// Shared with canonicals, Open Graph and JSON-LD so the preferred domain cannot
// drift between them. See `lib/brand.ts`.
const baseUrl = SITE_URL;

/**
 * Evaluated per request, not at build time.
 *
 * Without this the sitemap prerenders during `next build`, which makes the
 * build itself open a database connection -- so the build fails whenever the
 * database is unreachable, and a CI box needs production credentials just to
 * compile. A sitemap is crawler-facing and rarely fetched; one query per fetch
 * (capped at 5,000 slugs) is the right trade.
 */
export const dynamic = 'force-dynamic';

/**
 * Sitemap.
 *
 * Only public, indexable, canonical URLs. Deliberately absent:
 *
 *  - `/search` and any filtered listing -- infinite URL space, duplicate
 *    content, and a crawler trap
 *  - `/account`, `/orders`, `/cart`, `/checkout` -- private
 *  - `/admin` -- private, and listing it is free reconnaissance
 *  - `/auth/*` -- indexing a sign-in page invites credential-stuffing traffic
 *
 * The product query is capped at 5,000 entries. A sitemap route that fetches
 * an unbounded collection is a denial-of-service vector against your own
 * server, triggered by anything that requests it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getAllProductSlugs(), getCategoryTree()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/products`, changeFrequency: 'daily', priority: 0.9 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = categories.flatMap((category) => [
    { url: `${baseUrl}/category/${category.slug}`, changeFrequency: 'weekly', priority: 0.8 },
    ...category.children.map((child) => ({
      url: `${baseUrl}/category/${child.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]);

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${baseUrl}/products/${product.slug}`,
    lastModified: product.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
