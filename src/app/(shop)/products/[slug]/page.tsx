import { Check, Shield, Truck, Undo2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AddToCart } from '@/components/cart/add-to-cart';
import { Breadcrumb } from '@/components/catalog/breadcrumb';
import { Container } from '@/components/layout/container';
import { CsrfField } from '@/components/security/csrf-field';
import { MAX_QUANTITY_PER_LINE } from '@/models/cart';
import { PriceDisplay } from '@/components/product/price-display';
import { ProductCarousel } from '@/components/product/product-carousel';
import { ProductGallery } from '@/components/product/product-gallery';
import { RatingStars } from '@/components/product/rating-stars';
import { ReviewSection } from '@/components/reviews/review-section';
import { JsonLd } from '@/components/seo/json-ld';
import { formatPaise, paiseToRupees } from '@/lib/utils/money';
import { slugSchema } from '@/lib/validations/common';
import {
  getCategoryBySlug,
  getProductBySlug,
  getProductDocBySlug,
  getRelatedProducts,
} from '@/services/catalog';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadProduct(params: PageProps['params']) {
  const { slug } = await params;
  // `[slug]` matches anything, so it is validated like any other input.
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) notFound();

  const product = await getProductBySlug(parsed.data);
  if (!product) notFound();

  return product;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await loadProduct(params);

  return {
    title: product.name,
    // Metadata values are escaped by Next.js when serialised into tags, and
    // the description is plain text from a length-capped field.
    description: product.description.slice(0, 160),
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.name,
      description: product.description.slice(0, 200),
      url: `/products/${product.slug}`,
      images: [{ url: product.thumbnail, alt: product.name }],
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const product = await loadProduct(params);
  const query = await searchParams;

  const [doc, category] = await Promise.all([
    getProductDocBySlug(product.slug),
    getCategoryBySlug(product.category),
  ]);

  const related = doc ? await getRelatedProducts(doc, 12) : [];

  const inStock = product.stockStatus !== 'OUT_OF_STOCK';

  return (
    <Container size="wide" className="py-4 sm:py-5">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.description,
          brand: { '@type': 'Brand', name: product.brand },
          sku: product.id,
          offers: {
            '@type': 'Offer',
            // schema.org expects a decimal string; this is the only place a
            // rupee decimal is produced, and it is for output only.
            price: paiseToRupees(product.effectivePrice).toFixed(2),
            priceCurrency: 'INR',
            availability: inStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
          ...(product.reviewCount > 0
            ? {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: product.rating,
                  reviewCount: product.reviewCount,
                },
              }
            : {}),
        }}
      />

      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          ...(category
            ? [{ label: category.name, href: `/category/${category.slug}` }]
            : []),
          { label: product.name },
        ]}
      />

      {/* Single column on mobile; gallery + details from md; buy box splits out
          on xl where there is room for a third column. */}
      <div className="mt-3 grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,2.2fr)_18rem]">
        <div className="bg-surface rounded-lg p-3 sm:p-4">
          <ProductGallery images={product.images} productName={product.name} />
        </div>

        {/* ------------------------------------------------------- details */}
        <div className="bg-surface rounded-lg p-3 sm:p-4">
          <h1 className="text-xl leading-snug font-bold sm:text-2xl">{product.name}</h1>

          <Link
            href={`/products?brand=${encodeURIComponent(product.brand)}`}
            className="text-link hover:text-link-hover mt-1 inline-block text-sm hover:underline"
          >
            Visit the {product.brand} store
          </Link>

          {product.reviewCount > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <RatingStars rating={product.rating} size="md" />
              <a href="#reviews" className="text-link text-sm hover:underline">
                {product.reviewCount.toLocaleString('en-IN')} ratings
              </a>
            </div>
          ) : (
            <p className="text-ink-subtle mt-2 text-sm">No reviews yet</p>
          )}

          <hr className="border-hairline my-3" />

          <PriceDisplay
            price={product.effectivePrice}
            listPrice={product.discountPrice ? product.price : null}
            discountPercentage={product.discountPercentage}
            size="lg"
          />
          <p className="text-ink-muted mt-1 text-xs">Inclusive of all taxes where applicable</p>

          {product.features.length > 0 && (
            <>
              <h2 className="mt-4 text-base font-bold">About this item</h2>
              <ul className="mt-2 space-y-1.5">
                {product.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-sm">
                    <Check
                      className="text-instock mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ------------------------------------------------------- buy box */}
        <aside className="border-hairline bg-surface h-fit rounded-lg border p-3 sm:p-4 md:col-span-2 xl:col-span-1">
          <PriceDisplay
            price={product.effectivePrice}
            listPrice={product.discountPrice ? product.price : null}
            size="md"
          />

          <p className="mt-2 text-sm">
            <span className="text-instock font-semibold">FREE delivery</span> on orders over
            &#8377;499
          </p>

          <p className="mt-3 text-lg font-semibold">
            {product.stockStatus === 'OUT_OF_STOCK' ? (
              <span className="text-deal">Currently unavailable</span>
            ) : product.stockStatus === 'LOW_STOCK' ? (
              <span className="text-deal">Only {product.unitsLeft} left in stock</span>
            ) : (
              <span className="text-instock">In stock</span>
            )}
          </p>

          <div className="mt-3">
            <AddToCart
              productId={product.id}
              // Options cap at the per-line maximum. Below the low-stock
              // threshold the true count is already public ("Only 3 left"), so
              // the selector shows exactly that many; above it, always ten --
              // sizing the list to stock at 6-9 units would leak the figure the
              // product page deliberately withholds. The server clamps to live
              // stock on submit either way.
              maxSelectable={
                product.stockStatus === 'LOW_STOCK' && product.unitsLeft
                  ? product.unitsLeft
                  : MAX_QUANTITY_PER_LINE
              }
              outOfStock={product.stockStatus === 'OUT_OF_STOCK'}
              csrfField={<CsrfField />}
            />
          </div>

          <ul className="text-ink-muted mt-4 space-y-2 text-xs">
            <li className="flex items-center gap-2">
              <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
              Dispatched by amazon
            </li>
            <li className="flex items-center gap-2">
              <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              7-day replacement policy
            </li>
            <li className="flex items-center gap-2">
              <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
              Secure transaction
            </li>
          </ul>
        </aside>
      </div>

      {/* ---------------------------------------- specifications + description */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {product.specifications.length > 0 && (
          <section aria-labelledby="specs" className="bg-surface rounded-lg p-3 sm:p-4">
            <h2 id="specs" className="mb-3 text-lg font-bold">
              Technical details
            </h2>
            {/* The table scrolls inside its own container so a long value
                cannot make the whole page scroll sideways on a phone. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-hairline divide-y">
                  {product.specifications.map((spec) => (
                    <tr key={spec.label}>
                      <th
                        scope="row"
                        className="bg-surface-muted w-2/5 px-3 py-2 text-left font-semibold"
                      >
                        {spec.label}
                      </th>
                      <td className="px-3 py-2">{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section aria-labelledby="description" className="bg-surface rounded-lg p-3 sm:p-4">
          <h2 id="description" className="mb-3 text-lg font-bold">
            Product description
          </h2>
          {/* Plain text rendered as a text node -- React escapes it. This app
              accepts no HTML from anyone, so there is nothing to sanitise. */}
          <p className="text-sm leading-relaxed whitespace-pre-line">{product.description}</p>
        </section>
      </div>

      <ReviewSection
        productId={product.id}
        productSlug={product.slug}
        rawSort={query.rsort}
        rawStars={query.rstars}
        rawPage={query.rpage}
      />

      {related.length > 0 && (
        <div className="mt-4">
          <ProductCarousel
            title="Customers also viewed"
            products={related}
            viewAllHref={`/category/${product.category}`}
          />
        </div>
      )}

      <p className="sr-only">List price {formatPaise(product.price)}</p>
    </Container>
  );
}
