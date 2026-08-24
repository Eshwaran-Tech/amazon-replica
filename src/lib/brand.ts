/**
 * The brand, in one place.
 *
 * `components/brand/logo.tsx` already treated the wordmark as data rather than
 * markup so the component would work for any name without editing JSX. This
 * extends the same idea to everything else that says the brand out loud --
 * page titles, Open Graph tags, structured data, transactional email, the
 * footer, the i18n strings. Renaming the store is then an environment change,
 * not a hunt through a hundred and forty-seven string literals.
 *
 * Every value is `NEXT_PUBLIC_`, so it is inlined into the client bundle at
 * build time. That is correct here and only here: a brand name is on the page
 * in twelve-point type. Nothing secret may ever join this file.
 */

/** The wordmark. */
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'Eshwaran';

/** The small suffix beside it, and the domain the store presents itself as. */
export const BRAND_SUFFIX = process.env.NEXT_PUBLIC_BRAND_SUFFIX ?? '.in';

/** "Eshwaran.in" -- how the store refers to itself in prose. */
export const BRAND_DOMAIN = `${BRAND_NAME}${BRAND_SUFFIX}`;

/**
 * The wallet and the other in-store services carry the brand too.
 *
 * They were named after the reference's own products. Keeping that name on a
 * store called something else would be both confusing and a borrowed mark.
 */
export const BRAND_PAY = `${BRAND_NAME} Pay`;

/** The legal entity, for Organization structured data and the footer. */
export const BRAND_LEGAL_NAME = process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME?.trim() || BRAND_NAME;

/**
 * The canonical origin, with no trailing slash.
 *
 * Everything that builds an absolute URL -- canonicals, the sitemap,
 * `robots.txt`, Open Graph, JSON-LD -- reads it from here, so the preferred
 * domain cannot drift between them. A canonical tag pointing at one host while
 * the sitemap lists another is the classic way to split your own ranking.
 */
function resolveSiteUrl(): string {
  // `??` would accept an empty string, and an empty origin turns every
  // canonical into a relative URL -- which silently defeats the whole point of
  // having one. Treat blank exactly like unset.
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  // Vercel injects the project's own production domain, so a deployment can
  // describe itself correctly even if nobody set the variable above. Host only,
  // no scheme. The `NEXT_PUBLIC_` copy is the one that survives into the client
  // bundle, which matters because client components import this module for the
  // brand name and would otherwise evaluate a different origin than the server.
  const vercel = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}

export const SITE_URL = resolveSiteUrl();

/** An absolute URL for a path, for canonicals and structured data. */
export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * What the store sells, said once.
 *
 * Used in the homepage description, the Organization description and the
 * footer, so the three cannot describe different businesses. These are the
 * categories the catalogue genuinely carries -- listing categories the store
 * does not stock would be keyword stuffing, and Google has been able to tell
 * the difference for a decade.
 */
export const BRAND_CATEGORIES = [
  'electronics',
  'mobiles',
  'computers',
  'fashion',
  'home and kitchen',
  'books',
  'beauty',
  'sports',
  'toys',
  'grocery',
] as const;

export const BRAND_TAGLINE = 'Online Shopping for Electronics, Fashion, Home and more';

/** The homepage description. One sentence on what it is, one on why to click. */
export const BRAND_DESCRIPTION =
  `Shop ${BRAND_CATEGORIES.slice(0, 6).join(', ')} and more on ${BRAND_NAME}. ` +
  'Compare prices, read customer reviews, and check out securely with fast delivery across India.';
