import { z } from 'zod';

import { multiLineText, objectIdString, singleLineText, slugSchema } from './common';

/**
 * Category schemas (admin).
 *
 * `parentSlug` is a slug, not an id, and the service verifies it refers to an
 * existing *top-level* category. That check cannot live here: preventing a
 * two-level taxonomy from becoming a cycle (`a -> b -> a`) requires reading the
 * current tree, which a schema has no access to.
 */

const categoryImageSchema = z
  .string()
  .trim()
  .max(200)
  .regex(
    /^\/categories\/[a-z0-9][a-z0-9-]*\.(svg|png|jpg|jpeg|webp|avif)$/,
    'Category images must be local files under /categories/',
  );

const categoryBaseFields = {
  name: singleLineText(2, 60, 'Category name'),
  slug: slugSchema,
  description: multiLineText(0, 500, 'Description').nullable().optional(),
  image: categoryImageSchema.nullable().optional(),
  /** null makes this a top-level category. */
  parentSlug: slugSchema.nullable().default(null),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
};

export const categoryCreateSchema = z
  .strictObject(categoryBaseFields)
  .refine((data) => data.parentSlug !== data.slug, {
    message: 'A category cannot be its own parent',
    path: ['parentSlug'],
  });

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z
  .strictObject({ categoryId: objectIdString, ...categoryBaseFields })
  .refine((data) => data.parentSlug !== data.slug, {
    message: 'A category cannot be its own parent',
    path: ['parentSlug'],
  });

export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const categoryDeleteSchema = z.strictObject({
  categoryId: objectIdString,
});

export const categorySlugParamSchema = z.strictObject({
  slug: slugSchema,
});
