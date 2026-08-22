'use client';

import { Check, ShoppingCart, Zap } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useId, useState } from 'react';
import type { ReactNode } from 'react';

import { addToCartAction, buyNowAction } from '@/actions/cart';
import { Alert } from '@/components/ui/alert';
import { SubmitButton } from '@/components/ui/submit-button';
import { emptyFormState } from '@/lib/forms/state';
import { useT } from '@/lib/i18n/client';

interface AddToCartProps {
  productId: string;
  /** Options shown in the quantity selector. See product page for the cap. */
  maxSelectable: number;
  outOfStock: boolean;
  /** Server-rendered CSRF field, so the token never enters client state. */
  csrfField: ReactNode;
}

/**
 * Buy box controls: quantity, Add to Cart, Buy Now.
 *
 * Two separate forms rather than two submit buttons in one, because the
 * behaviours differ: "Add" stays on the page with inline feedback, "Buy Now"
 * redirects to the cart, and one action serving both makes the pending states
 * lie. The quantity is React state so both forms genuinely submit the same
 * number -- the select is visible in the first form and mirrored into the
 * second as a hidden input.
 *
 * The server clamps quantity to live stock regardless; this control is UX,
 * not enforcement.
 */
export function AddToCart({ productId, maxSelectable, outOfStock, csrfField }: AddToCartProps) {
  const t = useT();
  const [addState, addAction] = useActionState(addToCartAction, emptyFormState);
  const [buyState, buyAction] = useActionState(buyNowAction, emptyFormState);
  const [quantity, setQuantity] = useState(1);
  const selectId = useId();

  if (outOfStock) {
    return <p className="text-deal text-sm font-semibold">{t('product.unavailableCheckBack')}</p>;
  }

  return (
    <div className="space-y-3">
      {addState.message && (
        <Alert tone={addState.ok ? 'success' : 'error'}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {addState.ok && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {addState.message}
            {addState.ok && (
              <Link href="/cart" className="text-link font-semibold hover:underline">
                {t('product.viewCart')}
              </Link>
            )}
          </span>
        </Alert>
      )}
      {buyState.message && !buyState.ok && <Alert tone="error">{buyState.message}</Alert>}

      <form action={addAction} className="space-y-3">
        {csrfField}
        <input type="hidden" name="productId" value={productId} />

        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-sm font-medium">
            {t('product.quantity')}
          </label>
          <select
            id={selectId}
            name="quantity"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="border-hairline bg-surface min-h-10 rounded-md border px-2 text-sm"
          >
            {Array.from({ length: maxSelectable }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </div>

        <SubmitButton fullWidth pendingLabel={t('product.adding')}>
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {t('product.addToCart')}
        </SubmitButton>
      </form>

      <form action={buyAction}>
        {csrfField}
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="quantity" value={quantity} />
        <SubmitButton variant="secondary" fullWidth pendingLabel={t('product.redirecting')}>
          <Zap className="text-accent-400 h-4 w-4" aria-hidden="true" />
          {t('product.buyNow')}
        </SubmitButton>
      </form>
    </div>
  );
}
