import { z } from 'zod';

import {
  multiLineText,
  objectIdString,
  rupeeAmountSchema,
  singleLineText,
  slugSchema,
  stockSchema,
} from './common';

/**
 * Admin product schemas.
 *
 * Two controls here are load-bearing:
 *
 * 1. **Images must be local paths.** An admin cannot supply
 *    `https://attacker.example/x.png`. Remote image URLs would be fetched by
 *    the Next.js image optimiser -- turning `/_next/image` into a request
 *    forger that reaches internal addresses and cloud metadata endpoints. The
 *    allow-list here is the same decision as the empty `remotePatterns` in
 *    `next.config.ts`, enforced at the point of entry.
 *
 * 2. **Prices arrive as rupees and leave as integer paise**, converted by
 *    `rupeeAmountSchema`. No decimal amount survives parsing.
 */

/** A path under `public/products/`. No protocol, no traversal, no query string. */
const localImagePathSchema = z
  .string()
  .trim()
  .max(200)
  .regex(
    /^\/products\/[a-z0-9][a-z0-9-]*\.(svg|png|jpg|jpeg|webp|avif)$/,
    'Images must be local files under /products/',
  );

const featureSchema = singleLineText(2, 160, 'Feature');

const specificationSchema = z.strictObject({
  label: singleLineText(1, 60, 'Specification label'),
  value: singleLineText(1, 160, 'Specification value'),
});

const productBaseFields = {
  name: singleLineText(3, 160, 'Product name'),
  description: multiLineText(20, 4000, 'Description'),
  brand: singleLineText(1, 60, 'Brand'),
  category: slugSchema,
  subcategory: slugSchema.nullable().optional(),

  price: rupeeAmountSchema,
  discountPrice: rupeeAmountSchema.nullable().optional(),

  stock: stockSchema,

  images: z.array(localImagePathSchema).min(1, 'Add at least one image').max(8),
  thumbnail: localImagePathSchema,

  features: z.array(featureSchema).max(12).default([]),
  specifications: z.array(specificationSchema).max(20).default([]),

  isFeatured: z.boolean().default(false),
  isPrime: z.boolean().default(false),
  isActive: z.boolean().default(true),
};

/**
 * A discount at or above list price is not a discount -- it would compute a
 * zero or negative saving and display as a nonsensical badge.
 */
function discountBelowPrice(data: {
  price: number;
  discountPrice?: number | null;
}): boolean {
  return (
    data.discountPrice === null || data.discountPrice === undefined || data.discountPrice < data.price
  );
}

export const productCreateSchema = z
  .strictObject(productBaseFields)
  .refine(discountBelowPrice, {
    message: 'Discount price must be lower than the list price',
    path: ['discountPrice'],
  })
  .refine((data) => data.images.includes(data.thumbnail), {
    message: 'Thumbnail must be one of the product images',
    path: ['thumbnail'],
  });

export type ProductCreateInput = z.infer<typeof productCreateSchema>;

export const productUpdateSchema = z
  .strictObject({ productId: objectIdString, ...productBaseFields })
  .refine(discountBelowPrice, {
    message: 'Discount price must be lower than the list price',
    path: ['discountPrice'],
  })
  .refine((data) => data.images.includes(data.thumbnail), {
    message: 'Thumbnail must be one of the product images',
    path: ['thumbnail'],
  });

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

/** Soft delete. Products are deactivated, never removed -- past orders
 *  reference them, and a hard delete would orphan order history. */
export const productDeactivateSchema = z.strictObject({
  productId: objectIdString,
  isActive: z.boolean(),
});

export const productIdSchema = z.strictObject({ productId: objectIdString });

export const productSlugSchema = z.strictObject({ slug: slugSchema });
