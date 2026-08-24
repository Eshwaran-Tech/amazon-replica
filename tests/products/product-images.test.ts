import { describe, expect, it } from 'vitest';

import { ALL_SEED_PRODUCTS } from '@/data/catalog';
import { resolveProductImages } from '@/data/product-images';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Product galleries are resolved once at seed time and stored on the document,
 * so a defect here is baked into the database rather than fixed on the next
 * render. Two properties matter and neither is obvious from reading one case.
 */
describe('resolveProductImages', () => {
  const galleries = ALL_SEED_PRODUCTS.map((product) => ({
    product,
    images: resolveProductImages(
      product.name,
      slugify(product.name),
      product.category,
      product.subcategory,
    ),
  }));

  it('gives every product at least one image', () => {
    const empty = galleries.filter((entry) => entry.images.length === 0);
    expect(empty.map((entry) => entry.product.name)).toEqual([]);
  });

  it('never repeats the same photo inside one gallery', () => {
    // The regression: a type holding a single photo used to yield that photo
    // three times, which looks like a rendering failure rather than a gallery.
    const repeated = galleries.filter(
      (entry) => new Set(entry.images).size < entry.images.length,
    );
    expect(repeated.map((entry) => entry.product.name)).toEqual([]);
  });

  it('never returns more than three images', () => {
    expect(Math.max(...galleries.map((entry) => entry.images.length))).toBeLessThanOrEqual(3);
  });

  it('is deterministic across calls', () => {
    const sample = ALL_SEED_PRODUCTS.slice(0, 25);
    for (const product of sample) {
      const slug = slugify(product.name);
      const once = resolveProductImages(product.name, slug, product.category, product.subcategory);
      const twice = resolveProductImages(product.name, slug, product.category, product.subcategory);
      expect(twice).toEqual(once);
    }
  });

  it('resolves paths that point at files the site can actually serve', () => {
    for (const { images } of galleries) {
      for (const path of images) {
        expect(path).toMatch(/^\/products\/[A-Za-z0-9._-]+\.(jpg|svg)$/);
      }
    }
  });
});
