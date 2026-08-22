import type { ObjectId } from 'mongodb';

export interface CategoryDoc {
  _id: ObjectId;
  name: string;
  slug: string;
  description?: string | null;
  /** Path to a local SVG under `public/categories/`. */
  image?: string | null;
  /** null for a top-level category; a category slug for a subcategory. */
  parentSlug: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentSlug: string | null;
}

/** A top-level category with its children resolved, for nav menus. */
export interface CategoryTreeNode extends CategoryView {
  children: CategoryView[];
}

export function toCategoryView(doc: CategoryDoc): CategoryView {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    slug: doc.slug,
    description: doc.description ?? null,
    image: doc.image ?? null,
    parentSlug: doc.parentSlug,
  };
}

/**
 * Builds the two-level nav tree in one pass over a flat list, so rendering the
 * header costs one query rather than one per category.
 */
export function buildCategoryTree(docs: CategoryDoc[]): CategoryTreeNode[] {
  const roots: CategoryTreeNode[] = [];
  const byParent = new Map<string, CategoryView[]>();

  for (const doc of docs) {
    if (doc.parentSlug === null) continue;
    const siblings = byParent.get(doc.parentSlug) ?? [];
    siblings.push(toCategoryView(doc));
    byParent.set(doc.parentSlug, siblings);
  }

  for (const doc of docs) {
    if (doc.parentSlug !== null) continue;
    roots.push({
      ...toCategoryView(doc),
      children: byParent.get(doc.slug) ?? [],
    });
  }

  return roots;
}
