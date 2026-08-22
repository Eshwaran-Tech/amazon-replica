import {
  absoluteUrl,
  BRAND_DESCRIPTION,
  BRAND_LEGAL_NAME,
  BRAND_NAME,
  SITE_URL,
} from '@/lib/brand';

/**
 * Schema.org graphs, built from what the site actually is.
 *
 * The rule this file follows throughout: **nothing is asserted that is not
 * true of the page it sits on.** Structured data is machine-readable claims
 * about your own site, and inventing ratings or prices in it is both a
 * manual-action risk and, more simply, lying in a format designed for
 * automated trust. Where a value is not genuinely available, the property is
 * omitted rather than filled with a plausible number.
 */

/**
 * The two graphs the homepage carries.
 *
 * `Organization` is what Google reads to build a knowledge panel and to
 * connect the brand name to this domain -- the single most useful piece of
 * markup for branded search, which is what "I want people to find my site by
 * name" actually depends on.
 *
 * `WebSite` carries `SearchAction`, which is what can produce a sitelinks
 * search box. It points at the real `/search?q=` route the site already has;
 * declaring a search endpoint that does not exist is worse than declaring none.
 */
export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: BRAND_NAME,
    legalName: BRAND_LEGAL_NAME,
    url: SITE_URL,
    description: BRAND_DESCRIPTION,
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/opengraph-image'),
      width: 1200,
      height: 630,
    },
    // No `sameAs`, `telephone`, `address` or `founder`: those would be claims
    // about a real business, and pointing at social profiles that are not this
    // store's is exactly the kind of thing that gets structured data ignored.
  };
}

export function webSiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: BRAND_NAME,
    url: SITE_URL,
    description: BRAND_DESCRIPTION,
    inLanguage: 'en-IN',
    publisher: { '@id': absoluteUrl('/#organization') },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/search?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface Crumb {
  name: string;
  /** Path, not a full URL -- made absolute here so the origin cannot drift. */
  path: string;
}

/**
 * A breadcrumb trail.
 *
 * Google renders this in place of the raw URL in a search result, which is
 * worth real click-through on a deep category or product page. The last item
 * is the current page and still carries its own URL, which is what the spec
 * asks for.
 */
export function breadcrumbSchema(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * A category listing page.
 *
 * `CollectionPage` rather than `ItemList`: the page is a browsable collection,
 * and claiming an ordered list would imply a ranking the page does not have.
 */
export function collectionSchema(input: {
  name: string;
  description: string;
  path: string;
  itemCount: number;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path),
    isPartOf: { '@id': absoluteUrl('/#website') },
    // Genuinely the number of products in the collection, read from the query
    // that rendered the page.
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.itemCount,
    },
  };
}
