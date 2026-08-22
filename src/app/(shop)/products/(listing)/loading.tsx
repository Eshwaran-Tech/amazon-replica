import { Container } from '@/components/layout/container';

/**
 * Skeleton for the product listing.
 *
 * Note the route group: this file lives in `(listing)/`, which does not appear
 * in the URL but *does* scope the Suspense boundary to `/products` only.
 *
 * That scoping is deliberate and load-bearing. A `loading.tsx` higher up would
 * also wrap `/products/[slug]`, and a route-level Suspense boundary makes
 * Next.js flush the response shell -- committing HTTP 200 -- before the page
 * body runs. `notFound()` would then render the 404 page inside a 200
 * response: a soft 404, which crawlers index and uptime monitors ignore.
 *
 * Measured before this was fixed: `/products/does-not-exist` returned 200 with
 * "Error 404" in the body.
 *
 * Rule of thumb: no route-level `loading.tsx` above a segment that can call
 * `notFound()`. A `<Suspense>` *inside* a page is fine, because the existence
 * check runs before any JSX is returned.
 */
export default function ProductsLoading() {
  return (
    <Container size="wide" className="py-4 sm:py-5">
      <span className="sr-only" role="status" aria-live="polite">
        Loading products
      </span>

      <div
        className="animate-pulse lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6"
        aria-hidden="true"
      >
        <div className="bg-surface hidden h-96 rounded-lg lg:block" />

        <div>
          <div className="bg-surface mb-3 h-20 rounded-lg" />
          <div className="3xl:grid-cols-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4">
            {Array.from({ length: 12 }, (_, index) => (
              <div key={index} className="bg-surface space-y-3 rounded-lg p-3">
                <div className="bg-surface-sunken aspect-square rounded" />
                <div className="bg-surface-sunken h-3 w-3/4 rounded" />
                <div className="bg-surface-sunken h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Container>
  );
}
