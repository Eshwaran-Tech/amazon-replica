import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { ObjectId } from 'mongodb';
import Link from 'next/link';

import { removeCartLineAction, updateCartLineAction } from '@/actions/cart';
import { Container } from '@/components/layout/container';
import { PriceDisplay } from '@/components/product/price-display';
import { ProductImage } from '@/components/product/product-image';
import { CsrfField } from '@/components/security/csrf-field';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { getSession } from '@/lib/auth/guards';
import { readGuestCartId } from '@/lib/cart/guest';
import { getT } from '@/lib/i18n/server';
import { formatPaise } from '@/lib/utils/money';
import { MAX_QUANTITY_PER_LINE } from '@/models/cart';
import { amountToFreeShipping } from '@/services/pricing';
import { getCartView, type CartIdentity } from '@/services/cart';

export const metadata: Metadata = {
  title: 'Shopping cart',
  // A cart is personal; a search engine has no business indexing it.
  robots: { index: false, follow: false },
};

/**
 * The cart page.
 *
 * A Server Component end to end: every line is resolved against live catalogue
 * prices and stock on the server, and the quantity/remove controls are plain
 * forms posting Server Actions -- they work before hydration and without
 * JavaScript. Identity comes from the session or the HttpOnly guest cookie,
 * so there is nothing here a client could point at someone else's cart.
 */
export default async function CartPage() {
  const [session, { t }] = await Promise.all([getSession(), getT()]);
  const guestId = session ? null : await readGuestCartId();

  const identity: CartIdentity | null = session
    ? { userId: new ObjectId(session.user.id) }
    : guestId
      ? { guestId }
      : null;

  const cart = await getCartView(identity);
  const toFreeShipping = amountToFreeShipping(cart.totals);
  const purchasable = cart.lines.filter((line) => line.isActive);

  if (cart.lines.length === 0 && cart.removedLines.length === 0) {
    return (
      <Container size="narrow" className="py-16 text-center">
        <ShoppingCart className="text-ink-subtle mx-auto h-14 w-14" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">{t('cart.empty')}</h1>
        <p className="text-ink-muted mt-2 text-sm">
          {t('cart.emptyHint')}
          {session ? '' : t('cart.noAccountNeeded')}.
        </p>
        <Link
          href="/products"
          className="bg-accent-500 hover:bg-accent-400 text-brand-950 mt-6 inline-flex min-h-11 items-center justify-center rounded-md px-6 text-sm font-semibold"
        >
          {t('cart.startShopping')}
        </Link>
      </Container>
    );
  }

  return (
    <Container size="wide" className="py-5 sm:py-6">
      <h1 className="text-xl font-bold sm:text-2xl">{t('cart.title')}</h1>

      {cart.removedLines.length > 0 && (
        <div className="mt-3">
          <Alert tone="info">
            {t('cart.removedNoLongerSold', { names: cart.removedLines.join(', ') })}
          </Alert>
        </div>
      )}

      <div className="mt-4 gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* ------------------------------------------------------- lines */}
        <ul className="border-hairline bg-surface divide-hairline divide-y rounded-2xl border">
          {cart.lines.map((line) => (
            <li key={line.productId} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
              <Link
                href={`/products/${line.slug}`}
                className="bg-surface-sunken relative block h-24 w-24 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-28"
              >
                <ProductImage src={line.thumbnail} alt={line.name} sizes="112px" />
              </Link>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${line.slug}`}
                      className="hover:text-link line-clamp-2 text-sm font-medium sm:text-base"
                    >
                      {line.name}
                    </Link>
                    <p className="text-ink-subtle mt-0.5 text-xs">{line.brand}</p>
                  </div>
                  <PriceDisplay
                    price={line.unitPrice}
                    listPrice={line.listPrice > line.unitPrice ? line.listPrice : null}
                    size="sm"
                  />
                </div>

                {!line.isActive ? (
                  <p className="text-deal mt-2 text-sm font-semibold">{t('cart.outOfStockNote')}</p>
                ) : line.quantityAdjusted ? (
                  <p className="text-deal mt-2 text-xs font-medium">
                    {t('cart.quantityReduced', { count: line.quantity })}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {line.isActive && (
                    <>
                      {/* Minus / plus are separate one-value forms, so they work
                          with no JavaScript and each shows its own pending
                          state. The server clamps to live stock regardless. */}
                      <form action={updateCartLineAction}>
                        <CsrfField />
                        <input type="hidden" name="productId" value={line.productId} />
                        <input
                          type="hidden"
                          name="quantity"
                          value={Math.max(1, line.quantity - 1)}
                        />
                        <SubmitButton
                          variant="secondary"
                          size="sm"
                          pendingLabel="..."
                          aria-label={t('cart.decrease', { name: line.name })}
                        >
                          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                        </SubmitButton>
                      </form>

                      <span
                        className="min-w-8 text-center text-sm font-semibold"
                        aria-live="polite"
                      >
                        {line.quantity}
                      </span>

                      <form action={updateCartLineAction}>
                        <CsrfField />
                        <input type="hidden" name="productId" value={line.productId} />
                        <input
                          type="hidden"
                          name="quantity"
                          value={Math.min(MAX_QUANTITY_PER_LINE, line.quantity + 1)}
                        />
                        <SubmitButton
                          variant="secondary"
                          size="sm"
                          pendingLabel="..."
                          disabled={line.quantity >= line.availableStock}
                          aria-label={t('cart.increase', { name: line.name })}
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </SubmitButton>
                      </form>
                    </>
                  )}

                  <form action={removeCartLineAction} className="ml-auto">
                    <CsrfField />
                    <input type="hidden" name="productId" value={line.productId} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="...">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('cart.remove')}
                    </SubmitButton>
                  </form>
                </div>

                {line.isActive && (
                  <p className="text-ink-muted mt-1.5 text-xs">
                    {t('cart.lineTotal')}{' '}
                    <span className="text-ink font-semibold">{formatPaise(line.lineTotal)}</span>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* ---------------------------------------------------- summary */}
        <aside
          aria-label={t('cart.summary')}
          className="border-hairline bg-surface mt-4 rounded-2xl border p-4 lg:sticky lg:top-4 lg:mt-0"
        >
          {toFreeShipping > 0 ? (
            <p className="text-ink-muted text-xs">
              {t('cart.addMoreForFree', { amount: formatPaise(toFreeShipping) })}
            </p>
          ) : (
            purchasable.length > 0 && (
              <p className="text-instock text-xs font-semibold">{t('cart.qualifiesFree')}</p>
            )
          )}

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">
                {t('cart.subtotal', { count: cart.totals.itemCount })}
              </dt>
              <dd>{formatPaise(cart.totals.subtotal)}</dd>
            </div>
            {cart.totals.discount > 0 && (
              <div className="text-instock flex justify-between">
                <dt>{t('cart.savings')}</dt>
                <dd>-{formatPaise(cart.totals.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t('cart.delivery')}</dt>
              <dd>
                {cart.totals.shipping === 0 ? t('cart.free') : formatPaise(cart.totals.shipping)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">{t('cart.gst')}</dt>
              <dd>{formatPaise(cart.totals.tax)}</dd>
            </div>
            <div className="border-hairline flex justify-between border-t pt-2 text-base font-bold">
              <dt>{t('cart.total')}</dt>
              <dd>{formatPaise(cart.totals.total)}</dd>
            </div>
          </dl>

          {/* Checkout is a protected path: anonymous shoppers are sent through
              sign-in and their guest cart merges into the account on the way. */}
          <Link
            href="/checkout"
            aria-disabled={purchasable.length === 0}
            className={
              purchasable.length === 0
                ? 'bg-surface-sunken text-ink-subtle pointer-events-none mt-4 flex min-h-11 items-center justify-center rounded-md text-sm font-semibold'
                : 'bg-accent-500 hover:bg-accent-400 text-brand-950 mt-4 flex min-h-11 items-center justify-center rounded-md text-sm font-semibold'
            }
          >
            {t('cart.checkout')}
          </Link>

          <p className="text-ink-subtle mt-2 text-center text-[11px]">
            {t('cart.pricesConfirmed')}
          </p>
        </aside>
      </div>
    </Container>
  );
}
